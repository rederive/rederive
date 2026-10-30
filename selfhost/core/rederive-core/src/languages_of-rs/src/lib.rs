use serde_json::Value;
use std::collections::{BTreeSet, HashSet};

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn has_sir_end(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 4 && s.is_char_boundary(b.len() - 4) && b[b.len() - 4..].eq_ignore_ascii_case(b".sir")
}

fn base_of(path: &str) -> &str {
    let b = path.rsplit(['/', '\\']).next().unwrap_or("");
    b.trim_matches(|c| c == ' ' || c == '\t')
}

fn claim_of(path: &str) -> Option<String> {
    let base = base_of(path);
    let rem = base.trim_end_matches(|c: char| !('!'..='~').contains(&c));
    if rem.len() != base.len() && has_sir_end(rem) {
        panic!("hidden tail");
    }
    if !has_sir_end(base) {
        return None;
    }
    let stem = &base[..base.len() - 4];
    let parts: Vec<&str> = stem.split('.').collect();
    let unit = parts[0].as_bytes();
    if !unit.is_empty() {
        let ok = (unit[0].is_ascii_alphanumeric() || unit[0] == b'_')
            && unit[1..]
                .iter()
                .all(|c| c.is_ascii_alphanumeric() || *c == b'_' || *c == b'-');
        if !ok {
            panic!("bad unit");
        }
    }
    if parts.len() > 2 {
        panic!("too many segments");
    }
    if parts.len() == 1 {
        return None;
    }
    if parts[1].is_empty() {
        panic!("empty lang");
    }
    Some(parts[1].to_string())
}

fn sight(id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("unknown language");
    }
}

fn key_lang(k: &str) -> Option<&str> {
    if k == "package" {
        return None;
    }
    if let Some(rest) = k.strip_prefix("lang:") {
        let b = rest.as_bytes();
        if !b.is_empty()
            && b[0].is_ascii_lowercase()
            && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        {
            return Some(rest);
        }
    }
    panic!("bad variant key");
}

pub fn languages_of(input: &Value) -> Vec<String> {
    let obj = match input {
        Value::Object(m) => m,
        _ => panic!("not a map"),
    };
    let mut out: BTreeSet<String> = BTreeSet::new();
    match obj.get("sirFiles") {
        None => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(s) => {
                        if let Some(id) = claim_of(s) {
                            sight(&id);
                            out.insert(id);
                        }
                    }
                    _ => panic!("sirFiles element not text"),
                }
            }
        }
        Some(_) => panic!("sirFiles not a list"),
    }
    let variants = match obj.get("variants") {
        None | Some(Value::Null) => None,
        Some(Value::Object(m)) => Some(m),
        Some(_) => panic!("variants not a map"),
    };
    let mut claimed: HashSet<String> = HashSet::new();
    if let Some(vm) = variants {
        for (k, v) in vm {
            let vo = match v {
                Value::Object(m) => m,
                _ => panic!("variant not a map"),
            };
            let own = match vo.get("lang") {
                None => None,
                Some(Value::String(s)) => Some(s.clone()),
                Some(_) => panic!("lang not text"),
            };
            let mut has_sir = false;
            let mut path_lang: Option<String> = None;
            match vo.get("sir") {
                None => {}
                Some(Value::String(s)) => {
                    has_sir = true;
                    path_lang = claim_of(s);
                    if !has_sir_end(base_of(s)) {
                        panic!("sir names no .sir file");
                    }
                }
                Some(_) => panic!("sir not text"),
            }
            let kl = key_lang(k).map(|s| s.to_string());
            let mut named: Vec<&String> = Vec::new();
            if let Some(x) = &kl {
                named.push(x);
            }
            if let Some(x) = &own {
                named.push(x);
            }
            if let Some(x) = &path_lang {
                named.push(x);
            }
            if named.windows(2).any(|w| w[0] != w[1]) {
                panic!("names disagree");
            }
            if (kl.is_some() || own.is_some()) && has_sir && path_lang.is_none() {
                panic!("sir names no language");
            }
            if named.is_empty() {
                continue;
            }
            let id = named[0].clone();
            sight(&id);
            if !claimed.insert(id.clone()) {
                panic!("two variants claim one language");
            }
            out.insert(id);
        }
    }
    out.into_iter().collect()
}
