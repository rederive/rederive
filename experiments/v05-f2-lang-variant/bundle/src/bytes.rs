// Clean-room re-emission of bytes@3.1.2 (visionmedia/bytes.js, MIT)
// per the language-neutral SIR primary and the rust language file.
// No unsafe. Pure function, no I/O.

use serde_json::Value;

/// R1: dispatch on the kind of `value`.
pub fn bytes(
    value: &serde_json::Value,
    options: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    match value {
        Value::String(s) => Ok(parse_bytes(s)),
        Value::Number(n) => {
            let x = n.as_f64().unwrap_or(f64::NAN);
            let default_null = Value::Null;
            let opt_val: &Value = options
                .as_array()
                .and_then(|a| a.first())
                .unwrap_or(&default_null);
            format_value(x, opt_val)
        }
        _ => Ok(Value::Null),
    }
}

// ---------------------------------------------------------------------
// PARSE (R4-R6)
// ---------------------------------------------------------------------

fn parse_bytes(s: &str) -> Value {
    if let Some(v) = try_strict(s) {
        return Value::from(v);
    }
    match try_lenient(s) {
        Some(v) => Value::from(v),
        None => Value::Null,
    }
}

/// STRICT = [ "+" | "-" ] DIGIT+ [ "." DIGIT+ ] SPACE* UNIT, whole text, UNIT
/// one of kb/mb/gb/tb/pb in ASCII letter case (eq_ignore_ascii_case, never
/// to_lowercase — a KELVIN SIGN must NOT match "k" here).
fn try_strict(s: &str) -> Option<f64> {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut i = 0usize;

    if i < n && (chars[i] == '+' || chars[i] == '-') {
        i += 1;
    }
    let digit_start = i;
    while i < n && chars[i].is_ascii_digit() {
        i += 1;
    }
    if i == digit_start {
        return None;
    }
    let mut numeral_end = i;
    if i < n && chars[i] == '.' {
        let frac_start = i + 1;
        let mut j = frac_start;
        while j < n && chars[j].is_ascii_digit() {
            j += 1;
        }
        if j > frac_start {
            numeral_end = j;
        }
    }

    let mut k = numeral_end;
    while k < n && chars[k] == ' ' {
        k += 1;
    }

    let unit_str: String = chars[k..].iter().collect();
    let scale = match_unit_strict(&unit_str)?;

    let numeral_str: String = chars[0..numeral_end].iter().collect();
    let numeral: f64 = numeral_str.parse().ok()?;

    Some((scale * numeral).floor())
}

fn match_unit_strict(s: &str) -> Option<f64> {
    const UNITS: [(&str, f64); 5] = [
        ("kb", 1024.0),
        ("mb", 1048576.0),
        ("gb", 1073741824.0),
        ("tb", 1099511627776.0),
        ("pb", 1125899906842624.0),
    ];
    for (name, scale) in UNITS.iter() {
        if s.eq_ignore_ascii_case(name) {
            return Some(*scale);
        }
    }
    None
}

/// LEADING_SPACE per the PINNED set in the rust language file (ECMAScript
/// WhiteSpace + LineTerminator; NOT char::is_whitespace).
fn is_leading_space(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

fn try_lenient(s: &str) -> Option<f64> {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut i = 0usize;

    while i < n && is_leading_space(chars[i]) {
        i += 1;
    }

    let mut neg = false;
    if i < n && (chars[i] == '+' || chars[i] == '-') {
        neg = chars[i] == '-';
        i += 1;
    }

    let digit_start = i;
    while i < n && chars[i].is_ascii_digit() {
        i += 1;
    }
    if i == digit_start {
        return None;
    }

    let digits: String = chars[digit_start..i].iter().collect();
    let val: f64 = digits.parse().ok()?;
    Some(if neg { -val } else { val })
}

// ---------------------------------------------------------------------
// FORMAT (R7-R16)
// ---------------------------------------------------------------------

fn get_option<'a>(options: &'a Value, key: &str) -> Option<&'a Value> {
    options.as_object().and_then(|m| m.get(key))
}

/// R3 BLANK test: none, false, the number zero (-0 included), NaN, or
/// empty text. Everything else (including empty list/map) is FILLED.
fn value_is_blank(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Bool(b) => !*b,
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(f64::NAN);
            f == 0.0 || f.is_nan()
        }
        Value::String(s) => s.is_empty(),
        Value::Array(_) => false,
        Value::Object(_) => false,
    }
}

/// OUT-OF-DOMAIN host stringification, used for a FILLED non-text
/// thousandsSeparator/unitSeparator (and recursively for list items).
fn host_stringify(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Bool(b) => {
            if *b {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        Value::Number(n) => {
            let f = n.as_f64().unwrap_or(0.0);
            format!("{}", f)
        }
        Value::String(s) => s.clone(),
        Value::Array(arr) => arr
            .iter()
            .map(host_stringify)
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// ABSENT -> empty; text -> that text; FILLED non-text -> host_stringify.
/// (BLANK, including empty text, naturally yields empty either way.)
fn resolve_text_option(options: &Value, key: &str) -> String {
    match get_option(options, key) {
        None => String::new(),
        Some(v) => {
            if let Value::String(s) = v {
                s.clone()
            } else if value_is_blank(v) {
                String::new()
            } else {
                host_stringify(v)
            }
        }
    }
}

/// decimalPlaces OUT-OF-DOMAIN string reading: host numeral (trim
/// whitespace, empty -> 0, exponent/hex allowed, unreadable -> NaN).
fn js_string_to_number(s: &str) -> f64 {
    let t = s.trim();
    if t.is_empty() {
        return 0.0;
    }
    let (sign, rest) = if let Some(r) = t.strip_prefix('-') {
        (-1.0, r)
    } else if let Some(r) = t.strip_prefix('+') {
        (1.0, r)
    } else {
        (1.0, t)
    };
    if let Some(hex) = rest.strip_prefix("0x").or_else(|| rest.strip_prefix("0X")) {
        return match i64::from_str_radix(hex, 16) {
            Ok(v) => sign * (v as f64),
            Err(_) => f64::NAN,
        };
    }
    match t.parse::<f64>() {
        Ok(v) => v,
        Err(_) => f64::NAN,
    }
}

fn dp_numeric_value(v: &Value) -> f64 {
    match v {
        Value::Null => 0.0,
        Value::Bool(false) => 0.0,
        Value::Bool(true) => 1.0,
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => js_string_to_number(s),
        Value::Array(arr) => {
            if arr.len() == 1 {
                dp_numeric_value(&arr[0])
            } else {
                0.0
            }
        }
        Value::Object(_) => 0.0,
    }
}

fn unit_scale_lookup(lower: &str) -> Option<f64> {
    match lower {
        "b" => Some(1.0),
        "kb" => Some(1024.0),
        "mb" => Some(1048576.0),
        "gb" => Some(1073741824.0),
        "tb" => Some(1099511627776.0),
        "pb" => Some(1125899906842624.0),
        _ => None,
    }
}

/// TABLE AUTO_UNIT on |value|.
fn auto_unit(abs_val: f64) -> (&'static str, f64) {
    if abs_val >= 1125899906842624.0 {
        ("PB", 1125899906842624.0)
    } else if abs_val >= 1099511627776.0 {
        ("TB", 1099511627776.0)
    } else if abs_val >= 1073741824.0 {
        ("GB", 1073741824.0)
    } else if abs_val >= 1048576.0 {
        ("MB", 1048576.0)
    } else if abs_val >= 1024.0 {
        ("KB", 1024.0)
    } else {
        ("B", 1.0)
    }
}

/// R11 FIXED rendering of a non-negative magnitude with exactly `d`
/// fraction digits, rounded from the EXACT decimal expansion of the f64
/// (round-half-up realizes "when two are equally near, the larger one").
fn render_fixed(mag: f64, d: usize) -> String {
    let s = format!("{:.1100}", mag);
    let (int_part, frac_part) = match s.find('.') {
        Some(idx) => (s[..idx].to_string(), s[idx + 1..].to_string()),
        None => (s.clone(), String::new()),
    };
    let mut int_digits: Vec<u8> = int_part.into_bytes();
    let frac_bytes: Vec<u8> = frac_part.into_bytes();

    let mut kept: Vec<u8> = if d <= frac_bytes.len() {
        frac_bytes[0..d].to_vec()
    } else {
        frac_bytes.clone()
    };

    let round_up = d < frac_bytes.len() && frac_bytes[d] >= b'5';

    if round_up {
        let mut i = kept.len();
        let mut carry = true;
        while carry && i > 0 {
            i -= 1;
            if kept[i] == b'9' {
                kept[i] = b'0';
            } else {
                kept[i] += 1;
                carry = false;
            }
        }
        if carry {
            let mut j = int_digits.len();
            let mut c = true;
            while c && j > 0 {
                j -= 1;
                if int_digits[j] == b'9' {
                    int_digits[j] = b'0';
                } else {
                    int_digits[j] += 1;
                    c = false;
                }
            }
            if c {
                int_digits.insert(0, b'1');
            }
        }
    }

    let int_str = String::from_utf8(int_digits).unwrap();
    if d == 0 {
        int_str
    } else {
        let kept_str = String::from_utf8(kept).unwrap();
        format!("{}.{}", int_str, kept_str)
    }
}

/// R12 shortest round-trip exponential rendering of a non-negative
/// magnitude >= 1e21, with '+' inserted after 'e' for a positive exponent.
fn render_exp(mag: f64) -> String {
    let s = format!("{:e}", mag);
    if let Some(epos) = s.find('e') {
        let mantissa = &s[..epos];
        let exp_part = &s[epos + 1..];
        if let Some(stripped) = exp_part.strip_prefix('-') {
            format!("{}e-{}", mantissa, stripped)
        } else {
            format!("{}e+{}", mantissa, exp_part)
        }
    } else {
        s
    }
}

/// TABLE TRIM, keyed on the characters after the rendering's point.
fn table_trim(rendering: &str) -> String {
    let point_idx = match rendering.find('.') {
        None => return rendering.to_string(),
        Some(idx) => idx,
    };
    let head = &rendering[..point_idx];
    let f = &rendering[point_idx + 1..];
    if f.is_empty() {
        return rendering.to_string();
    }
    let bytes = f.as_bytes();
    if bytes.iter().all(|&b| b == b'0') {
        return head.to_string();
    }
    match bytes.iter().position(|&b| b == b'0') {
        None => rendering.to_string(),
        Some(first_zero) => {
            if first_zero == 0 {
                rendering.to_string()
            } else if bytes[first_zero..].iter().all(|&b| b == b'0') {
                format!("{}.{}", head, &f[..first_zero])
            } else {
                rendering.to_string()
            }
        }
    }
}

/// R14 GROUPING: within each maximal digit run of the leading part, insert
/// `sep` wherever the count of digits following the position (within that
/// run) is a positive multiple of three. Non-digit characters (a leading
/// "-", or the "e"/"+"/"-" of an ungrouped R12 leading part) pass through.
fn apply_grouping(leading: &str, sep: &str) -> String {
    if sep.is_empty() {
        return leading.to_string();
    }
    let chars: Vec<char> = leading.chars().collect();
    let n = chars.len();
    let mut result = String::new();
    let mut i = 0;
    while i < n {
        if chars[i].is_ascii_digit() {
            let run_start = i;
            let mut j = i;
            while j < n && chars[j].is_ascii_digit() {
                j += 1;
            }
            let run_len = j - run_start;
            for k in run_start..j {
                result.push(chars[k]);
                let pos_in_run = k - run_start;
                let digits_after = run_len - pos_in_run - 1;
                if digits_after > 0 && digits_after % 3 == 0 {
                    result.push_str(sep);
                }
            }
            i = j;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

fn format_value(x: f64, options: &Value) -> Result<Value, String> {
    // R7: non-finite -> none, before any option is read.
    if !x.is_finite() {
        return Ok(Value::Null);
    }

    // R8: unit.
    let unit_opt = get_option(options, "unit");
    let mut special_nan = false;
    let (suffix, scale): (String, f64) = match unit_opt {
        None => {
            let (s, sc) = auto_unit(x.abs());
            (s.to_string(), sc)
        }
        Some(Value::Null) | Some(Value::Bool(false)) => {
            let (s, sc) = auto_unit(x.abs());
            (s.to_string(), sc)
        }
        Some(Value::String(s)) => {
            let lower = s.to_lowercase();
            if lower == "constructor" || lower == "__proto__" {
                special_nan = true;
                (s.clone(), 1.0)
            } else if let Some(sc) = unit_scale_lookup(&lower) {
                (s.clone(), sc)
            } else {
                let (auto_s, auto_sc) = auto_unit(x.abs());
                (auto_s.to_string(), auto_sc)
            }
        }
        Some(Value::Number(n)) => {
            let f = n.as_f64().unwrap_or(f64::NAN);
            if f == 0.0 || f.is_nan() {
                let (s, sc) = auto_unit(x.abs());
                (s.to_string(), sc)
            } else {
                return Err("bytes: OPTIONS.unit must be text".to_string());
            }
        }
        Some(Value::Bool(true)) | Some(Value::Array(_)) | Some(Value::Object(_)) => {
            return Err("bytes: OPTIONS.unit must be text".to_string());
        }
    };

    // R10: decimalPlaces (unit is read first per R16).
    let dp_opt = get_option(options, "decimalPlaces");
    let d: f64 = match dp_opt {
        None => 2.0,
        Some(v) => {
            let raw = dp_numeric_value(v);
            if raw.is_nan() {
                0.0
            } else {
                raw.trunc()
            }
        }
    };
    if !(0.0..=100.0).contains(&d) {
        return Err("bytes: decimalPlaces out of range".to_string());
    }
    let d_usize = d as usize;

    let unit_sep_text = resolve_text_option(options, "unitSeparator");

    if special_nan {
        return Ok(Value::String(format!("NaN{}{}", unit_sep_text, suffix)));
    }

    // R9: q = value / scale.
    let q = x / scale;
    let mag = q.abs();

    let magnitude_rendering = if mag >= 1e21 {
        render_exp(mag)
    } else {
        render_fixed(mag, d_usize)
    };

    let signed = if q < 0.0 {
        format!("-{}", magnitude_rendering)
    } else {
        magnitude_rendering
    };

    // R13: TRIM, unless fixedDecimals is on.
    let fixed_decimals_on = match get_option(options, "fixedDecimals") {
        None => false,
        Some(v) => !value_is_blank(v),
    };
    let trimmed = if fixed_decimals_on {
        signed
    } else {
        table_trim(&signed)
    };

    // R14: GROUPING on the leading part.
    let sep_text = resolve_text_option(options, "thousandsSeparator");
    let (leading, rest) = match trimmed.find('.') {
        Some(idx) => (trimmed[..idx].to_string(), trimmed[idx..].to_string()),
        None => (trimmed.clone(), String::new()),
    };
    let grouped_leading = apply_grouping(&leading, &sep_text);
    let final_rendering = format!("{}{}", grouped_leading, rest);

    // R15: assembly.
    Ok(Value::String(format!(
        "{}{}{}",
        final_rendering, unit_sep_text, suffix
    )))
}
