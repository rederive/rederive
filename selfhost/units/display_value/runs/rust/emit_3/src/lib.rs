use serde_json::Value;

enum D {
    T(String),
    Missing,
    Null,
}

fn quote(s: &str) -> String {
    serde_json::to_string(&Value::String(s.to_string())).unwrap_or_else(|_| "\"\"".to_string())
}

fn fieldname(n: &str) -> String {
    let b = n.as_bytes();
    let ok = !b.is_empty()
        && (b[0].is_ascii_alphabetic() || b[0] == b'_')
        && b[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_');
    if ok {
        n.to_string()
    } else {
        quote(n)
    }
}

fn bool_s(b: bool) -> String {
    if b { "true" } else { "false" }.to_string()
}

fn node(v: &Value) -> Result<D, String> {
    let m = match v {
        Value::Null => return Err("null node".to_string()),
        Value::Object(m) => m,
        _ => return Ok(D::T("?".to_string())),
    };
    let t = match m.get("t") {
        Some(Value::String(t)) => t.as_str(),
        _ => return Ok(D::T("?".to_string())),
    };
    let f = m.get("v");
    let s = |x: String| Ok(D::T(x));
    match t {
        "none" => s("null".to_string()),
        "undefined" => s("undefined".to_string()),
        "text" => match f {
            Some(Value::String(x)) => s(quote(x)),
            Some(Value::Bool(b)) => s(bool_s(*b)),
            Some(Value::Null) => s("null".to_string()),
            None => Ok(D::Missing),
            _ => s("?".to_string()),
        },
        "f64" | "i64" | "u64" | "bytes" => match f {
            Some(Value::String(x)) => s(x.clone()),
            Some(Value::Null) => Ok(D::Null),
            None => Ok(D::Missing),
            _ => s("?".to_string()),
        },
        "bigint" => match f {
            Some(Value::String(x)) => s(format!("{}n", x)),
            Some(Value::Bool(b)) => s(format!("{}n", bool_s(*b))),
            Some(Value::Null) => s("nulln".to_string()),
            None => s("undefinedn".to_string()),
            _ => s("?".to_string()),
        },
        "bool" => match f {
            Some(Value::Bool(b)) => s(bool_s(*b)),
            Some(Value::String(x)) => s(x.clone()),
            Some(Value::Null) => s("null".to_string()),
            None => s("undefined".to_string()),
            _ => s("?".to_string()),
        },
        "throw" => match m.get("msg") {
            Some(Value::String(x)) => s(format!("throw({})", quote(x))),
            Some(Value::Bool(b)) => s(format!("throw({})", bool_s(*b))),
            _ => s("throw(\"\")".to_string()),
        },
        "list" | "tuple" => {
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v not a list".to_string()),
            };
            let mut parts = Vec::new();
            for e in arr {
                match node(e)? {
                    D::T(x) => parts.push(x),
                    _ => parts.push(String::new()),
                }
            }
            s(format!("[{}]", parts.join(",")))
        }
        "record" | "map" => {
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v not a list".to_string()),
            };
            let rec = t == "record";
            let mut parts = Vec::new();
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
                            (Some(c1), Some(c2)) => (
                                Value::String(c1.to_string()),
                                Value::String(c2.to_string()),
                            ),
                            _ => return Err("short entry".to_string()),
                        }
                    }
                    _ => return Err("bad entry".to_string()),
                };
                let k = if rec {
                    match &a {
                        Value::String(n) => fieldname(n),
                        other => quote(&other.to_string()),
                    }
                } else {
                    dstr(node(&a)?)
                };
                let val = dstr(node(&b)?);
                parts.push(format!("{}:{}", k, val));
            }
            if rec {
                s(format!("{{{}}}", parts.join(", ")))
            } else {
                s(format!("{{{}}}", parts.join(",")))
            }
        }
        _ => s("?".to_string()),
    }
}

fn dstr(d: D) -> String {
    match d {
        D::T(x) => x,
        D::Missing => "undefined".to_string(),
        D::Null => "null".to_string(),
    }
}

pub fn display_value(tv: &Value) -> Result<Option<String>, String> {
    match node(tv)? {
        D::T(x) => Ok(Some(x)),
        _ => Ok(None),
    }
}
