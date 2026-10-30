use serde_json::Value;
use std::collections::{BTreeSet, HashSet};

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

// Base name of a path: after last separator, space/tab trimmed.
fn base_of(path: &str) -> &str {
    let b = path.rsplit(['/', '\\']).next().unwrap_or("");
    b.trim_matches(|c| c == ' ' || c == '\t')
}

fn has_sir_end(s: &str) -> bool {
    let n = s.len();
    n >= 4 && s.is_char_boundary(n - 4) && s.as_bytes()[n - 4..].eq_ignore_ascii_case(b".sir")
}

fn claim_of(path: &str) -> Option<String> {
    let base = base_of(path);
    let t = base.trim_end_matches(|c: char| !('!'..='~').contains(&c));
    if t.len() != base.len() && has_sir_end(t) {
        panic!("hidden tail");
    }
    if !has_sir_end(base) {
        return None;
    }
    let stem = &base[..base.len() - 4];
    let segs: Vec<&str> = stem.split('.').collect();
    let unit = segs[0].as_bytes();
    if !unit.is_empty() {
        let f = unit[0];
        if !(f.is_ascii_alphanumeric() || f == b'_') {
            panic!("unit name");
        }
        if unit[1..]
            .iter()
            .any(|b| !(b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-'))
        {
            panic!("unit name");
        }
    }
    if segs.len() > 2 {
        panic!("too many segments");
    }
    if segs.len() == 1 {
        return None;
    }
    if segs[1].is_empty() {
        panic!("empty lang");
    }
    Some(segs[1].to_string())
}

fn sight(id: &str, out: &mut BTreeSet<String>) {
    if !REGISTRY.contains(&id) {
        panic!("unknown language");
    }
    out.insert(id.to_string());
}

fn key_lang(k: &str) -> Option<&str> {
    if k == "package" {
        return None;
    }
    let rest = match k.strip_prefix("lang:") {
        Some(r) => r,
        None => panic!("bad variant key"),
    };
    let b = rest.as_bytes();
    if b.is_empty() || !b[0].is_ascii_lowercase() {
        panic!("bad variant key");
    }
    if b.iter().any(|c| !(c.is_ascii_lowercase() || c.is_ascii_digit())) {
        panic!("bad variant key");
    }
    Some(rest)
}

pub fn languages_of(input: &Value) -> Vec<String> {
    let map = match input.as_object() {
        Some(m) => m,
        None => panic!("input must be a map"),
    };
    let mut out: BTreeSet<String> = BTreeSet::new();
    match map.get("sirFiles") {
        None => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e.as_str() {
                    Some(s) => {
                        if let Some(c) = claim_of(s) {
                            sight(&c, &mut out);
                        }
                    }
                    None => panic!("sirFiles element not text"),
                }
            }
        }
        Some(_) => panic!("sirFiles must be a list"),
    }
    let empty = serde_json::Map::new();
    let variants = match map.get("variants") {
        None | Some(Value::Null) => &empty,
        Some(Value::Object(m)) => m,
        Some(_) => panic!("variants must be a map"),
    };
    let mut claimed: HashSet<String> = HashSet::new();
    for (k, v) in variants {
        let vm = match v.as_object() {
            Some(m) => m,
            None => panic!("variant must be a map"),
        };
        let own: Option<&str> = match vm.get("lang") {
            None => None,
            Some(Value::String(s)) => Some(s.as_str()),
            Some(_) => panic!("lang not text"),
        };
        let mut has_sir = false;
        let mut path_lang: Option<String> = None;
        match vm.get("sir") {
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
        let kl = key_lang(k);
        let mut named: Vec<&str> = Vec::new();
        if let Some(x) = kl {
            named.push(x);
        }
        if let Some(x) = own {
            named.push(x);
        }
        if let Some(x) = path_lang.as_deref() {
            named.push(x);
        }
        if named.iter().any(|x| *x != named[0]) {
            panic!("names disagree");
        }
        if (kl.is_some() || own.is_some()) && has_sir && path_lang.is_none() {
            panic!("sir names no language");
        }
        if named.is_empty() {
            continue;
        }
        let id = named[0];
        sight(id, &mut out);
        if !claimed.insert(id.to_string()) {
            panic!("two variants claim one language");
        }
    }
    out.into_iter().collect()
}
