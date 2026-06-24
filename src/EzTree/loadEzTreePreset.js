import { loadPreset } from "./EzTreePresets.js";

/**
 * Creates an {@link EzTreeOptions} object from a built-in EzTree preset.
 *
 * @function loadEzTreePreset
 *
 * @param {string} name The preset name.
 * @returns {EzTreeOptions} The preset options, or default options if the preset is not found.
 */
const loadEzTreePreset = loadPreset;

export default loadEzTreePreset;
