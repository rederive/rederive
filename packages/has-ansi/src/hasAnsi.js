// @rederive/hasAnsi — verified-recompose of has-ansi@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/hasAnsi.sir
const re = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[a-zA-Z\\d]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))');

export default function hasAnsi(input) {
	return re.test(input);
}
