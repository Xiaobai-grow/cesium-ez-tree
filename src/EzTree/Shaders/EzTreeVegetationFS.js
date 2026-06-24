export default `
in vec3 v_normalEC;
in vec2 v_st;
in vec4 v_color;
in float v_windWeight;

uniform float u_cutoutType;
uniform float u_alphaCutoff;
uniform sampler2D u_barkColorTexture;
uniform vec2 u_barkTextureScale;
uniform bool u_useBarkTexture;
uniform sampler2D u_assetColorTexture;
uniform bool u_useAssetColorTexture;
uniform bool u_roundedLeafNormals;

float ezTree_leafMask(vec2 st)
{
    vec2 p = st * 2.0 - 1.0;
    p.y += 0.12;
    float body = 1.0 - dot(p * vec2(0.78, 1.08), p * vec2(0.78, 1.08));
    float tip = smoothstep(-0.2, 0.85, st.y);
    return body * tip;
}

float ezTree_grassMask(vec2 st)
{
    float center = abs(st.x - 0.5) * 2.0;
    float height = 1.0 - st.y;
    float taper = 1.0 - smoothstep(0.1, 1.0, height);
    return 1.0 - smoothstep(max(0.08, taper), 1.0, center);
}

float ezTree_flowerMask(vec2 st)
{
    if (st.y < 0.0) {
        return 1.0;
    }

    vec2 p = st * 2.0 - 1.0;
    float petal = 1.0 - dot(p * vec2(0.92, 1.28), p * vec2(0.92, 1.28));
    float center = 1.0 - smoothstep(0.0, 0.22, length(p));
    return max(petal, center);
}

void main()
{
    float mask = 1.0;
    vec4 assetTexel = vec4(1.0);
    if (u_useAssetColorTexture) {
        assetTexel = texture(u_assetColorTexture, v_st);
        mask = assetTexel.a;
    } else if (u_cutoutType > 2.5) {
        mask = ezTree_flowerMask(v_st);
    } else if (u_cutoutType > 1.5) {
        mask = ezTree_grassMask(v_st);
    } else if (u_cutoutType > 0.5) {
        mask = ezTree_leafMask(v_st);
    }

    if (mask < u_alphaCutoff) {
        discard;
    }

    vec3 albedo = v_color.rgb;
    if (u_useAssetColorTexture) {
        albedo *= assetTexel.rgb;
    } else if (u_cutoutType < 0.5 && u_useBarkTexture) {
        vec2 barkSt = vec2(
            v_st.x * u_barkTextureScale.x,
            v_st.y / max(u_barkTextureScale.y, 0.001)
        );
        albedo *= texture(u_barkColorTexture, barkSt).rgb;
    }

    vec3 normalEC = normalize(
        u_roundedLeafNormals
            ? v_normalEC
            : (gl_FrontFacing ? v_normalEC : -v_normalEC)
    );
    float diffuse = max(dot(normalEC, normalize(czm_lightDirectionEC)), 0.0);
    float wrap = 0.38 + diffuse * 0.62;
    vec3 color = albedo * wrap;
    if (u_cutoutType > 2.5 && v_st.y < 0.0) {
        color = vec3(0.22, 0.48, 0.18) * wrap;
    }
    color += albedo * 0.08 * v_windWeight;

    out_FragColor = vec4(color, v_color.a);
}
`;
