use serde_json::Value;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn is_ws(c: char) -> bool {
    matches!(c as u32, 0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
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

fn st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_st(s: &str) -> String {
    s.trim_matches(st).to_string()
}

fn trim_ws(s: &str) -> String {
    s.trim_matches(is_ws).to_string()
}

fn find_token(hay: &[char], tok: &str, open: bool, closed: bool) -> bool {
    let t: Vec<char> = tok.chars().collect();
    if t.len() > hay.len() {
        return false;
    }
    for i in 0..=(hay.len() - t.len()) {
        if hay[i..i + t.len()] != t[..] {
            continue;
        }
        if open && i > 0 && is_word(hay[i - 1]) {
            continue;
        }
        let e = i + t.len();
        if closed && e < hay.len() && is_word(hay[e]) {
            continue;
        }
        return true;
    }
    false
}

fn has_tok(s: &str, tok: &str, open: bool, closed: bool) -> bool {
    let v: Vec<char> = s.chars().collect();
    find_token(&v, tok, open, closed)
}

fn has_ref(s: &str) -> bool {
    let c: Vec<char> = s.chars().collect();
    let t: Vec<char> = "ref(".chars().collect();
    let n = c.len();
    let mut i = 0;
    while i + 4 <= n {
        if c[i..i + 4] == t[..] && (i == 0 || !is_word(c[i - 1])) {
            let mut j = i + 4;
            while j < n && is_ws(c[j]) {
                j += 1;
            }
            let s0 = j;
            if j < n && c[j].is_ascii_lowercase() {
                j += 1;
                while j < n && (c[j].is_ascii_lowercase() || c[j].is_ascii_digit()) {
                    j += 1;
                }
                if j < n && c[j] == ':' {
                    let id: String = c[s0..j].iter().collect();
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

fn split_attrs(p: &[char]) -> (String, Vec<(String, String)>) {
    let n = p.len();
    let mut found: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if st(p[i]) {
            let mut j = i;
            while j < n && st(p[j]) {
                j += 1;
            }
            let mut matched = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                if j + k.len() <= n && p[j..j + k.len()] == k[..] {
                    let e = j + k.len();
                    if e == n || st(p[e]) {
                        found.push((i, e, kw));
                        i = e;
                        matched = true;
                        break;
                    }
                }
            }
            if !matched {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    if found.is_empty() {
        let s: String = p.iter().collect();
        return (trim_st(&s), Vec::new());
    }
    let body: String = p[..found[0].0].iter().collect();
    let mut vals = Vec::new();
    for (idx, f) in found.iter().enumerate() {
        let end = if idx + 1 < found.len() { found[idx + 1].0 } else { n };
        let v: String = p[f.1..end].iter().collect();
        vals.push((f.2.to_string(), trim_st(&v)));
    }
    (body, vals)
}

struct Dir {
    name: String,
    args: String,
    conts: Vec<String>,
    attrs: Vec<(String, Vec<String>)>,
}

impl Dir {
    fn add(&mut self, vals: Vec<(String, String)>) {
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
        let mut v = vec![self.args.clone()];
        v.extend(self.conts.iter().cloned());
        for a in &self.attrs {
            v.extend(a.1.iter().cloned());
        }
        v
    }
}

fn cut_lines(s: &str) -> Vec<String> {
    let c: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < c.len() {
        match c[i] {
            '\r' => {
                out.push(std::mem::take(&mut cur));
                if i + 1 < c.len() && c[i + 1] == '\n' {
                    i += 1;
                }
            }
            '\n' => out.push(std::mem::take(&mut cur)),
            ch => cur.push(ch),
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let n = c.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] == '"' {
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
            if let Some(cl) = close {
                out.push((i, cl));
                i = cl + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn code_of(content: &str) -> String {
    let c: Vec<char> = content.chars().collect();
    let sp = spans(&c);
    for i in 1..c.len() {
        if c[i] == '#'
            && st(c[i - 1])
            && (i + 1 >= c.len() || st(c[i + 1]))
            && !sp.iter().any(|&(o, cl)| o < i && i < cl)
        {
            let s: String = c[..i].iter().collect();
            return trim_st(&s);
        }
    }
    content.to_string()
}

fn is_name(t: &str) -> bool {
    let c: Vec<char> = t.chars().collect();
    if c.is_empty() || !c[0].is_ascii_uppercase() {
        return false;
    }
    c[1..].iter().all(|&x| x.is_ascii_uppercase() || x.is_ascii_digit() || x == '-')
}

fn suffix(p: &str) -> Option<String> {
    let b: Vec<char> = p.chars().collect();
    let start = b.iter().rposition(|&c| c == '/' || c == '\\').map(|x| x + 1).unwrap_or(0);
    let bs: String = b[start..].iter().collect();
    let b: Vec<char> = trim_st(&bs).chars().collect();
    let mut e = b.len();
    while e > 0 && is_hidden(b[e - 1]) {
        e -= 1;
    }
    if e < b.len() && e >= 4 {
        let (d, s, i, r) = (b[e - 4], b[e - 3], b[e - 2], b[e - 1]);
        if d == '.' && matches!(s, 's' | 'S' | '\u{17F}') && matches!(i, 'i' | 'I') && matches!(r, 'r' | 'R') {
            panic!("hidden");
        }
    }
    let n = b.len();
    if n >= 4 {
        let tail: String = b[n - 4..].iter().collect();
        if tail.eq_ignore_ascii_case(".sir") {
            if let Some(d) = b[..n - 4].iter().rposition(|&c| c == '.') {
                let x: String = b[d + 1..n - 4].iter().collect();
                if x.is_empty() {
                    panic!("empty");
                }
                return Some(x);
            }
        }
    }
    None
}

fn add_lang(langs: &mut Vec<String>, id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("registry");
    }
    if !langs.iter().any(|l| l == id) {
        langs.push(id.to_string());
    }
}

fn langs_of(f: &Option<&Value>, vr: &Option<&Value>) -> Vec<String> {
    let mut langs: Vec<String> = Vec::new();
    match f {
        None | Some(Value::Null) => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(s) => {
                        if let Some(id) = suffix(s) {
                            add_lang(&mut langs, &id);
                        }
                    }
                    _ => panic!("sirFiles element"),
                }
            }
        }
        _ => panic!("sirFiles"),
    }
    let mut seen: Vec<String> = Vec::new();
    match vr {
        None | Some(Value::Null) => {}
        Some(Value::Object(m)) => {
            for (k, v) in m {
                let vm = match v {
                    Value::Object(o) => o,
                    _ => panic!("variant"),
                };
                let own = match vm.get("lang") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    _ => panic!("lang"),
                };
                let sir = match vm.get("sir") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    _ => panic!("sir"),
                };
                let mut named: Vec<String> = Vec::new();
                let key_lang = k.strip_prefix("lang:").map(|s| s.to_string());
                if let Some(kl) = &key_lang {
                    named.push(kl.clone());
                }
                if let Some(o) = &own {
                    named.push(o.clone());
                }
                let mut path_none = false;
                if let Some(s) = &sir {
                    match suffix(s) {
                        Some(id) => named.push(id),
                        None => path_none = true,
                    }
                }
                if named.iter().any(|x| *x != named[0]) {
                    panic!("differ");
                }
                if key_lang.is_some() && sir.is_some() && path_none {
                    panic!("key sir none");
                }
                if named.is_empty() {
                    continue;
                }
                let id = named[0].clone();
                add_lang(&mut langs, &id);
                if seen.contains(&id) {
                    panic!("dup");
                }
                seen.push(id);
            }
        }
        _ => panic!("variants"),
    }
    langs
}

pub fn detect_features(input: &Value) -> Vec<String> {
    if input.is_null() {
        panic!("null");
    }
    let obj = input.as_object();
    let get = |k: &str| obj.and_then(|o| o.get(k));
    let sir_text: String = match get("sirText") {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        _ => panic!("sirText"),
    };
    let carried = get("carriedData");
    match carried {
        None | Some(Value::Null) | Some(Value::Array(_)) => {}
        _ => panic!("carriedData"),
    }
    let envelope: Option<String> = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.clone()),
        _ => panic!("envelope"),
    };
    let mode: Option<&str> = match get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };
    let langs = langs_of(&get("sirFiles"), &get("variants"));

    let mut prose: Vec<Vec<char>> = Vec::new();
    let mut dirs: Vec<Dir> = Vec::new();
    for raw in cut_lines(&sir_text) {
        let l = raw.trim_start_matches('\u{FEFF}');
        let l = l.trim_end_matches(st);
        if l.is_empty() {
            continue;
        }
        let content = l.trim_start_matches(st);
        let indented = content.len() != l.len();
        if content.starts_with('#') {
            continue;
        }
        prose.push(l.chars().collect());
        let code = code_of(content);
        if !indented {
            let tok_end = code.find(st).unwrap_or(code.len());
            let tok = &code[..tok_end];
            let name = tok.strip_suffix(':').unwrap_or(tok);
            if is_name(name) && name != "CITED" {
                let rest: Vec<char> = code[tok_end..].chars().collect();
                let (body, vals) = split_attrs(&rest);
                let mut d = Dir { name: name.to_string(), args: body, conts: Vec::new(), attrs: Vec::new() };
                d.add(vals);
                dirs.push(d);
                continue;
            }
        }
        if let Some(d) = dirs.last_mut() {
            let piece: Vec<char> = format!(" {}", code).chars().collect();
            let (body, vals) = split_attrs(&piece);
            if !body.is_empty() {
                d.conts.push(body);
            }
            d.add(vals);
        }
    }

    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let carried_hit = matches!(carried, Some(Value::Array(a)) if !a.is_empty())
        || has("CARRIED")
        || dirs.iter().any(|d| {
            d.name == "CARRIED-DATA" && {
                let t = trim_ws(&d.full());
                !t.is_empty() && t != "none"
            }
        });
    let env_hit = envelope.as_ref().map_or(false, |e| !trim_ws(e).is_empty()) || has("ENVELOPE");
    let trace_hit = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().any(|d| {
            d.name == "ORACLE-CLASS" && {
                let t = trim_ws(&d.full());
                t.starts_with("trace") && !t.chars().nth(5).map_or(false, is_word)
            }
        });
    let par_hit = mode == Some("par") || has("PAR");
    let ring_hit = mode == Some("ring") || has("RING");
    let life_hit = has("LIFECYCLE") || prose.iter().any(|l| find_token(l, "setTimer", true, true));
    let sched_hit = dirs.iter().any(|d| {
        d.name == "EFFECT" && {
            let f = d.full();
            has_tok(&f, "time.timer", true, true) || has_tok(&f, "microtask", true, true)
        }
    }) || prose.iter().any(|l| {
        find_token(l, "schedule(", true, false)
            || find_token(l, "virtual time", true, true)
            || find_token(l, "timers.", true, false)
    });
    let anchor_hit = dirs.iter().any(|d| {
        if d.name == "ANCHOR" {
            d.pieces().iter().any(|p| has_ref(p))
        } else if d.name == "FIDELITY" || d.name == "VARIANT" {
            d.attrs.iter().any(|a| a.0 == "ANCHOR" && a.1.iter().any(|v| has_ref(v)))
        } else {
            false
        }
    });

    let rows = [
        ("vectors", true),
        ("carried-data", carried_hit),
        ("envelope", env_hit),
        ("trace-seam", trace_hit),
        ("par-interleaving", par_hit),
        ("ring", ring_hit),
        ("lifecycle", life_hit),
        ("scheduler", sched_hit),
        ("lang-variant", !langs.is_empty()),
        ("cross-lang-anchor", anchor_hit),
    ];
    rows.iter().filter(|r| r.1).map(|r| r.0.to_string()).collect()
}
