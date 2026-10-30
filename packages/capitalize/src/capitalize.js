// @rederive/capitalize — verified-recompose of capitalize@2.0.4. quorum 3/3, differential 400/400, round 2. SIR: sir/capitalize.sir
function normalizeOptions(opts) {
  if (!opts) return { preserve: false };
  if (typeof opts === 'boolean') return { preserve: opts };
  if (opts.skipWord instanceof RegExp) {
    const re = opts.skipWord;
    opts.skipWord = function (word) {
      return re.test(word);
    };
  }
  return opts;
}

function capitalize(string, opts) {
  opts = normalizeOptions(opts);
  if (!opts.preserve) {
    string = string.toLowerCase();
  }
  return string.charAt(0).toUpperCase() + string.substring(1);
}

export default capitalize;
