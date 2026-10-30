import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export default function tree_sha(files: Readonly<Record<string, string>>): string {
  const paths = Object.keys(files);
  for (const p of paths) {
    const names = p.split('/');
    const bad = p.startsWith('/') || p.includes('\\') || names.some((n) => n === '' || n === '.' || n === '..');
    if (bad) throw new Error('tree_sha: not a relative path ' + JSON.stringify(p));
  }
  const lines: string[] = [];
  for (const p of paths) {
    const names = p.split('/');
    if (names.length >= 2 && names[0] === 'target') continue;
    const text = files[p] ?? '';
    lines.push(p + '\u0000' + sha(text) + '\n');
  }
  lines.sort();
  return sha(lines.join(''));
}
