// @rederive/typeDetect — verified-recompose of type-detect@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/typeDetect.sir
// Clean-room re-emission of type-detect@4.1.0 default export.
// Reconstructed solely from the SIR and frozen oracle; no original source consulted.

// --- Module-load-time capability flags and anchors ---

const promiseExists   = typeof Promise   === 'function';
const symbolExists    = typeof Symbol    !== 'undefined';
const mapExists       = typeof Map       !== 'undefined';
const setExists       = typeof Set       !== 'undefined';
const weakMapExists   = typeof WeakMap   !== 'undefined';
const weakSetExists   = typeof WeakSet   !== 'undefined';
const dataViewExists  = typeof DataView  !== 'undefined';
const symbolToStringTagExists = symbolExists && typeof Symbol.toStringTag !== 'undefined';

// Iterator-prototype anchors
const mapIteratorPrototype    = mapExists    ? Object.getPrototypeOf(new Map().entries())      : null;
const setIteratorPrototype    = setExists    ? Object.getPrototypeOf(new Set().entries())      : null;
const arrayIteratorPrototype  = symbolExists ? Object.getPrototypeOf([][Symbol.iterator]())    : null;
const stringIteratorPrototype = symbolExists ? Object.getPrototypeOf(''[Symbol.iterator]())    : null;

const arrayIteratorExists  = arrayIteratorPrototype  !== null;
const stringIteratorExists = stringIteratorPrototype !== null;

// Global object anchor
let globalObject;
if (typeof globalThis === 'object') {
  globalObject = globalThis;
} else {
  // Legacy path: use a temporary getter on Object.prototype
  Object.defineProperty(Object.prototype, 'typeDetectGlobalObject', {
    get: function () { return this; },
    configurable: true,
  });
  // eslint-disable-next-line no-undef
  globalObject = typeDetectGlobalObject;
  delete Object.prototype.typeDetectGlobalObject;
}

// --- The function ---

function typeDetect(obj) {
  // NODE 1 — primitive fast path
  const typeofObj = typeof obj;
  if (typeofObj !== 'object') {
    return typeofObj;
  }

  // NODE 2 — null
  if (obj === null) {
    return 'null';
  }

  // NODE 3 — global object
  if (obj === globalObject) {
    return 'global';
  }

  // NODE 4 — Array (without toStringTag)
  if (Array.isArray(obj) && (!symbolToStringTagExists || !(Symbol.toStringTag in obj))) {
    return 'Array';
  }

  // NODE 5 — Browser window / DOM (skipped on Node)
  if (typeof window === 'object' && window !== null) {
    if (obj === window.location) return 'Location';
    if (obj === window.document) return 'Document';
    if (window.navigator && obj === window.navigator.mimeTypes) return 'MimeTypeArray';
    if (window.navigator && obj === window.navigator.plugins)   return 'PluginArray';
    if (typeof window.HTMLElement === 'function' && obj instanceof window.HTMLElement) {
      const tag = obj.tagName;
      if (tag === 'BLOCKQUOTE') return 'HTMLQuoteElement';
      if (tag === 'TD')         return 'HTMLTableDataCellElement';
      if (tag === 'TH')         return 'HTMLTableHeaderCellElement';
    }
  }

  // NODE 6 — Symbol.toStringTag string override
  const stringTag = symbolToStringTagExists && obj[Symbol.toStringTag];
  if (typeof stringTag === 'string') {
    return stringTag;
  }

  // NODE 7 — capture objPrototype
  const objPrototype = Object.getPrototypeOf(obj);

  // NODE 8 — prototype-identity ladder
  if (objPrototype === RegExp.prototype)  return 'RegExp';
  if (objPrototype === Date.prototype)    return 'Date';
  if (promiseExists   && objPrototype === Promise.prototype)  return 'Promise';
  if (setExists       && objPrototype === Set.prototype)      return 'Set';
  if (mapExists       && objPrototype === Map.prototype)      return 'Map';
  if (weakSetExists   && objPrototype === WeakSet.prototype)  return 'WeakSet';
  if (weakMapExists   && objPrototype === WeakMap.prototype)  return 'WeakMap';
  if (dataViewExists  && objPrototype === DataView.prototype) return 'DataView';
  if (mapExists       && objPrototype === mapIteratorPrototype)    return 'Map Iterator';
  if (setExists       && objPrototype === setIteratorPrototype)    return 'Set Iterator';
  if (arrayIteratorExists  && objPrototype === arrayIteratorPrototype)  return 'Array Iterator';
  if (stringIteratorExists && objPrototype === stringIteratorPrototype) return 'String Iterator';

  // NODE 10 — null prototype
  if (objPrototype === null) {
    return 'Object';
  }

  // NODE 11 — objectToString fallback
  return Object.prototype.toString.call(obj).slice(8, -1);
}

export default typeDetect;
