#!/usr/bin/env bash
# dep-guard CI plumbing — GitHub Actions + Azure DevOps. Extracts a PR's base+head
# lockfiles, runs `rdv guard` once, emits the CI's native annotations + a summary,
# and exits non-zero on RED. npm + pnpm. No data egress beyond the guard's own
# best-effort metadata lookups.
#
# Exit codes: 0 = green/yellow (or no root lockfile), 1 = RED, 2 = the guard itself
# failed (npx/rdv crashed, or printed empty/invalid JSON) and DEPGUARD_FAIL_CLOSED is
# "true" (the default). With DEPGUARD_FAIL_CLOSED=false a guard failure is a notice + exit 0.
#
# Only the ROOT lockfile is read (pnpm-lock.yaml, else package-lock.json). Lockfiles in
# subdirectories (monorepo packages without a root lock) are not gated.
set -uo pipefail
RDV_VERSION="${DEPGUARD_RDV_VERSION:-0.5.0}"
RDV="${DEPGUARD_RDV:-npx --yes rederive@${RDV_VERSION}}"
FAIL_CLOSED="${DEPGUARD_FAIL_CLOSED:-true}"

guard_failed() {   # $1 = reason
  if [ "$FAIL_CLOSED" != false ]; then   # anything but an explicit "false" fails closed
    echo "dep-guard: guard failed — $1. Failing closed (exit 2); set fail-closed: false to skip instead."
    [ -n "${GITHUB_ACTIONS:-}" ] && echo "::error title=dep-guard::guard failed — $1"
    exit 2
  fi
  echo "dep-guard: guard failed — $1. fail-closed is off: skipping (not blocking)."
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::warning title=dep-guard::guard failed — $1 (not blocking: fail-closed is off)"
  exit 0
}

CI="${DEPGUARD_CI:-}"
if [ -z "$CI" ]; then [ -n "${GITHUB_ACTIONS:-}" ] && CI=github; [ -n "${TF_BUILD:-}" ] && CI=ado; fi
CI="${CI:-github}"
cd "${GITHUB_WORKSPACE:-${BUILD_SOURCESDIRECTORY:-$PWD}}"

LOCK=""; for lf in pnpm-lock.yaml package-lock.json; do [ -f "$lf" ] && LOCK="$lf" && break; done
if [ -z "$LOCK" ]; then
  echo "dep-guard: no lockfile at repo root — nothing to gate."
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::notice title=dep-guard::no pnpm-lock.yaml or package-lock.json at the repo root — nothing gated"
  exit 0
fi

BASE_SHA="${DEPGUARD_BASE_SHA:-}"
if [ -z "$BASE_SHA" ]; then
  BASE_BRANCH=""
  [ "$CI" = github ] && BASE_BRANCH="${GITHUB_BASE_REF:-}"
  [ "$CI" = ado ] && BASE_BRANCH="${SYSTEM_PULLREQUEST_TARGETBRANCHNAME:-}"
  if [ -n "$BASE_BRANCH" ]; then
    git fetch --no-tags --depth=1 origin "$BASE_BRANCH" >/dev/null 2>&1 || true
    BASE_SHA="$(git rev-parse "origin/$BASE_BRANCH" 2>/dev/null || git rev-parse "$BASE_BRANCH" 2>/dev/null || echo "")"
  fi
fi

BASE_DIR="$(mktemp -d)"
if [ -n "$BASE_SHA" ] && git show "$BASE_SHA:$LOCK" > "$BASE_DIR/$LOCK" 2>/dev/null; then
  git show "$BASE_SHA:package.json" > "$BASE_DIR/package.json" 2>/dev/null || true
else
  echo "dep-guard: no base lockfile — base treated as empty."
  [ "$LOCK" = pnpm-lock.yaml ] && printf 'lockfileVersion: 9.0\nimporters:\npackages:\n' > "$BASE_DIR/$LOCK" || echo '{"packages":{"":{}}}' > "$BASE_DIR/$LOCK"
fi

echo "dep-guard [$CI]: base=${BASE_SHA:-<empty>}  lockfile=$LOCK"
echo "dep-guard: verifier = $RDV"
JSON="$($RDV guard "$BASE_DIR/$LOCK" "$LOCK" --reporter json)"; STATUS=$?   # guard exits 1 on RED — expected
case "$STATUS" in 0|1) ;; *) guard_failed "\`$RDV guard\` exited $STATUS" ;; esac
[ -z "$JSON" ] && guard_failed "no guard output"
DEPGUARD_JSON="$JSON" python3 -c 'import os,json; d=json.loads(os.environ["DEPGUARD_JSON"]); assert d["overall"] in ("red","yellow","green") and "counts" in d and isinstance(d["results"], list)' 2>/dev/null \
  || guard_failed "guard output is not valid dep-guard JSON"

DEPGUARD_JSON="$JSON" DEPGUARD_CI="$CI" DEPGUARD_SUMMARY="$(mktemp).md" python3 <<'PY'
import os, json, sys
d = json.loads(os.environ['DEPGUARD_JSON']); ci = os.environ['DEPGUARD_CI']
overall = d['overall']; c = d['counts']
E = {'red':'🔴','yellow':'🟡','green':'🟢'}
GH = {'red':'error','yellow':'warning','green':'notice'}; ADO = {'red':'error','yellow':'warning'}
sm = [f"## {E[overall]} dep-guard: {overall.upper()}  ({c['added']} added, {c['bumped']} bumped)\n"]
for r in d['results']:
    if r['direct'] or r['level'] == 'red':
        flags = '; '.join(r['flags']); tag = f"{r['name']}@{r['version']}"
        if ci == 'github': print(f"::{GH[r['level']]} title=dep-guard::{tag} — {flags}")
        elif ci == 'ado' and r['level'] != 'green': print(f"##vso[task.logissue type={ADO[r['level']]}]dep-guard: {tag} — {flags}")
        sm.append(f"- {E[r['level']]} `{tag}` — {flags}")
roll = sum(1 for r in d['results'] if not r['direct'] and r['level'] != 'red')
if roll: sm.append(f"\n_+ {roll} transitive dep(s) added, none tripped a hard signal._")
text = '\n'.join(sm) + '\n'
if ci == 'github' and os.environ.get('GITHUB_STEP_SUMMARY'): open(os.environ['GITHUB_STEP_SUMMARY'],'a').write(text)
elif ci == 'ado': open(os.environ['DEPGUARD_SUMMARY'],'w').write(text); print(f"##vso[task.uploadsummary]{os.environ['DEPGUARD_SUMMARY']}")
sys.exit(1 if overall == 'red' else 0)
PY
