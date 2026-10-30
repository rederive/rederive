use serde_json::Value;

fn text(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 32 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn number(x: f64, out: &mut String) {
    if x == 0.0 {
        out.push('0');
        return;
    }
    if x < 0.0 {
        out.push('-');
    }
    let e = format!("{:e}", x.abs());
    let (mant, exp) = match e.split_once('e') {
        Some(p) => p,
        None => (e.as_str(), "0"),
    };
    let d: String = mant.chars().filter(|c| *c != '.').collect();
    let n: i64 = exp.parse::<i64>().unwrap_or(0) + 1;
    let k = d.len() as i64;
    if k <= n && n <= 21 {
        out.push_str(&d);
        for _ in 0..(n - k) {
            out.push('0');
        }
    } else if 0 < n && n <= 21 {
        out.push_str(&d[..n as usize]);
        out.push('.');
        out.push_str(&d[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        for _ in 0..(-n) {
            out.push('0');
        }
        out.push_str(&d);
    } else {
        out.push_str(&d[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&d[1..]);
        }
        out.push('e');
        let m = n - 1;
        out.push(if m < 0 { '-' } else { '+' });
        out.push_str(&m.abs().to_string());
    }
}

fn render(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => number(n.as_f64().unwrap_or(0.0), out),
        Value::String(s) => text(s, out),
        Value::Array(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render(x, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                text(k, out);
                out.push(':');
                render(&m[k.as_str()], out);
            }
            out.push('}');
        }
    }
}

pub fn carried_canonical(table: &serde_json::Value) -> String {
    let mut out = String::new();
    render(table, &mut out);
    out
}
