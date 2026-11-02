// `rdv lsp` over stdio: the framing, the lifecycle, and that a change to an open primary re-publishes its open language
// file's diagnostics (the binding moves with the buffer, not the disk). Run: node --test cli/lsp/server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../..', import.meta.url).pathname;
const P = join(ROOT, 'packages/colors/sir/strip.sir'), J = join(ROOT, 'packages/colors/sir/strip.js.sir');
const uri = (p) => pathToFileURL(p).href;

function client() {
  const s = spawn(process.execPath, ['--input-type=module', '-e', `import { serve } from ${JSON.stringify(pathToFileURL(join(ROOT, 'cli/lsp/server.mjs')).href)}; serve();`]);
  let buf = Buffer.alloc(0); const msgs = []; const waiters = [];
  s.stdout.on('data', (c) => { buf = Buffer.concat([buf, c]); for (;;) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) break; const n = +buf.slice(0, i).toString().match(/Content-Length: (\d+)/)[1]; if (buf.length < i + 4 + n) break;
    msgs.push(JSON.parse(buf.slice(i + 4, i + 4 + n).toString())); buf = buf.slice(i + 4 + n); for (const w of [...waiters]) if (w.ok()) { waiters.splice(waiters.indexOf(w), 1); w.res(); } } });
  const send = (m) => { const b = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m })); s.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); s.stdin.write(b); };
  const until = (pred) => new Promise((res, rej) => { const w = { ok: () => msgs.some(pred), res }; if (w.ok()) return res(); waiters.push(w); setTimeout(() => rej(new Error('timeout: ' + JSON.stringify(msgs.map((m) => m.method ?? m.id)))), 5000); }).then(() => msgs.filter(pred).at(-1));
  return { s, send, until, msgs };
}

test('initialize → diagnostics follow an unsaved primary edit → shutdown/exit 0', async () => {
  const c = client();
  c.send({ id: 1, method: 'initialize', params: { processId: null, rootUri: null, capabilities: {} } });
  const init = await c.until((m) => m.id === 1); assert.ok(init.result.capabilities.hoverProvider && init.result.capabilities.codeLensProvider);
  c.send({ method: 'initialized', params: {} });
  c.send({ method: 'textDocument/didOpen', params: { textDocument: { uri: uri(J), languageId: 'sir', version: 1, text: readFileSync(J, 'utf8') } } });
  const clean = await c.until((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri(J)); assert.deepEqual(clean.params.diagnostics, []);
  c.send({ method: 'textDocument/didOpen', params: { textDocument: { uri: uri(P), languageId: 'sir', version: 1, text: readFileSync(P, 'utf8') } } });
  c.send({ method: 'textDocument/didChange', params: { textDocument: { uri: uri(P), version: 2 }, contentChanges: [{ text: readFileSync(P, 'utf8').replace('R1 The result', 'R1 The output') }] } });
  const stale = await c.until((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri(J) && m.params.diagnostics.length);
  assert.deepEqual(stale.params.diagnostics.map((d) => d.code), ['E_STALE_BINDING']);
  c.send({ id: 2, method: 'textDocument/codeAction', params: { textDocument: { uri: uri(J) }, range: stale.params.diagnostics[0].range, context: { diagnostics: stale.params.diagnostics } } });
  const fix = await c.until((m) => m.id === 2); assert.equal(fix.result.length, 1); assert.ok(fix.result[0].edit.changes[uri(J)][0].newText.match(/^[0-9a-f]{64}$/));
  c.send({ id: 3, method: 'textDocument/hover', params: { textDocument: { uri: uri(P) }, position: { line: 0, character: 1 } } });
  assert.match((await c.until((m) => m.id === 3)).result.contents.value, /^\*\*UNIT\*\*/);
  c.send({ id: 4, method: 'shutdown' }); await c.until((m) => m.id === 4); c.send({ method: 'exit' });
  assert.equal(await new Promise((r) => c.s.on('exit', r)), 0);
});
