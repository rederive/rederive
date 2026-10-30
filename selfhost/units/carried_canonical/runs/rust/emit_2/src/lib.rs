use serde_json::Value;

fn esc(s: &str, out: &mut String) {
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

fn num(x: f64) -> String {
    if x == 0.0 {
        return "0".to_string();
    }
    let e = format!("{:e}", x.abs());
    let (m, ex) = e.split_once('e').unwrap();
    let d: String = m.chars().filter(|c| *c != '.').collect();
    let ex: i64 = ex.parse().unwrap();
    let k = d.len() as i64;
    let n = ex + 1;
    let mut s = String::new();
    if x < 0.0 {
        s.push('-');
    }
    if k <= n && n <= 21 {
        s.push_str(&d);
        s.push_str(&"0".repeat((n - k) as usize));
    } else if 0 < n && n <= 21 {
        s.push_str(&d[..n as usize]);
        s.push('.');
        s.push_str(&d[n as usize..]);
    } else if -6 < n && n <= 0 {
        s.push_str("0.");
        s.push_str(&"0".repeat((-n) as usize));
        s.push_str(&d);
    } else {
        s.push_str(&d[..1]);
        if k > 1 {
            s.push('.');
            s.push_str(&d[1..]);
        }
        s.push('e');
        let p = n - 1;
        s.push(if p < 0 { '-' } else { '+' });
        s.push_str(&p.abs().to_string());
    }
    s
}

fn render(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&num(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => esc(s, out),
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
            let mut ents: Vec<(&String, &Value)> = m.iter().collect();
            ents.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            out.push('{');
            for (i, (k, x)) in ents.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                esc(k, out);
                out.push(':');
                render(x, out);
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
