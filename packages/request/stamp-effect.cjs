// Stamp the @rederive/request EFFECT unit (getProxyFromURI) by record/replay of the env boundary:
// run the REAL request@2.88.2 getProxyFromURI under a CONTROLLED process.env snapshot, capture output.
// The env snapshot is the injected inbound (REQUEST) boundary; it is also stored as the unit's 2nd arg
// so the re-derivation reads it as a parameter (boundary injection). Run:
//   node packages/request/stamp-effect.cjs <path-to>/request/lib/getProxyFromURI.js
const fs = require('fs');
const path = require('path');
const ORIG = process.argv[2] || '/tmp/reqorig/node_modules/request/lib/getProxyFromURI.js';
const getProxyFromURI = require(ORIG);

const VARS = ['NO_PROXY', 'no_proxy', 'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'];
function withEnv(snapshot, fn) {
  const saved = {};
  for (const v of VARS) { saved[v] = process.env[v]; delete process.env[v]; }
  for (const k of Object.keys(snapshot || {})) process.env[k] = snapshot[k];
  try { return fn(); }
  finally { for (const v of VARS) { delete process.env[v]; if (saved[v] !== undefined) process.env[v] = saved[v]; } }
}

const stamp = (list) => list.map((it) => {
  const [uri, env] = it.args;
  let expected;
  try { expected = withEnv(env, () => getProxyFromURI(uri)); }
  catch (e) { expected = { __throw: String((e && e.message) || e) }; }
  return { name: it.name, args: it.args, expected: expected === undefined ? null : expected };
});

const frozen = [
  { name: 'http_proxy_set', args: [{ protocol: 'http:', hostname: 'example.com', port: '' }, { HTTP_PROXY: 'http://p:8080' }] },
  { name: 'no_proxy_match', args: [{ protocol: 'http:', hostname: 'example.com', port: '' }, { NO_PROXY: 'example.com', HTTP_PROXY: 'http://p:8080' }] },
  { name: 'no_proxy_wildcard', args: [{ protocol: 'http:', hostname: 'x.com', port: '' }, { NO_PROXY: '*', HTTP_PROXY: 'http://p' }] },
  { name: 'https_proxy', args: [{ protocol: 'https:', hostname: 'a.com', port: '' }, { HTTPS_PROXY: 'http://sp' }] },
  { name: 'no_env', args: [{ protocol: 'http:', hostname: 'a.com', port: '' }, {}] },
  { name: 'https_fallback_http_proxy', args: [{ protocol: 'https:', hostname: 'a.com', port: '' }, { HTTP_PROXY: 'http://hp' }] },
];
const heldout = [
  { name: 'ho_suffix_quirk', args: [{ protocol: 'http:', hostname: 'oogle.com', port: '' }, { NO_PROXY: 'google.com', HTTP_PROXY: 'http://p' }] },
  { name: 'ho_subdomain_match', args: [{ protocol: 'http:', hostname: 'sub.example.com', port: '' }, { NO_PROXY: 'example.com', HTTP_PROXY: 'http://p' }] },
  { name: 'ho_port_match', args: [{ protocol: 'http:', hostname: 'a.com', port: '8080' }, { NO_PROXY: 'a.com:8080', HTTP_PROXY: 'http://p' }] },
  { name: 'ho_port_mismatch', args: [{ protocol: 'http:', hostname: 'a.com', port: '9090' }, { NO_PROXY: 'a.com:8080', HTTP_PROXY: 'http://p' }] },
  { name: 'ho_lowercase_no_proxy', args: [{ protocol: 'http:', hostname: 'a.com', port: '' }, { no_proxy: 'a.com', HTTP_PROXY: 'http://p' }] },
  { name: 'ho_unknown_protocol', args: [{ protocol: 'ftp:', hostname: 'a.com', port: '' }, { HTTP_PROXY: 'http://p' }] },
  { name: 'ho_lowercase_http_proxy', args: [{ protocol: 'http:', hostname: 'a.com', port: '' }, { http_proxy: 'http://lp' }] },
];

fs.mkdirSync(path.join(__dirname, 'oracles'), { recursive: true });
const oracle = { mode: 'vectors', exportName: 'getProxyFromURI', unit: 'getProxyFromURI', vectors: stamp(frozen), heldout: stamp(heldout) };
fs.writeFileSync(path.join(__dirname, 'oracles', 'getProxyFromURI.json'), JSON.stringify(oracle, null, 2) + '\n');
const ver = require(path.join(path.dirname(ORIG), '..', 'package.json')).version;
console.log('stamped getProxyFromURI (EFFECT, env boundary record/replay) from real request@' + ver);
