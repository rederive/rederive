const HEX16 = /^[0-9a-f]{16}$/;
const RAW_CAP = 416;

function render(x: unknown, depth: number): string {
  if (depth > RAW_CAP) throw new Error("not canonical: too deep");
  if (typeof x === "string") return JSON.stringify(x);
  if (typeof x === "boolean") return x ? "true" : "false";
  if (Array.isArray(x)) {
    const parts: string[] = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) throw new Error("not canonical: hole");
      parts.push(render(x[i], depth + 1));
    }
    return "[" + parts.join(",") + "]";
  }
  if (typeof x === "object" && x !== null) {
    const proto: unknown = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) throw new Error("not canonical: object");
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.indexOf("t") >= 0) {
      const t = o["t"];
      if (t === "f64") {
        const bits = o["bits"];
        if (typeof bits !== "string" || !HEX16.test(bits)) {
          throw new Error("not canonical: an f64 tag without 16-hex bits");
        }
        if (depth + 1 > RAW_CAP) throw new Error("not canonical: too deep");
        return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
      }
      if (t === "throw") {
        if (depth + 1 > RAW_CAP) throw new Error("not canonical: too deep");
        return '{"t":"throw"}';
      }
    }
    keys.sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ":" + render(o[k], depth + 1));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error("not canonical");
}

export default function canonical_string(value: unknown): string {
  return render(value, 0);
}
