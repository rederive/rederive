#!/usr/bin/env node
// Fixture test for finding #13: `claude plugin update` is gated on the VERSION FIELD, not on content. After
// ccae2aa landed the SessionStart fix, `claude plugin update rederive@rederive` from an installed consumer
// said "already at the latest version (0.5.0)" and left the cache copy untouched — old hooks.json, no
// hooks/session-start.mjs — because plugin.json's version hadn't moved. Every landed plugin change that
// should reach an installed consumer MUST bump this number, and plugin.json's version and the marketplace
// entry's version must always agree (a mismatch is exactly the kind of silent drift this file exists to
// catch). Run: node plugins/rederive/tests/plugin-version.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HERE);            // plugins/rederive
const REPO_ROOT = dirname(dirname(PLUGIN_ROOT)); // plugins/rederive -> plugins -> repo root

test('plugin.json sets a version, and it matches the marketplace entry\'s version for "rederive"', () => {
  const plugin = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const entry = (marketplace.plugins || []).find((p) => p.name === 'rederive');

  assert.ok(entry, 'marketplace.json must list a plugin entry named "rederive"');
  assert.ok(typeof plugin.version === 'string' && plugin.version.length > 0, 'plugin.json must set a non-empty version');
  assert.equal(
    entry.version,
    plugin.version,
    `marketplace entry version (${entry.version}) must equal plugin.json version (${plugin.version}) — ` +
      `\`claude plugin update\` compares this number, not file contents; drift here (or forgetting to bump ` +
      `either one) means a landed change never reaches an installed consumer's cache copy (finding #13)`,
  );
});
