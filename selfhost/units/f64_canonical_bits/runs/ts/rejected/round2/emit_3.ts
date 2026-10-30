const HEX16: RegExp = /^[0-9a-f]{16}$/;
const QNAN: string = "7ff8000000000000";

export default function f64_canonical_bits(raw: string): string {
  if (typeof raw !== "string" || !HEX16.test(raw)) {
    throw new Error('f64 bits must be 16 lowercase hex digits (got "' + String(raw) + '")');
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt("0x" + raw), false);
  const value: number = view.getFloat64(0, false);
  if (Number.isNaN(value)) return QNAN;
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false).toString(16).padStart(16, "0");
}
