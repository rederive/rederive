use serde_json::Value;

fn is_ws(c: char) -> bool {
    matches!(c as u32, 9..=13 | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
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

fn has_tok(text: &str, tok: &str, open: bool, close: bool) -> bool {
    let t: Vec<char> = text.chars().collect();
    let k: Vec<char> = tok.chars().collect();
    if k.len() > t.len() {
        return false;
    }
    for i in 0..=(t.len() - k.len()) {
        if t[i..i + k.len()] != k[..] {
            continue;
        }
        if open && i > 0 && is_word(t[i - 1]) {
            continue;
        }
        if close && i + k.len() < t.len() && is_word(t[i + k.len()]) {
            continue;
        }
        return true;
    }
    false
}

fn split_lines(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out
}

fn split_r6(piece: &str) -> (String, Vec<(String, String)>) {
    let c: Vec<char> = piece.chars().collect();
    let n = c.len();
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut found: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_st(c[i]) {
            let mut k = i;
            while k < n && is_st(c[k]) {
                k += 1;
            }
            let mut matched = false;
            for kw in kws.iter() {
                let kc: Vec<char> = kw.chars().collect();
                if k + kc.len() <= n
                    && c[k..k + kc.len()] == kc[..]
                    && (k + kc.len() == n || is_st(c[k + kc.len()]))
                {
                    found.push((i, kw, k + kc.len()));
                    i = k + kc.len();
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
    let sub = |a: usize, b: usize| -> String {
        let s: String = c[a..b].iter().collect();
        trim_ws(&s).to_string()
    };
    if found.is_empty() {
        return (sub(0, n), Vec::new());
    }
    let body = sub(0, found[0].0);
    let mut attrs = Vec::new();
    for (idx, f) in found.iter().enumerate() {
        let end = if idx + 1 < found.len() { found[idx + 1].0 } else { n };
        attrs.push((f.1.to_string(), sub(f.2, end)));
    }
    (body, attrs)
}

struct Dir {
    name: String,
    args: String,
    cont: Vec<String>,
    attrs: Vec<(String, String)>,
}

fn add_attrs(d: &mut Dir, list: Vec<(String, String)>) {
    for (k, v) in list {
        if let Some(e) = d.attrs.iter_mut().find(|e| e.0 == k) {
            e.1.push_str("; ");
            e.1.push_str(&v);
        } else {
            d.attrs.push((k, v));
        }
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

fn parse(text: &str) -> Vec<Dir> {
    let mut dirs: Vec<Dir> = Vec::new();
    for raw in split_lines(text) {
        let l = raw.trim_start_matches('\u{FEFF}');
        let l = l.trim_end_matches(is_st);
        if l.chars().all(is_ws) {
            continue;
        }
        let indent = l.chars().take_while(|&c| is_st(c)).count();
        let content: Vec<char> = l.chars().skip(indent).collect();
        if content[0] == '#' {
            continue;
        }
        let mut code_end = content.len();
        for j in 1..content.len() {
            if content[j] == '#' && is_ws(content[j - 1]) && (j + 1 == content.len() || is_ws(content[j + 1])) {
                code_end = j - 1;
                break;
            }
        }
        let code_s: String = content[..code_end].iter().collect();
        let code = code_s.trim_end_matches(is_ws).to_string();
        if indent == 0 {
            let tok_end = code.find(is_st).unwrap_or(code.len());
            let tok = &code[..tok_end];
            let tok = tok.strip_suffix(':').unwrap_or(tok);
            if is_name(tok) {
                let rest = code[tok_end..].trim_start_matches(is_st);
                let (body, attrs) = split_r6(rest);
                let mut d = Dir { name: tok.to_string(), args: body, cont: Vec::new(), attrs: Vec::new() };
                add_attrs(&mut d, attrs);
                dirs.push(d);
                continue;
            }
        }
        if let Some(d) = dirs.last_mut() {
            let (body, attrs) = split_r6(&format!(" {}", code));
            d.cont.push(body);
            add_attrs(d, attrs);
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

fn suffix(p: &str) -> Option<String> {
    let b = p.rsplit(|c| c == '/' || c == '\\').next().unwrap_or(p);
    let b: Vec<char> = trim_ws(b).chars().collect();
    if b.len() < 4 {
        return None;
    }
    let tail: String = b[b.len() - 4..].iter().collect();
    if !tail.eq_ignore_ascii_case(".sir") {
        return None;
    }
    let pre = &b[..b.len() - 4];
    let dot = pre.iter().rposition(|&c| c == '.')?;
    let x = &pre[dot + 1..];
    if x.is_empty() {
        return None;
    }
    Some(x.iter().collect())
}

fn registered(s: &str) -> bool {
    matches!(s, "js" | "ts" | "rust" | "php" | "csharp" | "python")
}

fn langs(files: &Value, variants: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    match files {
        Value::Null => {}
        Value::Array(a) => {
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
        Value::Null => {}
        Value::Object(m) => {
            for (k, v) in m {
                let key_lang = k.strip_prefix("lang:");
                let own = match v.get("lang") {
                    Some(Value::String(s)) if v.is_object() => Some(s.as_str()),
                    _ => None,
                };
                if let (Some(a), Some(b)) = (key_lang, own) {
                    if a != b {
                        panic!("lang mismatch");
                    }
                }
                if let Some(a) = key_lang {
                    out.push(a.to_string());
                } else if let Some(b) = own {
                    out.push(b.to_string());
                }
                if let Some(Value::String(s)) = v.get("sir") {
                    if v.is_object() {
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
        if !registered(l) {
            panic!("not in registry");
        }
    }
    out
}

fn anchor_ref(a: &str) -> Option<String> {
    let c: Vec<char> = a.chars().collect();
    let k: Vec<char> = "ref(".chars().collect();
    let n = c.len();
    let mut i = 0;
    while i + k.len() <= n {
        if c[i..i + k.len()] == k[..] && (i == 0 || !is_word(c[i - 1])) {
            let mut p = i + k.len();
            while p < n && is_ws(c[p]) {
                p += 1;
            }
            if p < n && c[p].is_ascii_lowercase() {
                let s = p;
                p += 1;
                while p < n && (c[p].is_ascii_lowercase() || c[p].is_ascii_digit()) {
                    p += 1;
                }
                if p < n && c[p] == ':' {
                    return Some(c[s..p].iter().collect());
                }
            }
        }
        i += 1;
    }
    None
}

pub fn detect_features(input: Value) -> Vec<String> {
    if input.is_null() {
        panic!("null input");
    }
    let get = |k: &str| -> Option<&Value> { input.as_object().and_then(|m| m.get(k)) };
    let sir_text: &str = match get("sirText") {
        None => "",
        Some(Value::String(s)) => s.as_str(),
        Some(_) => panic!("sirText"),
    };
    let carried = match get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        Some(_) => panic!("carriedData"),
    };
    let envelope = match get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => panic!("envelope"),
    };
    let mode = match get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };
    let null = Value::Null;
    let lg = langs(get("sirFiles").unwrap_or(&null), get("variants").unwrap_or(&null));

    let dirs = parse(sir_text);
    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let body: String = dirs.iter().map(content_text).collect::<Vec<_>>().join("\n");

    let mut out = vec!["vectors".to_string()];
    let carried_on = carried.map_or(false, |a| !a.is_empty())
        || has("CARRIED")
        || dirs.iter().any(|d| {
            d.name == "CARRIED-DATA" && {
                let f = full(d);
                let t = trim_ws(&f);
                !t.is_empty() && t != "none"
            }
        });
    if carried_on {
        out.push("carried-data".into());
    }
    if envelope.map_or(false, |e| !trim_ws(e).is_empty()) || has("ENVELOPE") {
        out.push("envelope".into());
    }
    let trace = mode == Some("trace")
        || has("TRACE-SEAM")
        || dirs.iter().any(|d| {
            d.name == "ORACLE-CLASS" && {
                let f = full(d);
                let t: Vec<char> = trim_ws(&f).chars().collect();
                t.len() >= 5 && t[..5].iter().collect::<String>() == "trace" && (t.len() == 5 || !is_word(t[5]))
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
    if has("LIFECYCLE") || has_tok(&body, "setTimer", true, true) {
        out.push("lifecycle".into());
    }
    let sched = dirs.iter().any(|d| {
        d.name == "EFFECT" && {
            let f = full(d);
            has_tok(&f, "time.timer", true, true) || has_tok(&f, "microtask", true, true)
        }
    }) || has_tok(&body, "schedule(", true, false)
        || has_tok(&body, "virtual time", true, true)
        || has_tok(&body, "timers.", true, false);
    if sched {
        out.push("scheduler".into());
    }
    if !lg.is_empty() {
        out.push("lang-variant".into());
    }
    let cross = dirs.iter().any(|d| {
        let a = d.name == "ANCHOR" && anchor_ref(&d.args).map_or(false, |x| registered(&x));
        let b = d
            .attrs
            .iter()
            .find(|e| e.0 == "ANCHOR")
            .map_or(false, |e| anchor_ref(&e.1).map_or(false, |x| registered(&x)));
        a || b
    });
    if cross {
        out.push("cross-lang-anchor".into());
    }
    out
}
