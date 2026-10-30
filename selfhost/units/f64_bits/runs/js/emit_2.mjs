const dv = new DataView(new ArrayBuffer(8));

export function f64_bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

export default f64_bits;
