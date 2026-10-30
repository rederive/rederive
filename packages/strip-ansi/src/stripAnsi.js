// @rederive/stripAnsi — verified-recompose of strip-ansi@6.0.1. quorum 2/3, differential 400/400, round 1. SIR: sir/stripAnsi.sir
const ANSI_REGEX = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
  ].join('|'),
  'g'
);

export default function stripAnsi(input) {
  return typeof input === 'string'
    ? input.replace(ANSI_REGEX, '')
    : input;
}
