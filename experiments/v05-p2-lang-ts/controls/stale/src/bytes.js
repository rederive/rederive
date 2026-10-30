// @rederive/bytes — verified-recompose of bytes@3.1.2. quorum 3/3, differential 400/400, round 1. SIR: sir/bytes.sir
// Clean-room re-emission of bytes@3.1.2 (visionmedia/bytes.js, MIT)
// Reconstructed from SIR contract only — no original source consulted.

const map = {
  b:  1,
  kb: 1 << 10,
  mb: 1 << 20,
  gb: 1 << 30,
  tb: Math.pow(1024, 4),
  pb: Math.pow(1024, 5),
};

const parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;
const formatThousandsRegExp = /\B(?=(\d{3})+(?!\d))/g;
const formatDecimalsRegExp = /(?:\.0*|(\.[^0]+)0+)$/;

function format(value, options) {
  // F1: finite guard
  if (!Number.isFinite(value)) return null;

  // F2: read options
  const mag = Math.abs(value);
  const thousandsSeparator = (options && options.thousandsSeparator) || '';
  const unitSeparator      = (options && options.unitSeparator)      || '';
  const decimalPlaces      = (options && options.decimalPlaces !== undefined)
                               ? options.decimalPlaces : 2;
  const fixedDecimals      = Boolean(options && options.fixedDecimals);
  let unit                 = (options && options.unit) || '';

  // F3: auto-select unit if no usable explicit unit
  if (!unit || !map[unit.toLowerCase()]) {
    if      (mag >= map.pb) unit = 'PB';
    else if (mag >= map.tb) unit = 'TB';
    else if (mag >= map.gb) unit = 'GB';
    else if (mag >= map.mb) unit = 'MB';
    else if (mag >= map.kb) unit = 'KB';
    else                    unit = 'B';
  }
  // else: keep unit verbatim (original casing)

  // F4: compute scaled value text (may throw RangeError if decimalPlaces out of range)
  const val = value / map[unit.toLowerCase()];
  let str = val.toFixed(decimalPlaces);

  // F5: strip trailing-zero decimals unless fixedDecimals
  if (!fixedDecimals) {
    str = str.replace(formatDecimalsRegExp, '$1');
  }

  // F6: thousands separators on integer part only
  if (thousandsSeparator) {
    const parts = str.split('.');
    parts[0] = parts[0].replace(formatThousandsRegExp, thousandsSeparator);
    str = parts.join('.');
  }

  // F7: assemble
  return str + unitSeparator + unit;
}

function parse(val) {
  // P0: number branch (unreachable from dispatch, documented for completeness)
  if (typeof val === 'number' && !isNaN(val)) return val;

  // P1: non-string guard (unreachable from dispatch)
  if (typeof val !== 'string') return null;

  // P2: regex test
  let floatValue;
  let unit;
  const results = parseRegExp.exec(val);
  if (results === null) {
    // fallback: parseInt base-10
    floatValue = parseInt(val, 10);
    unit = 'b';
  } else {
    floatValue = parseFloat(results[1]);
    unit = results[4].toLowerCase();
  }

  // P3: NaN guard
  if (isNaN(floatValue)) return null;

  // P4: compute
  return Math.floor(map[unit] * floatValue);
}

function bytes(value, options) {
  // D1: string -> parse
  if (typeof value === 'string') return parse(value);
  // D2: number -> format
  if (typeof value === 'number') return format(value, options);
  // D3: otherwise -> null
  return null;
}

export default bytes;
