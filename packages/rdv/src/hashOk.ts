// @rederive/rdv — verified-recompose of rdv's content-hash check (verdict core).
// NOT zero-dep: the SHA-256 algorithm is delegated to the host (node:crypto). The VERIFIED behavior
// is the control logic — an absent or empty `want` means "not pinned" => true; otherwise an exact hex
// match of sha256(bytes). Verifying the hash algorithm itself is the enterprise / every-byte extension
// (verified substrate + attestation), deliberately out of scope here. See The rederive Promise.
import { createHash } from 'node:crypto';
export function hashOk(bytes: any, want?: string): boolean {
  return !want || createHash('sha256').update(bytes).digest('hex') === want;
}
