use serde_json::{Map, Value};

const NULL: Value = Value::Null;

fn is_none_alt(a: &Value) -> bool {
    matches!(a.get("k"), Some(Value::String(s)) if s == "none") && a.is_object()
}

pub fn reshape(v: &Value, t: &Value) -> Result<Value, String> {
    if v.is_null() {
        return Ok(Value::Null);
    }
    if t.is_null() {
        return Err("type tree is none".to_string());
    }
    let obj = match t.as_object() {
        Some(o) => o,
        None => return Ok(v.clone()),
    };
    let k = match obj.get("k") {
        Some(Value::String(s)) => s.as_str(),
        _ => return Ok(v.clone()),
    };
    match k {
        "union" => {
            let alts = match obj.get("alts") {
                Some(Value::Array(a)) => a,
                _ => return Err("alts not a list".to_string()),
            };
            if alts.iter().any(|a| a.is_null()) {
                return Err("none element in alts".to_string());
            }
            let non_none: Vec<&Value> = alts.iter().filter(|a| !is_none_alt(a)).collect();
            if alts.len() == 2 && non_none.len() == 1 {
                reshape(v, non_none[0])
            } else {
                Ok(v.clone())
            }
        }
        "record" => {
            let arr = match v.as_array() {
                Some(a) => a,
                None => return Ok(v.clone()),
            };
            let fields = match obj.get("fields") {
                None | Some(Value::Null) => return Err("fields missing".to_string()),
                Some(Value::Array(f)) => f,
                Some(_) => return Ok(v.clone()),
            };
            if fields.len() != arr.len() {
                return Ok(v.clone());
            }
            let mut out = Map::new();
            for (i, entry) in fields.iter().enumerate() {
                let e = match entry.as_array() {
                    Some(e) => e,
                    None => return Err("field entry not a list".to_string()),
                };
                let name = match e.get(0) {
                    Some(Value::String(s)) => s.clone(),
                    Some(other) => other.to_string(),
                    None => String::new(),
                };
                let ft = e.get(1).unwrap_or(&NULL);
                out.insert(name, reshape(&arr[i], ft)?);
            }
            Ok(Value::Object(out))
        }
        "tuple" => {
            let arr = match v.as_array() {
                Some(a) => a,
                None => return Ok(v.clone()),
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
        "list" => match v.as_array() {
            Some(arr) => {
                let item = obj.get("item").unwrap_or(&NULL);
                let mut out = Vec::with_capacity(arr.len());
                for x in arr {
                    out.push(reshape(x, item)?);
                }
                Ok(Value::Array(out))
            }
            None => Ok(v.clone()),
        },
        "map" => match v.as_object() {
            Some(m) => {
                let val = obj.get("val").unwrap_or(&NULL);
                let mut out = Map::new();
                for (key, x) in m {
                    out.insert(key.clone(), reshape(x, val)?);
                }
                Ok(Value::Object(out))
            }
            None => Ok(v.clone()),
        },
        _ => Ok(v.clone()),
    }
}

pub fn rust_reshape(v: &Value, t: &Value) -> Result<Value, String> {
    reshape(v, t)
}
