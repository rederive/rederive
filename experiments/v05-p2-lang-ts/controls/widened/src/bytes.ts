type OptionsRecord = Record<string, unknown>;

const UNIT_SCALE: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1048576,
  gb: 1073741824,
  tb: 1099511627776,
  pb: 1125899906842624,
};

const STRICT_RE = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;
const TRIM_RE = /(?:\.0*|(\.[^0]+)0+)$/;
const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;

function autoUnit(mag: number): { suffix: string; scale: number } {
  if (mag >= UNIT_SCALE.pb) {
    return { suffix: 'PB', scale: UNIT_SCALE.pb };
  }
  if (mag >= UNIT_SCALE.tb) {
    return { suffix: 'TB', scale: UNIT_SCALE.tb };
  }
  if (mag >= UNIT_SCALE.gb) {
    return { suffix: 'GB', scale: UNIT_SCALE.gb };
  }
  if (mag >= UNIT_SCALE.mb) {
    return { suffix: 'MB', scale: UNIT_SCALE.mb };
  }
  if (mag >= UNIT_SCALE.kb) {
    return { suffix: 'KB', scale: UNIT_SCALE.kb };
  }
  return { suffix: 'B', scale: UNIT_SCALE.b };
}

function parseBytes(value: string): number | null {
  const match = STRICT_RE.exec(value);
  if (match !== null) {
    const numeral = parseFloat(match[1]);
    const unitWord = match[4].toLowerCase();
    const scale = UNIT_SCALE[unitWord];
    return Math.floor(scale * numeral);
  }
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    return null;
  }
  return n;
}

function formatBytes(value: number, options: unknown): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const opts: OptionsRecord =
    typeof options === 'object' && options !== null
      ? (options as OptionsRecord)
      : {};

  const unitOption = opts.unit;
  let unitSuffix: string;
  let scale: number;

  if (!unitOption) {
    const auto = autoUnit(Math.abs(value));
    unitSuffix = auto.suffix;
    scale = auto.scale;
  } else if (typeof unitOption !== 'string') {
    throw new TypeError('bytes: unit option must be a string');
  } else {
    const lower = unitOption.toLowerCase();
    const mapped = UNIT_SCALE[lower];
    if (!mapped) {
      const auto = autoUnit(Math.abs(value));
      unitSuffix = auto.suffix;
      scale = auto.scale;
    } else {
      unitSuffix = unitOption;
      scale = mapped;
    }
  }

  const decimalPlacesRaw = opts.decimalPlaces;
  const decimalPlaces =
    decimalPlacesRaw === undefined ? 2 : Number(decimalPlacesRaw);

  const q = value / scale;
  let str = q.toFixed(decimalPlaces);

  const fixedDecimalsOn = Boolean(opts.fixedDecimals);
  if (!fixedDecimalsOn) {
    str = str.replace(TRIM_RE, '$1');
  }

  const thousandsSeparatorRaw = opts.thousandsSeparator;
  if (thousandsSeparatorRaw) {
    const sep = String(thousandsSeparatorRaw);
    const parts = str.split('.');
    parts[0] = parts[0].replace(GROUP_RE, sep);
    str = parts.join('.');
  }

  const unitSeparatorRaw = opts.unitSeparator;
  const unitSeparatorText = unitSeparatorRaw ? String(unitSeparatorRaw) : '';

  return str + unitSeparatorText + unitSuffix;
}

export default function bytes(
  value: unknown,
  options?: unknown
): string | number | null | undefined {
  if (typeof value === 'string') {
    return parseBytes(value);
  }
  if (typeof value === 'number') {
    return formatBytes(value, options);
  }
  return null;
}
