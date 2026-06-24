function EzTreeRNG(seed) {
  this._mask = 0xffffffff;
  this._mW = (123456789 + (seed ?? 0)) & this._mask;
  this._mZ = (987654321 - (seed ?? 0)) & this._mask;
}

EzTreeRNG.prototype.random = function (maximum, minimum) {
  maximum = maximum ?? 1.0;
  minimum = minimum ?? 0.0;

  this._mZ = (36969 * (this._mZ & 65535) + (this._mZ >> 16)) & this._mask;
  this._mW = (18000 * (this._mW & 65535) + (this._mW >> 16)) & this._mask;

  let result = ((this._mZ << 16) + (this._mW & 65535)) >>> 0;
  result /= 4294967296;
  return (maximum - minimum) * result + minimum;
};

export default EzTreeRNG;
