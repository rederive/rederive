// @rederive/splitString — verified-recompose of split-string@6.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/splitString.sir
// splitString — clean-room re-emission from SIR + frozen oracle
// split-string@6.1.0, MIT, zero dependencies

function closeIndex(str, value, start) {
  let idx = str.indexOf(value, start);
  while (idx > -1 && str[idx - 1] === '\\') {
    idx = closeIndex(str, value, idx + 1);
  }
  return idx;
}

function invert(obj) {
  const result = {};
  for (const k of Object.keys(obj)) {
    result[obj[k]] = k;
  }
  return result;
}

function splitString(input, options) {
  if (typeof input !== 'string') {
    throw new TypeError('expected a string');
  }

  if (options === undefined || options === null) {
    options = {};
  }

  // --- Option resolution ---

  // separator
  const separator = options.separator || '.';

  // quotes
  let quotes;
  if (options.quotes === true) {
    quotes = ['"', "'", '`'];
  } else {
    quotes = options.quotes || [];
  }

  // brackets / openers / closers
  let openers;
  const bracketsOpt = options.brackets;
  if (bracketsOpt === false) {
    openers = null; // fully disabled
  } else if (bracketsOpt === true) {
    openers = { '[': ']', '(': ')', '{': '}', '<': '>' };
  } else if (bracketsOpt === undefined || bracketsOpt === null) {
    openers = {};
  } else {
    openers = bracketsOpt;
  }
  const closers = openers !== null ? invert(openers) : {};

  const strict = options.strict === true;

  // keep — default: drop lone backslash
  const keep = (value) => value !== '\\';

  // --- State ---
  const root = { type: 'root', stash: [''], nodes: [] };
  const stack = [root];

  // APPEND helper — appends onto last segment of current block's stash
  function append(block, value) {
    if (value && keep(value) !== false) {
      block.stash[block.stash.length - 1] += value;
    }
  }

  const str = input;
  const len = str.length;
  let i = -1;

  function next() {
    i++;
    return str[i] !== undefined ? str[i] : '';
  }

  // Main scan loop: advance i inside body via next(), guard is i < len - 1
  while (i < len - 1) {
    const value = next();
    const block = stack[stack.length - 1];

    // (1) ESCAPE
    if (value === '\\') {
      if (str[i + 1] === '\\') {
        // double backslash: consume both, append '\\\\', kept
        const second = next();
        append(block, '\\' + second);
      } else {
        // lone backslash: dropped by default keep
        append(block, '\\');
        // next char appended verbatim
        const nextChar = next();
        append(block, nextChar);
      }
      continue;
    }

    // (2) QUOTE
    if (quotes.includes(value)) {
      const pos = i + 1;
      const idx = closeIndex(str, value, pos);
      if (idx > -1) {
        append(block, value);                    // opening quote
        append(block, str.slice(pos, idx));      // inner text verbatim
        append(block, str[idx]);                 // closing quote
        i = idx;                                 // jump cursor
      } else {
        // no closing quote: treat as ordinary char
        append(block, value);
      }
      continue;
    }

    // (3) OPEN BRACKET
    if (openers !== null && openers[value]) {
      const node = {
        type: 'bracket',
        nodes: [],
        stash: keep(value) !== false ? [value] : [''],
        parent: block,
      };
      block.nodes.push(node);
      stack.push(node);
      continue;
    }

    // (4) CLOSE BRACKET
    if (openers !== null && closers[value]) {
      if (stack.length === 1) {
        // stray closer: treat as normal char
        append(block, value);
      } else {
        // close the current bracket node
        append(block, value);
        const node = stack.pop();
        const parent = stack[stack.length - 1];
        // collapse bracket content into parent's last segment
        append(parent, node.stash.join(''));
      }
      continue;
    }

    // (5) SEPARATOR — only at root
    if (value === separator && block.type === 'root') {
      block.stash.push('');
      continue;
    }

    // (6) DEFAULT
    append(block, value);
  }

  // --- FLATTEN unclosed brackets ---
  let node = stack.pop();
  while (node !== root) {
    if (strict) {
      const column = i - node.stash.length + 1;
      throw new SyntaxError(`Unmatched: "${node.stash[0]}", at column ${column}`);
    } else {
      // merge unclosed bracket back onto parent
      const parent = node.parent;
      const prefix = parent.stash.pop();
      const inner = node.stash.join('.');
      const merged = prefix + inner;
      const pieces = merged.split('.');
      parent.stash = parent.stash.concat(pieces);
      node = stack.pop();
    }
  }

  return root.stash;
}

export default splitString;
