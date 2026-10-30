const HEX16: RegExp = /^[0-9a-f]{16}$/;

export default function f64_from_bits(bits: string): number {
  if (typeof bits !== "string" || !HEX16.test(bits)) {
    throw new Error("f64 bits must be 16 lowercase hex digits");
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, parseInt(bits.slice(0, 8), 16), false);
  view.setUint32(4, parseInt(bits.slice(8, 16), 16), false);
  return view.getFloat64(0, false);
}

export { f64_from_bits };
