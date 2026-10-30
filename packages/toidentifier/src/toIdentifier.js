// @rederive/toIdentifier — verified-recompose of toidentifier@1.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/toIdentifier.sir
export default function toIdentifier(str) {
  return str
    .split(' ')
    .map(function (token) {
      return token.slice(0, 1).toUpperCase() + token.slice(1)
    })
    .join('')
    .replace(/[^ _0-9a-z]/gi, '')
}
