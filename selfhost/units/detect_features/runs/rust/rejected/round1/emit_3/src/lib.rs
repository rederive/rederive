use serde_json::Value;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn is_ws(c: char) -> bool {
    matches!(c as u32,
        0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}

fn find_tok(h: &[char], t: &str, open: bool, close: bool) -> bool {
    let t: Vec<char> = t.chars().collect();
    if t.len() > h.len() {
        return false;
    }
    for s in 0..=(h.len() - t.len()) {
        if h[s..s + t.len()] != t[..] {
            continue;
        }
        let e = s + t.len();
        let o = !open || s == 0 || !is_word(h[s - 1]);
        let c = !close || e == h.len() || !is_word(h[e]);
        if o && c {
            return true;
        }
    }
    false
}

fn cut_lines(s: &str) -> Vec<String> {
    let cs: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            out.push(std::mem::take(&mut cur));
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn is_name(t: &str) -> bool {
    let c: Vec<char> = t.chars().collect();
    if c.is_empty() || !c[0].is_ascii_uppercase() {
        return false;
    }
    c[1..].iter().all(|&x| x.is_ascii_uppercase() || x.is_ascii_digit() || x == '-')
}

fn split_r6(p: &[char]) -> (String, Vec<(&'static str, String)>) {
    let n = p.len();
    let mut kws: Vec<(usize, &'static str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_st(p[i]) {
            let mut j = i;
            while j < n && is_st(p[j]) {
                j += 1;
            }
            let mut matched = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                let e = j + k.len();
                if e <= n && p[j..e] == k[..] && (e == n || is_st(p[e])) {
                    kws.push((i, kw, e));
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
    let s = |a: usize, b: usize| -> String {
        let t: String = p[a..b].iter().collect();
        trim_ws(&t).to_string()
    };
    if kws.is_empty() {
        return (s(0, n), Vec::new());
    }
    let body = s(0, kws[0].0);
    let mut vals = Vec::new();
    for idx in 0..kws.len() {
        let end = if idx + 1 < kws.len() { kws[idx + 1].0 } else { n };
        vals.push((kws[idx].1, s(kws[idx].2, end)));
    }
    (body, vals)
}

struct Dir {
    name: String,
    args: String,
    cont: Vec<String>,
    attrs: Vec<(String, String)>,
}

fn add_attrs(d: &mut Dir, vals: Vec<(&'static str, String)>) {
    for (k, v) in vals {
        if let Some(e) = d.attrs.iter_mut().find(|e| e.0 == k) {
            e.1.push_str("; ");
            e.1.push_str(&v);
        } else {
            d.attrs.push((k.to_string(), v));
        }
    }
}

fn parse(text: &str) -> Vec<Dir> {
    let mut dirs: Vec<Dir> = Vec::new();
    for raw in cut_lines(text) {
        let l = raw.trim_start_matches('\u{feff}');
        let l = l.trim_end_matches(|c| is_st(c));
        if l.chars().all(is_ws) {
            continue;
        }
        let cs: Vec<char> = l.chars().collect();
        let ind = cs.iter().take_while(|&&c| is_st(c)).count();
        let content = &cs[ind..];
        if content.first() == Some(&'#') {
            continue;
        }
        let mut end = content.len();
        for j in 1..content.len() {
            if content[j] == '#'
                && is_ws(content[j - 1])
                && (j + 1 == content.len() || is_ws(content[j + 1]))
            {
                end = j - 1;
                break;
            }
        }
        let mut code: &[char] = &content[..end];
        while let Some(&c) = code.last() {
            if is_ws(c) {
                code = &code[..code.len() - 1];
            } else {
                break;
            }
        }
        let tl = code.iter().take_while(|&&c| !is_st(c)).count();
        let mut tok: String = code[..tl].iter().collect();
        if tok.ends_with(':') {
            tok.pop();
        }
        if ind == 0 && is_name(&tok) {
            let mut r = tl;
            while r < code.len() && is_st(code[r]) {
                r += 1;
            }
            let (body, vals) = split_r6(&code[r..]);
            let mut d = Dir { name: tok, args: body, cont: Vec::new(), attrs: Vec::new() };
            add_attrs(&mut d, vals);
            dirs.push(d);
        } else if let Some(d) = dirs.last_mut() {
            let mut p = vec![' '];
            p.extend_from_slice(code);
            let (body, vals) = split_r6(&p);
            d.cont.push(body);
            add_attrs(d, vals);
        }
    }
    dirs
}

fn full(d: &Dir) -> String {
    let mut v = vec![d.args.clone()];
    v.extend(d.cont.iter().cloned());
    v.join(" ")
}

fn content_text(d: &Dir) -> String {
    let mut v = vec![d.args.clone()];
    v.extend(d.cont.iter().cloned());
    v.extend(d.attrs.iter().map(|a| a.1.clone()));
    v.join(" ")
}

fn anchor_ref(a: &str) -> Option<String> {
    let c: Vec<char> = a.chars().collect();
    let pat: Vec<char> = "ref(".chars().collect();
    let n = c.len();
    for p in 0..n {
        if p + 4 > n || c[p..p + 4] != pat[..] {
            continue;
        }
        if p > 0 && is_word(c[p - 1]) {
            continue;
        }
        let mut q = p + 4;
        while q < n && is_ws(c[q]) {
            q += 1;
        }
        if q >= n || !c[q].is_ascii_lowercase() {
            continue;
        }
        let s = q;
        q += 1;
        while q < n && (c[q].is_ascii_lowercase() || c[q].is_ascii_digit()) {
            q += 1;
        }
        if q < n && c[q] == ':' {
            return Some(c[s..q].iter().collect());
        }
    }
    None
}

fn suffix(p: &str) -> Option<String> {
    let b = p.rsplit(|c| c == '/' || c == '\\').next().unwrap_or("");
    let b: Vec<char> = trim_ws(b).chars().collect();
    if b.len() < 4 {
        return None;
    }
    let tail: String = b[b.len() - 4..].iter().collect();
    if !tail.eq_ignore_ascii_case(".sir") {
        return None;
    }
    let stem = &b[..b.len() - 4];
    let dot = stem.iter().rposition(|&c| c == '.')?;
    let x = &stem[dot + 1..];
    if x.is_empty() {
        return None;
    }
    Some(x.iter().collect())
}

fn langs(sir_files: Option<&Value>, variants: Option<&Value>) -> Vec<String> {
    let mut out = Vec::new();
    match sir_files {
        None | Some(Value::Null) => {}
        Some(Value::Array(a)) => {
            for e in a {
                match e {
                    Value::String(s) => {
                        if let Some(x) = suffix(s) {
                            out.push(x);
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
            for (k, v) in m {
                let key = k.strip_prefix("lang:").map(|s| s.to_string());
                let own = match v {
                    Value::Object(o) => match o.get("lang") {
                        Some(Value::String(s)) => Some(s.clone()),
                        _ => None,
                    },
                    _ => None,
                };
                if let (Some(a), Some(b)) = (&key, &own) {
                    if a != b {
                        panic!("lang mismatch");
                    }
                }
                if let Some(a) = key {
                    out.push(a);
                } else if let Some(b) = own {
                    out.push(b);
                }
                if let Value::Object(o) = v {
                    if let Some(Value::String(s)) = o.get("sir") {
                        if let Some(x) = suffix(s) {
                            out.push(x);
                        }
                    }
                }
            }
        }
        _ => panic!("variants"),
    }
    for l in &out {
        if !REGISTRY.contains(&l.as_str()) {
            panic!("language not in registry");
        }
    }
    out
}

pub fn detect_features(input: Value) -> Vec<String> {
    let empty = serde_json::Map::new();
    let m = match &input {
        Value::Null => panic!("null input"),
        Value::Object(m) => m,
        _ => &empty,
    };
    let sir_text: String = match m.get("sirText") {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        _ => panic!("sirText"),
    };
    let carried = match m.get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        _ => panic!("carriedData"),
    };
    let envelope = match m.get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        _ => panic!("envelope"),
    };
    let mode = match m.get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };
    let lg = langs(m.get("sirFiles"), m.get("variants"));
    let dirs = parse(&sir_text);
    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let body: Vec<char> = dirs.iter().map(content_text).collect::<Vec<_>>().join("\n").chars().collect();

    let mut r = vec!["vectors".to_string()];
    let mut push = |c: bool, n: &str| {
        if c {
            r.push(n.to_string());
        }
    };

    push(
        carried.map_or(false, |a| !a.is_empty())
            || has("CARRIED")
            || dirs.iter().any(|d| {
                d.name == "CARRIED-DATA" && {
                    let f = full(d);
                    let t = trim_ws(&f);
                    !t.is_empty() && t != "none"
                }
            }),
        "carried-data",
    );
    push(envelope.map_or(false, |e| !trim_ws(e).is_empty()) || has("ENVELOPE"), "envelope");
    push(
        mode == Some("trace")
            || has("TRACE-SEAM")
            || dirs.iter().any(|d| {
                d.name == "ORACLE-CLASS" && {
                    let f: Vec<char> = trim_ws(&full(d)).chars().collect();
                    f.len() >= 5
                        && f[..5].iter().collect::<String>() == "trace"
                        && (f.len() == 5 || !is_word(f[5]))
                }
            }),
        "trace-seam",
    );
    push(mode == Some("par") || has("PAR"), "par-interleaving");
    push(mode == Some("ring") || has("RING"), "ring");
    push(has("LIFECYCLE") || find_tok(&body, "setTimer", true, true), "lifecycle");
    push(
        dirs.iter().any(|d| {
            d.name == "EFFECT" && {
                let f: Vec<char> = full(d).chars().collect();
                find_tok(&f, "time.timer", true, true) || find_tok(&f, "microtask", true, true)
            }
        }) || find_tok(&body, "schedule(", true, false)
            || find_tok(&body, "virtual time", true, true)
            || find_tok(&body, "timers.", true, false),
        "scheduler",
    );
    push(!lg.is_empty(), "lang-variant");
    push(
        dirs.iter().any(|d| {
            let reg = |s: &str| anchor_ref(s).map_or(false, |id| REGISTRY.contains(&id.as_str()));
            (d.name == "ANCHOR" && reg(&d.args))
                || d.attrs.iter().any(|a| a.0 == "ANCHOR" && reg(&a.1))
        }),
        "cross-lang-anchor",
    );
    r
}
