use serde_json::{json, Map, Value};

fn ws(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn split_lines(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut it = text.chars().peekable();
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

fn attrs(t: &str) -> (String, Vec<(&'static str, String)>) {
    let c: Vec<char> = t.chars().collect();
    let n = c.len();
    let kws: [&'static str; 3] = ["CITED", "EARNED", "ANCHOR"];
    // groups: (start, keyword_end, keyword)
    let mut groups: Vec<(usize, usize, &'static str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if st(c[i]) {
            let mut j = i;
            while j < n && st(c[j]) {
                j += 1;
            }
            let mut found = None;
            for kw in kws.iter() {
                let k: Vec<char> = kw.chars().collect();
                if j + k.len() <= n && c[j..j + k.len()] == k[..] {
                    let e = j + k.len();
                    if e == n || st(c[e]) {
                        found = Some((e, *kw));
                        break;
                    }
                }
            }
            if let Some((e, kw)) = found {
                groups.push((i, e, kw));
                i = e;
            } else {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    let sub = |a: usize, b: usize| -> String {
        let s: String = c[a..b].iter().collect();
        s.trim_matches(ws).to_string()
    };
    if groups.is_empty() {
        return (sub(0, n), Vec::new());
    }
    let body = sub(0, groups[0].0);
    let mut vals = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        vals.push((g.2, sub(g.1, end)));
    }
    (body, vals)
}

fn store(map: &mut Map<String, Value>, vals: Vec<(&'static str, String)>) {
    for (k, v) in vals {
        match map.get_mut(k) {
            Some(Value::String(old)) => {
                old.push_str("; ");
                old.push_str(&v);
            }
            _ => {
                map.insert(k.to_string(), Value::String(v));
            }
        }
    }
}

fn is_dir_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn registry(name: &str) -> (Value, &'static str) {
    let b = |k| (json!("B"), k);
    let p = |k| (json!("P"), k);
    match name {
        "UNIT" | "SIG" | "ENVELOPE" | "DEPENDS-ON" | "PINNED" | "EARNED" | "CARRIED" => b("lb"),
        "DESCRIPTION" | "NOTE" | "RATIONALE" | "PROVENANCE" => b("pr"),
        "KIND" | "FIDELITY" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS"
        | "TRACE-SEAM" | "SEAM" | "BEHAVIOR" | "TABLE" | "UNGUARDED-PRECONDITION"
        | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE" | "CANONICAL-SHA256" | "AUTHORITY" | "STATE"
        | "EMIT" | "REQUEST" | "BRANCH" | "ON-ERROR" | "PAR" | "RING" | "LIFECYCLE"
        | "EFFECT" | "SURFACE" => p("lb"),
        "INVARIANT" | "SCOPE" => p("pr"),
        "SIR" | "VARIANT" | "CARRIED-DATA" | "NOTES" | "GUARD-PINNED" => p("legacy"),
        "LANG" | "PRIMARY-SHA256" | "ABI" | "MECHANISM" => (json!("L"), "lb"),
        _ => {
            if name.len() > 1
                && name.starts_with('R')
                && name[1..].chars().all(|c| c.is_ascii_digit())
            {
                p("lb")
            } else {
                (Value::Null, "unknown")
            }
        }
    }
}

fn diag(code: &str, line: usize, msg: Option<&str>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), json!(code));
    m.insert("line".into(), Value::from(line as u64));
    if let Some(s) = msg {
        m.insert("msg".into(), json!(s));
    }
    Value::Object(m)
}

fn cut40(s: &str) -> String {
    s.chars().take(40).collect()
}

fn push_cont(node: &mut Value, body: String, vals: Vec<(&'static str, String)>, comment: Option<String>) {
    let o = node.as_object_mut().unwrap();
    o.get_mut("cont").unwrap().as_array_mut().unwrap().push(Value::String(body));
    store(o.get_mut("attrs").unwrap().as_object_mut().unwrap(), vals);
    if let Some(cm) = comment {
        o.get_mut("comments").unwrap().as_array_mut().unwrap().push(Value::String(cm));
    }
}

pub fn sir_parse(text: &str) -> Value {
    let mut ast: Vec<Value> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut current: Option<usize> = None;

    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
        let line = raw.trim_start_matches('\u{feff}').trim_end_matches(st);
        if line.chars().all(ws) {
            continue;
        }
        let content = line.trim_start_matches(st);
        let indented = content.len() != line.len();

        if content.starts_with('#') {
            warnings.push(diag("W_LEGACY_COMMENT", ln, None));
            let rest = content.trim_start_matches('#');
            let mut ch = rest.chars();
            let text_c = match ch.next() {
                Some(c) if ws(c) => ch.as_str(),
                _ => rest,
            };
            if let Some(ci) = current {
                ast[ci].as_object_mut().unwrap().get_mut("comments").unwrap()
                    .as_array_mut().unwrap().push(Value::String(text_c.to_string()));
            } else {
                ast.push(json!({
                    "directive": "#", "name": "#", "body": content, "args": "",
                    "attrs": {}, "cont": [], "comments": [content], "line": ln as u64,
                    "register": null, "kind": "comment"
                }));
            }
            continue;
        }

        let cc: Vec<char> = content.chars().collect();
        let mut code: String = content.to_string();
        let mut comment: Option<String> = None;
        for k in 1..cc.len() {
            if cc[k] == '#' && ws(cc[k - 1]) && (k + 1 == cc.len() || ws(cc[k + 1])) {
                let c1: String = cc[..k - 1].iter().collect();
                code = c1.trim_end_matches(ws).to_string();
                let c2: String = cc[k + 1..].iter().collect();
                comment = Some(c2.trim_matches(ws).to_string());
                warnings.push(diag("W_LEGACY_TRAILING_COMMENT", ln, None));
                break;
            }
        }

        if indented {
            match current {
                None => errors.push(diag("E_ORPHAN_CONTINUATION", ln, Some(&cut40(&code)))),
                Some(ci) => {
                    let (body, vals) = attrs(&format!(" {}", code));
                    push_cont(&mut ast[ci], body, vals, comment);
                }
            }
            continue;
        }

        let (mut name, rest) = match code.find(st) {
            Some(p) => (code[..p].to_string(), code[p + 1..].trim_start_matches(st).to_string()),
            None => (code.clone(), String::new()),
        };
        if name.ends_with(':') && is_dir_name(&name[..name.len() - 1]) {
            name.pop();
            warnings.push(diag("W_LEGACY_COLON", ln, Some(&name)));
        }
        if is_dir_name(&name) {
            let (reg, kind) = registry(&name);
            if kind == "unknown" {
                warnings.push(diag("W_UNKNOWN_DIRECTIVE", ln, Some(&name)));
            }
            let (body, vals) = attrs(&rest);
            let mut am = Map::new();
            store(&mut am, vals);
            let comments: Vec<Value> = comment.into_iter().map(Value::String).collect();
            ast.push(json!({
                "directive": name, "name": name, "args": body, "attrs": Value::Object(am),
                "cont": [], "comments": comments, "line": ln as u64,
                "register": reg, "kind": kind
            }));
            current = Some(ast.len() - 1);
        } else {
            match current {
                None => errors.push(diag("E_NO_DIRECTIVE", ln, Some(&cut40(&code)))),
                Some(ci) => {
                    let (body, vals) = attrs(&format!(" {}", code));
                    push_cont(&mut ast[ci], body, vals, comment);
                    warnings.push(diag("W_UNINDENTED_CONTINUATION", ln, None));
                }
            }
        }
    }
    json!({"ast": ast, "errors": errors, "warnings": warnings})
}
