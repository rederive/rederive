const HEX16 = /^[0-9a-f]{16}$/;
const QNAN = "7ff8000000000000";

export default function f64_canonical_bits(raw: string): string {
  if (typeof raw !== "string" || !HEX16.test(raw)) {
    throw new Error('f64 bits must be 16 lowercase hex digits (got ' + JSON.stringify(raw) + ')');
  }
  const dv = new DataView(new ArrayBuffer(8));
  dv.setBigUint64(0, BigInt('0x' + raw), false);
  const x = dv.getFloat64(0, false);
  if (Number.isNaN(x)) return QNAN;
  dv.setFloat64(0, x, false);
  return dv.getBigUint64(0, false).toString(16).padStart(16, '0');
}
