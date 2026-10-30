use serde_json::Value;
use std::collections::{BTreeSet, HashSet};

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

const HIDDEN: &[(u32, u32)] = &[
    (0x0000, 0x0020),
    (0x007F, 0x00A0),
    (0x00AD, 0x00AD),
    (0x0600, 0x0605),
    (0x061C, 0x061C),
    (0x06DD, 0x06DD),
    (0x070F, 0x070F),
    (0x0890, 0x0891),
    (0x08E2, 0x08E2),
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

// Some(id) claim, None nothing, panic on throw.
fn claim_of(path: &str) -> Option<String> {
    let base = path.rsplit(['/', '\\']).next().unwrap_or("");
    let base = base.trim_matches(|c| c == ' ' || c == '\t');
    let stripped = base.trim_end_matches(is_hidden);
    if stripped.len() != base.len() {
        let mut it = stripped.chars().rev();
        let c4 = it.next();
        let c3 = it.next();
        let c2 = it.next();
        let c1 = it.next();
        if c1 == Some('.')
            && matches!(c2, Some('s') | Some('S') | Some('\u{017F}'))
            && matches!(c3, Some('i') | Some('I'))
            && matches!(c4, Some('r') | Some('R'))
        {
            // chars were collected reversed: c4 is last char
        }
        let mut rv = stripped.chars().rev();
        let l = rv.next();
        let m = rv.next();
        let n = rv.next();
        let o = rv.next();
        if o == Some('.')
            && matches!(n, Some('s') | Some('S') | Some('\u{017F}'))
            && matches!(m, Some('i') | Some('I'))
            && matches!(l, Some('r') | Some('R'))
        {
            panic!("sir name followed by invisible characters");
        }
    }
    let n = base.len();
    if n >= 4 && base.is_char_boundary(n - 4) && base[n - 4..].eq_ignore_ascii_case(".sir") {
        let before = &base[..n - 4];
        if let Some((_, seg)) = before.rsplit_once('.') {
            if seg.is_empty() {
                panic!("empty language segment");
            }
            return Some(seg.to_string());
        }
    }
    None
}

fn sight(id: &str) -> String {
    if !REGISTRY.contains(&id) {
        panic!("not in registry");
    }
    id.to_string()
}

pub fn languages_of(input: &serde_json::Value) -> Vec<String> {
    let map = match input.as_object() {
        Some(m) => m,
        None => panic!("languagesOf takes a map"),
    };
    let mut out: BTreeSet<String> = BTreeSet::new();
    match map.get("sirFiles") {
        None => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e.as_str() {
                    Some(s) => {
                        if let Some(id) = claim_of(s) {
                            out.insert(sight(&id));
                        }
                    }
                    None => panic!("sirFiles element must be text"),
                }
            }
        }
        Some(_) => panic!("sirFiles must be a list"),
    }
    let variants = match map.get("variants") {
        None | Some(Value::Null) => None,
        Some(Value::Object(m)) => Some(m),
        Some(_) => panic!("variants must be a map"),
    };
    if let Some(vs) = variants {
        let mut claimed: HashSet<String> = HashSet::new();
        for (k, v) in vs {
            let vm = match v.as_object() {
                Some(m) => m,
                None => panic!("a variant is a map"),
            };
            let own: Option<&str> = match vm.get("lang") {
                None => None,
                Some(Value::String(s)) => Some(s.as_str()),
                Some(_) => panic!("lang must be text"),
            };
            let sir: Option<&str> = match vm.get("sir") {
                None => None,
                Some(Value::String(s)) => Some(s.as_str()),
                Some(_) => panic!("sir must be text"),
            };
            let keylang: Option<&str> = k.strip_prefix("lang:");
            let pathlang: Option<String> = match sir {
                Some(s) => claim_of(s),
                None => None,
            };
            let mut named: Vec<&str> = Vec::new();
            if let Some(x) = keylang {
                named.push(x);
            }
            if let Some(x) = own {
                named.push(x);
            }
            if let Some(x) = pathlang.as_deref() {
                named.push(x);
            }
            if named.windows(2).any(|w| w[0] != w[1]) {
                panic!("names differ");
            }
            if keylang.is_some() && sir.is_some() && pathlang.is_none() {
                panic!("sir path names no language");
            }
            if named.is_empty() {
                continue;
            }
            let id = sight(named[0]);
            if !claimed.insert(id.clone()) {
                panic!("two variants claim one language");
            }
            out.insert(id);
        }
    }
    out.into_iter().collect()
}
