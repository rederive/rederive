// @rederive/arrayUnique — verified-recompose of array-unique@0.3.2. quorum 3/3, differential 400/400, round 1. SIR: sir/arrayUnique.sir
function unique(arr) {
  if (!Array.isArray(arr)) {
    throw new TypeError('array-unique expects an array.');
  }

  let i = 0;
  while (i < arr.length) {
    let found = false;
    for (let j = 0; j < i; j++) {
      if (arr[j] === arr[i]) {
        found = true;
        break;
      }
    }
    if (found) {
      arr.splice(i, 1);
    } else {
      i++;
    }
  }

  return arr;
}

export default unique;
