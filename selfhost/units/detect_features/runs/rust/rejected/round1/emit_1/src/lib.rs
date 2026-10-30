use serde_json::Value;

fn is_ws(c: char) -> bool {
    matches!(c as u32, 0x9..=0xD | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}
fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}
fn cs(v: &[char]) -> String {
    v.iter().collect()
}

struct Dir {
    name: String,
    args: String,
    cont: Vec<String>,
    attrs: Vec<(String, String)>,
}

fn add_attrs(d: &mut Dir, found: Vec<(String, String)>) {
    for (k, v) in found {
        if let Some(e) = d.attrs.iter_mut().find(|e| e.0 == k) {
            e.1.push_str("; ");
            e.1.push_str(&v);
        } else {
            d.attrs.push((k, v));
        }
    }
}

fn split_piece(p: &[char]) -> (String, Vec<(String, String)>) {
    let n = p.len();
    let kws = ["CITED", "EARNED", "ANCHOR"];
    // (run start, keyword, value start)
    let mut ms: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_st(p[i]) {
            let mut k = i;
            while k < n && is_st(p[k]) {
                k += 1;
            }
            let mut matched = false;
            for kw in kws.iter() {
                let kc: Vec<char> = kw.chars().collect();
                let e = k + kc.len();
                if e <= n && p[k..e] == kc[..] && (e == n || is_st(p[e])) {
                    ms.push((i, kw, e));
                    i = e;
                    matched = true;
                    break;
                }
            }
            if !matched {
                i = k;
            }
        } else {
            i += 1;
        }
    }
    if ms.is_empty() {
        return (trim_ws(&cs(p)).to_string(), Vec::new());
    }
    let body = trim_ws(&cs(&p[..ms[0].0])).to_string();
    let mut out = Vec::new();
    for (idx, m) in ms.iter().enumerate() {
        let end = if idx + 1 < ms.len() { ms[idx + 1].0 } else { n };
        let v = trim_ws(&cs(&p[m.2..end])).to_string();
        out.push((m.1.to_string(), v));
    }
    (body, out)
}

fn is_name(t: &[char]) -> bool {
    if t.is_empty() || !t[0].is_ascii_uppercase() {
        return false;
    }
    t[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn split_lines(s: &str) -> Vec<Vec<char>> {
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let cs: Vec<char> = s.chars().collect();
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

fn parse(text: &str) -> Vec<Dir> {
    let mut dirs: Vec<Dir> = Vec::new();
    for line in split_lines(text) {
        let mut st = 0;
        while st < line.len() && line[st] == '\u{FEFF}' {
            st += 1;
        }
        let mut l: Vec<char> = line[st..].to_vec();
        while let Some(&c) = l.last() {
            if is_st(c) {
                l.pop();
            } else {
                break;
            }
        }
        if l.iter().all(|&c| is_ws(c)) {
            continue;
        }
        let mut ind = 0;
        while ind < l.len() && is_st(l[ind]) {
            ind += 1;
        }
        let content = &l[ind..];
        if content.is_empty() || content[0] == '#' {
            continue;
        }
        let mut code: Vec<char> = content.to_vec();
        for j in 1..content.len() {
            if content[j] == '#' && is_ws(content[j - 1]) && (j + 1 == content.len() || is_ws(content[j + 1])) {
                let mut c = content[..j - 1].to_vec();
                while let Some(&x) = c.last() {
                    if is_ws(x) {
                        c.pop();
                    } else {
                        break;
                    }
                }
                code = c;
                break;
            }
        }
        if ind == 0 {
            let te = code.iter().position(|&c| is_st(c)).unwrap_or(code.len());
            let mut tok = &code[..te];
            if let Some(&':') = tok.last() {
                tok = &tok[..tok.len() - 1];
            }
            if is_name(tok) {
                let mut rs = te;
                while rs < code.len() && is_st(code[rs]) {
                    rs += 1;
                }
                let (body, found) = split_piece(&code[rs..]);
                let mut d = Dir { name: cs(tok), args: body, cont: Vec::new(), attrs: Vec::new() };
                add_attrs(&mut d, found);
                dirs.push(d);
                continue;
            }
        }
        if let Some(d) = dirs.last_mut() {
            let mut piece = vec![' '];
            piece.extend_from_slice(&code);
            let (body, found) = split_piece(&piece);
            d.cont.push(body);
            add_attrs(d, found);
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

fn holds(hay: &[char], needle: &str, open: bool, closed: bool) -> bool {
    let nd: Vec<char> = needle.chars().collect();
    let n = hay.len();
    if nd.len() > n {
        return false;
    }
    for i in 0..=(n - nd.len()) {
        if hay[i..i + nd.len()] != nd[..] {
            continue;
        }
        if open && i > 0 && is_word(hay[i - 1]) {
            continue;
        }
        let e = i + nd.len();
        if closed && e < n && is_word(hay[e]) {
            continue;
        }
        return true;
    }
    false
}

fn anchor_ref(a: &str) -> Option<String> {
    let c: Vec<char> = a.chars().collect();
    let n = c.len();
    let pre: Vec<char> = "ref(".chars().collect();
    for i in 0..n {
        if i + 4 > n || c[i..i + 4] != pre[..] {
            continue;
        }
        if i > 0 && is_word(c[i - 1]) {
            continue;
        }
        let mut j = i + 4;
        while j < n && is_ws(c[j]) {
            j += 1;
        }
        let s = j;
        if j < n && c[j].is_ascii_lowercase() {
            j += 1;
            while j < n && (c[j].is_ascii_lowercase() || c[j].is_ascii_digit()) {
                j += 1;
            }
            if j < n && c[j] == ':' {
                return Some(cs(&c[s..j]));
            }
        }
    }
    None
}

const REG: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn suffix(p: &str) -> Option<String> {
    let b: Vec<char> = p.chars().collect();
    let st = b.iter().rposition(|&c| c == '/' || c == '\\').map(|i| i + 1).unwrap_or(0);
    let base = cs(&b[st..]);
    let base: Vec<char> = trim_ws(&base).chars().collect();
    let n = base.len();
    if n < 4 {
        return None;
    }
    if !cs(&base[n - 4..]).eq_ignore_ascii_case(".sir") {
        return None;
    }
    let rest = &base[..n - 4];
    let d = rest.iter().rposition(|&c| c == '.')?;
    let x = &rest[d + 1..];
    if x.is_empty() {
        None
    } else {
        Some(cs(x))
    }
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
                    _ => panic!("sirFiles element not text"),
                }
            }
        }
        _ => panic!("sirFiles not a list"),
    }
    match variants {
        None | Some(Value::Null) => {}
        Some(Value::Object(m)) => {
            for (k, v) in m {
                let key_lang = k.strip_prefix("lang:").map(|s| s.to_string());
                let own = match v {
                    Value::Object(o) => match o.get("lang") {
                        Some(Value::String(s)) => Some(s.clone()),
                        _ => None,
                    },
                    _ => None,
                };
                if let (Some(a), Some(b)) = (&key_lang, &own) {
                    if a != b {
                        panic!("lang mismatch");
                    }
                }
                if let Some(x) = key_lang.or(own) {
                    out.push(x);
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
        _ => panic!("variants not a map"),
    }
    for l in &out {
        if !REG.contains(&l.as_str()) {
            panic!("language not in registry");
        }
    }
    out
}

pub fn detect_features(input: Value) -> Vec<String> {
    if input.is_null() {
        panic!("null input");
    }
    let empty = serde_json::Map::new();
    let obj = match &input {
        Value::Object(m) => m,
        _ => &empty,
    };
    let sir_text: String = match obj.get("sirText") {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(_) => panic!("sirText not text"),
    };
    let carried = match obj.get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        Some(_) => panic!("carriedData not a list"),
    };
    let envelope = match obj.get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => panic!("envelope not text"),
    };
    let mode = match obj.get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };
    let lg = langs(obj.get("sirFiles"), obj.get("variants"));
    let dirs = parse(&sir_text);
    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let body: Vec<char> = dirs.iter().map(content_text).collect::<Vec<_>>().join("\n").chars().collect();

    let mut res = vec!["vectors".to_string()];
    let mut push = |c: bool, n: &str| {
        if c {
            res.push(n.to_string());
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
                if d.name != "ORACLE-CLASS" {
                    return false;
                }
                let f = full(d);
                let t: Vec<char> = trim_ws(&f).chars().collect();
                t.len() >= 5 && cs(&t[..5]) == "trace" && (t.len() == 5 || !is_word(t[5]))
            }),
        "trace-seam",
    );
    push(mode == Some("par") || has("PAR"), "par-interleaving");
    push(mode == Some("ring") || has("RING"), "ring");
    push(has("LIFECYCLE") || holds(&body, "setTimer", true, true), "lifecycle");
    push(
        dirs.iter().any(|d| {
            if d.name != "EFFECT" {
                return false;
            }
            let f: Vec<char> = full(d).chars().collect();
            holds(&f, "time.timer", true, true) || holds(&f, "microtask", true, true)
        }) || holds(&body, "schedule(", true, false)
            || holds(&body, "virtual time", true, true)
            || holds(&body, "timers.", true, false),
        "scheduler",
    );
    push(!lg.is_empty(), "lang-variant");
    push(
        dirs.iter().any(|d| {
            let reg = |s: &str| anchor_ref(s).map_or(false, |id| REG.contains(&id.as_str()));
            (d.name == "ANCHOR" && reg(&d.args))
                || d.attrs.iter().any(|a| a.0 == "ANCHOR" && reg(&a.1))
        }),
        "cross-lang-anchor",
    );
    res
}
