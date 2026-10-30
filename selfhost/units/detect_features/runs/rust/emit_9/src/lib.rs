use serde_json::Value;
use std::collections::HashSet;

const REG: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];
const OPENERS: &str = " \t([{,=:;|<>!&-~";

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn trim(c: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = c.len();
    while a < b && sp(c[a]) {
        a += 1;
    }
    while b > a && sp(c[b - 1]) {
        b -= 1;
    }
    &c[a..b]
}
fn s(c: &[char]) -> String {
    c.iter().collect()
}
fn trim_str(t: &str) -> String {
    let v: Vec<char> = t.chars().collect();
    s(trim(&v))
}

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    let n = c.len();
    let mut out = Vec::new();
    let mut i = 0;
    let mut prev_close: Option<usize> = None;
    while i < n {
        if c[i] == '"' && (i == 0 || OPENERS.contains(c[i - 1]) || prev_close.map_or(false, |p| p + 1 == i)) {
            let mut j = i + 1;
            let mut closed = None;
            while j < n {
                if c[j] == '\\' {
                    j += 2;
                } else if c[j] == '"' {
                    closed = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match closed {
                Some(cl) => {
                    out.push((i, cl));
                    prev_close = Some(cl);
                    i = cl + 1;
                }
                None => break,
            }
        } else {
            i += 1;
        }
    }
    out
}

fn unquote(c: &[char]) -> Vec<char> {
    let sp_ = spans(c);
    let mut out = Vec::new();
    let mut i = 0;
    for (o, cl) in sp_ {
        out.extend_from_slice(&c[i..o]);
        out.push('"');
        out.push('"');
        i = cl + 1;
    }
    out.extend_from_slice(&c[i..]);
    out
}

fn inside(sps: &[(usize, usize)], i: usize) -> bool {
    sps.iter().any(|&(o, c)| o < i && i < c)
}

fn split_attrs(c: &[char]) -> (String, Vec<(String, String)>) {
    let n = c.len();
    let sps = spans(c);
    let mut ms: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(c[i]) {
            let mut j = i;
            while j < n && sp(c[j]) {
                j += 1;
            }
            let mut next = j;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                if j + k.len() <= n && c[j..j + k.len()] == k[..] && (j + k.len() == n || sp(c[j + k.len()])) {
                    if !inside(&sps, j) {
                        ms.push((i, kw, j + k.len()));
                    }
                    next = j + k.len();
                    break;
                }
            }
            i = next;
        } else {
            i += 1;
        }
    }
    if ms.is_empty() {
        return (s(trim(c)), Vec::new());
    }
    let body = s(trim(&c[..ms[0].0]));
    let mut attrs = Vec::new();
    for k in 0..ms.len() {
        let end = if k + 1 < ms.len() { ms[k + 1].0 } else { n };
        attrs.push((ms[k].1.to_string(), s(trim(&c[ms[k].2..end]))));
    }
    (body, attrs)
}

fn find_comment(c: &[char]) -> Vec<char> {
    let sps = spans(c);
    let n = c.len();
    for i in 1..n {
        if c[i] == '#' && sp(c[i - 1]) && (i + 1 == n || sp(c[i + 1])) && !inside(&sps, i) {
            let mut e = i;
            while e > 0 && sp(c[e - 1]) {
                e -= 1;
            }
            return c[..e].to_vec();
        }
    }
    c.to_vec()
}

fn is_name(t: &[char]) -> bool {
    if t.is_empty() || !t[0].is_ascii_uppercase() {
        return false;
    }
    t[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Dir {
    name: String,
    args: String,
    cont: Vec<String>,
    attrs: Vec<(String, String)>,
}

impl Dir {
    fn full(&self) -> String {
        let mut v = vec![self.args.clone()];
        v.extend(self.cont.iter().cloned());
        v.join(" ")
    }
    fn anchors(&self) -> Vec<&String> {
        self.attrs.iter().filter(|a| a.0 == "ANCHOR").map(|a| &a.1).collect()
    }
}

fn tok(text: &[char], t: &str, open: bool, closed: bool) -> bool {
    let k: Vec<char> = t.chars().collect();
    let n = text.len();
    if k.len() > n {
        return false;
    }
    for p in 0..=(n - k.len()) {
        if text[p..p + k.len()] == k[..] {
            if open && p > 0 && word(text[p - 1]) {
                continue;
            }
            if closed && p + k.len() < n && word(text[p + k.len()]) {
                continue;
            }
            return true;
        }
    }
    false
}

fn has_ref(text: &[char]) -> bool {
    let n = text.len();
    let k: Vec<char> = "ref(".chars().collect();
    if n < 4 {
        return false;
    }
    for p in 0..=(n - 4) {
        if text[p..p + 4] != k[..] || (p > 0 && word(text[p - 1])) {
            continue;
        }
        let mut q = p + 4;
        while q < n && sp(text[q]) {
            q += 1;
        }
        let st = q;
        if q < n && text[q].is_ascii_lowercase() {
            q += 1;
            while q < n && (text[q].is_ascii_lowercase() || text[q].is_ascii_digit()) {
                q += 1;
            }
            if q < n && text[q] == ':' && REG.contains(&s(&text[st..q]).as_str()) {
                return true;
            }
        }
    }
    false
}

fn split_lines(t: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = t.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' || c == '\n' {
            if c == '\r' && i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn norm_line(l: &[char]) -> Vec<char> {
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

fn path_b(p: &str) -> Vec<char> {
    let cs: Vec<char> = p.chars().collect();
    let st = cs.iter().rposition(|&c| c == '/' || c == '\\').map_or(0, |i| i + 1);
    trim(&cs[st..]).to_vec()
}

fn ends_tail(b: &[char]) -> bool {
    let n = b.len();
    if n < 4 {
        return false;
    }
    let t = ['.', 's', 'i', 'r'];
    (0..4).all(|i| b[n - 4 + i].to_ascii_lowercase() == t[i] && (b[n - 4 + i].is_ascii()))
}

fn suffix(p: &str) -> Option<String> {
    let b = path_b(p);
    let mut e = b.len();
    while e > 0 && !('\u{21}'..='\u{7e}').contains(&b[e - 1]) {
        e -= 1;
    }
    if e < b.len() {
        if ends_tail(&b[..e]) {
            panic!("hidden tail");
        }
        return None;
    }
    if !ends_tail(&b) {
        return None;
    }
    let rest = &b[..b.len() - 4];
    let segs: Vec<&[char]> = rest.split(|&c| c == '.').collect();
    let f = segs[0];
    if !f.is_empty() {
        let ok = (f[0].is_ascii_alphanumeric() || f[0] == '_')
            && f[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-');
        if !ok {
            panic!("unit name");
        }
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
    Some(s(segs[1]))
}

fn add(langs: &mut HashSet<String>, id: &str) {
    if !REG.contains(&id) {
        panic!("registry");
    }
    langs.insert(id.to_string());
}

fn langs_of(sir_files: Option<&Value>, variants: Option<&Value>) -> bool {
    let mut langs: HashSet<String> = HashSet::new();
    match sir_files {
        None | Some(Value::Null) => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(p) => {
                        if let Some(id) = suffix(p) {
                            add(&mut langs, &id);
                        }
                    }
                    _ => panic!("sirFiles element"),
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
                let vm = match v {
                    Value::Object(o) => o,
                    _ => panic!("variant"),
                };
                let own = match vm.get("lang") {
                    None => None,
                    Some(Value::String(t)) => Some(t.clone()),
                    _ => panic!("lang"),
                };
                let mut path: Option<Option<String>> = None;
                match vm.get("sir") {
                    None => {}
                    Some(Value::String(t)) => {
                        let sf = suffix(t);
                        if !ends_tail(&path_b(t)) {
                            panic!("sir tail");
                        }
                        path = Some(sf);
                    }
                    _ => panic!("sir"),
                }
                let key_lang: Option<String> = if k == "package" {
                    None
                } else if let Some(r) = k.strip_prefix("lang:") {
                    let b = r.as_bytes();
                    if !b.is_empty()
                        && b[0].is_ascii_lowercase()
                        && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
                    {
                        Some(r.to_string())
                    } else {
                        panic!("key")
                    }
                } else {
                    panic!("key")
                };
                let mut named: Vec<String> = Vec::new();
                if let Some(x) = &key_lang {
                    named.push(x.clone());
                }
                if let Some(x) = &own {
                    named.push(x.clone());
                }
                if let Some(Some(x)) = &path {
                    named.push(x.clone());
                }
                if named.iter().any(|x| *x != named[0]) {
                    panic!("differ");
                }
                if (key_lang.is_some() || own.is_some()) && matches!(path, Some(None)) {
                    panic!("none suffix");
                }
                if named.is_empty() {
                    continue;
                }
                add(&mut langs, &named[0]);
                if !seen.insert(named[0].clone()) {
                    panic!("dup");
                }
            }
        }
        _ => panic!("variants"),
    }
    !langs.is_empty()
}

pub fn detect_features(input: &Value) -> Vec<String> {
    let obj = match input {
        Value::Null => panic!("null input"),
        Value::Object(m) => Some(m),
        _ => None,
    };
    let get = |k: &str| obj.and_then(|m| m.get(k));
    let sir_text: String = match get("sirText") {
        None => String::new(),
        Some(Value::String(t)) => t.clone(),
        _ => panic!("sirText"),
    };
    let carried = match get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        _ => panic!("carriedData"),
    };
    let envelope = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(t)) => Some(t.clone()),
        _ => panic!("envelope"),
    };
    let mode: Option<&str> = match get("mode") {
        Some(Value::String(t)) => Some(t.as_str()),
        _ => None,
    };
    let lang_variant = langs_of(get("sirFiles"), get("variants"));

    let mut dirs: Vec<Dir> = Vec::new();
    let mut prose: Vec<Vec<char>> = Vec::new();
    for raw in split_lines(&sir_text) {
        let line = norm_line(&raw);
        if line.is_empty() {
            continue;
        }
        let ind = line.iter().take_while(|&&c| sp(c)).count();
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        let mut l = vec![' '];
        l.extend(unquote(&line));
        let (pb, _) = split_attrs(&l);
        prose.push(pb.chars().collect());

        let code = find_comment(content);
        let mut tl = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
        let mut name_chars: &[char] = &code[..tl];
        if let Some((&':', head)) = name_chars.split_last() {
            name_chars = head;
        }
        let name = s(name_chars);
        let _ = &mut tl;
        if ind == 0 && is_name(name_chars) && name != "CITED" {
            let (body, attrs) = split_attrs(&code[tl..]);
            dirs.push(Dir { name, args: body, cont: Vec::new(), attrs });
        } else if let Some(d) = dirs.last_mut() {
            let mut piece = vec![' '];
            piece.extend_from_slice(&code);
            let (body, attrs) = split_attrs(&piece);
            if !body.is_empty() {
                d.cont.push(body);
            }
            d.attrs.extend(attrs);
        }
    }
    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let mut out = vec!["vectors".to_string()];

    let mut cd = carried.map_or(false, |a| !a.is_empty()) || has("CARRIED");
    if !cd {
        for d in dirs.iter().filter(|d| d.name == "CARRIED-DATA") {
            let mut texts = vec![d.full()];
            texts.extend(d.attrs.iter().map(|a| a.1.clone()));
            if texts.iter().any(|t| {
                let t = trim_str(t);
                !t.is_empty() && t != "none"
            }) {
                cd = true;
            }
        }
    }
    if cd {
        out.push("carried-data".into());
    }
    if envelope.map_or(false, |e| !trim_str(&e).is_empty()) || has("ENVELOPE") {
        out.push("envelope".into());
    }
    let trace = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().filter(|d| d.name == "ORACLE-CLASS").any(|d| {
            let f: Vec<char> = d.full().chars().collect();
            let t = trim(&f);
            tok(&t.iter().take(5).cloned().collect::<Vec<_>>(), "trace", false, false)
                && t.len() >= 5
                && (t.len() == 5 || !word(t[5]))
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
    if has("LIFECYCLE") || prose.iter().any(|p| tok(p, "setTimer", true, true)) {
        out.push("lifecycle".into());
    }
    let sched = dirs.iter().filter(|d| d.name == "EFFECT").any(|d| {
        let u = unquote(&d.full().chars().collect::<Vec<_>>());
        tok(&u, "time.timer", true, true) || tok(&u, "microtask", true, true)
    }) || prose.iter().any(|p| {
        tok(p, "schedule(", true, false) || tok(p, "virtual time", true, true) || tok(p, "timers.", true, false)
    });
    if sched {
        out.push("scheduler".into());
    }
    if lang_variant {
        out.push("lang-variant".into());
    }
    let ur = |t: &str| has_ref(&unquote(&t.chars().collect::<Vec<_>>()));
    let cross = dirs.iter().any(|d| {
        if d.name == "ANCHOR" {
            ur(&d.args) || d.cont.iter().any(|c| ur(c)) || d.anchors().iter().any(|a| ur(a))
        } else if d.name == "FIDELITY" || d.name == "VARIANT" {
            let a: Vec<&str> = d.anchors().iter().map(|x| x.as_str()).filter(|x| !x.is_empty()).collect();
            !a.is_empty() && ur(&a.join("; "))
        } else {
            false
        }
    });
    if cross {
        out.push("cross-lang-anchor".into());
    }
    out
}
