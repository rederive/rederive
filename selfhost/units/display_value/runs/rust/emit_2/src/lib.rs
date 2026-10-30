use serde_json::Value;

enum D {
    Text(String),
    Missing,
    Null,
}

fn quote(s: &str) -> String {
    serde_json::to_string(&Value::String(s.to_string())).unwrap_or_else(|_| "\"\"".to_string())
}

fn is_ident(n: &str) -> bool {
    let b = n.as_bytes();
    if b.is_empty() {
        return false;
    }
    if !(b[0].is_ascii_alphabetic() || b[0] == b'_') {
        return false;
    }
    b[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}

fn disp(v: &Value) -> Result<D, String> {
    let m = match v {
        Value::Null => return Err("cannot read properties of null".to_string()),
        Value::Object(m) => m,
        _ => return Ok(D::Text("?".to_string())),
    };
    let t = match m.get("t") {
        Some(Value::String(t)) => t.as_str(),
        _ => return Ok(D::Text("?".to_string())),
    };
    let f = m.get("v");
    let s = |x: &str| Ok(D::Text(x.to_string()));
    match t {
        "none" => s("null"),
        "undefined" => s("undefined"),
        "text" => match f {
            Some(Value::String(x)) => Ok(D::Text(quote(x))),
            Some(Value::Bool(b)) => s(if *b { "true" } else { "false" }),
            Some(Value::Null) => s("null"),
            None => Ok(D::Missing),
            _ => s("?"),
        },
        "f64" | "i64" | "u64" | "bytes" => match f {
            Some(Value::String(x)) => Ok(D::Text(x.clone())),
            Some(Value::Null) => Ok(D::Null),
            None => Ok(D::Missing),
            _ => s("?"),
        },
        "bigint" => match f {
            Some(Value::String(x)) => Ok(D::Text(format!("{}n", x))),
            Some(Value::Bool(b)) => s(if *b { "truen" } else { "falsen" }),
            Some(Value::Null) => s("nulln"),
            None => s("undefinedn"),
            _ => s("?"),
        },
        "bool" => match f {
            Some(Value::Bool(b)) => s(if *b { "true" } else { "false" }),
            Some(Value::String(x)) => Ok(D::Text(x.clone())),
            Some(Value::Null) => s("null"),
            None => s("undefined"),
            _ => s("?"),
        },
        "throw" => match m.get("msg") {
            Some(Value::String(x)) => Ok(D::Text(format!("throw({})", quote(x)))),
            Some(Value::Bool(b)) => s(if *b { "throw(true)" } else { "throw(false)" }),
            _ => s("throw(\"\")"),
        },
        "list" | "tuple" => {
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v not a list".to_string()),
            };
            let mut parts: Vec<String> = Vec::new();
            for e in arr {
                match disp(e)? {
                    D::Text(x) => parts.push(x),
                    _ => parts.push(String::new()),
                }
            }
            Ok(D::Text(format!("[{}]", parts.join(","))))
        }
        "record" | "map" => {
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v not a list".to_string()),
            };
            let rec = t == "record";
            let mut parts: Vec<String> = Vec::new();
            for e in arr {
                let (a, b): (Value, Value) = match e {
                    Value::Array(items) => {
                        if items.len() < 2 {
                            return Err("short entry".to_string());
                        }
                        (items[0].clone(), items[1].clone())
                    }
                    Value::String(x) => {
                        let mut it = x.chars();
                        match (it.next(), it.next()) {
                            (Some(c1), Some(c2)) => {
                                (Value::String(c1.to_string()), Value::String(c2.to_string()))
                            }
                            _ => return Err("short entry".to_string()),
                        }
                    }
                    _ => return Err("bad entry".to_string()),
                };
                let k = if rec {
                    match &a {
                        Value::String(n) => {
                            if is_ident(n) {
                                n.clone()
                            } else {
                                quote(n)
                            }
                        }
                        _ => return Err("bad field name".to_string()),
                    }
                } else {
                    sub(&a)?
                };
                let val = sub(&b)?;
                parts.push(format!("{}:{}", k, val));
            }
            let sep = if rec { ", " } else { "," };
            Ok(D::Text(format!("{{{}}}", parts.join(sep))))
        }
        _ => s("?"),
    }
}

fn sub(v: &Value) -> Result<String, String> {
    Ok(match disp(v)? {
        D::Text(x) => x,
        D::Missing => "undefined".to_string(),
        D::Null => "null".to_string(),
    })
}

pub fn display_value(tv: &serde_json::Value) -> Result<Option<String>, String> {
    match disp(tv)? {
        D::Text(x) => Ok(Some(x)),
        _ => Ok(None),
    }
}
