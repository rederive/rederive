import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const valid = (p: string): boolean => {
  if (p.includes('\\')) return false;
  return p.split('/').every((n) => n !== '' && n !== '.' && n !== '..');
};

export function tree_sha(files: Readonly<Record<string, string>>): string {
  const keys = Object.keys(files);
  for (const p of keys) {
    if (!valid(p)) throw new Error('tree_sha: not a relative path ' + JSON.stringify(p));
  }
  const lines: string[] = [];
  for (const p of keys) {
    const names = p.split('/');
    if (names.length >= 2 && names[0] === 'target') continue;
    lines.push(p + '\u0000' + sha(files[p] as string) + '\n');
  }
  lines.sort();
  return sha(lines.join(''));
}
