const HEX16 = /^[0-9a-f]{16}$/;

export default function f64_from_bits(bits) {
  if (typeof bits !== 'string' || !HEX16.test(bits)) {
    throw new Error('f64 bits must be 16 lowercase hex digits');
  }
  const dv = new DataView(new ArrayBuffer(8));
  dv.setBigUint64(0, BigInt('0x' + bits), false);
  return dv.getFloat64(0, false);
}

export { f64_from_bits };
