// `rdv lsp` — a Language Server Protocol server for SIR over stdio, for any LSP editor (Neovim, Helix, Zed, Emacs, Sublime …).
// Zero dependencies: the JSON-RPC framing is the ~20 lines below; every judgment is ./analyze.mjs, which is rdv's own.
// Full-document sync. A change to any open file re-publishes every open file in its directory: editing a primary moves its
// language files' bindings, and editing an oracle moves the primary's ORACLE line.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as A from './analyze.mjs';

export function serve(input = process.stdin, output = process.stdout, { version = '' } = {}) {
  const docs = new Map();   // path → text (open buffers)
  let mode = 'auto', shutdown = false;
  const ctx = () => ({ mode, read: (p) => (docs.has(p) ? docs.get(p) : existsSync(p) ? readFileSync(p, 'utf8') : null), list: (d) => { try { return readdirSync(d); } catch { return []; } } });
  const toPath = (uri) => fileURLToPath(uri), toUri = (p) => pathToFileURL(p).href;
  const send = (msg) => { const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8'); output.write(`Content-Length: ${body.length}\r\n\r\n`); output.write(body); };
  const isSir = (p) => p.endsWith('.sir');
  const publish = (p) => { if (!isSir(p) || !docs.has(p)) return; let diagnostics = [];
    try { diagnostics = A.diagnostics(p, docs.get(p), ctx()); } catch (e) { diagnostics = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, severity: 1, source: 'rdv', message: `rdv lsp: ${e.message}` }]; }
    send({ method: 'textDocument/publishDiagnostics', params: { uri: toUri(p), diagnostics } }); };
  const republish = (p) => { const dir = dirname(p); for (const q of docs.keys()) if (dirname(q) === dir || dirname(dirname(q)) === dirname(dir)) publish(q); };
  const loc = (x) => ({ uri: toUri(x.path), range: { start: { line: x.line, character: x.character }, end: { line: x.line, character: x.endCharacter ?? x.character } } });
  const fullRange = (t) => { const ls = t.split(/\r\n|\r|\n/); return { start: { line: 0, character: 0 }, end: { line: ls.length - 1, character: ls[ls.length - 1].length } }; };

  const handlers = {
    initialize: (p) => { mode = p?.initializationOptions?.mode ?? mode;
      return { serverInfo: { name: 'rdv lsp', version }, capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: { includeText: false } }, hoverProvider: true, definitionProvider: true, referencesProvider: true,
        documentSymbolProvider: true, foldingRangeProvider: true, documentFormattingProvider: true, codeActionProvider: { codeActionKinds: ['quickfix'] },
        codeLensProvider: { resolveProvider: false }, completionProvider: { triggerCharacters: [' ', ':', '[', '|', ','] } } }; },
    initialized: () => {}, shutdown: () => { shutdown = true; return null; }, exit: () => process.exit(shutdown ? 0 : 1),
    'workspace/didChangeConfiguration': (p) => { const m = p?.settings?.sir?.validation?.mode; if (m) { mode = m; for (const q of docs.keys()) publish(q); } },
    'textDocument/didOpen': ({ textDocument: d }) => { const p = toPath(d.uri); docs.set(p, d.text); republish(p); },
    'textDocument/didChange': ({ textDocument: d, contentChanges }) => { const p = toPath(d.uri); docs.set(p, contentChanges[contentChanges.length - 1].text); republish(p); },
    'textDocument/didSave': ({ textDocument: d }) => republish(toPath(d.uri)),
    'textDocument/didClose': ({ textDocument: d }) => { const p = toPath(d.uri); docs.delete(p); if (isSir(p)) send({ method: 'textDocument/publishDiagnostics', params: { uri: d.uri, diagnostics: [] } }); republish(p); },
    'textDocument/hover': ({ textDocument: d, position }) => withDoc(d, (p, t) => A.hover(p, t, position, ctx())),
    'textDocument/definition': ({ textDocument: d, position }) => withDoc(d, (p, t) => A.definition(p, t, position, ctx()).map(loc)),
    'textDocument/references': ({ textDocument: d, position }) => withDoc(d, (p, t) => A.references(p, t, position, ctx()).map(loc)),
    'textDocument/documentSymbol': ({ textDocument: d }) => withDoc(d, (p, t) => A.documentSymbols(p, t, ctx())),
    'textDocument/foldingRange': ({ textDocument: d }) => withDoc(d, (p, t) => A.foldingRanges(p, t, ctx())),
    'textDocument/completion': ({ textDocument: d, position }) => withDoc(d, (p, t) => A.completion(p, t, position, ctx())),
    'textDocument/formatting': ({ textDocument: d }) => withDoc(d, (p, t) => { const f = A.format(t); return f === null ? [] : [{ range: fullRange(t), newText: f }]; }),
    'textDocument/codeAction': ({ textDocument: d, context }) => withDoc(d, (p, t) => A.codeActions(p, t, context?.diagnostics ?? [], ctx()).map((a) => ({ title: a.title, kind: 'quickfix', diagnostics: [a.diagnostic], edit: { changes: { [d.uri]: a.edits } } }))),
    'textDocument/codeLens': ({ textDocument: d }) => withDoc(d, (p, t) => A.codeLenses(p, t, ctx()).map((l) => ({ range: { start: { line: l.line, character: 0 }, end: { line: l.line, character: 0 } }, command: { title: l.title, command: '' } }))),
  };
  function withDoc(d, f) { const p = toPath(d.uri); const t = docs.get(p) ?? (existsSync(p) ? readFileSync(p, 'utf8') : null); return t === null ? null : f(p, t); }

  // JSON-RPC over stdio: `Content-Length: N\r\n\r\n` + N bytes of UTF-8 JSON
  let buf = Buffer.alloc(0);
  input.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const sep = buf.indexOf('\r\n\r\n'); if (sep < 0) return;
      const len = +(buf.slice(0, sep).toString('ascii').match(/Content-Length:\s*(\d+)/i)?.[1] ?? NaN);
      if (!Number.isFinite(len)) { buf = buf.slice(sep + 4); continue; }
      if (buf.length < sep + 4 + len) return;
      const raw = buf.slice(sep + 4, sep + 4 + len).toString('utf8'); buf = buf.slice(sep + 4 + len);
      let msg; try { msg = JSON.parse(raw); } catch { send({ id: null, error: { code: -32700, message: 'parse error' } }); continue; }
      const h = handlers[msg.method];
      if (msg.id === undefined) { if (h) { try { h(msg.params); } catch (e) { send({ method: 'window/logMessage', params: { type: 1, message: `rdv lsp ${msg.method}: ${e.stack ?? e}` } }); } } continue; }
      if (!h) { send({ id: msg.id, ...(msg.method?.startsWith('$/') ? { result: null } : { error: { code: -32601, message: `unhandled ${msg.method}` } }) }); continue; }
      try { send({ id: msg.id, result: h(msg.params) ?? null }); } catch (e) { send({ id: msg.id, error: { code: -32603, message: String(e?.message ?? e) } }); }
    }
  });
  input.on('end', () => process.exit(shutdown ? 0 : 1));
}
