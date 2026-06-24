import createTaskProcessorWorker from "@cesium/engine/Source/Workers/createTaskProcessorWorker.js";
import createEzTreeVegetationInstances from "../EzTree/EzTreeVegetationInstances.js";

function createEzTreeVegetationInstancesWorker(parameters) {
  return createEzTreeVegetationInstances(parameters);
}

export default createTaskProcessorWorker(createEzTreeVegetationInstancesWorker);
