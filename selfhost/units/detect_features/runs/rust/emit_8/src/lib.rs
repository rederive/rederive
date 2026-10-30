use serde_json::Value;
use std::collections::BTreeSet;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];
const OPENERS: &str = " \t([{,=:;|<>!&-~";

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn trim(s: &str) -> &str {
    s.trim_matches(|c| c == ' ' || c == '\t')
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn spans(t: &[char]) -> Vec<(usize, usize)> {
    let n = t.len();
    let mut res = Vec::new();
    let mut last: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if t[i] == '"' && (i == 0 || OPENERS.contains(t[i - 1]) || last.map_or(false, |c| c + 1 == i)) {
            let mut j = i + 1;
            let mut closed = None;
            while j < n {
                if t[j] == '\\' {
                    j += 2;
                } else if t[j] == '"' {
                    closed = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match closed {
                Some(c) => {
                    res.push((i, c));
                    last = Some(c);
                    i = c + 1;
                }
                None => break,
            }
        } else {
            i += 1;
        }
    }
    res
}

fn in_span(sp_: &[(usize, usize)], idx: usize) -> bool {
    sp_.iter().any(|&(o, c)| o < idx && idx < c)
}

fn unquote(t: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut i = 0;
    for (o, c) in spans(t) {
        out.extend_from_slice(&t[i..o]);
        out.push('"');
        out.push('"');
        i = c + 1;
    }
    out.extend_from_slice(&t[i..]);
    out
}

fn split_attrs(piece: &[char]) -> (String, Vec<(String, String)>) {
    let n = piece.len();
    let sps = spans(piece);
    let mut found: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(piece[i]) {
            let rs = i;
            let mut j = i;
            while j < n && sp(piece[j]) {
                j += 1;
            }
            let mut matched = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                let e = j + k.len();
                if e <= n && piece[j..e] == k[..] && (e == n || sp(piece[e])) {
                    if !in_span(&sps, j) {
                        found.push((rs, kw, e));
                    }
                    i = e;
                    matched = true;
                    break;
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
        let s: String = piece.iter().collect();
        return (trim(&s).to_string(), Vec::new());
    }
    let body: String = piece[..found[0].0].iter().collect();
    let mut attrs = Vec::new();
    for (k, &(_, kw, e)) in found.iter().enumerate() {
        let end = if k + 1 < found.len() { found[k + 1].0 } else { n };
        let v: String = piece[e..end.max(e)].iter().collect();
        attrs.push((kw.to_string(), trim(&v).to_string()));
    }
    (body, attrs)
}

#[derive(Default)]
struct Dir {
    name: String,
    args: String,
    conts: Vec<String>,
    attrs: Vec<(String, String)>,
}

impl Dir {
    fn full(&self) -> String {
        let mut v = vec![self.args.clone()];
        v.extend(self.conts.iter().cloned());
        v.join(" ")
    }
    fn anchors(&self) -> Vec<&String> {
        self.attrs.iter().filter(|a| a.0 == "ANCHOR").map(|a| &a.1).collect()
    }
}

fn is_name(t: &str) -> bool {
    let t = t.strip_suffix(':').unwrap_or(t);
    if t == "CITED" {
        return false;
    }
    let mut it = t.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    lines.push(cur);
    lines
}

fn clean_line(l: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < l.len() && (sp(l[i]) || l[i] == '\u{feff}') {
        if l[i] != '\u{feff}' {
            out.push(l[i]);
        }
        i += 1;
    }
    out.extend_from_slice(&l[i..]);
    while let Some(&c) = out.last() {
        if sp(c) {
            out.pop();
        } else {
            break;
        }
    }
    out
}

fn holds(h: &[char], tok: &str, open: bool, closed: bool) -> bool {
    let t: Vec<char> = tok.chars().collect();
    let n = h.len();
    if t.len() > n {
        return false;
    }
    for i in 0..=(n - t.len()) {
        if h[i..i + t.len()] == t[..] {
            let o = i == 0 || !is_word(h[i - 1]);
            let e = i + t.len();
            let c = e == n || !is_word(h[e]);
            if (!open || o) && (!closed || c) {
                return true;
            }
        }
    }
    false
}

fn has_ref(h: &[char]) -> bool {
    let n = h.len();
    let t: Vec<char> = "ref(".chars().collect();
    let mut i = 0;
    while i + 4 <= n {
        if h[i..i + 4] == t[..] && (i == 0 || !is_word(h[i - 1])) {
            let mut j = i + 4;
            while j < n && sp(h[j]) {
                j += 1;
            }
            if j < n && h[j].is_ascii_lowercase() {
                let s = j;
                while j < n && (h[j].is_ascii_lowercase() || h[j].is_ascii_digit()) {
                    j += 1;
                }
                if j < n && h[j] == ':' {
                    let id: String = h[s..j].iter().collect();
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

fn ends_tail(c: &[char]) -> bool {
    let t = ['.', 's', 'i', 'r'];
    c.len() >= 4 && (0..4).all(|k| c[c.len() - 4 + k].eq_ignore_ascii_case(&t[k]))
}

fn base(p: &str) -> Vec<char> {
    let b = p.rsplit(|c| c == '/' || c == '\\').next().unwrap_or("");
    trim(b).chars().collect()
}

fn suffix(p: &str) -> Option<String> {
    let ch = base(p);
    let mut e = ch.len();
    while e > 0 && !('\u{21}'..='\u{7e}').contains(&ch[e - 1]) {
        e -= 1;
    }
    if e < ch.len() && ends_tail(&ch[..e]) {
        panic!("hidden tail");
    }
    if !ends_tail(&ch) {
        return None;
    }
    let rest: String = ch[..ch.len() - 4].iter().collect();
    let segs: Vec<&str> = rest.split('.').collect();
    let f = segs[0];
    let unit_ok = {
        let mut it = f.chars();
        match it.next() {
            Some(c) => (c.is_ascii_alphanumeric() || c == '_') && it.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
            None => false,
        }
    };
    if !(f.is_empty() || unit_ok) {
        panic!("unit name");
    }
    if segs.len() >= 3 {
        panic!("segments");
    }
    if segs.len() == 1 {
        return None;
    }
    if segs[1].is_empty() {
        panic!("empty id");
    }
    Some(segs[1].to_string())
}

fn add(langs: &mut BTreeSet<String>, id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("not in registry");
    }
    langs.insert(id.to_string());
}

fn langs_of(files: Option<&Value>, variants: Option<&Value>) -> BTreeSet<String> {
    let mut langs = BTreeSet::new();
    match files {
        None | Some(Value::Null) => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(s) => {
                        if let Some(id) = suffix(s) {
                            add(&mut langs, &id);
                        }
                    }
                    _ => panic!("sirFiles element"),
                }
            }
        }
        _ => panic!("sirFiles"),
    }
    let vm = match variants {
        None | Some(Value::Null) => return langs,
        Some(Value::Object(m)) => m,
        _ => panic!("variants"),
    };
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (k, v) in vm {
        let o = match v {
            Value::Object(o) => o,
            _ => panic!("variant"),
        };
        let own: Option<&str> = match o.get("lang") {
            None => None,
            Some(Value::String(s)) => Some(s),
            _ => panic!("lang"),
        };
        let mut path_suffix: Option<Option<String>> = None;
        match o.get("sir") {
            None => {}
            Some(Value::String(s)) => {
                let sf = suffix(s);
                if !ends_tail(&base(s)) {
                    panic!("sir tail");
                }
                path_suffix = Some(sf);
            }
            _ => panic!("sir"),
        }
        let key_lang: Option<String> = if k == "package" {
            None
        } else if let Some(r) = k.strip_prefix("lang:") {
            let mut it = r.chars();
            let ok = match it.next() {
                Some(c) if c.is_ascii_lowercase() => it.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
                _ => false,
            };
            if !ok {
                panic!("variant key");
            }
            Some(r.to_string())
        } else {
            panic!("variant key");
        };
        let mut named: Vec<String> = Vec::new();
        if let Some(k) = &key_lang {
            named.push(k.clone());
        }
        if let Some(o) = own {
            named.push(o.to_string());
        }
        if let Some(Some(id)) = &path_suffix {
            named.push(id.clone());
        }
        if named.iter().any(|x| x != &named[0]) {
            panic!("differ");
        }
        if (key_lang.is_some() || own.is_some()) && matches!(path_suffix, Some(None)) {
            panic!("none suffix");
        }
        if named.is_empty() {
            continue;
        }
        let id = named[0].clone();
        add(&mut langs, &id);
        if !seen.insert(id) {
            panic!("duplicate");
        }
    }
    langs
}

pub fn detect_features(input: &Value) -> Vec<String> {
    let obj = match input {
        Value::Null => panic!("null input"),
        Value::Object(m) => Some(m),
        _ => None,
    };
    let get = |k: &str| obj.and_then(|m| m.get(k));
    let sir_text: &str = match get("sirText") {
        None => "",
        Some(Value::String(s)) => s,
        _ => panic!("sirText"),
    };
    let carried = match get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        _ => panic!("carriedData"),
    };
    let envelope: Option<&str> = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s),
        _ => panic!("envelope"),
    };
    let mode: Option<&str> = match get("mode") {
        Some(Value::String(s)) => Some(s),
        _ => None,
    };
    let langs = langs_of(get("sirFiles"), get("variants"));

    let mut dirs: Vec<Dir> = Vec::new();
    let mut prose: Vec<Vec<char>> = Vec::new();
    for raw in split_lines(sir_text) {
        let line = clean_line(&raw);
        if line.is_empty() {
            continue;
        }
        let ind = line.iter().take_while(|&&c| sp(c)).count();
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        {
            let mut l = vec![' '];
            l.extend(unquote(&line));
            let (body, _) = split_attrs(&l);
            prose.push(trim(&body).chars().collect());
        }
        let cs = spans(content);
        let mut cut = content.len();
        for i in 1..content.len() {
            if content[i] == '#'
                && sp(content[i - 1])
                && (i + 1 == content.len() || sp(content[i + 1]))
                && !in_span(&cs, i)
            {
                cut = i;
                break;
            }
        }
        let mut code: &[char] = &content[..cut];
        while let Some(&c) = code.last() {
            if sp(c) {
                code = &code[..code.len() - 1];
            } else {
                break;
            }
        }
        let tok_end = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
        let tok: String = code[..tok_end].iter().collect();
        if ind == 0 && is_name(&tok) {
            let name = tok.strip_suffix(':').unwrap_or(&tok).to_string();
            let (args, attrs) = split_attrs(&code[tok_end..]);
            dirs.push(Dir { name, args, conts: Vec::new(), attrs });
        } else if let Some(d) = dirs.last_mut() {
            let mut p = vec![' '];
            p.extend_from_slice(code);
            let (body, attrs) = split_attrs(&p);
            if !body.is_empty() {
                d.conts.push(body);
            }
            d.attrs.extend(attrs);
        }
    }
    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let mut out = vec!["vectors".to_string()];

    let carried_data = carried.map_or(false, |a| !a.is_empty())
        || has("CARRIED")
        || dirs.iter().filter(|d| d.name == "CARRIED-DATA").any(|d| {
            let mut texts = vec![d.full()];
            texts.extend(d.attrs.iter().map(|a| a.1.clone()));
            texts.iter().any(|t| {
                let t = trim(t);
                !t.is_empty() && t != "none"
            })
        });
    if carried_data {
        out.push("carried-data".into());
    }
    if envelope.map_or(false, |e| !trim(e).is_empty()) || has("ENVELOPE") {
        out.push("envelope".into());
    }
    let trace = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().filter(|d| d.name == "ORACLE-CLASS").any(|d| {
            let f = d.full();
            let t: Vec<char> = trim(&f).chars().collect();
            t.len() >= 5 && t[..5] == ['t', 'r', 'a', 'c', 'e'] && (t.len() == 5 || !is_word(t[5]))
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
    if has("LIFECYCLE") || prose.iter().any(|p| holds(p, "setTimer", true, true)) {
        out.push("lifecycle".into());
    }
    let sched = dirs.iter().filter(|d| d.name == "EFFECT").any(|d| {
        let f: Vec<char> = d.full().chars().collect();
        let u = unquote(&f);
        holds(&u, "time.timer", true, true) || holds(&u, "microtask", true, true)
    }) || prose.iter().any(|p| {
        holds(p, "schedule(", true, false)
            || holds(p, "virtual time", true, true)
            || holds(p, "timers.", true, false)
    });
    if sched {
        out.push("scheduler".into());
    }
    if !langs.is_empty() {
        out.push("lang-variant".into());
    }
    let cross = dirs.iter().any(|d| {
        if d.name == "ANCHOR" {
            let mut pieces: Vec<String> = vec![d.args.clone()];
            pieces.extend(d.conts.iter().cloned());
            pieces.extend(d.anchors().into_iter().cloned());
            pieces.iter().any(|p| {
                let c: Vec<char> = p.chars().collect();
                has_ref(&unquote(&c))
            })
        } else if d.name == "FIDELITY" || d.name == "VARIANT" {
            let a = d.anchors();
            if a.is_empty() {
                return false;
            }
            let j = a.iter().filter(|s| !s.is_empty()).map(|s| s.as_str()).collect::<Vec<_>>().join("; ");
            let c: Vec<char> = j.chars().collect();
            has_ref(&unquote(&c))
        } else {
            false
        }
    });
    if cross {
        out.push("cross-lang-anchor".into());
    }
    out
}
