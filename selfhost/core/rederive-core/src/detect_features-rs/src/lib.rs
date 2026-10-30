use serde_json::Value;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn opener(c: char) -> bool {
    " \t([{,=:;|<>!&-~".contains(c)
}
fn trim_sp(s: &str) -> &str {
    s.trim_matches(sp)
}
fn trim_chars(s: &[char]) -> String {
    let mut a = 0;
    let mut b = s.len();
    while a < b && sp(s[a]) {
        a += 1;
    }
    while b > a && sp(s[b - 1]) {
        b -= 1;
    }
    s[a..b].iter().collect()
}

fn spans(t: &[char]) -> Vec<(usize, usize)> {
    let n = t.len();
    let mut out = Vec::new();
    let mut last_end: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if t[i] == '"' && (i == 0 || opener(t[i - 1]) || last_end == Some(i - 1)) {
            let mut j = i + 1;
            let mut closed = None;
            while j < n {
                if t[j] == '\\' {
                    j += 2;
                    continue;
                }
                if t[j] == '"' {
                    closed = Some(j);
                    break;
                }
                j += 1;
            }
            match closed {
                None => break,
                Some(c) => {
                    out.push((i, c));
                    last_end = Some(c);
                    i = c + 1;
                }
            }
        } else {
            i += 1;
        }
    }
    out
}

fn inside(sp_: &[(usize, usize)], p: usize) -> bool {
    sp_.iter().any(|&(a, b)| a < p && p < b)
}

fn unquote(t: &[char]) -> Vec<char> {
    let s = spans(t);
    let mut out = Vec::new();
    let mut i = 0;
    for (a, b) in s {
        out.extend_from_slice(&t[i..a]);
        out.push('"');
        out.push('"');
        i = b + 1;
    }
    out.extend_from_slice(&t[i..]);
    out
}

fn split_attrs(p: &[char]) -> (String, Vec<(String, String)>) {
    let n = p.len();
    let sps = spans(p);
    let mut kws: Vec<(&str, usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(p[i]) {
            let mut j = i;
            while j < n && sp(p[j]) {
                j += 1;
            }
            let mut matched = None;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                let e = j + k.len();
                if e <= n && p[j..e] == k[..] && (e == n || sp(p[e])) && !inside(&sps, j) {
                    matched = Some((kw, e));
                    break;
                }
            }
            match matched {
                Some((kw, e)) => {
                    kws.push((kw, i, e));
                    i = e;
                }
                None => i = j,
            }
        } else {
            i += 1;
        }
    }
    if kws.is_empty() {
        return (trim_chars(p), Vec::new());
    }
    let body = trim_chars(&p[..kws[0].1]);
    let mut attrs = Vec::new();
    for (idx, &(kw, _, e)) in kws.iter().enumerate() {
        let end = if idx + 1 < kws.len() { kws[idx + 1].1 } else { n };
        attrs.push((kw.to_string(), trim_chars(&p[e..end])));
    }
    (body, attrs)
}

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
    let c: Vec<char> = t.chars().collect();
    if c.is_empty() || t == "CITED" {
        return false;
    }
    if !c[0].is_ascii_uppercase() {
        return false;
    }
    c[1..].iter().all(|&x| x.is_ascii_uppercase() || x.is_ascii_digit() || x == '-')
}

fn physical_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut raw: Vec<Vec<char>> = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        match cs[i] {
            '\r' => {
                if i + 1 < cs.len() && cs[i + 1] == '\n' {
                    i += 1;
                }
                raw.push(std::mem::take(&mut cur));
            }
            '\n' => raw.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
        i += 1;
    }
    raw.push(cur);
    raw.into_iter()
        .map(|l| {
            let mut out = Vec::new();
            let mut k = 0;
            while k < l.len() && (sp(l[k]) || l[k] == '\u{feff}') {
                if l[k] != '\u{feff}' {
                    out.push(l[k]);
                }
                k += 1;
            }
            out.extend_from_slice(&l[k..]);
            while let Some(&c) = out.last() {
                if sp(c) {
                    out.pop();
                } else {
                    break;
                }
            }
            out
        })
        .filter(|l| !l.is_empty())
        .collect()
}

fn strip_comment(content: &[char]) -> Vec<char> {
    let sps = spans(content);
    let n = content.len();
    for i in 1..n {
        if content[i] == '#'
            && sp(content[i - 1])
            && (i + 1 == n || sp(content[i + 1]))
            && !inside(&sps, i)
        {
            let mut e = i;
            while e > 0 && sp(content[e - 1]) {
                e -= 1;
            }
            return content[..e].to_vec();
        }
    }
    content.to_vec()
}

fn find(h: &[char], tok: &str, open: bool, closed: bool) -> bool {
    let t: Vec<char> = tok.chars().collect();
    let (n, m) = (h.len(), t.len());
    if n < m {
        return false;
    }
    for i in 0..=(n - m) {
        if h[i..i + m] == t[..]
            && (!open || i == 0 || !word(h[i - 1]))
            && (!closed || i + m == n || !word(h[i + m]))
        {
            return true;
        }
    }
    false
}

fn has_ref(h: &[char]) -> bool {
    let n = h.len();
    let t: Vec<char> = "ref(".chars().collect();
    let mut i = 0;
    while i + 4 <= n {
        if h[i..i + 4] == t[..] && (i == 0 || !word(h[i - 1])) {
            let mut j = i + 4;
            while j < n && sp(h[j]) {
                j += 1;
            }
            if j < n && h[j].is_ascii_lowercase() {
                let s = j;
                j += 1;
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
    let n = c.len();
    n >= 4 && c[n - 4..].iter().collect::<String>().eq_ignore_ascii_case(".sir")
}

fn base(p: &str) -> Vec<char> {
    let cs: Vec<char> = p.chars().collect();
    let start = cs.iter().rposition(|&c| c == '/' || c == '\\').map(|i| i + 1).unwrap_or(0);
    let b: String = cs[start..].iter().collect();
    trim_sp(&b).chars().collect()
}

fn unit_name(s: &str) -> bool {
    let c: Vec<char> = s.chars().collect();
    if c.is_empty() {
        return false;
    }
    (c[0].is_ascii_alphanumeric() || c[0] == '_')
        && c[1..].iter().all(|&x| x.is_ascii_alphanumeric() || x == '_' || x == '-')
}

fn suffix(p: &str) -> Option<String> {
    let b = base(p);
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
    let rest: String = b[..b.len() - 4].iter().collect();
    let segs: Vec<&str> = rest.split('.').collect();
    if !segs[0].is_empty() && !unit_name(segs[0]) {
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

fn add(langs: &mut Vec<String>, id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("not in registry");
    }
    if !langs.iter().any(|l| l == id) {
        langs.push(id.to_string());
    }
}

fn langs_of(files: Option<&Value>, variants: Option<&Value>) -> Vec<String> {
    let mut langs: Vec<String> = Vec::new();
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
    match variants {
        None | Some(Value::Null) => {}
        Some(Value::Object(m)) => {
            let mut seen: Vec<String> = Vec::new();
            for (k, v) in m {
                let o = match v {
                    Value::Object(o) => o,
                    _ => panic!("variant not map"),
                };
                let own = match o.get("lang") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    _ => panic!("lang"),
                };
                let mut path_lang: Option<String> = None;
                let mut path_none = false;
                let mut has_sir = false;
                if let Some(s) = o.get("sir") {
                    let s = match s {
                        Value::String(s) => s,
                        _ => panic!("sir"),
                    };
                    has_sir = true;
                    let r = suffix(s);
                    if !ends_tail(&base(s)) {
                        panic!("sir tail");
                    }
                    match r {
                        Some(id) => path_lang = Some(id),
                        None => path_none = true,
                    }
                }
                let mut key_lang: Option<String> = None;
                if k == "package" {
                } else if let Some(r) = k.strip_prefix("lang:") {
                    let c: Vec<char> = r.chars().collect();
                    if c.is_empty()
                        || !c[0].is_ascii_lowercase()
                        || !c[1..].iter().all(|&x| x.is_ascii_lowercase() || x.is_ascii_digit())
                    {
                        panic!("key");
                    }
                    key_lang = Some(r.to_string());
                } else {
                    panic!("key");
                }
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
                    panic!("named differ");
                }
                if (key_lang.is_some() || own.is_some()) && has_sir && path_none {
                    panic!("sir none");
                }
                if named.is_empty() {
                    continue;
                }
                add(&mut langs, &named[0]);
                if seen.contains(&named[0]) {
                    panic!("dup");
                }
                seen.push(named[0].clone());
            }
        }
        _ => panic!("variants"),
    }
    langs
}

pub fn detect_features(input: &Value) -> Vec<String> {
    let get = |k: &str| -> Option<&Value> {
        match input {
            Value::Object(m) => m.get(k),
            Value::Null => panic!("null input"),
            _ => None,
        }
    };
    let sir_text = match get("sirText") {
        None => "",
        Some(Value::String(s)) => s.as_str(),
        _ => panic!("sirText"),
    };
    let carried = get("carriedData");
    let carried_nonempty = match carried {
        None | Some(Value::Null) => false,
        Some(Value::Array(a)) => !a.is_empty(),
        _ => panic!("carriedData"),
    };
    let envelope = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        _ => panic!("envelope"),
    };
    let mode = match get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };
    let langs = langs_of(get("sirFiles"), get("variants"));

    let mut dirs: Vec<Dir> = Vec::new();
    let mut prose: Vec<Vec<char>> = Vec::new();
    for line in physical_lines(sir_text) {
        let indent = line.iter().take_while(|&&c| sp(c)).count();
        let content = &line[indent..];
        if content[0] == '#' {
            continue;
        }
        let mut l = vec![' '];
        l.extend(unquote(&line));
        let (body, _) = split_attrs(&l);
        prose.push(body.chars().collect());

        let code = strip_comment(content);
        let tlen = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
        let mut tok: String = code[..tlen].iter().collect();
        if tok.ends_with(':') {
            tok.pop();
        }
        if indent == 0 && is_name(&tok) {
            let (body, attrs) = split_attrs(&code[tlen..]);
            dirs.push(Dir { name: tok, args: body, conts: Vec::new(), attrs });
        } else if let Some(d) = dirs.last_mut() {
            let mut piece = vec![' '];
            piece.extend_from_slice(&code);
            let (body, attrs) = split_attrs(&piece);
            if !body.is_empty() {
                d.conts.push(body);
            }
            d.attrs.extend(attrs);
        }
    }
    let has = |n: &str| dirs.iter().any(|d| d.name == n);

    let carried_data = carried_nonempty
        || has("CARRIED")
        || dirs.iter().filter(|d| d.name == "CARRIED-DATA").any(|d| {
            let mut texts = vec![d.full()];
            texts.extend(d.attrs.iter().map(|a| a.1.clone()));
            texts.iter().any(|t| {
                let t = trim_sp(t);
                !t.is_empty() && t != "none"
            })
        });
    let env = envelope.map_or(false, |e| !trim_sp(e).is_empty()) || has("ENVELOPE");
    let trace = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().filter(|d| d.name == "ORACLE-CLASS").any(|d| {
            let f: Vec<char> = trim_sp(&d.full()).chars().collect();
            find(&f, "trace", false, false)
                && f.len() >= 5
                && f[..5].iter().collect::<String>() == "trace"
                && (f.len() == 5 || !word(f[5]))
        });
    let par = mode == Some("par") || has("PAR");
    let ring = mode == Some("ring") || has("RING");
    let lifecycle = has("LIFECYCLE") || prose.iter().any(|p| find(p, "setTimer", true, true));
    let scheduler = dirs.iter().filter(|d| d.name == "EFFECT").any(|d| {
        let f = unquote(&d.full().chars().collect::<Vec<char>>());
        find(&f, "time.timer", true, true) || find(&f, "microtask", true, true)
    }) || prose.iter().any(|p| {
        find(p, "schedule(", true, false)
            || find(p, "virtual time", true, true)
            || find(p, "timers.", true, false)
    });
    let lang_variant = !langs.is_empty();
    let cross = dirs.iter().any(|d| {
        if d.name == "ANCHOR" {
            let mut pieces = vec![d.args.clone()];
            pieces.extend(d.conts.iter().cloned());
            pieces.extend(d.anchors().into_iter().cloned());
            pieces.iter().any(|p| has_ref(&unquote(&p.chars().collect::<Vec<char>>())))
        } else if d.name == "FIDELITY" || d.name == "VARIANT" {
            let a = d.anchors();
            if a.is_empty() {
                return false;
            }
            let j = a.iter().filter(|s| !s.is_empty()).map(|s| s.as_str()).collect::<Vec<_>>().join("; ");
            has_ref(&unquote(&j.chars().collect::<Vec<char>>()))
        } else {
            false
        }
    });

    let mut out = vec!["vectors".to_string()];
    let rows = [
        (carried_data, "carried-data"),
        (env, "envelope"),
        (trace, "trace-seam"),
        (par, "par-interleaving"),
        (ring, "ring"),
        (lifecycle, "lifecycle"),
        (scheduler, "scheduler"),
        (lang_variant, "lang-variant"),
        (cross, "cross-lang-anchor"),
    ];
    for (b, n) in rows {
        if b {
            out.push(n.to_string());
        }
    }
    out
}
