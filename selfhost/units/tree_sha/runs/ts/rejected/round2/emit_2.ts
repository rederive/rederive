import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const valid = (p: string): boolean => {
  if (p.length === 0 || p.startsWith('/') || p.includes('\\')) return false;
  return p.split('/').every((n) => n !== '' && n !== '.' && n !== '..');
};

export default function tree_sha(files: Readonly<Record<string, string>>): string {
  const keys = Object.keys(files);
  for (const k of keys) {
    if (!valid(k)) throw new Error('tree_sha: not a relative path ' + JSON.stringify(k));
  }
  const lines: string[] = [];
  for (const k of keys) {
    const names = k.split('/');
    if (names.length >= 2 && names[0] === 'target') continue;
    const text = files[k] ?? '';
    lines.push(k + '\u0000' + sha(text) + '\n');
  }
  lines.sort();
  return sha(lines.join(''));
}
