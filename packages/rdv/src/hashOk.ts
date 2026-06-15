// @rederive/rdv — verified-recompose of hashOk (rederive cli/verdict.mts (rdv verdict core)). ZERO-DEP.
// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;
// quorum 3/3, 5/5 held-out. Trust your own build, not the publisher's.
import { createHash } from 'node:crypto';

export function hashOk(bytes: any, want?: string): boolean {
  if (want === undefined || want === '') {
    return true;
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  return actual === want;
}
