// @rederive/normalizePath — verified-recompose of normalize-path@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/normalizePath.sir
export default function normalizePath(path, stripTrailing) {
  // NODE 1 — TYPE GUARD
  if (typeof path !== 'string') {
    throw new TypeError('expected path to be a string');
  }

  // NODE 2 — SINGLE-SEPARATOR SHORTCUT
  if (path === '\\' || path === '/') {
    return '/';
  }

  // NODE 3 — TRIVIAL-LENGTH SHORTCUT
  var len = path.length;
  if (len <= 1) {
    return path;
  }

  // NODE 4 — WIN32 NAMESPACE PREFIX DETECTION
  var prefix = '';
  if (len > 4 && path[3] === '\\') {
    var ch = path[2];
    if ((ch === '?' || ch === '.') && path.slice(0, 2) === '\\\\') {
      path = path.slice(2);
      prefix = '//';
    }
  }

  // NODE 5 — SPLIT ON SEPARATOR RUNS
  var segs = path.split(/[/\\]+/);

  // NODE 6 — OPTIONAL TRAILING-EMPTY-SEGMENT STRIP
  if (stripTrailing !== false && segs[segs.length - 1] === '') {
    segs.pop();
  }

  // NODE 7 — JOIN
  return prefix + segs.join('/');
}
