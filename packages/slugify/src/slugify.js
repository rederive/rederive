// Clean-room re-emission of slugify, reconstructed from slugify.hardened.sir.
// Carried data (charMap, locales) is IMPORTED, never transcribed.
import { charMap, locales } from './slugify.data.js';

// Step 4b default: /[^\w\s$*_+~.()'"!\-:@]+/g
const DEFAULT_REMOVE = /[^\w\s$*_+~.()'"!\-:@]+/g;
// Step 7 strict regex.
const STRICT_REMOVE = /[^A-Za-z0-9\s]/g;
// Step 9 space-collapse regex.
const WHITESPACE_COLLAPSE = /\s+/g;

export default function slugify(string, options) {
  // 1. GUARD
  if (typeof string !== 'string') {
    throw new Error('slugify: string argument expected');
  }

  // 2. NORMALIZE OPTIONS
  if (typeof options === 'string') {
    options = { replacement: options };
  } else {
    options = options || {};
  }

  // 3. RESOLVE locale table (locale map first, global charMap second — precedence
  //    is enforced later in the map phase, step 6a/6b).
  const locale = locales[options.locale] || {};

  // 4. RESOLVE replacement — undefined-check (NOT truthiness).
  const replacement = options.replacement === undefined ? '-' : options.replacement;

  // 4b. RESOLVE remove — TRUTHINESS (||), not undefined-check. Every falsy value
  //     (undefined, missing, '', 0, null, false, NaN) falls back to the DEFAULT
  //     regex. A truthy RegExp or string is used as-is (native String.replace
  //     semantics: string patterns only replace the first match within the
  //     fragment they're applied to).
  const removePattern = options.remove || DEFAULT_REMOVE;

  // 5. RESOLVE trim — undefined-check, default true.
  const trim = options.trim === undefined ? true : options.trim;

  // 6. MAP PHASE
  let slug = string
    .normalize() // NFC (default form)
    .split('') // UTF-16 code-unit split (a surrogate pair splits into 2 lone halves)
    .reduce((result, ch) => {
      // 6a: locale overrides first.
      let appendChar = locale[ch];
      // 6b: then global charMap.
      if (appendChar === undefined) appendChar = charMap[ch];
      // 6c: else the char itself.
      if (appendChar === undefined) appendChar = ch;
      // 6d: collision — mapped/literal output equal to replacement collapses to a space.
      if (appendChar === replacement) appendChar = ' ';
      // Remove pattern applies to appendChar ALONE (the just-produced fragment),
      // not to the accumulated result.
      return result + appendChar.replace(removePattern, '');
    }, '');

  // 7. STRICT (optional) — runs BEFORE trim/space-collapse.
  if (options.strict) {
    slug = slug.replace(STRICT_REMOVE, '');
  }

  // 8. TRIM (optional, default on).
  if (trim) {
    slug = slug.trim();
  }

  // 9. SPACE-COLLAPSE (always).
  slug = slug.replace(WHITESPACE_COLLAPSE, replacement);

  // 10. LOWER (optional) — last step, applies to replacement chars too.
  if (options.lower) {
    slug = slug.toLowerCase();
  }

  // 11. RETURN
  return slug;
}
