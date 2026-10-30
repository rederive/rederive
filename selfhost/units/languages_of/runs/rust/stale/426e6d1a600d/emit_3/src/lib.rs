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

// Returns Some(id) for a claim, None for nothing; panics on a throw.
fn claim_of(path: &str) -> Option<String> {
    let base = path.rsplit(['/', '\\']).next().unwrap_or("");
    let base = base.trim_matches(|c| c == ' ' || c == '\t');

    let stripped = base.trim_end_matches(is_hidden);
    if stripped.len() != base.len() {
        let last: Vec<char> = stripped.chars().rev().take(4).collect();
        if last.len() == 4
            && last[3] == '.'
            && (last[2] == 's' || last[2] == 'S' || last[2] == '\u{17F}')
            && (last[1] == 'i' || last[1] == 'I')
            && (last[0] == 'r' || last[0] == 'R')
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

fn sight(id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("not in registry");
    }
}

pub fn languages_of(input: &serde_json::Value) -> Vec<String> {
    let obj = match input.as_object() {
        Some(o) => o,
        None => panic!("languagesOf takes a map"),
    };
    let mut out: BTreeSet<String> = BTreeSet::new();

    match obj.get("sirFiles") {
        None => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e.as_str() {
                    Some(s) => {
                        if let Some(id) = claim_of(s) {
                            sight(&id);
                            out.insert(id);
                        }
                    }
                    None => panic!("sirFiles element must be text"),
                }
            }
        }
        Some(_) => panic!("sirFiles must be a list"),
    }

    let variants = match obj.get("variants") {
        None | Some(Value::Null) => None,
        Some(Value::Object(m)) => Some(m),
        Some(_) => panic!("variants must be a map"),
    };

    if let Some(m) = variants {
        let mut claimed: HashSet<String> = HashSet::new();
        for (k, v) in m {
            let vm = match v.as_object() {
                Some(x) => x,
                None => panic!("a variant is a map"),
            };
            let own: Option<String> = match vm.get("lang") {
                None => None,
                Some(Value::String(s)) => Some(s.clone()),
                Some(_) => panic!("lang must be text"),
            };
            let sir: Option<&str> = match vm.get("sir") {
                None => None,
                Some(Value::String(s)) => Some(s.as_str()),
                Some(_) => panic!("sir must be text"),
            };
            let key_lang: Option<String> = k.strip_prefix("lang:").map(|s| s.to_string());
            let path_lang: Option<String> = match sir {
                Some(p) => claim_of(p),
                None => None,
            };
            let mut named: Vec<String> = Vec::new();
            if let Some(x) = &key_lang {
                named.push(x.clone());
            }
            if let Some(x) = &own {
                named.push(x.clone());
            }
            if let Some(x) = &path_lang {
                named.push(x.clone());
            }
            if named.iter().any(|x| *x != named[0]) {
                panic!("names disagree");
            }
            if key_lang.is_some() && sir.is_some() && path_lang.is_none() {
                panic!("sir path names no language");
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
