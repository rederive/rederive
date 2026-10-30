// @rederive/isExtglob — verified-recompose of is-extglob@2.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isExtglob.sir
export default function isExtglob(str) {
  if (typeof str !== 'string' || str === '') return false;
  var match;
  var re = /(\\).|([@?!+*]\(.*\))/;
  while ((match = re.exec(str)) !== null) {
    if (match[2]) return true;
    str = str.slice(match.index + match[0].length);
  }
  return false;
}
