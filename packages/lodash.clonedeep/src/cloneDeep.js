// @rederive/cloneDeep — verified-recompose of lodash.clonedeep@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/cloneDeep.sir
// Clean-room re-emission of cloneDeep (lodash.clonedeep@4.5.0 behavioral contract)
// Reconstructed from SIR + frozen oracle. Zero dependencies.

// ---- Tag constants ----
const tagArguments    = '[object Arguments]';
const tagArray        = '[object Array]';
const tagArrayBuffer  = '[object ArrayBuffer]';
const tagBoolean      = '[object Boolean]';
const tagDataView     = '[object DataView]';
const tagDate         = '[object Date]';
const tagError        = '[object Error]';
const tagFloat32      = '[object Float32Array]';
const tagFloat64      = '[object Float64Array]';
const tagFunction     = '[object Function]';
const tagGeneratorFn  = '[object GeneratorFunction]';
const tagInt8         = '[object Int8Array]';
const tagInt16        = '[object Int16Array]';
const tagInt32        = '[object Int32Array]';
const tagMap          = '[object Map]';
const tagNumber       = '[object Number]';
const tagObject       = '[object Object]';
const tagRegExp       = '[object RegExp]';
const tagSet          = '[object Set]';
const tagString       = '[object String]';
const tagSymbol       = '[object Symbol]';
const tagUint8        = '[object Uint8Array]';
const tagUint8Clamped = '[object Uint8ClampedArray]';
const tagUint16       = '[object Uint16Array]';
const tagUint32       = '[object Uint32Array]';
const tagWeakMap      = '[object WeakMap]';

// ---- Cloneable tags table ----
const cloneableTags = Object.create(null);
// true = cloneable
for (const t of [
  tagArguments, tagArray, tagArrayBuffer, tagBoolean, tagDataView, tagDate,
  tagFloat32, tagFloat64, tagInt8, tagInt16, tagInt32,
  tagMap, tagNumber, tagObject, tagRegExp, tagSet, tagString,
  tagUint8, tagUint8Clamped, tagUint16, tagUint32, tagSymbol,
]) {
  cloneableTags[t] = true;
}
// false = non-cloneable
for (const t of [tagError, tagFunction, tagWeakMap]) {
  cloneableTags[t] = false;
}

// ---- Helpers ----

function getTag(value) {
  return Object.prototype.toString.call(value);
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

// isBuffer: checks for Node.js Buffer
function isBuffer(value) {
  return (
    typeof Buffer !== 'undefined' &&
    Buffer.isBuffer &&
    Buffer.isBuffer(value)
  );
}

// isPrototype: checks if an object is a prototype object
// (used to detect when initCloneObject should return {} instead of Object.create(proto))
function isPrototype(value) {
  const Ctor = value && value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || Object.prototype;
  return value === proto;
}

// ---- Stack (cycle tracking) ----
// A simple Map-backed stack for cycle/shared-ref detection.
// SIR: "a small ListCache (linear) that upgrades to a Map-backed MapCache once it exceeds 199 entries."
// For correctness, we use a Map throughout (same SameValueZero semantics, equivalent behavior).

class Stack {
  constructor() {
    this._map = new Map();
  }
  get(key) {
    return this._map.get(key);
  }
  set(key, value) {
    this._map.set(key, value);
    return this;
  }
  has(key) {
    return this._map.has(key);
  }
}

// ---- Cloning helpers ----

function cloneArrayBuffer(ab) {
  const r = new ab.constructor(ab.byteLength);
  new Uint8Array(r).set(new Uint8Array(ab));
  return r;
}

function cloneDataView(dv, isDeep) {
  const buffer = isDeep ? cloneArrayBuffer(dv.buffer) : dv.buffer;
  return new dv.constructor(buffer, dv.byteOffset, dv.byteLength);
}

function cloneTypedArray(ta, isDeep) {
  const buffer = isDeep ? cloneArrayBuffer(ta.buffer) : ta.buffer;
  return new ta.constructor(buffer, ta.byteOffset, ta.length);
}

function cloneRegExp(re) {
  // Extract flags from the end of the regexp's string representation
  const flagsMatch = /\w*$/.exec(re);
  const r = new re.constructor(re.source, flagsMatch[0]);
  r.lastIndex = re.lastIndex;
  return r;
}

function cloneSymbol(value) {
  // Returns a Symbol wrapper object around the same underlying symbol primitive
  return Object(Symbol.prototype.valueOf.call(value));
}

function cloneBuffer(buf) {
  // Node Buffer#slice — returns a new Buffer with the same bytes
  return buf.slice();
}

// initCloneArray: create empty array of same length, handle regexp-exec result shape
function initCloneArray(value) {
  const { length } = value;
  const result = new value.constructor(length);
  // Special case: regexp exec result shape (has own 'index' and first element is string)
  if (length && typeof value[0] === 'string' && Object.prototype.hasOwnProperty.call(value, 'index')) {
    result.index = value.index;
    result.input = value.input;
  }
  return result;
}

// initCloneObject: preserve prototype for plain objects
function initCloneObject(object) {
  // If object is a function (isFunc && !object case), initCloneObject receives {}
  // For null-proto objects: no constructor -> returns {}
  if (typeof object.constructor === 'function' && !isPrototype(object)) {
    return Object.create(Object.getPrototypeOf(object));
  }
  return {};
}

// mapToArray: convert Map entries to [[k,v], ...] array
function mapToArray(map) {
  const result = [];
  map.forEach((value, key) => {
    result.push([key, value]);
  });
  return result;
}

// setToArray: convert Set members to array
function setToArray(set) {
  const result = [];
  set.forEach((value) => {
    result.push(value);
  });
  return result;
}

// addMapEntry: reducer to build a Map from [[k,v], ...] pairs
function addMapEntry(map, pair) {
  map.set(pair[0], pair[1]);
  return map;
}

// addSetEntry: reducer to build a Set from array of values
function addSetEntry(set, value) {
  set.add(value);
  return set;
}

// cloneMap: deep-clone a Map (keys AND values)
function cloneMap(map, isDeep, cloneFunc, stack) {
  const pairs = mapToArray(map);
  const clonedPairs = cloneFunc(pairs, true, true, undefined, undefined, undefined, stack);
  const result = new map.constructor();
  clonedPairs.reduce(addMapEntry, result);
  return result;
}

// cloneSet: deep-clone a Set (members)
function cloneSet(set, isDeep, cloneFunc, stack) {
  const members = setToArray(set);
  const clonedMembers = cloneFunc(members, true, true, undefined, undefined, undefined, stack);
  const result = new set.constructor();
  clonedMembers.reduce(addSetEntry, result);
  return result;
}

// initCloneByTag: the tag-dispatch ladder (NODE 4)
function initCloneByTag(value, tag, cloneFunc, isDeep, stack) {
  const Ctor = value.constructor;
  switch (tag) {
    case tagArrayBuffer:
      return cloneArrayBuffer(value);

    case tagBoolean:
    case tagDate:
      return new Ctor(+value);

    case tagDataView:
      return cloneDataView(value, isDeep);

    case tagFloat32:
    case tagFloat64:
    case tagInt8:
    case tagInt16:
    case tagInt32:
    case tagUint8:
    case tagUint8Clamped:
    case tagUint16:
    case tagUint32:
      return cloneTypedArray(value, isDeep);

    case tagMap:
      return cloneMap(value, isDeep, cloneFunc, stack);

    case tagNumber:
    case tagString:
      return new Ctor(value);

    case tagRegExp:
      return cloneRegExp(value);

    case tagSet:
      return cloneSet(value, isDeep, cloneFunc, stack);

    case tagSymbol:
      return cloneSymbol(value);
  }
  // Should never be reached for in-contract inputs
  return undefined;
}

// assignValue: sets obj[key]=val unless an equivalent own value already exists
// "if val===undefined it still assigns when key not already in obj"
function assignValue(obj, key, val) {
  const objVal = obj[key];
  if (!(Object.prototype.hasOwnProperty.call(obj, key) &&
        (objVal === val || (objVal !== objVal && val !== val)))) {
    // val is not already present as an equivalent own value
    obj[key] = val;
  }
}

// getAllKeys: own enumerable string keys + own enumerable symbol keys (isFull=true path)
function getAllKeys(value) {
  const result = Object.keys(value);
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length) {
    for (const sym of symbols) {
      // Only own enumerable symbols
      if (Object.prototype.propertyIsEnumerable.call(value, sym)) {
        result.push(sym);
      }
    }
  }
  return result;
}

// ---- Core baseClone ----
// isDeep=true, isFull=true are FIXED throughout.

function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
  // NODE 0: no customizer; skip.

  // NODE 1: non-object passthrough
  if (!isObject(value)) {
    return value;
  }

  const isArr = Array.isArray(value);
  let result;

  if (isArr) {
    // NODE 2: arrays
    result = initCloneArray(value);
    // isDeep=true: do NOT early-return; fall through to NODE 5
  } else {
    // NODE 3: non-array objects
    const tag = getTag(value);
    const isFunc = (tag === tagFunction || tag === tagGeneratorFn);

    // NODE 3a: Buffer
    if (isBuffer(value)) {
      return cloneBuffer(value);
    }

    // NODE 3b: plain-object / arguments / top-level function
    if (tag === tagObject || tag === tagArguments || (isFunc && !object)) {
      // isHostObject check: in Node.js this is never true for in-scope inputs; treat as not taken.
      if (isFunc) {
        // top-level function: initCloneObject({}) -> empty {}
        result = initCloneObject({});
      } else {
        result = initCloneObject(value);
      }
      // isDeep=true: fall through to NODE 5
    } else {
      // NODE 3c: tag-dispatched / non-cloneable
      const isCloneable = cloneableTags[tag];
      if (!isCloneable) {
        // NON-CLONEABLE: nested -> return original; top-level -> {}
        return object ? value : {};
      }
      // Cloneable: NODE 4 ladder
      result = initCloneByTag(value, tag, baseClone, isDeep, stack);
      // Fall through to NODE 5 for property walk
    }
  }

  // NODE 5: cycle check + recursive property walk
  stack || (stack = new Stack());
  const stacked = stack.get(value);
  if (stacked !== undefined) {
    // CYCLE / SHARED-REF: return already-built clone
    return stacked;
  }
  // Register BEFORE recursing to handle cycles
  stack.set(value, result);

  // Determine keys to walk
  let props;
  if (!isArr) {
    props = isFull ? getAllKeys(value) : Object.keys(value);
  }

  // arrayEach: walk props list or array by index
  const iterable = props || value;
  const iterLen = props ? props.length : value.length;
  for (let i = 0; i < iterLen; i++) {
    let subKey, subValue;
    if (props) {
      subKey = iterable[i];
      subValue = value[subKey];
    } else {
      subKey = i;
      subValue = value[i];
    }
    assignValue(
      result,
      subKey,
      baseClone(subValue, true, true, customizer, subKey, value, stack)
    );
  }

  return result;
}

// ---- Public API ----

function cloneDeep(value) {
  return baseClone(value, true, true, undefined, undefined, undefined, undefined);
}

export default cloneDeep;
