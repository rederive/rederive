// The js ENVELOPE EXTENSION — one grader for the lab and rdv (#164: rdv never graded it, so a bundle's verdict covered only the
// shared slice while the lab graded both). The extension oracle (oracles/<unit>.js.json, js-native-v0.4) holds the vectors whose
// values have no language-neutral meaning (bigint, holes, Map/Set, lone surrogates…): args are decoded from the legacy tags, the
// EXPECTED is escaped exactly as a driver escapes a result (#155; a throw stays a throw) and both sides go through the js-native
// codec. An expected the verifier cannot encode is the VERIFIER's fault, never an artifact's.
import { decodeLegacy } from '../sir/legacy.mjs';
import { encodeJsNative, escapeMarkers, isThrowMarker, isLegacyThrow } from '../sir/canon.mjs';
import { gradeArtifact } from './grade.mjs';

const escExpected = (x) => (isLegacyThrow(x) || isThrowMarker(x) ? x : escapeMarkers(x));

/** The extension's cases with every expected encoded (js-native), args left legacy (decoded per call). Throws, marked
 *  verifierFault, if any expected cannot be encoded. */
export function extensionCases(ex, sig) {
  const obsType = sig.state ? { k: 'record', fields: [['result', sig.result], ['post', sig.args[sig.state.index].type]] } : sig.result;
  const exp = (e) => encodeJsNative(e && e.__record ? { result: escExpected(decodeLegacy(e.__record.result)), post: escExpected(decodeLegacy(e.__record.post)) } : escExpected(decodeLegacy(e)), obsType);
  try { return { frozen: ex.frozen.map((c) => ({ ...c, expected: exp(c.expected) })), heldout: ex.heldout.map((c) => ({ ...c, expected: exp(c.expected) })) }; }
  catch (e) { const err = new Error(`VERIFIER FAULT — the js extension oracle cannot be encoded: ${String(e?.message ?? e).slice(0, 160)}`); err.verifierFault = true; throw err; }
}

/** Grade a prepared js/ts artifact on the extension cases. */
export const gradeExtension = (prepared, cases, sig) => gradeArtifact(prepared, cases, sig, { decodeArgs: decodeLegacy, encodeResult: encodeJsNative });
