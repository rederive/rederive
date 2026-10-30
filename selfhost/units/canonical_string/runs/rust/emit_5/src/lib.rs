use serde_json::Value;

const RAW_CAP: usize = 416;

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

fn visit(v: &Value, depth: usize, out: &mut String) {
    if depth > RAW_CAP {
        panic!("not canonical: too deep");
    }
    match v {
        Value::String(s) => out.push_str(&quote(s)),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                visit(e, depth + 1, out);
            }
            out.push(']');
        }
        Value::Object(o) => {
            if let Some(Value::String(t)) = o.get("t") {
                if t == "f64" {
                    match o.get("bits") {
                        Some(Value::String(s))
                            if s.len() == 16
                                && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) =>
                        {
                            if depth + 1 > RAW_CAP {
                                panic!("not canonical: too deep");
                            }
                            out.push_str("{\"bits\":");
                            visit(&Value::String(s.clone()), depth + 1, out);
                            out.push_str(",\"t\":");
                            visit(&Value::String("f64".to_string()), depth + 1, out);
                            out.push('}');
                            return;
                        }
                        _ => panic!("not canonical: an f64 tag without 16-hex bits"),
                    }
                } else if t == "throw" {
                    if depth + 1 > RAW_CAP {
                        panic!("not canonical: too deep");
                    }
                    out.push_str("{\"t\":");
                    visit(&Value::String("throw".to_string()), depth + 1, out);
                    out.push('}');
                    return;
                }
            }
            let mut keys: Vec<&String> = o.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&quote(k));
                out.push(':');
                visit(&o[k.as_str()], depth + 1, out);
            }
            out.push('}');
        }
        _ => panic!("not canonical: number or none"),
    }
}

pub fn canonical_string(value: &serde_json::Value) -> String {
    let mut out = String::new();
    visit(value, 0, &mut out);
    out
}
