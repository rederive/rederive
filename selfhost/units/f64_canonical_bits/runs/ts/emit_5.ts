const HEX16 = /^[0-9a-f]{16}$/;
const QNAN = "7ff8000000000000";

export function f64_canonical_bits(raw: string): string {
  if (typeof raw !== "string" || !HEX16.test(raw)) {
    throw new Error('f64 bits must be 16 lowercase hex digits (got "' + String(raw) + '")');
  }
  const dv = new DataView(new ArrayBuffer(8));
  dv.setBigUint64(0, BigInt("0x" + raw), false);
  const v = dv.getFloat64(0, false);
  if (Number.isNaN(v)) return QNAN;
  dv.setFloat64(0, v, false);
  return dv.getBigUint64(0, false).toString(16).padStart(16, "0");
}
