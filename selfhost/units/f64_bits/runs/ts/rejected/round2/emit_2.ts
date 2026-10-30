export default function f64_bits(x: number): string {
  if (Number.isNaN(x)) return "7ff8000000000000";
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}
