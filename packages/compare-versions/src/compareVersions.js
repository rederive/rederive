// @rederive/compareVersions — verified-recompose of compare-versions@3.6.0. quorum 3/3, differential 400/400, round 1. SIR: sir/compareVersions.sir
// Clean-room re-emission of compareVersions (compare-versions@3.6.0)
// Reconstructed from SIR contract only. Zero dependencies. Pure ESM.

const semver = /^v?(?:\d+)(\.(?:[x*]|\d+)(\.(?:[x*]|\d+)(\.(?:[x*]|\d+))?(?:-[\da-z\-]+(?:\.[\da-z\-]+)*)?(?:\+[\da-z\-]+(?:\.[\da-z\-]+)*)?)?)?$/i;

function split(v) {
  // Strip single leading lowercase 'v' (note: /^v/ is NOT case-insensitive per SIR)
  let c = v.replace(/^v/, '');
  // Strip build metadata
  c = c.replace(/\+.*$/, '');
  // Find index of first '-'
  const patchIndex = c.indexOf('-');
  const end = patchIndex === -1 ? c.length : patchIndex;
  const numericPart = c.substring(0, end);
  // If no '-', substring(len+1) = "" per SIR
  const preRelease = patchIndex === -1 ? '' : c.substring(patchIndex + 1);
  const arr = numericPart.split('.');
  arr.push(preRelease);
  return arr;
}

function tryParse(token) {
  const n = Number(token);
  return isNaN(n) ? token : n;
}

function compareVersions(v1, v2) {
  // NODE 1 — Validation (v1 first, then v2)
  for (const version of [v1, v2]) {
    if (typeof version !== 'string') {
      throw new TypeError('Invalid argument expected string');
    }
    if (!semver.test(version)) {
      throw new Error("Invalid argument not valid semver ('" + version + "' received)");
    }
  }

  // NODE 2 — Split
  const s1 = split(v1);
  const s2 = split(v2);

  // NODE 3 — Numeric segment comparison
  // Loop over numeric slots only (exclude last element which is pre-release)
  const numLen = Math.max(s1.length - 1, s2.length - 1);
  for (let i = 0; i < numLen; i++) {
    const n1 = parseInt(s1[i] || 0, 10);
    const n2 = parseInt(s2[i] || 0, 10);
    if (n1 > n2) return 1;
    if (n2 > n1) return -1;
    // NaN comparisons both false => treat as equal (wildcard semantics)
  }

  // NODE 4 — Pre-release comparison
  const sp1 = s1[s1.length - 1];
  const sp2 = s2[s2.length - 1];

  if (sp1 && sp2) {
    // CASE A — both non-empty
    const p1 = sp1.split('.').map(tryParse);
    const p2 = sp2.split('.').map(tryParse);
    const preLen = Math.max(p1.length, p2.length);
    for (let i = 0; i < preLen; i++) {
      // Rule 1
      if (p1[i] === undefined || (typeof p2[i] === 'string' && typeof p1[i] === 'number')) return -1;
      // Rule 2
      if (p2[i] === undefined || (typeof p1[i] === 'string' && typeof p2[i] === 'number')) return 1;
      // Rule 3
      if (p1[i] > p2[i]) return 1;
      // Rule 4
      if (p2[i] > p1[i]) return -1;
      // else continue
    }
  } else if (sp1 || sp2) {
    // CASE B — exactly one non-empty: pre-release ranks below release
    return sp1 ? -1 : 1;
  }
  // CASE C — both empty, fall through

  // NODE 5 — Default
  return 0;
}

export default compareVersions;
