const HEX16 = /^[0-9a-f]{16}$/;
const RAW_CAP = 416;

function fail(msg: string): never {
  throw new Error("not canonical: " + msg);
}

function render(x: unknown, depth: number): string {
  if (depth > RAW_CAP) fail("too deep");
  if (typeof x === "string") return JSON.stringify(x);
  if (typeof x === "boolean") return x ? "true" : "false";
  if (Array.isArray(x)) {
    const parts: string[] = [];
    for (let i = 0; i < x.length; i++) {
      if (!(i in x)) fail("hole");
      parts.push(render(x[i], depth + 1));
    }
    return "[" + parts.join(",") + "]";
  }
  if (typeof x === "object" && x !== null) {
    const proto: unknown = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) fail("not a plain map");
    const o = x as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.indexOf("t") >= 0) {
      const tag = o["t"];
      if (tag === "f64") {
        const bits = o["bits"];
        if (typeof bits !== "string" || !HEX16.test(bits)) fail("an f64 tag without 16-hex bits");
        if (depth + 1 > RAW_CAP) fail("too deep");
        return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
      }
      if (tag === "throw") {
        if (depth + 1 > RAW_CAP) fail("too deep");
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
  return fail("unsupported value");
}

export default function canonical_string(value: unknown): string {
  return render(value, 0);
}
