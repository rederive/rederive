// @rederive/colors — verified-recompose of strip (colors@1.4.0). ZERO-DEP.
// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;
// quorum 3/3, 10/10 held-out. Trust your own build, not the publisher's.
export function strip(str) {
  return ('' + str).replace(/\x1B\[\d+m/g, '');
}

export { strip as stripColors };
