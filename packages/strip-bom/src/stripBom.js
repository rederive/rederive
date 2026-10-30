// @rederive/stripBom — verified-recompose of strip-bom@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/stripBom.sir
export default function stripBom(x) {
	if (typeof x !== 'string') {
		throw new TypeError('Expected a string, got ' + typeof x);
	}
	if (x.charCodeAt(0) === 0xFEFF) {
		return x.slice(1);
	}
	return x;
}
