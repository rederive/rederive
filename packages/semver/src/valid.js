// @rederive/valid — verified-recompose of semver@5.7.1. quorum 3/3, differential 400/400, round 1. SIR: sir/valid.sir
// Clean-room re-emission of semver@5.7.1 `valid`
// Reconstructed from SIR + frozen oracle. No import of the original package.

const MAX_LENGTH = 256;
const MAX_SAFE_INTEGER = 9007199254740991; // 2^53 - 1

// RE_FULL: strict mode
// ^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$
const RE_FULL = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// RE_LOOSE: loose mode
// ^[v=\s]*([0-9]+)\.([0-9]+)\.([0-9]+)(?:-?((?:[0-9]+|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:[0-9]+|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$
const RE_LOOSE = /^[v=\s]*([0-9]+)\.([0-9]+)\.([0-9]+)(?:-?((?:[0-9]+|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:[0-9]+|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// Sentinel class for SemVer-instance passthrough detection
class SemVer {
  constructor(version, loose) {
    this._isSemVer = true;
    this.version = version;
    this.loose = loose;
  }
}

export function valid(version, optionsOrLoose) {
  // Step 0 — normalize options into `loose` boolean
  let loose;
  if (optionsOrLoose === null || optionsOrLoose === undefined || typeof optionsOrLoose !== 'object') {
    loose = Boolean(optionsOrLoose);
  } else {
    loose = Boolean(optionsOrLoose.loose);
  }

  // Step 1 — SemVer-instance passthrough
  if (version instanceof SemVer) {
    return version.version;
  }

  // Step 2 — non-string guard
  if (typeof version !== 'string') {
    return null;
  }

  // Step 3 — length guard on RAW string
  if (version.length > MAX_LENGTH) {
    return null;
  }

  // Step 4 — regex GATE on RAW (untrimmed) string
  const r = loose ? RE_LOOSE : RE_FULL;
  if (!r.test(version)) {
    return null;
  }

  // Step 5 — parse the TRIMMED string (re-match)
  try {
    const m = version.trim().match(r);
    if (!m) {
      return null;
    }

    // Extract main numbers
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = Number(m[3]);

    if (major > MAX_SAFE_INTEGER || major < 0) return null;
    if (minor > MAX_SAFE_INTEGER || minor < 0) return null;
    if (patch > MAX_SAFE_INTEGER || patch < 0) return null;

    // Prerelease
    let prerelease;
    if (!m[4]) {
      prerelease = [];
    } else {
      prerelease = m[4].split('.').map(id => {
        if (/^[0-9]+$/.test(id)) {
          const num = Number(id);
          if (num >= 0 && num < MAX_SAFE_INTEGER) {
            return num;
          }
        }
        return id;
      });
    }

    // Build (parsed but dropped from output)
    // const build = m[5] ? m[5].split('.') : [];

    // Step 6 — format()
    let out = major + '.' + minor + '.' + patch;
    if (prerelease.length > 0) {
      out = out + '-' + prerelease.join('.');
    }
    // Build metadata is NEVER appended.

    return out;
  } catch (e) {
    return null;
  }
}

export default valid;
