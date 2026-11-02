// hunk_lines input generator: curated prefix (grammar, line starts, counts, malformed, magnitudes, real git output), then
// seeded header soup. Every input is text. MAX_HUNK (1,000,000) bounds what a kept header walks, so any magnitude is safe
// to probe; only the DROPPED side of the boundary is in the oracle (N = 1,000,000 kept is left to the MAX_HUNK pin and the
// model check — ruling N5: a kept 1,000,000-line vector made the oracle 53 MB).
const LS = '\u2028', PS = '\u2029', NEL = '\u0085';
const GIT1 = 'diff --git a/x.old b/x.new\nindex f9d9a01..1464f49 100644\n--- a/x.old\n+++ b/x.new\n@@ -2 +2 @@ a\n-b\n+B\n@@ -4 +3,0 @@ c\n-d\n@@ -6,0 +6,2 @@ f\n+new1\n+new2\n';
const GIT2 = 'diff --git a/y.old b/y.new\nindex 30197d7..0ebfd76 100644\n--- a/y.old\n+++ b/y.new\n@@ -2,2 +2,2 @@ int main() {\n-  return 0;\r\n-}\r\n+  return 1;\r\n+}\n\\ No newline at end of file\n';
const GIT3 = 'diff --git a/z.old b/z.new\nindex 2920178..e69de29 100644\n--- a/z.old\n+++ b/z.new\n@@ -1,2 +0,0 @@\n-only\n-lines\n';
// git output whose CONTENT carries a CR / U+2028 then header-shaped text (F1 at c509956a8f8a: 700 of 5,000 git pairs; at 9e2245be5f42 it yields only the real headers)
const GIT_HOSTILE = 'diff --git a/h b/h\n--- a/h\n+++ b/h\n@@ -1,0 +2 @@ q' + LS + '@@ -1 +901,2 @@\n+a\n@@ -5,0 +7,2 @@ e\n+foo\n+q\r@@ -1 +900 @@\n';
const SAFE = 9007199254740991;   // 2^53 - 1
const CURATED = [
  // frozen slice (the first 24)
  '',
  '@@ -1,2 +3,4 @@',
  '@@ -1 +5 @@',
  '@@ -3,2 +2,0 @@',
  '@@ -10,3 +12,2 @@ function foo() {',
  GIT1,
  'x\r@@ -1 +5,2 @@',
  '@@ -1 +1,2 @@\r\n+a\r\n+b\r\n@@ -9 +10 @@\r\n',
  'x' + LS + '@@ -1 +7 @@',
  'x\n' + PS + '@@ -1 +8,2 @@\n@@ -1 +3 @@',
  '@@ -1 +3@@',
  '@@ -1 +1,1000001 @@\n@@ -1 +3 @@',
  '@@ -1 +' + SAFE + ',2 @@',
  '@@ -1 +3 @@@',
  '@@ -1 +007,03 @@ ctx',
  '@@ -1 +0 @@',
  '@@ -1 +0,3 @@',
  '@@ -1 +5,0 @@\n@@ -1 +3,4 @@\n@@ -1 +1,2 @@',
  '@@ -1 +' + '9'.repeat(400) + ',0 @@',
  '@@ -1 +' + (SAFE - 1) + ',1 @@',
  '@@ -1 +' + SAFE + ' @@\n@@ -1 +4 @@',
  GIT_HOSTILE,
  GIT2,
  GIT3,
  // held-out side of the prefix
  '@@ -' + '9'.repeat(40) + ',' + '9'.repeat(40) + ' +4 @@',
  '@@ -1 +5, @@',
  '@@ -1 +-5 @@',
  '@@ -1 +１ @@',
  '@@ -1 +٣ @@',
  '@@ -1\t+3 @@',
  'text @@ -1 +2 @@',
  ' @@ -1 +2 @@',
  '@@  -1 +3 @@',
  '@@ -1 +1,20000000 @@',
  '@@ -1 +1,0001000001 @@\n@@ -1 +7,2 @@',
  '@@ -1 +1,1000001 @@\n@@ -1 +1,1000002 @@\n@@ -1 +6,2 @@',
  '@@ -1 +' + (SAFE - 1) + ',3 @@',
  '@@ -1 +' + (SAFE - 3) + ',4 @@\n@@ -1 +' + (SAFE - 3) + ',5 @@',
  '@@ -1 +9007199254000000,1000000 @@',
  '@@@ -1,2 -1,2 +1,3 @@@',
  '+@@ -1 +2 @@\n-@@ -1 +3 @@\n @@ -1 +4 @@',
  '@@ -1 +1,0000000000000000000000000000002 @@',
  '@@ -0 +1 @@',
  '@@ -1 +9007199254740000,3 @@',
  '@@ -1 +' + SAFE + ',0 @@',
  '@@ -1 +3,40 @@\n@@ -1 +20,5 @@',
  '@@ -1 +2 @@\n',
  '\n\n@@ -1 +2 @@\n\n',
  '@@ -1 +2',
  '@@ -1 +2 @',
  '@@ -1,2 +3,4 @@\r',
  '\r\r@@ -1 +6 @@\r@@ -2 +2 @@',
  'a\r\n\r\n@@ -4 +4,2 @@',
  '@@ -1 +2 @@' + LS + '@@ -1 +3 @@' + PS + '@@ -1 +4 @@',
  '@@ -1, +2 @@',
  '@@ -,1 +2 @@',
  '@@ -1 +2,3,4 @@',
  '@@ -1 +2 @@x@@ -1 +3 @@',
  'x' + NEL + '@@ -1 +9 @@',
  '@@ +1,2 @@',
  '@@ -1,0 +0,0 @@',
  '@@ -1 +0,1 @@\n@@ -1 +0,2 @@',
  '@@ -1 +' + (SAFE - 2) + ',2 @@',
  '@@ -1 +' + (SAFE - 1) + ',2 @@',
  '@@ -1 +1,' + SAFE + ' @@',
  '@@ -1 +' + (SAFE + 1) + ' @@',
  '@@ -1 +' + (SAFE + 1) + ',0 @@',
  '@@ -1 +99999999999999999999,3 @@\n@@ -2 +2 @@',
  '@@ -1 +' + '9'.repeat(400) + ' @@',
  '@@ -1 +1,' + '9'.repeat(30) + ' @@',
  '\n' + '\r@@ -1 +11 @@\n' + LS + '@@ -1 +12 @@\n' + PS + '@@ -1 +13 @@\n@@ -1 +14 @@\r\n',
  '+foo\r@@ -1 +900 @@\n@@ -1,2 +3 @@ q' + LS + '@@ -1 +901,2 @@\n',
];
const SEPS = ['\n', '\n', '\n', '\r\n', '\r', LS, PS, NEL, ' ', ''];
const BODY = ['+x', '-y', ' z', '\\ No newline at end of file', '+@@ -1 +77 @@', 'diff --git a/f b/f', '--- a/f', '+++ b/f', 'index 1..2 100644', ''];
const CTX = ['', ' f()', ' class A {', ' @@ -1 +55 @@', '@', ' ' + 'été'];
export function genInputs(n, rnd) {
  const ri = (k) => Math.floor(rnd() * k), pick = (a) => a[ri(a.length)];
  const num = () => { const r = rnd(); const v = r < 0.1 ? 0 : r < 0.8 ? 1 + ri(60) : ri(100000);
    return (rnd() < 0.1 ? '0'.repeat(1 + ri(3)) : '') + String(v); };
  const header = () => {
    const r0 = rnd();
    const c = r0 < 0.06 ? String(SAFE - 30 + ri(40)) : r0 < 0.09 ? '9'.repeat(16 + ri(30)) : num(); const cnt = rnd() < 0.35 ? '' : ',' + (rnd() < 0.2 ? '0' : String(ri(25)));
    const old = num() + (rnd() < 0.5 ? '' : ',' + num());
    let h = '@@ -' + old + ' +' + c + cnt + ' @@' + pick(CTX);
    const r = rnd();   // malformations, ~25%
    if (r < 0.04) h = h.replace(' @@', '@@'); else if (r < 0.08) h = h.replace('@@ -', '@@  -');
    else if (r < 0.12) h = h.replace(' +', ' + '); else if (r < 0.16) h = h.replace('+', '+x');
    else if (r < 0.2) h = ' ' + h; else if (r < 0.25) h = h.replace(/,(\d+) @@/, ', @@');
    return h;
  };
  const out = CURATED.map((s) => [s]);
  while (out.length < n) {
    const parts = []; const k = 1 + ri(8);
    for (let i = 0; i < k; i++) { parts.push(rnd() < 0.55 ? header() : pick(BODY)); parts.push(pick(SEPS)); }
    out.push([parts.join('')]);
  }
  return out;
}
