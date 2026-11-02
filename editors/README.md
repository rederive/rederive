# Editor support for SIR

One analysis engine, `cli/lsp/analyze.mjs`, sits behind every editor. It runs rdv's own checks, so an editor never
disagrees with `rdv check`.

| editor | highlighting | checks, hover, outline, navigation, completion, format |
|---|---|---|
| **VS Code** (also Cursor, Windsurf, VSCodium) | ✓ TextMate grammar | ✓ built in: [rederive/vscode-sir](https://github.com/rederive/vscode-sir), on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=rederive.sir-lang) |
| **Neovim** 0.11+ | — | ✓ `rdv lsp` |
| **Helix** | — | ✓ `rdv lsp` |
| **Emacs** (eglot) | — | ✓ `rdv lsp` |
| **Sublime Text** (LSP package) | ✓ the TextMate grammar | ✓ `rdv lsp` |

Highlighting outside VS Code needs a tree-sitter grammar for Neovim, Helix and Zed, which isn't written yet. Diagnostics,
hover and the rest work without it.

## The language server

```sh
npm i -g rederive        # or: npx -p rederive rdv lsp --stdio
rdv lsp --stdio
```

It speaks standard LSP over stdio with full-document sync, and has no dependencies. It provides:

- diagnostics
- hover
- go to definition
- references (every line in the family that names a rule)
- document symbols
- folding
- completion
- formatting (the binding normal form)
- quick fixes
- code lenses (binding and oracle state)

`initializationOptions.mode` (or the `sir.validation.mode` setting) picks the register: `auto`, `strict` or `legacy`.

### Neovim (0.11+)

```lua
vim.filetype.add({ extension = { sir = 'sir' } })
vim.lsp.config('rdv', { cmd = { 'rdv', 'lsp', '--stdio' }, filetypes = { 'sir' }, root_markers = { 'sir.manifest.json', '.git' } })
vim.lsp.enable('rdv')
```

Code lenses are opt-in in Neovim: `vim.lsp.codelens.refresh()` (e.g. on `BufEnter`/`InsertLeave`).

### Helix (`~/.config/helix/languages.toml`)

```toml
[language-server.rdv]
command = "rdv"
args = ["lsp", "--stdio"]

[[language]]
name = "sir"
scope = "source.sir"
file-types = ["sir"]
roots = ["sir.manifest.json"]
language-servers = ["rdv"]
```

### Emacs (eglot)

```elisp
(define-derived-mode sir-mode prog-mode "SIR")
(add-to-list 'auto-mode-alist '("\\.sir\\'" . sir-mode))
(with-eval-after-load 'eglot (add-to-list 'eglot-server-programs '(sir-mode "rdv" "lsp" "--stdio")))
```

### Sublime Text (LSP package → Preferences: LSP Settings)

```json
{ "clients": { "rdv": { "enabled": true, "command": ["rdv", "lsp", "--stdio"], "selector": "source.sir" } } }
```

For highlighting, install `syntaxes/sir.tmLanguage.json` from [rederive/vscode-sir](https://github.com/rederive/vscode-sir). Sublime reads TextMate grammars once they're
converted with PackageDev.

## The VS Code extension

It lives in [rederive/vscode-sir](https://github.com/rederive/vscode-sir) and bundles this repo's engine from the
`rederive` npm package. A change to `cli/lsp/` reaches VS Code after a rederive release and an extension rebuild. When
`DIRECTIVES` in `cli/sir/sir-parse.mjs` changes, update that repo's TextMate grammar too.
