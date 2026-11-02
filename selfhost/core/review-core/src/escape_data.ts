export function escapeData(v: unknown): string {
  return String(v).replace(/[%\r\n]/g, (c: string): string => (c === '%' ? '%25' : c === '\r' ? '%0D' : '%0A'));
}
