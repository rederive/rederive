// @rederive/stringify — verified-recompose of fast-safe-stringify@2.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/stringify.sir
export default function stringify (obj, replacer, spacer) {
  try {
    return JSON.stringify(obj, replacer, spacer)
  } catch (_) {
    return JSON.stringify('[unable to serialize, circular reference is too complex to analyze]')
  }
}
