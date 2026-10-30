use serde_json::{Map, Value};

fn kind_is(t: &Value, name: &str) -> bool {
    matches!(t.get("k"), Some(Value::String(s)) if s == name)
}

pub fn reshape(v: &Value, t: &Value) -> Result<Value, String> {
    if v.is_null() {
        return Ok(Value::Null);
    }
    if t.is_null() {
        return Err("type tree is none".to_string());
    }
    let obj = match t {
        Value::Object(o) => o,
        _ => return Ok(v.clone()),
    };
    let k = match obj.get("k") {
        Some(Value::String(s)) => s.as_str(),
        _ => return Ok(v.clone()),
    };
    let null = Value::Null;
    match k {
        "union" => {
            let alts = match obj.get("alts") {
                Some(Value::Array(a)) => a,
                _ => return Err("alts not a list".to_string()),
            };
            if alts.iter().any(|a| a.is_null()) {
                return Err("none in alts".to_string());
            }
            let others: Vec<&Value> = alts.iter().filter(|a| !kind_is(a, "none") || !a.is_object()).collect();
            if alts.len() == 2 && others.len() == 1 {
                reshape(v, others[0])
            } else {
                Ok(v.clone())
            }
        }
        "record" => {
            let arr = match v {
                Value::Array(a) => a,
                _ => return Ok(v.clone()),
            };
            let fields = match obj.get("fields") {
                None | Some(Value::Null) => return Err("fields missing".to_string()),
                Some(Value::Array(f)) => f,
                Some(_) => return Ok(v.clone()),
            };
            if fields.len() != arr.len() {
                return Ok(v.clone());
            }
            let mut m = Map::new();
            for (i, entry) in fields.iter().enumerate() {
                let e = match entry {
                    Value::Array(e) => e,
                    _ => return Err("field entry not a list".to_string()),
                };
                let name = match e.first() {
                    Some(Value::String(s)) => s.clone(),
                    Some(other) => other.to_string(),
                    None => "null".to_string(),
                };
                let ft = e.get(1).unwrap_or(&null);
                let r = reshape(&arr[i], ft)?;
                m.insert(name, r);
            }
            Ok(Value::Object(m))
        }
        "tuple" => {
            let arr = match v {
                Value::Array(a) => a,
                _ => return Ok(v.clone()),
            };
            if arr.is_empty() {
                return Ok(Value::Array(vec![]));
            }
            match obj.get("items") {
                None | Some(Value::Null) => Err("items missing".to_string()),
                Some(Value::Array(items)) => {
                    let mut out = Vec::with_capacity(arr.len());
                    for (i, x) in arr.iter().enumerate() {
                        match items.get(i) {
                            Some(it) if it.is_object() => out.push(reshape(x, it)?),
                            _ => out.push(x.clone()),
                        }
                    }
                    Ok(Value::Array(out))
                }
                Some(_) => Ok(v.clone()),
            }
        }
        "list" => match v {
            Value::Array(a) => {
                let item = obj.get("item").unwrap_or(&null);
                let mut out = Vec::with_capacity(a.len());
                for x in a {
                    out.push(reshape(x, item)?);
                }
                Ok(Value::Array(out))
            }
            _ => Ok(v.clone()),
        },
        "map" => match v {
            Value::Object(m) => {
                let val = obj.get("val").unwrap_or(&null);
                let mut out = Map::new();
                for (key, x) in m {
                    out.insert(key.clone(), reshape(x, val)?);
                }
                Ok(Value::Object(out))
            }
            _ => Ok(v.clone()),
        },
        _ => Ok(v.clone()),
    }
}

pub fn rust_reshape(v: &Value, t: &Value) -> Result<Value, String> {
    reshape(v, t)
}
