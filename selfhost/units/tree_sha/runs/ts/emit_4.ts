import { createHash } from 'node:crypto';

function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function validPath(p: string): boolean {
  if (p.length === 0 || p.startsWith('/') || p.includes('\\')) return false;
  for (const n of p.split('/')) {
    if (n === '' || n === '.' || n === '..') return false;
  }
  return true;
}

export function tree_sha(files: Readonly<Record<string, string>>): string {
  const keys = Object.keys(files);
  for (const k of keys) {
    if (!validPath(k)) throw new Error('tree_sha: not a relative path ' + JSON.stringify(k));
  }
  const lines: string[] = [];
  for (const k of keys) {
    const names = k.split('/');
    if (names.length >= 2 && names[0] === 'target') continue;
    const content = files[k] ?? '';
    lines.push(k + '\u0000' + sha(content) + '\n');
  }
  lines.sort();
  return sha(lines.join(''));
}
