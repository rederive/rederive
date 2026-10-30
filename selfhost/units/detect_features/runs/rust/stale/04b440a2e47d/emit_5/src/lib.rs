use serde_json::Value;

const REGISTRY: [&str; 6] = ["js", "ts", "rust", "php", "csharp", "python"];

fn is_ws(c: char) -> bool {
    matches!(c as u32,
        0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
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

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}

fn trim_sp(s: &str) -> &str {
    s.trim_matches(sp)
}

fn has_token(text: &str, tok: &str, open: bool, closed: bool) -> bool {
    let c: Vec<char> = text.chars().collect();
    let t: Vec<char> = tok.chars().collect();
    let (n, m) = (c.len(), t.len());
    if m > n {
        return false;
    }
    for i in 0..=(n - m) {
        if c[i..i + m] != t[..] {
            continue;
        }
        if open && i > 0 && is_word(c[i - 1]) {
            continue;
        }
        if closed && i + m < n && is_word(c[i + m]) {
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
                let s = j;
                j += 1;
                while j < n && (c[j].is_ascii_lowercase() || c[j].is_ascii_digit()) {
                    j += 1;
                }
                if j < n && c[j] == ':' {
                    let id: String = c[s..j].iter().collect();
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

fn split_attrs(piece: &str) -> (String, Vec<(String, String)>) {
    let c: Vec<char> = piece.chars().collect();
    let n = c.len();
    let mut kws: Vec<(usize, &str, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(c[i]) {
            let mut r = i;
            while r < n && sp(c[r]) {
                r += 1;
            }
            let mut matched = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                let e = r + k.len();
                if e <= n && c[r..e] == k[..] && (e == n || sp(c[e])) {
                    kws.push((i, kw, e));
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
    if kws.is_empty() {
        return (trim_sp(piece).to_string(), Vec::new());
    }
    let body: String = c[..kws[0].0].iter().collect();
    let mut out = Vec::new();
    for (idx, (_, kw, vs)) in kws.iter().enumerate() {
        let end = if idx + 1 < kws.len() { kws[idx + 1].0 } else { n };
        let v: String = c[*vs..end.max(*vs)].iter().collect();
        out.push((kw.to_string(), trim_sp(&v).to_string()));
    }
    (trim_sp(&body).to_string(), out)
}

struct Dir {
    name: String,
    args: String,
    cont: Vec<String>,
    attrs: Vec<(String, Vec<String>)>,
}

fn add_attrs(d: &mut Dir, list: Vec<(String, String)>) {
    for (k, v) in list {
        if let Some(e) = d.attrs.iter_mut().find(|(n, _)| *n == k) {
            e.1.push(v);
        } else {
            d.attrs.push((k, vec![v]));
        }
    }
}

fn is_name(t: &str) -> bool {
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

fn comment_cut(content: &str) -> String {
    let c: Vec<char> = content.chars().collect();
    let n = c.len();
    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] == '"' {
            let mut j = i + 1;
            let mut closed = None;
            loop {
                if j >= n {
                    break;
                }
                if c[j] == '\\' {
                    if j + 1 >= n || matches!(c[j + 1], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                        break;
                    }
                    j += 2;
                } else if c[j] == '"' {
                    closed = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match closed {
                Some(e) => {
                    spans.push((i, e));
                    i = e + 1;
                }
                None => i += 1,
            }
        } else {
            i += 1;
        }
    }
    for i in 1..n {
        if c[i] == '#'
            && sp(c[i - 1])
            && (i + 1 >= n || sp(c[i + 1]))
            && !spans.iter().any(|&(o, e)| o < i && i < e)
        {
            let s: String = c[..i].iter().collect();
            return trim_sp(&s).to_string();
        }
    }
    content.to_string()
}

fn suffix(p: &str) -> Option<String> {
    let b0 = match p.rfind(|c| c == '/' || c == '\\') {
        Some(i) => &p[i + 1..],
        None => p,
    };
    let b: Vec<char> = trim_sp(b0).chars().collect();
    let mut e = b.len();
    while e > 0 && is_hidden(b[e - 1]) {
        e -= 1;
    }
    if e < b.len() && e >= 4 {
        let (a, s, i, r) = (b[e - 4], b[e - 3], b[e - 2], b[e - 1]);
        if a == '.' && matches!(s, 's' | 'S' | '\u{17F}') && matches!(i, 'i' | 'I') && matches!(r, 'r' | 'R') {
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

fn add_lang(set: &mut Vec<String>, id: &str) {
    if !REGISTRY.contains(&id) {
        panic!("registry");
    }
    if !set.iter().any(|s| s == id) {
        set.push(id.to_string());
    }
}

pub fn detect_features(input: &Value) -> Vec<String> {
    if input.is_null() {
        panic!("null");
    }
    let empty = serde_json::Map::new();
    let obj = input.as_object().unwrap_or(&empty);
    let sir_text: &str = match obj.get("sirText") {
        None => "",
        Some(Value::String(s)) => s,
        Some(_) => panic!("sirText"),
    };
    let carried = match obj.get("carriedData") {
        None | Some(Value::Null) => None,
        Some(Value::Array(a)) => Some(a),
        Some(_) => panic!("carriedData"),
    };
    let envelope = match obj.get("envelope") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(s.as_str()),
        Some(_) => panic!("envelope"),
    };
    let mode = match obj.get("mode") {
        Some(Value::String(s)) => Some(s.as_str()),
        _ => None,
    };

    let mut dirs: Vec<Dir> = Vec::new();
    let mut prose: Vec<String> = Vec::new();
    for raw in split_lines(sir_text) {
        let line = trim_sp(raw.trim_start_matches('\u{FEFF}').trim_end_matches(sp));
        let line = raw
            .trim_start_matches('\u{FEFF}')
            .trim_end_matches(sp)
            .to_string()
            .clone()
            + if line.is_empty() { "" } else { "" };
        if line.is_empty() {
            continue;
        }
        let content = line.trim_start_matches(sp);
        let indent = line.len() - content.len();
        if content.starts_with('#') {
            continue;
        }
        prose.push(line.clone());
        let code = comment_cut(content);
        let tok_end = code.find(sp).unwrap_or(code.len());
        let token = &code[..tok_end];
        let tname = token.strip_suffix(':').unwrap_or(token);
        if indent == 0 && is_name(tname) {
            let (args, at) = split_attrs(&code[tok_end..]);
            let mut d = Dir { name: tname.to_string(), args, cont: Vec::new(), attrs: Vec::new() };
            add_attrs(&mut d, at);
            dirs.push(d);
        } else if let Some(d) = dirs.last_mut() {
            let (body, at) = split_attrs(&format!(" {}", code));
            if !body.is_empty() {
                d.cont.push(body);
            }
            add_attrs(d, at);
        }
    }

    let has = |n: &str| dirs.iter().any(|d| d.name == n);
    let full = |d: &Dir| {
        let mut v = vec![d.args.clone()];
        v.extend(d.cont.iter().cloned());
        v.join(" ")
    };

    // LANGS
    let mut langs: Vec<String> = Vec::new();
    match obj.get("sirFiles") {
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
        Some(_) => panic!("sirFiles"),
    }
    match obj.get("variants") {
        None | Some(Value::Null) => {}
        Some(Value::Object(m)) => {
            let mut added: Vec<String> = Vec::new();
            for (k, v) in m {
                let vm = match v {
                    Value::Object(vm) => vm,
                    _ => panic!("variant"),
                };
                let own = match vm.get("lang") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    Some(_) => panic!("lang"),
                };
                let sir = match vm.get("sir") {
                    None => None,
                    Some(Value::String(s)) => Some(s.clone()),
                    Some(_) => panic!("sir"),
                };
                let mut named: Vec<String> = Vec::new();
                let key_lang = k.strip_prefix("lang:");
                if let Some(kl) = key_lang {
                    named.push(kl.to_string());
                }
                if let Some(o) = own {
                    named.push(o);
                }
                if let Some(sp_) = &sir {
                    let suf = suffix(sp_);
                    match suf {
                        Some(id) => named.push(id),
                        None => {
                            if key_lang.is_some() {
                                panic!("key lang with non-sir path");
                            }
                        }
                    }
                }
                if named.iter().any(|x| *x != named[0]) {
                    panic!("differ");
                }
                if named.is_empty() {
                    continue;
                }
                let id = named[0].clone();
                add_lang(&mut langs, &id);
                if added.contains(&id) {
                    panic!("dup");
                }
                added.push(id);
            }
        }
        Some(_) => panic!("variants"),
    }

    let mut out = vec!["vectors".to_string()];
    let carried_f = carried.map_or(false, |a| !a.is_empty())
        || has("CARRIED")
        || dirs.iter().any(|d| {
            d.name == "CARRIED-DATA" && {
                let f = full(d);
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
                let f = full(d);
                let t = trim_ws(&f);
                t.starts_with("trace") && t["trace".len()..].chars().next().map_or(true, |c| !is_word(c))
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
    if has("LIFECYCLE") || prose.iter().any(|l| has_token(l, "setTimer", true, true)) {
        out.push("lifecycle".into());
    }
    let sched = dirs.iter().any(|d| {
        d.name == "EFFECT" && {
            let f = full(d);
            has_token(&f, "time.timer", true, true) || has_token(&f, "microtask", true, true)
        }
    }) || prose.iter().any(|l| {
        has_token(l, "schedule(", true, false)
            || has_token(l, "virtual time", true, true)
            || has_token(l, "timers.", true, false)
    });
    if sched {
        out.push("scheduler".into());
    }
    if !langs.is_empty() {
        out.push("lang-variant".into());
    }
    let anchor = dirs.iter().any(|d| {
        if d.name == "ANCHOR" {
            has_ref(&d.args)
                || d.cont.iter().any(|c| has_ref(c))
                || d.attrs.iter().any(|(_, vs)| vs.iter().any(|v| has_ref(v)))
        } else if d.name == "FIDELITY" || d.name == "VARIANT" {
            d.attrs.iter().any(|(k, vs)| k == "ANCHOR" && vs.iter().any(|v| has_ref(v)))
        } else {
            false
        }
    });
    if anchor {
        out.push("cross-lang-anchor".into());
    }
    out
}
