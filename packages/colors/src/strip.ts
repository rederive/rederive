// Verified-recompose of colors@1.4.0 `strip` (alias `stripColors`). ZERO dependencies — String/RegExp only.
// Reconstructed from sir/strip.sir + oracles/strip.json with the ORIGINAL DELETED; 3 independent
// emissions reached quorum (3/3), 10/10 on a disjoint held-out set. This is a FAITHFUL behavior-lock
// of the original, including its narrowness — see README "Known limitation": only single-parameter
// SGR codes (ESC[<digits>m) are removed; combined-SGR / CSI / OSC sequences survive by design.
export function strip(str: any): string {
  return ('' + str).replace(/\x1B\[\d+m/g, '');
}
