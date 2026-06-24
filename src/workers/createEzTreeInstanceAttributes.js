import createTaskProcessorWorker from "@cesium/engine/Source/Workers/createTaskProcessorWorker.js";
import createEzTreeInstanceAttributes from "../EzTree/EzTreeInstanceAttributes.js";

function createEzTreeInstanceAttributesWorker(parameters, transferableObjects) {
  const attributes = createEzTreeInstanceAttributes(
    parameters.instances,
    parameters.colorMode,
  );
  transferableObjects.push(attributes.values.buffer);
  return attributes;
}

export default createTaskProcessorWorker(createEzTreeInstanceAttributesWorker);
