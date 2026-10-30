// @rederive/omit — verified-recompose of object.omit@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/omit.sir
// Clean-room reconstruction of object.omit@3.0.0
// Inlines: isobject@3.0.1, is-plain-object@2.0.4, is-extendable@1.0.1
// No require/import — fully self-contained.

// ---- Inlined helper: isObject(val) [from isobject@3.0.1] ----
function isObject(val) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

// ---- Inlined helper: isObjectObject(o) [from is-plain-object@2.0.4] ----
function isObjectObject(o) {
  return isObject(o) === true &&
    Object.prototype.toString.call(o) === '[object Object]';
}

// ---- Inlined helper: isPlainObject(o) [from is-plain-object@2.0.4] ----
function isPlainObject(o) {
  if (isObjectObject(o) === false) return false;
  var ctor = o.constructor;
  if (typeof ctor !== 'function') return false;
  var prot = ctor.prototype;
  if (isObjectObject(prot) === false) return false;
  if (prot.hasOwnProperty('isPrototypeOf') === false) return false;
  return true;
}

// ---- Inlined helper: isExtendable(val) [from is-extendable@1.0.1] ----
function isExtendable(val) {
  return isPlainObject(val) || typeof val === 'function' || Array.isArray(val);
}

// ---- omit(obj, props, fn) ----
export default function omit(obj, props, fn) {
  // NODE A — extendability guard
  if (isExtendable(obj) === false) return {};

  // NODE B1 — props-as-function coercion
  if (typeof props === 'function') {
    fn = props;
    props = [];
  }

  // NODE B2 — props-as-string coercion
  if (typeof props === 'string') {
    props = [props];
  }

  // NODE C — predicate-presence flag
  var isFunction = typeof fn === 'function';

  // NODE D — enumerate own string keys
  var keys = Object.keys(obj);

  // NODE E — build result
  var res = {};
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = obj[key];
    // KEEP-CONDITION:
    //   (!props) || ( props.indexOf(key) === -1 && (!isFunction || fn(val, key, obj)) )
    // NODE F: if props is truthy but lacks .indexOf, props.indexOf(key) throws TypeError
    if (!props || (props.indexOf(key) === -1 && (!isFunction || fn(val, key, obj)))) {
      res[key] = val;
    }
  }
  return res;
}
