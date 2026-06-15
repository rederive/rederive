// @rederive/rdv — verified-recompose of hashOk (rederive cli/verdict.mts).
// Verified by rdv check (held-out) + quorum 3/3 (rdv resynth, original deleted).
// Control logic only: absent/empty want => true; else exact sha256-hex match. The SHA-256 algorithm
// is the host's (node:crypto) — verifying the primitive + substrate is the every-byte enterprise tier.
import { createHash } from 'node:crypto';

export function hashOk(bytes, want) {
  if (want === undefined || want === '') return true;
  return createHash('sha256').update(bytes).digest('hex') === want;
}
