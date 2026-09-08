
import * as Cesium from "cesium";

// 绘制管理器：多边形 / 折线 / 矩形 / 圆 的绘制、预览、贴地形显示与样式控制
// 依赖全局 Cesium
//
// 构造参数：
//   viewer        Cesium.Viewer 实例
//   onStatus      状态文本回调：onStatus(text)
//   onDrawComplete 绘制完成回调：onDrawComplete(info)，info 包含
//                  id / type / positions(Cartesian3[]) / lonLats(度) 及测量信息
//
// 实例属性：
//   lastShape     最近一次绘制完成的图形数据（同 info 结构），供"下一步"按需读取；
//                 无图形时 null，clearAll 后重置为 null
//
// 对外统一接口：
//   startDraw(type)  // type: 'polygon' | 'polyline' | 'rectangle' | 'circle'
//   finishDraw()     // 完成当前绘制（多边形/折线右键结束；矩形/圆第二次左键确认）
//   cancelDraw()     // 取消当前绘制
//   clearAll()       // 清除所有图形与绘制状态
//   applyStyle()     // 把 params 样式应用到所有已绘图形
//   flyTo()          // 视角飞到已绘图形
//   destroy()        // 销毁，清理全部资源

// ---------- 测量工具（局部平面近似，仅用于面板展示） ----------

function metersPerDegree(latDeg) {
  return { mx: 111320 * Math.cos(Cesium.Math.toRadians(latDeg)), my: 110540 };
}

function toLonLats(positions) {
  return positions.map((position) => {
    const carto = Cesium.Cartographic.fromCartesian(position);
    return {
      x: Cesium.Math.toDegrees(carto.longitude),
      y: Cesium.Math.toDegrees(carto.latitude),
    };
  });
}

function measurePolygon(positions) {
  const lonLats = toLonLats(positions);
  if (lonLats.length < 3) return { area: 0, perimeter: 0 };

  const { mx, my } = metersPerDegree(lonLats[0].y);
  let perimeter = 0;
  let area = 0;
  for (let i = 0; i < lonLats.length; i++) {
    const a = lonLats[i];
    const b = lonLats[(i + 1) % lonLats.length];
    perimeter += Math.hypot((b.x - a.x) * mx, (b.y - a.y) * my);
    area += a.x * mx * (b.y * my) - b.x * mx * (a.y * my);
  }
  return { area: Math.abs(area) / 2, perimeter };
}

function measurePolyline(positions) {
  const lonLats = toLonLats(positions);
  if (lonLats.length < 2) return { length: 0 };

  const { mx, my } = metersPerDegree(
    (lonLats[0].y + lonLats[lonLats.length - 1].y) / 2,
  );
  let length = 0;
  for (let i = 0; i < lonLats.length - 1; i++) {
    length += Math.hypot(
      (lonLats[i + 1].x - lonLats[i].x) * mx,
      (lonLats[i + 1].y - lonLats[i].y) * my,
    );
  }
  return { length };
}

function measureRectangle(rectangle) {
  const { mx, my } = metersPerDegree(
    Cesium.Math.toDegrees((rectangle.south + rectangle.north) / 2),
  );
  const width = Cesium.Math.toDegrees(rectangle.east - rectangle.west) * mx;
  const height = Cesium.Math.toDegrees(rectangle.north - rectangle.south) * my;
  return { area: width * height, perimeter: 2 * (width + height) };
}

const SHAPE_TYPES = ["polygon", "polyline", "rectangle", "circle"];

const START_HINTS = {
  polygon: "左键逐点取点（≥3 个），右键结束绘制。",
  polyline: "左键逐点取点（≥2 个），右键结束绘制。",
  rectangle: "左键点击第一个角点。",
  circle: "左键点击圆心。",
};

export default class DrawManager {
  constructor({ viewer, onStatus, onDrawComplete }) {
    this.viewer = viewer;
    this.onStatus = onStatus || (() => {});
    this.onDrawComplete = onDrawComplete || (() => {});
    this._shapeSeq = 0;
    // 最近一次绘制完成的图形数据（含 id/type/positions/lonLats/测量），
    // 供"下一步"按需读取；无图形时为 null
    this.lastShape = null;

    // 绘制状态（统一，所有图形共用）
    this.mode = null; // 当前绘制类型
    this.drawing = false;
    this.drawHandler = null;
    this.drawPositions = []; // 多边形/折线已取的点
    this.movingPosition = null; // 鼠标悬停预览点
    this.anchorCartesian = null; // 矩形第一个角点 / 圆圆心
    this.previewRectangle = null; // 矩形预览
    this.previewRadius = null; // 圆预览半径
    this.drawPointEntities = []; // 顶点标记
    this.previewEntities = []; // 当前绘制中的动态预览实体
    this.shapeEntities = {
      polygon: [],
      polyline: [],
      rectangle: [],
      circle: [],
    };

    // 样式参数（交给 lil-gui 直接绑定）
    this.params = {
      fillColor: "#2e5bff",
      fillOpacity: 0.25,
      outlineColor: "#19d3ff",
      outlineWidth: 3,
      showVertices: true,
      vertexSize: 8,
    };
  }

  // ============================================================
  // 对外统一接口
  // ============================================================

  startDraw(type) {
    if (!SHAPE_TYPES.includes(type)) {
      this.onStatus(`不支持的绘制类型：${type}`);
      return;
    }
    this.clearAll();
    this.mode = type;
    this.drawing = true;
    this._createPreview();
    this.onStatus(START_HINTS[type]);
    this._bindDrawEvents();
  }

  finishDraw() {
    const mode = this.mode;
    if (!mode || !this._canFinish(mode)) return;

    this._destroyHandler();
    this._removePreview(true); // 保留顶点标记，只移除动态预览
    this._createFinalShape(mode);
    this.onStatus(this._measureText(mode));
    const info = this._buildCompletePayload(mode);
    this.lastShape = info;
    this.onDrawComplete(info);
    this._resetDrawState();
  }

  cancelDraw() {
    this._destroyHandler();
    this._removePreview();
    this._resetDrawState();
  }

  clearAll() {
    this.cancelDraw();
    for (const key of Object.keys(this.shapeEntities)) {
      this.shapeEntities[key].forEach((entity) =>
        this.viewer.entities.remove(entity),
      );
      this.shapeEntities[key] = [];
    }
    this.lastShape = null;
    this.onStatus("已清除。");
  }

  applyStyle() {
    const fill = this._fillMaterial();
    const outline = this._outlineMaterial();

    for (const key of Object.keys(this.shapeEntities)) {
      for (const entity of this.shapeEntities[key]) {
        if (entity.polygon) entity.polygon.material = fill;
        if (entity.rectangle) entity.rectangle.material = fill;
        if (entity.polyline) {
          entity.polyline.width = this.params.outlineWidth;
          entity.polyline.material = outline;
        }
      }
    }
    this.drawPointEntities.forEach((entity) => {
      entity.point.pixelSize = this.params.vertexSize;
      entity.show = this.params.showVertices;
    });
  }

  flyTo() {
    const targets = [];
    for (const key of Object.keys(this.shapeEntities)) {
      targets.push(...this.shapeEntities[key]);
    }
    if (!targets.length) {
      this.onStatus("尚未绘制图形。");
      return;
    }
    this.viewer.flyTo(targets, {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 800),
    });
  }

  destroy() {
    this.clearAll();
  }

  // ============================================================
  // 内部：事件绑定与交互
  // ============================================================

  _bindDrawEvents() {
    // 屏蔽默认双击追踪
    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );

    const handler = new Cesium.ScreenSpaceEventHandler(
      this.viewer.scene.canvas,
    );
    this.drawHandler = handler;

    handler.setInputAction(
      (click) => this._handleLeftClick(click),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    handler.setInputAction(
      (movement) => this._handleMouseMove(movement),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    );
    if (this.mode === "polygon" || this.mode === "polyline") {
      handler.setInputAction(
        () => this._handleRightClick(),
        Cesium.ScreenSpaceEventType.RIGHT_CLICK,
      );
    }
  }

  _handleLeftClick(click) {
    const cartesian = this._pickGlobe(click.position);
    if (!cartesian) return;
    if (this.mode === "polygon" || this.mode === "polyline") {
      this._addPoint(cartesian);
    } else {
      this._handleAnchorClick(cartesian);
    }
  }

  _handleMouseMove(movement) {
    const cartesian = this._pickGlobe(movement.endPosition);
    if (!cartesian) return;

    if (this.mode === "polygon" || this.mode === "polyline") {
      this.movingPosition = cartesian;
    } else if (this.mode === "rectangle" && this.anchorCartesian) {
      this.previewRectangle = this._rectangleFromTwoCartesians(
        this.anchorCartesian,
        cartesian,
      );
    } else if (this.mode === "circle" && this.anchorCartesian) {
      this.previewRadius = this._distanceOnGround(
        this.anchorCartesian,
        cartesian,
      );
    }
  }

  _handleAnchorClick(cartesian) {
    if (!this.anchorCartesian) {
      this.anchorCartesian = cartesian;
      this.previewEntities.forEach((entity) => (entity.show = true));
      this.onStatus(
        this.mode === "circle"
          ? "移动鼠标确定半径，左键点击确认。"
          : "移动鼠标并左键点击第二个对角点。",
      );
    } else {
      if (this.mode === "rectangle") {
        this.previewRectangle = this._rectangleFromTwoCartesians(
          this.anchorCartesian,
          cartesian,
        );
      } else {
        this.previewRadius = this._distanceOnGround(
          this.anchorCartesian,
          cartesian,
        );
      }
      this.finishDraw();
    }
  }

  _handleRightClick() {
    const min = this.mode === "polygon" ? 3 : 2;
    if (this.drawPositions.length < min) {
      this.onStatus(`至少需要 ${min} 个点，请继续取点。`);
      return;
    }
    this.finishDraw();
  }

  _addPoint(cartesian) {
    this.drawPositions.push(cartesian);
    this.drawPointEntities.push(
      this.viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: this.params.vertexSize,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
    this.onStatus(`已取 ${this.drawPositions.length} 个点，右键结束绘制。`);
  }

  _canFinish(mode) {
    if (mode === "polygon") return this.drawPositions.length >= 3;
    if (mode === "polyline") return this.drawPositions.length >= 2;
    if (mode === "rectangle") return !!this.previewRectangle;
    if (mode === "circle") return !!this.previewRadius;
    return false;
  }

  _destroyHandler() {
    this.drawing = false;
    if (this.drawHandler) {
      this.drawHandler.destroy();
      this.drawHandler = null;
    }
  }

  _resetDrawState() {
    this.mode = null;
    this.drawing = false;
    this.drawPositions = [];
    this.movingPosition = null;
    this.anchorCartesian = null;
    this.previewRectangle = null;
    this.previewRadius = null;
  }

  _pickGlobe(windowPosition) {
    const ray = this.viewer.camera.getPickRay(windowPosition);
    if (!ray) return null;
    return this.viewer.scene.globe.pick(ray, this.viewer.scene);
  }

  _rectangleFromTwoCartesians(start, end) {
    const c1 = Cesium.Cartographic.fromCartesian(start);
    const c2 = Cesium.Cartographic.fromCartesian(end);
    const west = Math.min(c1.longitude, c2.longitude);
    const east = Math.max(c1.longitude, c2.longitude);
    const south = Math.min(c1.latitude, c2.latitude);
    const north = Math.max(c1.latitude, c2.latitude);
    return new Cesium.Rectangle(west, south, east, north);
  }

  /** 两点间的地面距离（局部平面近似，与测量口径一致） */
  _distanceOnGround(a, b) {
    const ca = Cesium.Cartographic.fromCartesian(a);
    const cb = Cesium.Cartographic.fromCartesian(b);
    const { mx, my } = metersPerDegree(
      Cesium.Math.toDegrees((ca.latitude + cb.latitude) / 2),
    );
    return Math.hypot(
      (Cesium.Math.toDegrees(cb.longitude) -
        Cesium.Math.toDegrees(ca.longitude)) *
        mx,
      (Cesium.Math.toDegrees(cb.latitude) -
        Cesium.Math.toDegrees(ca.latitude)) *
        my,
    );
  }

  /** 以圆心 + 半径生成近似圆的闭合折线 */
  _circleRing(center, radius, segments = 64) {
    const carto = Cesium.Cartographic.fromCartesian(center);
    const centerLat = Cesium.Math.toDegrees(carto.latitude);
    const centerLon = Cesium.Math.toDegrees(carto.longitude);
    const { mx, my } = metersPerDegree(centerLat);

    const ring = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      ring.push(
        Cesium.Cartesian3.fromDegrees(
          centerLon + (radius * Math.cos(angle)) / mx,
          centerLat + (radius * Math.sin(angle)) / my,
        ),
      );
    }
    return ring;
  }

  _fillMaterial() {
    return Cesium.Color.fromCssColorString(this.params.fillColor).withAlpha(
      this.params.fillOpacity,
    );
  }

  _outlineMaterial() {
    return Cesium.Color.fromCssColorString(this.params.outlineColor);
  }

  // ============================================================
  // 内部：预览实体
  // ============================================================

  _createPreview() {
    this._removePreview();
    const mode = this.mode;

    if (mode === "polygon") {
      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              if (p.length > 2) p.push(p[0]);
              return p.length > 1 ? p : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
      this.previewEntities.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              return p.length > 2 ? new Cesium.PolygonHierarchy(p) : undefined;
            }, false),
            material: Cesium.Color.CYAN.withAlpha(0.15),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
    } else if (mode === "polyline") {
      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              return p.length > 1 ? p : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
    } else if (mode === "rectangle") {
      this.previewEntities.push(
        this.viewer.entities.add({
          rectangle: {
            coordinates: new Cesium.CallbackProperty(
              () => this.previewRectangle,
              false,
            ),
            material: Cesium.Color.CYAN.withAlpha(0.18),
            outline: true,
            outlineColor: Cesium.Color.CYAN,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
          show: false,
        }),
      );
    } else if (mode === "circle") {
      // 圆预览：使用贴地折线 + 贴地面（与最终图形一致），
      // 避免 ellipse 实体在贴地模式下不可见的问题
      const circlePositions = () => {
        if (!this.anchorCartesian || !this.previewRadius) return [];
        return this._circleRing(this.anchorCartesian, this.previewRadius);
      };

      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const ring = circlePositions();
              return ring.length ? ring.concat(ring[0]) : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
      this.previewEntities.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(() => {
              const ring = circlePositions();
              return ring.length > 2
                ? new Cesium.PolygonHierarchy(ring)
                : undefined;
            }, false),
            material: Cesium.Color.CYAN.withAlpha(0.15),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
    }
  }

  _removePreview(keepPoints = false) {
    this.previewEntities.forEach((entity) =>
      this.viewer.entities.remove(entity),
    );
    this.previewEntities = [];
    if (!keepPoints) {
      this.drawPointEntities.forEach((entity) =>
        this.viewer.entities.remove(entity),
      );
      this.drawPointEntities = [];
    }
  }

  // ============================================================
  // 内部：正式图形实体
  // ============================================================

  _createFinalShape(mode) {
    if (mode === "polygon") {
      const ring = this.drawPositions.slice();
      ring.push(ring[0]);
      this.shapeEntities.polygon.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(this.drawPositions.slice()),
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      this.shapeEntities.polygon.push(
        this.viewer.entities.add({
          polyline: {
            positions: ring,
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "polyline") {
      this.shapeEntities.polyline.push(
        this.viewer.entities.add({
          polyline: {
            positions: this.drawPositions.slice(),
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "rectangle") {
      const rect = this.previewRectangle;
      this.shapeEntities.rectangle.push(
        this.viewer.entities.add({
          rectangle: {
            coordinates: rect,
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      const ring = [
        rect.west,
        rect.south,
        rect.west,
        rect.north,
        rect.east,
        rect.north,
        rect.east,
        rect.south,
      ];
      this.shapeEntities.rectangle.push(
        this.viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(ring),
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "circle") {
      const ring = this._circleRing(this.anchorCartesian, this.previewRadius);
      const closed = ring.slice();
      closed.push(closed[0]);
      this.shapeEntities.circle.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(ring),
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      this.shapeEntities.circle.push(
        this.viewer.entities.add({
          polyline: {
            positions: closed,
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    }
  }

  // ============================================================
  // 内部：绘制完成回调载荷
  // ============================================================

  /** 组装绘制完成回调的载荷：id、类型、Cartesian3[]、经纬度(度) 及测量信息 */
  _buildCompletePayload(mode) {
    const info = {
      id: `shape-${++this._shapeSeq}`,
      type: mode,
      positions: [],
      lonLats: [],
    };

    if (mode === "polygon" || mode === "polyline") {
      info.positions = this.drawPositions.slice();
      info.lonLats = toLonLats(this.drawPositions).map((p) => [p.x, p.y]);
      if (mode === "polygon") {
        const { area, perimeter } = measurePolygon(this.drawPositions);
        info.area = area;
        info.perimeter = perimeter;
      } else {
        info.length = measurePolyline(this.drawPositions).length;
      }
    } else if (mode === "rectangle") {
      const rect = this.previewRectangle;
      info.rectangle = {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      };
      const corners = [
        [info.rectangle.west, info.rectangle.south],
        [info.rectangle.east, info.rectangle.south],
        [info.rectangle.east, info.rectangle.north],
        [info.rectangle.west, info.rectangle.north],
      ];
      info.positions = corners.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat),
      );
      info.lonLats = corners;
      const { area, perimeter } = measureRectangle(rect);
      info.area = area;
      info.perimeter = perimeter;
    } else if (mode === "circle") {
      const carto = Cesium.Cartographic.fromCartesian(this.anchorCartesian);
      const centerLon = Cesium.Math.toDegrees(carto.longitude);
      const centerLat = Cesium.Math.toDegrees(carto.latitude);
      info.center = {
        position: this.anchorCartesian,
        lonLats: [centerLon, centerLat],
      };
      info.radius = this.previewRadius;
      info.positions = this._circleRing(
        this.anchorCartesian,
        this.previewRadius,
      );
      info.lonLats = toLonLats(info.positions).map((p) => [p.x, p.y]);
      info.area = Math.PI * info.radius * info.radius;
      info.perimeter = 2 * Math.PI * info.radius;
    }

    return info;
  }

  // ============================================================
  // 内部：测量文本
  // ============================================================

  _measureText(mode) {
    if (mode === "polygon") {
      const { area, perimeter } = measurePolygon(this.drawPositions);
      return [
        `多边形绘制完成，共 ${this.drawPositions.length} 个顶点。`,
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "polyline") {
      const { length } = measurePolyline(this.drawPositions);
      return [
        `折线绘制完成，共 ${this.drawPositions.length} 个端点。`,
        `长度：${length.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "rectangle") {
      const { area, perimeter } = measureRectangle(this.previewRectangle);
      return [
        "矩形绘制完成。",
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "circle") {
      const r = this.previewRadius;
      const area = Math.PI * r * r;
      const perimeter = 2 * Math.PI * r;
      return [
        "圆绘制完成。",
        `半径：${r.toFixed(0)} m`,
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    return "";
  }
}
