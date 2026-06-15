// Trace-oracle harness for @rederive/request's representative HTTP effect unit (httpRequest).
// Demonstrates the FULL ordered EMIT+REQUEST trace model: the `http` transport is INJECTED as a fake
// that (a) RECORDS the outbound emits (request / write / end) and (b) REPLAYS a canned response
// (the injected inbound). A re-derivation is verified by running it through the same harness and
// comparing the recorded emit-trace AND the resolved value to the oracle.
//
//   node trace-verify.mjs capture                 # run the reference -> write oracles/httpRequest.json
//   node trace-verify.mjs grade                    # grade .resynth emits, quorum, apply -> src + manifest
//
// rdv check is value-mode; this trace unit is verified here (a trace-mode CLI is a future rdv feature).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const jeq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- the injected transport: records emits, replays a canned response ----
function makeFakeHttp(script) {
  const emitted = [];
  const http = {
    request(opts, cb) {
      emitted.push({ op: 'request', opts });
      const res = { statusCode: script.statusCode, setEncoding() {}, on(ev, h) { res['_' + ev] = h; return res; } };
      const req = {
        on(ev, h) { req['_' + ev] = h; return req; },
        write(d) { emitted.push({ op: 'write', data: String(d) }); return true; },
        end() {
          emitted.push({ op: 'end' });
          queueMicrotask(() => {
            if (script.error) { if (req._error) req._error(new Error(script.error)); return; }
            if (cb) cb(res);
            queueMicrotask(() => {
              for (const c of (script.chunks || [])) if (res._data) res._data(c);
              if (res._end) res._end();
            });
          });
        },
      };
      return req;
    },
  };
  return { http, emitted };
}

async function runTrace(fn, reqOpts, body, script) {
  const { http, emitted } = makeFakeHttp(script);
  let result;
  try {
    result = await Promise.race([
      Promise.resolve(fn(reqOpts, body, http)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: never resolved')), 800)),
    ]);
  } catch (e) { result = { __throw: String((e && e.message) || e) }; }
  return { emitted, result };
}

// ---- the REFERENCE (the "original"; used only to CAPTURE the oracle, then deleted from re-emit) ----
function referenceHttpRequest(reqOpts, body, http) {
  return new Promise((resolve_, reject) => {
    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve_({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const INPUTS = {
  frozen: [
    { name: 'get_200', args: [{ method: 'GET', host: 'x', path: '/' }, null, { statusCode: 200, chunks: ['hello', ' world'] }] },
    { name: 'post_201', args: [{ method: 'POST', path: '/items' }, 'payload', { statusCode: 201, chunks: ['ok'] }] },
    { name: 'empty_resp_204', args: [{ method: 'GET', path: '/empty' }, null, { statusCode: 204, chunks: [] }] },
    { name: 'conn_error', args: [{ method: 'GET', path: '/err' }, null, { error: 'ECONNREFUSED' }] },
  ],
  heldout: [
    { name: 'ho_get_404', args: [{ method: 'GET', path: '/missing' }, null, { statusCode: 404, chunks: ['not', ' found'] }] },
    { name: 'ho_post_empty_body', args: [{ method: 'POST', path: '/x' }, '', { statusCode: 200, chunks: ['k'] }] },
    { name: 'ho_multi_chunk', args: [{ method: 'GET', path: '/big' }, null, { statusCode: 200, chunks: ['a', 'b', 'c', 'd'] }] },
    { name: 'ho_post_json', args: [{ method: 'POST', path: '/j' }, '{"k":1}', { statusCode: 202, chunks: ['queued'] }] },
    { name: 'ho_timeout_error', args: [{ method: 'GET', path: '/e2' }, null, { error: 'ETIMEDOUT' }] },
  ],
};

async function stamp(fn, list) {
  const out = [];
  for (const it of list) out.push({ name: it.name, args: it.args, expected: await runTrace(fn, ...it.args) });
  return out;
}

const mode = process.argv[2] || 'capture';

if (mode === 'capture') {
  mkdirSync(resolve(DIR, 'oracles'), { recursive: true });
  const oracle = { mode: 'trace', exportName: 'httpRequest', unit: 'httpRequest', boundary: 'net.request/write/end (EMIT) + net.read (REQUEST, injected)', vectors: await stamp(referenceHttpRequest, INPUTS.frozen), heldout: await stamp(referenceHttpRequest, INPUTS.heldout) };
  writeFileSync(resolve(DIR, 'oracles', 'httpRequest.json'), JSON.stringify(oracle, null, 2) + '\n');
  console.log('captured trace oracle from the reference (' + oracle.vectors.length + ' frozen / ' + oracle.heldout.length + ' held-out)');
} else if (mode === 'grade') {
  const oracle = JSON.parse(readFileSync(resolve(DIR, 'oracles', 'httpRequest.json'), 'utf8'));
  const held = oracle.heldout;
  const rdir = resolve(DIR, '.resynth', 'httpRequest');
  const emits = readdirSync(rdir).filter((f) => /^emit_\d+\.js$/.test(f)).sort();
  const graded = [];
  for (const f of emits) {
    const mod = await import(pathToFileURL(resolve(rdir, f)).href);
    const fn = mod.httpRequest ?? mod.default ?? Object.values(mod).find((x) => typeof x === 'function');
    let passN = 0; const miss = [];
    for (const v of held) { const got = await runTrace(fn, ...v.args); if (jeq(got, v.expected)) passN++; else miss.push(v.name); }
    graded.push({ f, pass: passN, total: held.length, full: passN === held.length, miss });
  }
  console.log('  httpRequest: ' + graded.map((g) => `${g.f.replace('.js', '')} ${g.pass}/${g.total}${g.full ? '' : ' miss[' + g.miss + ']'}`).join('  '));
  const full = graded.filter((g) => g.full);
  if (full.length < 2) { console.log(`     NO-QUORUM (${full.length}/${graded.length})`); process.exit(1); }
  const winnerFile = full[0].f;
  const header = `// @rederive/request — representative HTTP effect unit, re-derived by quorum (trace oracle).\n` +
    `// EMIT (request/write/end) + REQUEST (response) verified with the http transport injected;\n` +
    `// quorum ${full.length}/${graded.length}, ${held.length}/${held.length} held-out. Trust your own build.\n`;
  writeFileSync(resolve(DIR, 'src', 'httpRequest.js'), header + readFileSync(resolve(rdir, winnerFile), 'utf8').replace(/^\s+/, ''));
  const srcSha = sha(resolve(DIR, 'src', 'httpRequest.js'));
  console.log(`     QUORUM ${full.length}/${graded.length} -> applied ${winnerFile} -> src/httpRequest.js (${srcSha.slice(0, 12)})`);
  // attach as a traceUnit in the manifest (kept separate from the value `units` rdv check verifies)
  const man = JSON.parse(readFileSync(resolve(DIR, 'sir.manifest.json'), 'utf8'));
  man.traceUnits = [{
    name: 'httpRequest', kind: 'EFFECT', sig: '(reqOpts, body, http) => Promise<{statusCode, body}>',
    boundary: oracle.boundary, representative: 'models request@2.88.2 HTTP spine; not request.js verbatim',
    sir: 'sir/httpRequest.sir', sirSha256: sha(resolve(DIR, 'sir', 'httpRequest.sir')),
    oracle: 'oracles/httpRequest.json', oracleSha256: sha(resolve(DIR, 'oracles', 'httpRequest.json')),
    src: 'src/httpRequest.js', srcSha256: srcSha,
    verified: { mode: 'trace', frozen: oracle.vectors.length, heldout: held.length, quorum: `${full.length}/${graded.length}`, harness: 'trace-verify.mjs', at: '2026-06-15' },
    spec: 'specs/httpRequest.md', specSha256: sha(resolve(DIR, 'specs', 'httpRequest.md')),
  }];
  writeFileSync(resolve(DIR, 'sir.manifest.json'), JSON.stringify(man, null, 2) + '\n');
  console.log('     manifest.traceUnits updated.');
} else if (mode === 'smoke') {
  // Prove the trace oracle discriminates: known-broken impls must fail the held-out traces.
  const held = JSON.parse(readFileSync(resolve(DIR, 'oracles', 'httpRequest.json'), 'utf8')).heldout;
  const collect = (r, res, rej) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => { d += c; }); r.on('end', () => res({ statusCode: r.statusCode, body: d })); };
  const BROKEN = {
    'writes-unconditionally': (o, body, http) => new Promise((res, rej) => { const req = http.request(o, (r) => collect(r, res, rej)); req.on('error', rej); req.write(body); req.end(); }),
    'never-ends (no req.end)': (o, body, http) => new Promise((res, rej) => { const req = http.request(o, (r) => collect(r, res, rej)); req.on('error', rej); if (body) req.write(body); }),
    'hardcodes-statusCode-200': (o, body, http) => new Promise((res, rej) => { const req = http.request(o, (r) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => { d += c; }); r.on('end', () => res({ statusCode: 200, body: d })); }); req.on('error', rej); if (body) req.write(body); req.end(); }),
  };
  let allCaught = true;
  for (const [label, fn] of Object.entries(BROKEN)) {
    let passN = 0; const miss = [];
    for (const v of held) { const got = await runTrace(fn, ...v.args); if (jeq(got, v.expected)) passN++; else miss.push(v.name); }
    const caught = passN < held.length; allCaught = allCaught && caught;
    console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${label}: ${passN}/${held.length}` + (caught ? ` (fails [${miss}])` : ' — ORACLE BLIND'));
  }
  console.log(allCaught ? 'All broken impls caught — the trace oracle discriminates emit-order + result.' : 'WARNING: a broken impl slipped through.');
  process.exit(allCaught ? 0 : 1);
}
