use serde_json::Value;
use std::collections::HashSet;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn is_ws(c: char) -> bool {
    matches!(c as u32, 0x9..=0xD | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

fn is_hidden(c: char) -> bool {
    matches!(c as u32,
        0..=0x20 | 0x7F..=0xA0 | 0xAD | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F | 0x890..=0x891 | 0x8E2
        | 0x1680 | 0x180E | 0x2000..=0x200F | 0x2028..=0x202F | 0x205F..=0x2064 | 0x2066..=0x206F
        | 0x3000 | 0xFEFF | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F
        | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}

fn trim_st(s: &str) -> &str {
    s.trim_matches(|c| c == ' ' || c == '\t')
}

fn find_token(text: &str, tok: &str, open: bool, closed: bool) -> bool {
    let c: Vec<char> = text.chars().collect();
    let t: Vec<char> = tok.chars().collect();
    let n = c.len();
    if t.len() > n {
        return false;
    }
    for i in 0..=(n - t.len()) {
        if c[i..i + t.len()] != t[..] {
            continue;
        }
        if open && i > 0 && is_word(c[i - 1]) {
            continue;
        }
        let e = i + t.len();
        if closed && e < n && is_word(c[e]) {
            continue;
        }
        return true;
    }
    false
}

fn has_ref(text: &str) -> bool {
    let c: Vec<char> = text.chars().collect();
    let n = c.len();
    let t: Vec<char> = "ref(".chars().collect();
    let mut i = 0;
    while i + 4 <= n {
        if c[i..i + 4] == t[..] && (i == 0 || !is_word(c[i - 1])) {
            let mut j = i + 4;
            while j < n && is_ws(c[j]) {
                j += 1;
            }
            if j < n && c[j].is_ascii_lowercase() {
                let mut k = j;
                while k < n && (c[k].is_ascii_lowercase() || c[k].is_ascii_digit()) {
                    k += 1;
                }
                if k < n && c[k] == ':' {
                    let id: String = c[j..k].iter().collect();
                    if REGISTRY.contains(&id.as_str()) {
                        return true;
                    }
                }
            }
        }
        i += 1;
    }
    false
}

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let n = c.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] != '"' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut close = None;
        loop {
            if j >= n {
                break;
            }
            let ch = c[j];
            if ch == '\\' {
                if j + 1 >= n || matches!(c[j + 1], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                    break;
                }
                j += 2;
            } else if ch == '"' {
                close = Some(j);
                break;
            } else {
                j += 1;
            }
        }
        match close {
            Some(e) => {
                out.push((i, e));
                i = e + 1;
            }
            None => i += 1,
        }
    }
    out
}

fn split_attrs(text: &str) -> (String, Vec<(String, String)>) {
    let c: Vec<char> = text.chars().collect();
    let n = c.len();
    let mut found: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] == ' ' || c[i] == '\t' {
            let mut r = i;
            while r < n && (c[r] == ' ' || c[r] == '\t') {
                r += 1;
            }
            let mut matched = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                let e = r + k.len();
                if e <= n && c[r..e] == k[..] && (e == n || c[e] == ' ' || c[e] == '\t') {
                    found.push((i, kw, e));
                    i = e;
                    matched = true;
                    break;
                }
            }
            if !matched {
                i = r;
            }
        } else {
            i += 1;
        }
    }
    if found.is_empty() {
        return (trim_st(text).to_string(), Vec::new());
    }
    let body: String = c[..found[0].0].iter().collect();
    let mut vals = Vec::new();
    for (idx, (_, kw, e)) in found.iter().enumerate() {
        let end = if idx + 1 < found.len() { found[idx + 1].0 } else { n };
        let v: String = c[*e..end].iter().collect();
        vals.push((kw.to_string(), trim_st(&v).to_string()));
    }
    (trim_st(&body).to_string(), vals)
}

struct Dir {
    name: String,
    args: String,
    conts: Vec<String>,
    attrs: Vec<(String, Vec<String>)>,
}

impl Dir {
    fn add_attrs(&mut self, vals: Vec<(String, String)>) {
        for (k, v) in vals {
            if let Some(e) = self.attrs.iter_mut().find(|e| e.0 == k) {
                e.1.push(v);
            } else {
                self.attrs.push((k, vec![v]));
            }
        }
    }
    fn full(&self) -> String {
        let mut parts = vec![self.args.clone()];
        parts.extend(self.conts.iter().cloned());
        parts.join(" ")
    }
    fn pieces(&self) -> Vec<String> {
        let mut p = vec![self.args.clone()];
        p.extend(self.conts.iter().cloned());
        for (_, vs) in &self.attrs {
            p.extend(vs.iter().cloned());
        }
        p
    }
}

fn is_name(t: &str) -> bool {
    let mut it = t.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn cut_lines(s: &str) -> Vec<String> {
    let c: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < c.len() {
        match c[i] {
            '\r' => {
                if i + 1 < c.len() && c[i + 1] == '\n' {
                    i += 1;
                }
                out.push(std::mem::take(&mut cur));
            }
            '\n' => out.push(std::mem::take(&mut cur)),
            ch => cur.push(ch),
        }
        i += 1;
    }
    out.push(cur);
    out
}

enum Suffix {
    None,
    Id(String),
}

fn suffix(p: &str) -> Suffix {
    let b = match p.rfind(|c| c == '/' || c == '\\') {
        Some(i) => &p[i + 1..],
        None => p,
    };
    let v: Vec<char> = trim_st(b).chars().collect();
    let n = v.len();
    let mut e = n;
    while e > 0 && is_hidden(v[e - 1]) {
        e -= 1;
    }
    if e < n
        && e >= 4
        && v[e - 4] == '.'
        && matches!(v[e - 3], 's' | 'S' | '\u{17F}')
        && matches!(v[e - 2], 'i' | 'I')
        && matches!(v[e - 1], 'r' | 'R')
    {
        panic!("hidden");
    }
    if n >= 4
        && v[n - 4] == '.'
        && v[n - 3].to_ascii_lowercase() == 's'
        && v[n - 2].to_ascii_lowercase() == 'i'
        && v[n - 1].to_ascii_lowercase() == 'r'
    {
        if let Some(p) = v[..n - 4].iter().rposition(|&c| c == '.') {
            let x: String = v[p + 1..n - 4].iter().collect();
            if x.is_empty() {
                panic!("empty");
            }
            return Suffix::Id(x);
        }
    }
    Suffix::None
}

fn add(langs: &mut HashSet<String>, id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("registry");
    }
    langs.insert(id.to_string());
}

fn langs_of(files: Option<&Value>, variants: Option<&Value>) -> bool {
    let mut langs: HashSet<String> = HashSet::new();
    match files {
        None | Some(Value::Null) => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(s) => {
                        if let Suffix::Id(id) = suffix(s) {
                            add(&mut langs, &id);
                        }
                    }
                    _ => panic!("file"),
                }
            }
        }
        _ => panic!("sirFiles"),
    }
    match variants {
        None | Some(Value::Null) => {}
        Some(Value::Object(m)) => {
            let mut seen: HashSet<String> = HashSet::new();
            for (k, v) in m {
                let o = match v {
                    Value::Object(o) => o,
                    _ => panic!("variant"),
                };
                let own = match o.get("lang") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    _ => panic!("lang"),
                };
                let sir = match o.get("sir") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    _ => panic!("sir"),
                };
                let mut named: Vec<String> = Vec::new();
                let key_lang = k.strip_prefix("lang:");
                if let Some(kl) = key_lang {
                    named.push(kl.to_string());
                }
                if let Some(o) = own {
                    named.push(o);
                }
                let mut sir_none = false;
                if let Some(s) = &sir {
                    match suffix(s) {
                        Suffix::Id(id) => named.push(id),
                        Suffix::None => sir_none = true,
                    }
                }
                if named.windows(2).any(|w| w[0] != w[1]) {
                    panic!("differ");
                }
                if key_lang.is_some() && sir_none {
                    panic!("sir none");
                }
                if named.is_empty() {
                    continue;
                }
                let id = named[0].clone();
                add(&mut langs, &id);
                if !seen.insert(id) {
                    panic!("dup");
                }
            }
        }
        _ => panic!("variants"),
    }
    !langs.is_empty()
}

pub fn detect_features(input: &Value) -> Vec<String> {
    if input.is_null() {
        panic!("null input");
    }
    let obj = input.as_object();
    let get = |k: &str| obj.and_then(|o| o.get(k));
    let sir_text: String = match get("sirText") {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        _ => panic!("sirText"),
    };
    let carried = match get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        _ => panic!("carriedData"),
    };
    let envelope: Option<&String> = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s),
        _ => panic!("envelope"),
    };
    let mode: Option<&str> = match get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };

    let mut dirs: Vec<Dir> = Vec::new();
    let mut prose: Vec<String> = Vec::new();
    for raw in cut_lines(&sir_text) {
        let l1 = raw.trim_start_matches('\u{FEFF}');
        let line = trim_st_end(l1);
        if line.is_empty() {
            continue;
        }
        let content = line.trim_start_matches(|c| c == ' ' || c == '\t');
        let indent = line.len() - content.len();
        if content.starts_with('#') {
            continue;
        }
        prose.push(line.to_string());
        let c: Vec<char> = content.chars().collect();
        let sp = spans(&c);
        let mut cut = c.len();
        for i in 1..c.len() {
            if c[i] == '#'
                && (c[i - 1] == ' ' || c[i - 1] == '\t')
                && (i + 1 == c.len() || c[i + 1] == ' ' || c[i + 1] == '\t')
                && !sp.iter().any(|&(o, e)| o < i && i < e)
            {
                cut = i;
                break;
            }
        }
        let code_s: String = c[..cut].iter().collect();
        let code = trim_st_end(&code_s);
        let tok_end = code.find(|ch| ch == ' ' || ch == '\t').unwrap_or(code.len());
        let token = &code[..tok_end];
        let name = token.strip_suffix(':').unwrap_or(token);
        if indent == 0 && is_name(name) && name != "CITED" {
            let (body, vals) = split_attrs(&code[tok_end..]);
            let mut d = Dir { name: name.to_string(), args: body, conts: Vec::new(), attrs: Vec::new() };
            d.add_attrs(vals);
            dirs.push(d);
        } else if let Some(d) = dirs.last_mut() {
            let (body, vals) = split_attrs(&format!(" {}", code));
            if !body.is_empty() {
                d.conts.push(body);
            }
            d.add_attrs(vals);
        }
    }

    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let mut out = vec!["vectors".to_string()];

    let carried_f = carried.map_or(false, |a| !a.is_empty())
        || has("CARRIED")
        || dirs.iter().any(|d| {
            d.name == "CARRIED-DATA" && {
                let f = d.full();
                let t = trim_ws(&f);
                !t.is_empty() && t != "none"
            }
        });
    if carried_f {
        out.push("carried-data".into());
    }
    if envelope.map_or(false, |e| !trim_ws(e).is_empty()) || has("ENVELOPE") {
        out.push("envelope".into());
    }
    let trace = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().any(|d| {
            d.name == "ORACLE-CLASS" && {
                let f = d.full();
                let t = trim_ws(&f);
                match t.strip_prefix("trace") {
                    Some(rest) => rest.chars().next().map_or(true, |c| !is_word(c)),
                    None => false,
                }
            }
        });
    if trace {
        out.push("trace-seam".into());
    }
    if mode == Some("par") || has("PAR") {
        out.push("par-interleaving".into());
    }
    if mode == Some("ring") || has("RING") {
        out.push("ring".into());
    }
    if has("LIFECYCLE") || prose.iter().any(|l| find_token(l, "setTimer", true, true)) {
        out.push("lifecycle".into());
    }
    let sched = dirs.iter().any(|d| {
        d.name == "EFFECT" && {
            let f = d.full();
            find_token(&f, "time.timer", true, true) || find_token(&f, "microtask", true, true)
        }
    }) || prose.iter().any(|l| {
        find_token(l, "schedule(", true, false)
            || find_token(l, "virtual time", true, true)
            || find_token(l, "timers.", true, false)
    });
    if sched {
        out.push("scheduler".into());
    }
    if langs_of(get("sirFiles"), get("variants")) {
        out.push("lang-variant".into());
    }
    let cross = dirs.iter().any(|d| {
        (d.name == "ANCHOR" && d.pieces().iter().any(|p| has_ref(p)))
            || ((d.name == "FIDELITY" || d.name == "VARIANT")
                && d.attrs.iter().any(|(k, vs)| k == "ANCHOR" && vs.iter().any(|v| has_ref(v))))
    });
    if cross {
        out.push("cross-lang-anchor".into());
    }
    out
}

fn trim_st_end(s: &str) -> &str {
    s.trim_end_matches(|c| c == ' ' || c == '\t')
}
