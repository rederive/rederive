// @rederive/marshall — verified-recompose of @aws-sdk/util-dynamodb@3.515.0. quorum 3/3, differential 400/400, round 3. SIR: sir/marshall.sir
// Clean-room re-emission of @aws-sdk/util-dynamodb marshall
// Reconstructed from SIR + frozen oracle. No external dependencies.

// ============================================================================
// NumberValue — internal class, inline reproduction
// ============================================================================
class NumberValue {
  constructor(value) {
    this.value = String(value);
  }
  toString() {
    return this.value;
  }
  toAttributeValue() {
    return { N: this.value };
  }
}

// ============================================================================
// isBinary — constructor.name membership test (NOT instanceof)
// ============================================================================
const BINARY_NAMES = new Set([
  "ArrayBuffer", "Blob", "Buffer", "DataView", "File",
  "Int8Array", "Uint8Array", "Uint8ClampedArray",
  "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
]);

function isBinary(data) {
  return data?.constructor != null && BINARY_NAMES.has(data.constructor.name);
}

// ============================================================================
// convertToNumberAttr(num) — branch 9
// ============================================================================
function convertToNumberAttr(num) {
  const s = num.toString();
  if (s === "NaN" || s === "Infinity" || s === "-Infinity") {
    throw new Error(`Special numeric value ${s} is not allowed`);
  }
  const n = typeof num === "number" ? num : num.valueOf();
  if (n > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Number ${s} is greater than Number.MAX_SAFE_INTEGER. Use BigInt. `);
  }
  if (n < Number.MIN_SAFE_INTEGER) {
    throw new Error(`Number ${s} is lesser than Number.MIN_SAFE_INTEGER. Use BigInt. `);
  }
  return { N: s };
}

// ============================================================================
// convertToBigIntAttr(data) — branch 11
// ============================================================================
function convertToBigIntAttr(data) {
  return { N: data.toString() };
}

// ============================================================================
// convertToStringAttr(data) — used by Set<string>
// ============================================================================
function convertToStringAttr(data) {
  return { S: data.toString() };
}

// ============================================================================
// convertToBinaryAttr(data) — used by Set<binary>
// ============================================================================
function convertToBinaryAttr(data) {
  return { B: data };
}

// ============================================================================
// convertToListAttr(data, options) — branch 3
// ============================================================================
function convertToListAttr(data, options) {
  const removeUndefined = options?.removeUndefinedValues;
  const arr = removeUndefined
    ? data.filter(item => item !== undefined)
    : data;
  return { L: arr.map(item => convertToAttr(item, options)) };
}

// ============================================================================
// convertToSetAttr(set, options) — branch 4
// ============================================================================
function convertToSetAttr(set, options) {
  const removeUndefined = options?.removeUndefinedValues;

  // Step 1 — undefined handling
  let setToOperate;
  if (removeUndefined) {
    setToOperate = new Set([...set].filter(v => v !== undefined));
  } else {
    setToOperate = set;
    if (setToOperate.has(undefined)) {
      throw new Error(
        "Pass options.removeUndefinedValues=true to remove undefined values from map/array/set."
      );
    }
  }

  // Step 2 — empty check (after undefined filtering)
  if (setToOperate.size === 0) {
    if (options?.convertEmptyValues) {
      return { NULL: true };
    }
    throw new Error("Pass a non-empty set, or options.convertEmptyValues=true.");
  }

  // Step 3 — element-type detection by first element
  const item = setToOperate.values().next().value;

  if (item instanceof NumberValue) {
    return { NS: Array.from(setToOperate).map(x => x.toString()) };
  }
  if (typeof item === "number") {
    return { NS: Array.from(setToOperate).map(x => convertToNumberAttr(x)).map(x => x.N) };
  }
  if (typeof item === "bigint") {
    return { NS: Array.from(setToOperate).map(x => convertToBigIntAttr(x)).map(x => x.N) };
  }
  if (typeof item === "string") {
    return { SS: Array.from(setToOperate).map(x => convertToStringAttr(x)).map(x => x.S) };
  }
  if (isBinary(item)) {
    return { BS: Array.from(setToOperate).map(x => convertToBinaryAttr(x)).map(x => x.B) };
  }

  throw new Error("Only Number Set (NS), Binary Set (BS) or String Set (SS) are allowed.");
}

// ============================================================================
// convertToMapAttrFromIterable(data, options) — branch 5 (Map)
// ============================================================================
function convertToMapAttrFromIterable(data, options) {
  const removeUndefined = options?.removeUndefinedValues;
  const map = {};
  for (const [key, value] of data) {
    if (typeof value !== "function" && (value !== undefined || !removeUndefined)) {
      map[String(key)] = convertToAttr(value, options);
    }
  }
  return { M: map };
}

// ============================================================================
// convertToMapAttrFromEnumerableProps(data, options) — branch 6 & 13
// ============================================================================
function convertToMapAttrFromEnumerableProps(data, options) {
  const removeUndefined = options?.removeUndefinedValues;
  const map = {};
  for (const key in data) {
    const value = data[key];
    if (typeof value !== "function" && (value !== undefined || !removeUndefined)) {
      map[key] = convertToAttr(value, options);
    }
  }
  return { M: map };
}

// ============================================================================
// convertToAttr(data, options) — Layer A dispatcher
// ============================================================================
function convertToAttr(data, options) {
  // Branch 1: undefined
  if (data === undefined) {
    throw new Error(
      "Pass options.removeUndefinedValues=true to remove undefined values from map/array/set."
    );
  }

  // Branch 2: null
  if (data === null && typeof data === "object") {
    return { NULL: true };
  }

  // Branch 3: Array (includes Array subclasses)
  if (Array.isArray(data)) {
    return convertToListAttr(data, options);
  }

  // Branch 4: Set (by constructor.name === "Set" exactly)
  if (data?.constructor?.name === "Set") {
    return convertToSetAttr(data, options);
  }

  // Branch 5: Map (by constructor.name === "Map" exactly)
  if (data?.constructor?.name === "Map") {
    return convertToMapAttrFromIterable(data, options);
  }

  // Branch 6: plain object (constructor.name === "Object") or null-proto object
  if (data?.constructor?.name === "Object" || (!data.constructor && typeof data === "object")) {
    return convertToMapAttrFromEnumerableProps(data, options);
  }

  // Branch 7: isBinary
  if (isBinary(data)) {
    if (data.length === 0 && options?.convertEmptyValues) {
      return { NULL: true };
    }
    return { B: data };
  }

  // Branch 8: boolean (primitive or boxed)
  if (typeof data === "boolean" || data?.constructor?.name === "Boolean") {
    return { BOOL: data.valueOf() };
  }

  // Branch 9: number (primitive or boxed)
  if (typeof data === "number" || data?.constructor?.name === "Number") {
    return convertToNumberAttr(data);
  }

  // Branch 10: NumberValue instance
  if (data instanceof NumberValue) {
    return data.toAttributeValue();
  }

  // Branch 11: bigint
  if (typeof data === "bigint") {
    return convertToBigIntAttr(data);
  }

  // Branch 12: string (primitive or boxed)
  if (typeof data === "string" || data?.constructor?.name === "String") {
    if (data.length === 0 && options?.convertEmptyValues) {
      return { NULL: true };
    }
    return { S: data.toString() };
  }

  // Branch 13: convertClassInstanceToMap fallback for objects
  if (options?.convertClassInstanceToMap && typeof data === "object") {
    return convertToMapAttrFromEnumerableProps(data, options);
  }

  // Branch 14: unsupported type (may throw TypeError for Symbol via template literal)
  throw new Error(
    `Unsupported type passed: ${data}. Pass options.convertClassInstanceToMap=true to marshall typeof object as map attribute.`
  );
}

// ============================================================================
// marshall(data, options) — Layer B: top-level unwrap
// ============================================================================
export function marshall(data, options) {
  const av = convertToAttr(data, options);
  const [key, value] = Object.entries(av)[0];
  if (key === "M" || key === "L") {
    return options?.convertTopLevelContainer ? av : value;
  }
  return av;
}
