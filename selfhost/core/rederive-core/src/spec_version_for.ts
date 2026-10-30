const FEATURES: ReadonlyMap<string, string> = new Map<string, string>([
  ["vectors", "0.2"],
  ["carried-data", "0.3"],
  ["envelope", "0.3"],
  ["trace-seam", "0.3"],
  ["scheduler", "0.4"],
  ["lifecycle", "0.4"],
  ["par-interleaving", "0.4"],
  ["ring", "0.4"],
  ["lang-variant", "0.5"],
  ["cross-lang-anchor", "0.5"],
]);

const ORDER: readonly string[] = ["0.2", "0.3", "0.4", "0.5"];

export default function spec_version_for(features: readonly string[]): string {
  if (!Array.isArray(features)) throw new Error("features must be a list");
  let result = "0.2";
  for (const name of features) {
    const since = typeof name === "string" ? FEATURES.get(name) : undefined;
    if (since === undefined) {
      throw new Error(`unknown feature ${JSON.stringify(name)} — not in cli/capabilities.json; refusing to stamp a version for it`);
    }
    if (ORDER.indexOf(since) > ORDER.indexOf(result)) result = since;
  }
  return result;
}
