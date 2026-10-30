// Input generator for divergence_of (selfhost Tier 3). genInputs(n, rnd) -> n argument lists [round, artifacts].
// Every record carries EVERY declared field (none spelled null), so the stamped args and the SIG-decoded args are the same value.
const HV = 'harness-verified', TC = 'type-checked';
const tc = (applicable, ok) => ({ applicable, ok });
const miss = (name, slice = 'heldout', args = ['"x"'], expected = '"y"') => ({ slice, name, args, expected });
const art = (artifact, o = {}) => ({ artifact, control: false, error: null, rungs: [HV], typeCheck: tc(false, null), _misses: [], ...o });
const ok = (name, o) => art(name, o);
const bad = (name, misses, o = {}) => art(name, { rungs: [], _misses: misses, ...o });

function curated() {
  const c = [];
  const add = (round, artifacts) => c.push([round, artifacts]);
  // R1: nothing attempted
  add(1, []);
  add(2, [art('runs/js/emit_0.mjs', { control: true })]);
  add(3, [art('emit_0', { control: true, _misses: [miss('v1')] }), art('emit_0b', { control: true, rungs: null })]);
  // R2: every attempted artifact errored (misses and rungs on errored artifacts are never read)
  add(1, [art('e1', { error: 'harness build failed', rungs: [] }), art('e2', { error: 'x', rungs: [], _misses: [miss('v3'), miss('v4', 'frozen')] })]);
  add(4, [art('e1', { error: 'boom', rungs: null, typeCheck: null, _misses: null }), art('c', { control: true })]);
  // R3: an EMPTY error text is an error (not graded)
  add(1, [art('e1', { error: '', rungs: [] }), ok('e2'), ok('e3')]);
  add(1, [art('e1', { error: '', rungs: [HV] }), art('e2', { error: '', rungs: [HV] })]);
  add(2, [art('e1', { error: '', rungs: [] }), bad('e2', [miss('v7')])]);
  // R4 votes: 0, 1, 2, 3 of 3
  add(1, [bad('a', [miss('v1')]), bad('b', [miss('v1')]), bad('c', [miss('v2')])]);
  add(1, [ok('a'), bad('b', [miss('v1')]), bad('c', [miss('v1'), miss('v9')])]);
  add(1, [ok('a'), ok('b'), bad('c', [miss('v5')])]);
  add(1, [ok('a'), ok('b'), ok('c')]);
  add(7, [ok('a'), ok('b')]);
  add(7, [ok('a')]);
  add(5, [ok('a'), ok('b'), ok('c'), ok('d'), bad('e', [miss('v1')])]);
  add(5, [ok('a'), ok('b'), bad('c', []), bad('d', []), bad('e', [])]);
  // R4 type check variants
  add(1, [ok('a', { typeCheck: tc(true, true), rungs: [TC, HV] }), ok('b', { typeCheck: tc(true, false) }), ok('c', { typeCheck: null })]);
  add(1, [ok('a', { typeCheck: tc(true, null) }), ok('b', { typeCheck: tc(false, false) }), ok('c', { typeCheck: tc(false, true) })]);
  add(1, [ok('a', { typeCheck: tc(true, false), rungs: [HV] }), ok('b', { typeCheck: tc(true, false), rungs: [TC, HV] })]);
  add(2, [ok('a', { typeCheck: tc(true, true), rungs: [TC] }), ok('b', { typeCheck: tc(true, true), rungs: [TC, HV] }), ok('c', { typeCheck: tc(true, true), rungs: [HV, TC] })]);
  // R4 rung text is matched exactly, element by element
  add(1, [ok('a', { rungs: ['Harness-verified'] }), ok('b', { rungs: [' harness-verified'] }), ok('c', { rungs: ['harness-verified '] }), ok('d', { rungs: ['harness'] })]);
  add(1, [ok('a', { rungs: [HV, HV] }), ok('b', { rungs: ['cross-verified', HV] }), ok('c', { rungs: ['cross-verified'] })]);
  add(1, [ok('a', { rungs: [] }), ok('b', { rungs: [] })]);
  // R5 rungs none on a graded artifact -> throws; on a control or errored artifact it is never read
  add(1, [ok('a'), ok('b', { rungs: null })]);
  add(1, [ok('a', { rungs: null, typeCheck: tc(true, false) })]);
  add(1, [ok('a', { rungs: null, control: true }), ok('b', { rungs: null, error: 'e' }), ok('c'), ok('d')]);
  // R4(c): a miss of either slice withholds the vote, even with every rung
  add(1, [ok('a', { _misses: [miss('v8')] }), ok('b', { _misses: [miss('v8')] }), ok('c')]);
  add(1, [ok('a', { _misses: [miss('v8', 'frozen')] }), ok('b', { _misses: [miss('v9', 'frozen')] }), ok('c'), ok('d')]);
  add(1, [ok('a', { _misses: [] }), ok('b', { _misses: null })]);
  // R6 a slice of none is read as "heldout" (rederive@6199e2cc8b75): tallied with heldout, groups with a "heldout" miss of one name, withholds the vote
  add(1, [bad('a', [miss('v1', null)]), ok('b')]);
  add(1, [ok('a', { _misses: [miss('v1', null)] }), ok('b', { _misses: [miss('v1', null)] }), ok('c')]);
  add(1, [bad('a', [miss('v1', null, ['1'], '"n"'), miss('v1', 'heldout', ['2'], '"h"')]), bad('b', [miss('v1', 'heldout', ['3'], '"b"'), miss('v2', null), miss('v2', 'frozen')])]);
  add(1, [bad('a', [miss('v5', 'frozen'), miss('v6', null)]), bad('a', [miss('v6', null)]), ok('c')]);
  add(1, [bad('a', [miss('v1', null), miss('v2', 'Frozen')]), ok('b')]);
  // R5 slice checks: every other non-exact slice throws; only GRADED artifacts are checked
  add(1, [bad('a', [miss('v3', 'Frozen')]), ok('b')]);
  add(1, [ok('b'), bad('a', [miss('v4', 'heldout'), miss('v4', 'held-out')])]);
  add(1, [bad('a', [miss('v5', '')])]);
  add(1, [bad('a', [miss('v6', 'HELDOUT')]), ok('b')]);
  add(1, [bad('a', [miss('v1')]), art('c0', { control: true, _misses: [miss('v1', null), miss('v2', 'x')] }), art('x', { error: 'e', _misses: [miss('v3', '')] })]);
  add(1, [art('x', { error: '', _misses: [miss('v3', 'bogus')], rungs: null }), ok('b')]);
  // R6-R8 tallies
  add(1, [bad('a', [miss('v10', 'heldout', ['1'], '"a"'), miss('v2', 'heldout', ['2'], '"b"')]), bad('b', [miss('v2', 'heldout', ['22'], '"bb"'), miss('v1', 'heldout', [], 'null')]), ok('c')]);
  add(1, [bad('a', [miss('v1', 'heldout'), miss('v2', 'frozen')]), bad('b', [miss('v2', 'frozen'), miss('v1', 'heldout')])]);
  add(1, [bad('a', [miss('v3', 'frozen')]), ok('b'), ok('c')]);
  add(1, [bad('a', [miss('v1', 'heldout'), miss('v1', 'frozen')]), ok('b')]);
  // R7 dedupe: a repeated miss in one artifact counts once; two artifacts with one NAME count once
  add(1, [bad('a', [miss('v1'), miss('v1'), miss('v1')]), ok('b')]);
  add(1, [bad('a', [miss('v1')]), bad('a', [miss('v1')]), ok('a')]);
  add(1, [bad('a', [miss('v1', 'frozen'), miss('v1', 'frozen')]), bad('a', [miss('v1', 'frozen'), miss('v2', 'frozen')]), bad('b', [miss('v1', 'frozen')])]);
  add(1, [bad('a', [miss('v1')], { _misses: null }), bad('b', [miss('v2')])]);
  add(3, [bad('', [miss('', 'heldout', [], '')]), bad('é', [miss('ü', 'heldout', ['"日本"'], '"\\u0000"')])]);
  add(3, [bad('a', [miss('B'), miss('a'), miss('_'), miss('Z')]), bad('b', [miss('a'), miss('B')])]);
  add(3, [bad('a', [miss('10'), miss('2'), miss('constructor'), miss('__proto__')]), bad('b', [miss('2')])]);
  add(1, [bad('a', [miss('v1', 'frozen', ['1'], '2')]), bad('b', [miss('v1', 'frozen', ['9'], '8')])]);
  // R9 round carried verbatim
  add(0, [ok('a'), ok('b')]);
  add(-3, [ok('a')]);
  add(123456789, [bad('a', [miss('v1')])]);
  add(9007199254740991, []);
  add(-9007199254740991, [art('e', { error: 'z' })]);
  // real run.mjs shapes: js (typeCheck n/a, ok none), ts and rust (applicable), an errored build without control/typeCheck/_misses
  add(2, [
    art('runs/js/emit_0.mjs', { control: true }),
    art('runs/js/emit_1.mjs', { control: false, typeCheck: tc(false, null), rungs: [HV] }),
    art('runs/js/emit_2.mjs', { typeCheck: tc(false, null), rungs: [], _misses: [{ name: 'v30', slice: 'heldout', args: ['"#fff"'], expected: '[255, 255, 255, 1]' }, { name: 'v3', slice: 'frozen', args: ['""'], expected: 'null' }] }),
    art('runs/js/emit_3.mjs', { control: null, error: 'Unexpected token', rungs: [], typeCheck: null, _misses: null }),
  ]);
  add(3, [
    art('runs/rust/emit_1', { typeCheck: tc(true, true), rungs: [TC, HV] }),
    art('runs/rust/emit_2', { typeCheck: tc(true, true), rungs: [TC], _misses: [miss('v40', 'heldout', ['"a"', '2'], 'throw("")')] }),
    art('runs/rust/emit_3', { typeCheck: tc(true, false), rungs: [], _misses: [miss('v40', 'heldout', ['"a"', '2'], 'throw("")'), miss('v41')] }),
  ]);
  return c;
}

export function genInputs(n, rnd) {
  const out = curated();
  const ri = (k) => Math.floor(rnd() * k);
  const pick = (xs) => xs[ri(xs.length)];
  const RUNGS = [[], [HV], [TC], [TC, HV], [HV, TC], ['cross-verified', HV], ['harness-verified!'], [HV, HV]];
  const SLICES = ['heldout', 'frozen', 'heldout', 'frozen', null], BAD_SLICES = ['other', '', 'Frozen'];
  const TCS = [null, tc(false, null), tc(false, false), tc(false, true), tc(true, true), tc(true, false), tc(true, null)];
  const NAMES = ['v0', 'v1', 'v2', 'v3', 'v10', 'v11', 'ext1', 'a', 'B'];
  while (out.length < n) {
    const k = ri(6); const arts = [];
    for (let i = 0; i < k; i++) {
      const r = rnd();
      const control = r < 0.12 ? true : r < 0.2 ? null : false;
      const error = rnd() < 0.15 ? pick(['', 'harness build failed', 'tsc emit failed', 'x']) : null;
      const misses = [];
      const m = rnd() < 0.5 ? 0 : ri(5);
      for (let j = 0; j < m; j++) misses.push(miss(pick(NAMES), rnd() < 0.02 ? pick(BAD_SLICES) : pick(SLICES), [String(ri(9))], String(ri(9))));
      arts.push({ artifact: `runs/x/emit_${ri(5)}`, control, error, rungs: rnd() < 0.02 ? null : pick(RUNGS), typeCheck: pick(TCS), _misses: rnd() < 0.1 ? null : misses });
    }
    out.push([ri(12) - 1, arts]);
  }
  return out;
}
