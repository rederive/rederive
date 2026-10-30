// @rederive/balanced — verified-recompose of balanced-match@1.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/balanced.sir
function maybeMatch(reg, str) {
  var m = str.match(reg);
  return m ? m[0] : null;
}

function range(a, b, str) {
  var ai = str.indexOf(a);
  var bi = str.indexOf(b, ai + 1);
  var i = ai;
  var begs, beg, left, right, result;

  if (!(ai >= 0 && bi > 0)) return undefined;

  if (a === b) return [ai, bi];

  begs = [];
  left = str.length;

  while (i >= 0 && !result) {
    if (i == ai) {
      begs.push(i);
      ai = str.indexOf(a, i + 1);
    } else if (begs.length == 1) {
      result = [begs.pop(), bi];
    } else {
      beg = begs.pop();
      if (beg < left) {
        left = beg;
        right = bi;
      }
      bi = str.indexOf(b, i + 1);
    }

    i = (ai < bi && ai >= 0) ? ai : bi;
  }

  if (begs.length) result = [left, right];

  return result;
}

function balanced(a, b, str) {
  if (a instanceof RegExp) a = maybeMatch(a, str);
  if (b instanceof RegExp) b = maybeMatch(b, str);

  var r = range(a, b, str);

  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + a.length, r[1]),
    post: str.slice(r[1] + b.length)
  };
}

balanced.range = range;

export default balanced;
