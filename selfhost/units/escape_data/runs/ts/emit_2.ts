export function escapeData(v: unknown): string {
  return String(v)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}
