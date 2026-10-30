// @rederive/sign — verified-recompose of aws4@1.12.0. quorum 3/3, differential 400/400, round 1. SIR: sir/sign.sir
// emit_1.mjs — blind clean-room reconstruction of aws4 sign() from SIR + frozen oracle ONLY.
// aws4@1.12.0 behavioral contract — ES module, named export { sign }.
//
// THE DESYNC (PRESERVED EXACTLY):
//   canonicalHeaders() filters ONLY on HEADERS_TO_IGNORE — no extraHeadersToInclude override.
//   signedHeaders()    filters on HEADERS_TO_IGNORE + extraHeadersToIgnore, PLUS honors extraHeadersToInclude.
//   => user-agent with extraHeadersToInclude:{user-agent:1} appears in SignedHeaders list
//      but is ABSENT from the canonical-headers block the signature is computed over.

import crypto from 'node:crypto';
import querystring from 'node:querystring';

// ---------- crypto helpers ----------
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ---------- RFC-3986 encoding ----------
// encodeRfc3986: also escapes !'()* which encodeURIComponent leaves
function encodeRfc3986(str) {
  return str.replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
// encodeRfc3986Full: encodeRfc3986(encodeURIComponent(s))
function encodeRfc3986Full(s) {
  return encodeRfc3986(encodeURIComponent(s));
}

// ---------- HEADERS_TO_IGNORE (7 entries — inline constant) ----------
const HEADERS_TO_IGNORE = Object.assign(Object.create(null), {
  authorization:        true,
  connection:           true,
  'x-amzn-trace-id':   true,
  'user-agent':         true,
  expect:               true,
  'presigned-expires':  true,
  range:                true,
});

// ---------- matchHost ----------
function matchHost(host) {
  const m = (host || '').match(/([^.]+)\.(?:([^.]*)\.)?amazonaws\.com(\.cn)?$/);
  let hostParts = (m || []).slice(1, 3);   // [label0, label1 or undefined]

  // ES / AOSS: labels are swapped (service is second label)
  if (hostParts[1] === 'es' || hostParts[1] === 'aoss') {
    hostParts.reverse();
  } else if (hostParts[1] === 's3') {
    // e.g. examplebucket.s3.amazonaws.com
    hostParts = ['s3', 'us-east-1'];
  } else {
    // s3-<region>.amazonaws.com
    for (let i = 0; i < 2; i++) {
      if (hostParts[i] && /^s3-/.test(hostParts[i])) {
        hostParts = ['s3', hostParts[i].slice(3)];
        break;
      }
    }
  }
  return hostParts;
}

// ---------- isSingleRegion / createHost ----------
function isSingleRegion(service, region) {
  if ((service === 's3' || service === 'sdb') && region === 'us-east-1') return true;
  const sr = { cloudfront: 1, ls: 1, route53: 1, iam: 1, importexport: 1, sts: 1 };
  return !!sr[service];
}

function createHost(service, region) {
  const reg = isSingleRegion(service, region) ? '' : '.' + region;
  const sub = service === 'ses' ? 'email' : service;
  return sub + reg + '.amazonaws.com';
}

// ---------- trimAll ----------
function trimAll(v) {
  return v.toString().trim().replace(/\s+/g, ' ');
}

// ---------- getDateTime (ambient clock path — only called when date is not pinned) ----------
function computeDateTime(headers) {
  const d = new Date(headers.Date || headers.date || new Date());
  return d.toISOString().replace(/[:\-]|\.\d{3}/g, '');
}

// ---------- parsePath ----------
function parsePath(request) {
  let path = request.path || '/';
  // re-encode if any char outside safe URL set
  if (/[^0-9A-Za-z;,/?:@&=+$\-_.!~*'()#%]/.test(path)) {
    path = encodeURI(decodeURI(path));
  }
  let query = null;
  const qi = path.indexOf('?');
  if (qi >= 0) {
    query = querystring.parse(path.slice(qi + 1));
    path = path.slice(0, qi);
  }
  return { path, query };
}

// ---------- formatPath ----------
function formatPath(parsedPath) {
  const { path, query } = parsedPath;
  if (!query) return path;
  if (query[''] != null) delete query[''];
  return path + '?' + encodeRfc3986(querystring.stringify(query));
}

// ---------- Main sign function ----------
export function sign(request, credentials) {

  // C2: ensure headers object (mutates request)
  const headers = request.headers = (request.headers || {});

  // C3: service/region inference
  const hostForMatch = request.hostname || request.host || headers.Host || headers.host;
  const hostParts = matchHost(hostForMatch);

  // C4: credentials (always explicit in-contract)
  // C5: service / region
  let service = request.service || hostParts[0] || '';
  const region  = request.region  || hostParts[1] || 'us-east-1';

  // C6: email -> ses
  if (service === 'email') service = 'ses';

  // C7: body implies POST
  if (!request.method && request.body) request.method = 'POST';

  // C8: Host defaulting (happens in constructor — NOT gated by doNotModifyHeaders)
  if (!headers.Host && !headers.host) {
    headers.Host = request.hostname || request.host || createHost(service, region);
    if (request.port) headers.Host += ':' + request.port;
  }

  // C9: hostname mutation
  if (!request.hostname && !request.host) {
    request.hostname = headers.Host || headers.host;
  }

  // C10: isCodeCommitGit (OUT-OF-SCOPE; always false for in-contract inputs)
  const isCodeCommitGit = (service === 'codecommit' && request.method === 'GIT');

  // C11: extra header controls
  const extraHeadersToIgnore  = request.extraHeadersToIgnore  || Object.create(null);
  const extraHeadersToInclude = request.extraHeadersToInclude || Object.create(null);

  // ---------- parsePath ----------
  const parsedPath = parsePath(request);

  // Datetime state — captured during prepareRequest
  let datetime = null;

  // ---------- Inner helpers (closure over state) ----------

  function _datetime() { return datetime; }
  function _date()     { return datetime.substr(0, 8); }

  function credentialString() {
    return [_date(), region, service, 'aws4_request'].join('/');
  }

  // *** THE DESYNC — canonicalHeaders does NOT consult extraHeadersToInclude/extraHeadersToIgnore ***
  function canonicalHeaders() {
    return Object.keys(headers)
      .filter(k => HEADERS_TO_IGNORE[k.toLowerCase()] == null)
      .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1)
      .map(k => k.toLowerCase() + ':' + trimAll(headers[k]))
      .join('\n');
  }

  // *** THE DESYNC — signedHeaders DOES honor extraHeadersToInclude AND extraHeadersToIgnore ***
  function signedHeaders() {
    return Object.keys(headers)
      .map(k => k.toLowerCase())
      .filter(lk =>
        extraHeadersToInclude[lk]
        || (HEADERS_TO_IGNORE[lk] == null && !extraHeadersToIgnore[lk])
      )
      .sort()
      .join(';');
  }

  function bodyHash() {
    if (service === 's3' && request.signQuery) return 'UNSIGNED-PAYLOAD';
    if (isCodeCommitGit) return '';
    return headers['X-Amz-Content-Sha256'] || headers['x-amz-content-sha256']
      || sha256hex(request.body || '');
  }

  function canonicalQueryString() {
    const query = parsedPath.query;
    if (!query) return '';
    const firstValOnly = service === 's3';

    const reducedQuery = Object.create(null);
    for (const key of Object.keys(query)) {
      if (!key) continue;
      const ek = encodeRfc3986Full(key);
      const val = query[key];
      reducedQuery[ek] = Array.isArray(val)
        ? (firstValOnly ? val[0] : val)
        : val;
    }

    const pieces = [];
    for (const ek of Object.keys(reducedQuery).sort()) {
      const val = reducedQuery[ek];
      if (Array.isArray(val)) {
        val.map(v => encodeRfc3986Full(String(v))).sort().forEach(ev => pieces.push(ek + '=' + ev));
      } else {
        pieces.push(ek + '=' + encodeRfc3986Full(String(val)));
      }
    }
    return pieces.join('&');
  }

  function canonicalPath() {
    const normalizePath       = service !== 's3';
    const decodePath          = service === 's3' || !!request.doNotEncodePath;
    const decodeSlashesInPath = service === 's3';

    let p = parsedPath.path;
    if (p === '/') return '/';

    if (normalizePath) {
      p = p.replace(/\/{2,}/g, '/');   // collapse repeated slashes
    }

    const segments = p.split('/');
    const out = [];
    for (const piece of segments) {
      if (normalizePath && piece === '..') {
        out.pop();
      } else if (!normalizePath || piece !== '.') {
        let encoded;
        if (decodePath) {
          encoded = encodeRfc3986Full(decodeURIComponent(piece.replace(/\+/g, ' ')));
        } else {
          encoded = encodeRfc3986Full(piece);
        }
        out.push(encoded);
      }
    }

    let result = out.join('/');
    if (result[0] !== '/') result = '/' + result;
    if (decodeSlashesInPath) result = result.replace(/%2F/gi, '/');
    return result;
  }

  function canonicalString() {
    return [
      request.method || 'GET',
      canonicalPath(),
      canonicalQueryString(),
      canonicalHeaders() + '\n',
      signedHeaders(),
      bodyHash(),
    ].join('\n');
  }

  function stringToSign() {
    return [
      'AWS4-HMAC-SHA256',
      _datetime(),
      credentialString(),
      sha256hex(canonicalString()),
    ].join('\n');
  }

  function signature() {
    const kDate        = hmac('AWS4' + credentials.secretAccessKey, _date());
    const kRegion      = hmac(kDate, region);
    const kService     = hmac(kRegion, service);
    const kCredentials = hmac(kService, 'aws4_request');
    return hmacHex(kCredentials, stringToSign());
  }

  function authHeader() {
    return 'AWS4-HMAC-SHA256 Credential=' + credentials.accessKeyId + '/' + credentialString()
      + ', SignedHeaders=' + signedHeaders()
      + ', Signature=' + signature();
  }

  // ---------- prepareRequest ----------
  if (request.signQuery) {
    // BRANCH A — query-string signing
    const query = parsedPath.query = parsedPath.query || {};

    if (credentials.sessionToken) {
      query['X-Amz-Security-Token'] = credentials.sessionToken;
    }
    if (service === 's3' && !query['X-Amz-Expires']) {
      query['X-Amz-Expires'] = 86400;
    }
    // datetime comes FROM query string in this mode
    if (query['X-Amz-Date']) {
      datetime = query['X-Amz-Date'];
    } else {
      datetime = computeDateTime(headers);
      query['X-Amz-Date'] = datetime;
    }
    query['X-Amz-Algorithm']    = 'AWS4-HMAC-SHA256';
    query['X-Amz-Credential']   = credentials.accessKeyId + '/' + credentialString();
    query['X-Amz-SignedHeaders'] = signedHeaders();

  } else {
    // BRANCH B — header signing
    if (!request.doNotModifyHeaders && !isCodeCommitGit) {
      const body = request.body;

      if (body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
      }
      if (body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      if (credentials.sessionToken && !headers['X-Amz-Security-Token'] && !headers['x-amz-security-token']) {
        headers['X-Amz-Security-Token'] = credentials.sessionToken;
      }
      if (service === 's3' && !headers['X-Amz-Content-Sha256'] && !headers['x-amz-content-sha256']) {
        headers['X-Amz-Content-Sha256'] = sha256hex(request.body || '');
      }

      if (headers['X-Amz-Date'] || headers['x-amz-date']) {
        datetime = headers['X-Amz-Date'] || headers['x-amz-date'];
      } else {
        datetime = computeDateTime(headers);
        headers['X-Amz-Date'] = datetime;
      }
    } else {
      // doNotModifyHeaders: skip all header defaulting; compute datetime from Date header (SEAM)
      // NOTE: X-Amz-Date header does NOT pin datetime in this mode per the SEAM CONTRACT.
      // getDateTime reads new Date(headers.Date || headers.date || new Date()).
      datetime = computeDateTime(headers);
    }

    // ALWAYS delete Authorization (even under doNotModifyHeaders)
    delete headers.Authorization;
    delete headers.authorization;
  }

  // ---------- sign-finalize ----------
  if (request.signQuery) {
    parsedPath.query['X-Amz-Signature'] = signature();
  } else {
    request.headers.Authorization = authHeader();
  }

  request.path = formatPath(parsedPath);

  return request;
}
