use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

const HIDDEN: &[(u32, u32)] = &[
    (0x0, 0x20),
    (0x7F, 0xA0),
    (0xAD, 0xAD),
    (0x600, 0x605),
    (0x61C, 0x61C),
    (0x6DD, 0x6DD),
    (0x70F, 0x70F),
    (0x890, 0x891),
    (0x8E2, 0x8E2),
    (0x1680, 0x1680),
    (0x180E, 0x180E),
    (0x2000, 0x200F),
    (0x2028, 0x202F),
    (0x205F, 0x2064),
    (0x2066, 0x206F),
    (0x3000, 0x3000),
    (0xFEFF, 0xFEFF),
    (0xFFF9, 0xFFFB),
    (0x110BD, 0x110BD),
    (0x110CD, 0x110CD),
    (0x13430, 0x1343F),
    (0x1BCA0, 0x1BCA3),
    (0x1D173, 0x1D17A),
    (0xE0001, 0xE0001),
    (0xE0020, 0xE007F),
];

fn is_hidden(c: char) -> bool {
    let u = c as u32;
    HIDDEN.iter().any(|&(a, b)| u >= a && u <= b)
}

// CLAIM-OF: Some(id) or None; panics on throw.
fn claim_of(path: &str) -> Option<String> {
    let base = path.rsplit(['/', '\\']).next().unwrap_or("");
    let base = base.trim_matches(|c| c == ' ' || c == '\t');

    let mut end = base.len();
    for (i, c) in base.char_indices().rev() {
        if is_hidden(c) {
            end = i;
        } else {
            break;
        }
    }
    if end < base.len() {
        let rem = &base[..end];
        let mut it = rem.chars().rev();
        let r = it.next();
        let i = it.next();
        let s = it.next();
        let d = it.next();
        if matches!(r, Some('r') | Some('R'))
            && matches!(i, Some('i') | Some('I'))
            && matches!(s, Some('s') | Some('S') | Some('\u{17F}'))
            && d == Some('.')
        {
            panic!("hidden tail after .sir");
        }
    }

    let b = base.as_bytes();
    if b.len() >= 4 && b[b.len() - 4..].eq_ignore_ascii_case(b".sir") {
        let before = &base[..base.len() - 4];
        if let Some((_, seg)) = before.rsplit_once('.') {
            if seg.is_empty() {
                panic!("empty language segment");
            }
            return Some(seg.to_string());
        }
    }
    None
}

fn sight(id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("not in registry");
    }
}

pub fn languages_of(input: &Value) -> Vec<String> {
    let obj = match input {
        Value::Object(m) => m,
        _ => panic!("input must be a map"),
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
                    _ => panic!("sirFiles element must be text"),
                }
            }
        }
        Some(_) => panic!("sirFiles must be a list"),
    }

    let empty = serde_json::Map::new();
    let variants = match obj.get("variants") {
        None | Some(Value::Null) => &empty,
        Some(Value::Object(m)) => m,
        Some(_) => panic!("variants must be a map"),
    };

    let mut claimed: BTreeMap<String, String> = BTreeMap::new();
    for (k, v) in variants {
        let vm = match v {
            Value::Object(m) => m,
            _ => panic!("variant must be a map"),
        };
        let own = match vm.get("lang") {
            None => None,
            Some(Value::String(s)) => Some(s.clone()),
            Some(_) => panic!("lang must be text"),
        };
        let sir = match vm.get("sir") {
            None => None,
            Some(Value::String(s)) => Some(s.as_str()),
            Some(_) => panic!("sir must be text"),
        };
        let key = k.strip_prefix("lang:").map(|s| s.to_string());
        let path = match sir {
            Some(p) => claim_of(p),
            None => None,
        };
        let mut named: Vec<String> = Vec::new();
        if let Some(x) = &key {
            named.push(x.clone());
        }
        if let Some(x) = &own {
            named.push(x.clone());
        }
        if let Some(x) = &path {
            named.push(x.clone());
        }
        if named.iter().any(|n| *n != named[0]) {
            panic!("names disagree");
        }
        if key.is_some() && sir.is_some() && path.is_none() {
            panic!("sir path names no language");
        }
        if named.is_empty() {
            continue;
        }
        let id = named[0].clone();
        sight(&id);
        if claimed.contains_key(&id) {
            panic!("two variants claim one language");
        }
        claimed.insert(id.clone(), k.clone());
        out.insert(id);
    }

    out.into_iter().collect()
}
