// @rederive/request — verified-recompose of toBase64 (request@2.88.2 lib/helpers.js). ZERO-DEP.
// Re-derived by quorum from sir/ + oracles/ (stamped from the real original, then deleted);
// quorum 3/3, 5/5 held-out. Trust your own build.
export function toBase64(str) {
  return Buffer.from(str || '', 'utf8').toString('base64');
}
