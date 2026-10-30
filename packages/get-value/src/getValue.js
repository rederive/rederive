// @rederive/getValue — verified-recompose of get-value@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/getValue.sir
function isObject(v) {
  return v !== null && typeof v === "object";
}

function isValidObject(v) {
  return isObject(v) || typeof v === "function";
}

function split(path, splitChar, options) {
  if (typeof options.split === "function") {
    return options.split(path);
  }
  return path.split(splitChar);
}

function join(segs, joinChar, options) {
  if (typeof options.join === "function") {
    return options.join(segs);
  }
  return segs[0] + joinChar + segs[1];
}

function isValid(key, target, options) {
  if (typeof options?.isValid === "function") {
    return options.isValid(key, target === undefined ? {} : target);
  }
  return true;
}

function getValue(target, path, options) {
  // NODE 1 — normalize options
  if (!isObject(options)) {
    options = { default: options };
  }

  // NODE 2 — non-object target guard
  if (!isValidObject(target)) {
    return (typeof options.default !== "undefined") ? options.default : target;
  }

  // NODE 3 — number-path coercion
  if (typeof path === "number") {
    path = String(path);
  }

  // NODE 4 — compute flags and separators
  const pathIsArray = Array.isArray(path);
  const pathIsString = typeof path === "string";
  const splitChar = options.separator || ".";
  const joinChar = options.joinChar ||
    (typeof splitChar === "string" ? splitChar : ".");

  // NODE 5 — non-(string|array) path guard
  if (!pathIsString && !pathIsArray) {
    return target;
  }

  // NODE 6 — TOP-LEVEL direct lookup
  let value = target[path];
  if (value === undefined && typeof target.get === "function") {
    value = target.get(path);
  }
  if (value !== undefined) {
    return isValid(path, target, options) ? value : options.default;
  }

  // NODE 7 — segment the path
  const segs = pathIsArray ? path : split(path, splitChar, options);
  const len = segs.length;
  let idx = 0;

  // NODE 8 — main descent loop
  do {
    let prop = segs[idx];
    if (typeof prop !== "string") {
      prop = String(prop);
    }

    // 8a — BACKSLASH ESCAPE re-join
    while (prop && prop.slice(-1) === "\\") {
      idx = idx + 1;
      prop = join([prop.slice(0, -1), segs[idx] !== undefined ? segs[idx] : ""], joinChar, options);
    }

    // 8b — current-segment lookup
    value = target[prop];
    if (value === undefined && typeof target.get === "function") {
      value = target.get(prop);
    }
    if (value !== undefined) {
      if (!isValid(prop, target, options)) return options.default;
      target = value; // descend
    } else {
      // 8c — GREEDY COMBINE
      let hasProp = false;
      let n = idx + 1;
      while (n < len) {
        prop = join([prop, segs[n]], joinChar, options);
        n = n + 1;
        value = target[prop];
        if (value === undefined && typeof target.get === "function") {
          value = target.get(prop);
        }
        hasProp = (value !== undefined);
        if (hasProp) {
          if (!isValid(prop, target, options)) return options.default;
          target = value; // descend into the combined key
          idx = n - 1;   // advance idx to the last consumed seg
          break;
        }
      }
      if (!hasProp) {
        return options.default;
      }
    }
  } while (++idx < len && isValidObject(target));

  // NODE 9 — terminal
  if (idx === len) {
    return target;
  }
  return options.default;
}

export default getValue;
