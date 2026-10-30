import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const valid = (p) => {
  if (p.includes('\\')) return false;
  return p.split('/').every((n) => n !== '' && n !== '.' && n !== '..');
};

export function tree_sha(files) {
  const paths = Object.keys(files);
  for (const p of paths) {
    if (!valid(p)) throw new Error('tree_sha: not a relative path ' + JSON.stringify(p));
  }
  const lines = [];
  for (const p of paths) {
    const names = p.split('/');
    if (names.length >= 2 && names[0] === 'target') continue;
    lines.push(p + '\u0000' + sha(files[p]) + '\n');
  }
  lines.sort();
  return sha(lines.join(''));
}

export default tree_sha;
