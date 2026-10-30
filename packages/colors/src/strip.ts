const CODE_RE = /\x1B\[\d+m/g;

export function strip(str: unknown): string {
  return ('' + str).replace(CODE_RE, '');
}
