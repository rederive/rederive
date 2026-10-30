use serde_json::Value;

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

fn render(v: &Value, out: &mut String) {
    match v {
        Value::String(s) => out.push_str(&quote(s)),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render(e, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            if let Some(Value::String(t)) = m.get("t") {
                if t == "f64" {
                    match m.get("bits") {
                        Some(Value::String(s))
                            if s.len() == 16
                                && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) =>
                        {
                            out.push_str("{\"bits\":");
                            out.push_str(&quote(s));
                            out.push_str(",\"t\":\"f64\"}");
                            return;
                        }
                        _ => panic!("not canonical: an f64 tag without 16-hex bits"),
                    }
                } else if t == "throw" {
                    out.push_str("{\"t\":\"throw\"}");
                    return;
                }
            }
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&quote(k));
                out.push(':');
                render(&m[k.as_str()], out);
            }
            out.push('}');
        }
        Value::Number(_) => panic!("not canonical: number"),
        Value::Null => panic!("not canonical: none"),
    }
}

pub fn canonical_string(value: &serde_json::Value) -> String {
    let mut out = String::new();
    render(value, &mut out);
    out
}
