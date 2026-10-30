import { createHash } from "node:crypto";

export function hash_ok(text: string, want: string | null): boolean {
  if (want === null) return true;
  if (!/^[0-9a-f]{64}$/.test(want)) {
    throw new Error("hashOk: a pin is 64 lowercase hex digits (got " + JSON.stringify(want) + ")");
  }
  return createHash("sha256").update(text).digest("hex") === want;
}
