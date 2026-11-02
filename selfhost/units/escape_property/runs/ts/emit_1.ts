const PCT = /%/g;
const CR = /\r/g;
const LF = /\n/g;
const COLON = /:/g;
const COMMA = /,/g;

export default function escape_property(v: unknown): string {
  return String(v)
    .replace(PCT, "%25")
    .replace(CR, "%0D")
    .replace(LF, "%0A")
    .replace(COLON, "%3A")
    .replace(COMMA, "%2C");
}
