// @rederive/minimist — verified-recompose of minimist@1.2.8. quorum 3/3, differential 400/400, round 1. SIR: sir/minimist.sir
'use strict';

function isNumber(x) {
  if (typeof x === 'number') return true;
  if (/^0x[0-9a-f]+$/i.test(x)) return true;
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}

function isConstructorOrProto(obj, key) {
  return (key === 'constructor' && typeof obj[key] === 'function') || key === '__proto__';
}

function hasKey(obj, keys) {
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    o = o[keys[i]] || {};
  }
  return keys[keys.length - 1] in o;
}

function parseArgs(args, opts) {
  if (!opts) opts = {};

  const flags = { bools: {}, strings: {}, unknownFn: null };

  if (typeof opts.unknown === 'function') {
    flags.unknownFn = opts.unknown;
  }

  if (typeof opts.boolean === 'boolean' && opts.boolean === true) {
    flags.allBools = true;
  } else {
    [].concat(opts.boolean).filter(Boolean).forEach(function(key) {
      flags.bools[key] = true;
    });
  }

  const aliases = {};
  Object.keys(opts.alias || {}).forEach(function(key) {
    aliases[key] = [].concat(opts.alias[key]);
    aliases[key].forEach(function(x) {
      aliases[x] = [key].concat(aliases[key].filter(function(y) { return x !== y; }));
    });
  });

  function aliasIsBoolean(key) {
    return aliases[key].some(function(x) { return flags.bools[x]; });
  }

  [].concat(opts.string).filter(Boolean).forEach(function(key) {
    flags.strings[key] = true;
    if (aliases[key]) {
      [].concat(aliases[key]).forEach(function(k) {
        flags.strings[k] = true;
      });
    }
  });

  const defaults = opts.default || {};

  const argv = { _: [] };

  function setKeyInner(obj, keys, value) {
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (isConstructorOrProto(o, k)) return;
      if (o[k] === undefined) o[k] = {};
      if (o[k] === Object.prototype || o[k] === Number.prototype || o[k] === String.prototype) o[k] = {};
      if (o[k] === Array.prototype) o[k] = [];
      o = o[k];
    }
    const lastKey = keys[keys.length - 1];
    if (isConstructorOrProto(o, lastKey)) return;
    if (o === Object.prototype || o === Number.prototype || o === String.prototype) o = {};
    if (o === Array.prototype) o = [];

    if (o[lastKey] === undefined || flags.bools[lastKey] || typeof o[lastKey] === 'boolean') {
      o[lastKey] = value;
    } else if (Array.isArray(o[lastKey])) {
      o[lastKey].push(value);
    } else {
      o[lastKey] = [o[lastKey], value];
    }
  }

  function argDefined(key, arg) {
    return (flags.allBools && /^--[^=]+$/.test(arg))
      || flags.strings[key]
      || flags.bools[key]
      || aliases[key];
  }

  function setArg(key, val, arg) {
    if (arg && flags.unknownFn && !argDefined(key, arg)) {
      if (flags.unknownFn(arg) === false) return;
    }
    const value = (!flags.strings[key] && isNumber(val)) ? Number(val) : val;
    setKeyInner(argv, key.split('.'), value);
    (aliases[key] || []).forEach(function(x) {
      setKeyInner(argv, x.split('.'), value);
    });
  }

  // Boolean seed loop
  Object.keys(flags.bools).forEach(function(key) {
    setArg(key, defaults[key] === undefined ? false : defaults[key]);
  });

  // "--" terminator pre-split
  const doubleDashIdx = args.indexOf('--');
  let notFlags = [];
  if (doubleDashIdx !== -1) {
    notFlags = args.slice(doubleDashIdx + 1);
    args = args.slice(0, doubleDashIdx);
  }

  // Main scan
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // BRANCH A: long "--key=value"
    if (/^--.+=/.test(arg)) {
      const m = arg.match(/^--([^=]+)=([\s\S]*)$/);
      const key = m[1];
      let value = m[2];
      if (flags.bools[key]) {
        value = (value !== 'false');
      }
      setArg(key, value, arg);

    // BRANCH B: long negation "--no-KEY"
    } else if (/^--no-.+/.test(arg)) {
      const key = arg.match(/^--no-(.+)/)[1];
      setArg(key, false, arg);

    // BRANCH C: long "--KEY" (no '=')
    } else if (/^--.+/.test(arg)) {
      const key = arg.match(/^--(.+)/)[1];
      const next = args[i + 1];
      if (next !== undefined
          && !/^(-|--)[^-]/.test(next)
          && !flags.bools[key]
          && !flags.allBools
          && (aliases[key] ? !aliasIsBoolean(key) : true)) {
        setArg(key, next, arg);
        i += 1;
      } else if (/^(true|false)$/.test(next)) {
        setArg(key, next === 'true', arg);
        i += 1;
      } else {
        setArg(key, flags.strings[key] ? '' : true, arg);
      }

    // BRANCH D: short cluster "-XYZ..."
    } else if (/^-[^-]+/.test(arg)) {
      const letters = arg.slice(1, -1).split('');
      let broken = false;

      for (let j = 0; j < letters.length; j++) {
        const next = arg.slice(j + 2);

        // D1: remainder is exactly "-"
        if (next === '-') {
          setArg(letters[j], '-', arg);
          continue;
        }

        // D2: letter is [A-Za-z] AND remainder starts with '='
        if (/[A-Za-z]/.test(letters[j]) && next[0] === '=') {
          setArg(letters[j], next.slice(1), arg);
          broken = true;
          break;
        }

        // D3: letter is [A-Za-z] AND remainder LOOKS NUMERIC
        if (/[A-Za-z]/.test(letters[j]) && /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) {
          setArg(letters[j], next, arg);
          broken = true;
          break;
        }

        // D4: the NEXT letter is a NON-word char \W
        if (letters[j + 1] && letters[j + 1].match(/\W/)) {
          setArg(letters[j], arg.slice(j + 2), arg);
          broken = true;
          break;
        } else {
          setArg(letters[j], flags.strings[letters[j]] ? '' : true, arg);
        }
      }

      // Handle the LAST char of arg
      const key = arg.slice(-1)[0];
      if (!broken && key !== '-') {
        if (args[i + 1]
            && !/^(-|--)[^-]/.test(args[i + 1])
            && !flags.bools[key]
            && (aliases[key] ? !aliasIsBoolean(key) : true)) {
          setArg(key, args[i + 1], arg);
          i += 1;
        } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
          setArg(key, args[i + 1] === 'true', arg);
          i += 1;
        } else {
          setArg(key, flags.strings[key] ? '' : true, arg);
        }
      }

    // BRANCH E: everything else -> POSITIONAL
    } else {
      if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
        argv._.push((flags.strings._ || !isNumber(arg)) ? arg : Number(arg));
      }
      if (opts.stopEarly) {
        argv._.push(...args.slice(i + 1));
        break;
      }
    }
  }

  // FINALIZE
  // 1) Apply defaults for any key still absent
  Object.keys(defaults).forEach(function(k) {
    if (!hasKey(argv, k.split('.'))) {
      setKeyInner(argv, k.split('.'), defaults[k]);
      (aliases[k] || []).forEach(function(x) {
        setKeyInner(argv, x.split('.'), defaults[k]);
      });
    }
  });

  // 2) Dispose of notFlags
  if (opts['--']) {
    argv['--'] = notFlags.slice();
  } else {
    notFlags.forEach(function(k) {
      argv._.push(k);
    });
  }

  return argv;
}

export default parseArgs;
