// @rederive/fresh — verified-recompose of fresh@0.5.2. quorum 3/3, differential 400/400, round 1. SIR: sir/fresh.sir
function parseHttpDate(date) {
  var timestamp = date && Date.parse(date);
  return (typeof timestamp === 'number') ? timestamp : NaN;
}

function parseTokenList(str) {
  var list = [];
  var start = 0;
  var end = 0;
  var len = str.length;
  for (var i = 0; i < len; i++) {
    var code = str.charCodeAt(i);
    if (code === 0x20) {
      // space: skip leading spaces only (while start === end)
      if (start === end) {
        start = end = i + 1;
      }
      // if start !== end, space is interior — do not advance end
    } else if (code === 0x2c) {
      // comma: push current token, reset
      list.push(str.substring(start, end));
      start = end = i + 1;
    } else {
      // any other char: advance end
      end = i + 1;
    }
  }
  // final token (always pushed)
  list.push(str.substring(start, end));
  return list;
}

function fresh(reqHeaders, resHeaders) {
  var modifiedSince = reqHeaders['if-modified-since'];
  var noneMatch = reqHeaders['if-none-match'];

  // NODE 1 — Unconditional request: both falsy -> return false
  if (!modifiedSince && !noneMatch) {
    return false;
  }

  // NODE 2 — Cache-Control: no-cache
  var cacheControl = reqHeaders['cache-control'];
  if (cacheControl && /(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(cacheControl)) {
    return false;
  }

  // NODE 3 — If-None-Match (ETag) check
  // Skipped if noneMatch is falsy OR noneMatch === '*'
  if (noneMatch && noneMatch !== '*') {
    var etag = resHeaders['etag'];
    // a) missing/falsy etag -> stale
    if (!etag) {
      return false;
    }
    // b) scan token list for a match
    var etagStale = true;
    var matches = parseTokenList(noneMatch);
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      if (match === etag || match === 'W/' + etag || 'W/' + match === etag) {
        etagStale = false;
        break;
      }
    }
    // c) if still stale -> return false
    if (etagStale) {
      return false;
    }
  }

  // NODE 4 — If-Modified-Since (date) check
  if (modifiedSince) {
    var lastModified = resHeaders['last-modified'];
    var modifiedStale = !lastModified ||
      !(parseHttpDate(lastModified) <= parseHttpDate(modifiedSince));
    if (modifiedStale) {
      return false;
    }
  }

  // NODE 5 — Default: all applicable checks passed
  return true;
}

export default fresh;
