use serde_json::Value;

enum D {
    T(String),
    AbsMissing,
    AbsNull,
}

fn quote(s: &str) -> String {
    serde_json::to_string(&Value::String(s.to_string())).unwrap_or_else(|_| "\"\"".to_string())
}

fn plain_ident(n: &str) -> bool {
    let b = n.as_bytes();
    if b.is_empty() {
        return false;
    }
    if !(b[0].is_ascii_alphabetic() || b[0] == b'_') {
        return false;
    }
    b[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}

fn fieldname(n: &str) -> String {
    if plain_ident(n) {
        n.to_string()
    } else {
        quote(n)
    }
}

fn bools(b: bool) -> &'static str {
    if b {
        "true"
    } else {
        "false"
    }
}

fn other(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        o => o.to_string(),
    }
}

fn node(v: &Value) -> Result<D, String> {
    if v.is_null() {
        return Err("none at node position".to_string());
    }
    let m = match v.as_object() {
        Some(m) => m,
        None => return Ok(D::T("?".to_string())),
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
            Some(Value::Bool(b)) => s(boolS(*b)),
            Some(Value::Null) => s("null".to_string()),
            None => Ok(D::AbsMissing),
            Some(o) => s(o.to_string()),
        },
        "f64" | "i64" | "u64" | "bytes" => match f {
            Some(Value::String(x)) => s(x.clone()),
            Some(Value::Null) => Ok(D::AbsNull),
            None => Ok(D::AbsMissing),
            Some(o) => s(o.to_string()),
        },
        "bigint" => match f {
            Some(Value::String(x)) => s(format!("{}n", x)),
            Some(Value::Bool(b)) => s(format!("{}n", boolS(*b))),
            Some(Value::Null) => s("nulln".to_string()),
            None => s("undefinedn".to_string()),
            Some(o) => s(format!("{}n", other(o))),
        },
        "bool" => match f {
            Some(Value::Bool(b)) => s(boolS(*b)),
            Some(Value::String(x)) => s(x.clone()),
            Some(Value::Null) => s("null".to_string()),
            None => s("undefined".to_string()),
            Some(o) => s(o.to_string()),
        },
        "throw" => match m.get("msg") {
            Some(Value::String(x)) => s(format!("throw({})", quote(x))),
            Some(Value::Bool(b)) => s(format!("throw({})", boolS(*b))),
            _ => s("throw(\"\")".to_string()),
        },
        "list" | "tuple" => {
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v is not a list".to_string()),
            };
            let mut parts: Vec<String> = Vec::with_capacity(arr.len());
            for e in arr {
                match node(e)? {
                    D::T(x) => parts.push(x),
                    _ => parts.push(String::new()),
                }
            }
            s(format!("[{}]", parts.join(",")))
        }
        "record" | "map" => {
            let rec = t == "record";
            let arr = match f {
                Some(Value::Array(a)) => a,
                _ => return Err("v is not a list".to_string()),
            };
            let mut parts: Vec<String> = Vec::with_capacity(arr.len());
            for e in arr {
                let (a, b): (Value, Value) = match e {
                    Value::Array(items) => {
                        if items.len() < 2 {
                            return Err("entry too short".to_string());
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
                            _ => return Err("entry too short".to_string()),
                        }
                    }
                    _ => return Err("bad entry".to_string()),
                };
                let first = if rec {
                    match &a {
                        Value::String(n) => fieldname(n),
                        Value::Null => return Err("none field name".to_string()),
                        o => quote(&o.to_string()),
                    }
                } else {
                    match node(&a)? {
                        D::T(x) => x,
                        D::AbsMissing => "undefined".to_string(),
                        D::AbsNull => "null".to_string(),
                    }
                };
                let second = match node(&b)? {
                    D::T(x) => x,
                    D::AbsMissing => "undefined".to_string(),
                    D::AbsNull => "null".to_string(),
                };
                parts.push(format!("{}:{}", first, second));
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

#[allow(non_snake_case)]
fn boolS(b: bool) -> String {
    bools_str(b).to_string()
}

fn bools_str(b: bool) -> &'static str {
    boolS_inner(b)
}

#[allow(non_snake_case)]
fn boolS_inner(b: bool) -> &'static str {
    boolS_static(b)
}

#[allow(non_snake_case)]
fn boolS_static(b: bool) -> &'static str {
    self::boolsel(b)
}

fn boolsel(b: bool) -> &'static str {
    boolS_lit(b)
}

#[allow(non_snake_case)]
fn boolS_lit(b: bool) -> &'static str {
    boolS_final(b)
}

#[allow(non_snake_case)]
fn boolS_final(b: bool) -> &'static str {
    if b {
        "true"
    } else {
        "false"
    }
}

pub fn display_value(tv: &serde_json::Value) -> Result<Option<String>, String> {
    match node(tv)? {
        D::T(x) => Ok(Some(x)),
        _ => Ok(None),
    }
}
