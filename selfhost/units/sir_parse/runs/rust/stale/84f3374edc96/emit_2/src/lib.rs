use serde_json::{Map, Value};

fn is_ws(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn s_of(c: &[char]) -> String {
    c.iter().collect()
}

fn trim_ws(c: &[char]) -> String {
    s_of(c).trim_matches(is_ws).to_string()
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(ch) = it.next() {
        if ch == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push(std::mem::take(&mut cur));
        } else if ch == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(ch);
        }
    }
    out.push(cur);
    out.into_iter()
        .map(|l| {
            let s = l.iter().collect::<String>();
            let s = s.trim_start_matches('\u{feff}').trim_end_matches([' ', '\t']);
            s.chars().collect()
        })
        .collect()
}

fn registry(name: &str) -> Option<(&'static str, &'static str)> {
    let r = match name {
        "UNIT" | "SIG" | "ENVELOPE" | "DEPENDS-ON" | "PINNED" | "EARNED" | "CARRIED" => ("B", "lb"),
        "DESCRIPTION" | "NOTE" | "RATIONALE" | "PROVENANCE" => ("B", "pr"),
        "KIND" | "FIDELITY" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS"
        | "TRACE-SEAM" | "SEAM" | "BEHAVIOR" | "TABLE" | "UNGUARDED-PRECONDITION"
        | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE" | "CANONICAL-SHA256" | "AUTHORITY" | "STATE"
        | "EMIT" | "REQUEST" | "BRANCH" | "ON-ERROR" | "PAR" | "RING" | "LIFECYCLE"
        | "EFFECT" | "SURFACE" => ("P", "lb"),
        "INVARIANT" | "SCOPE" => ("P", "pr"),
        "SIR" | "VARIANT" | "CARRIED-DATA" | "NOTES" | "GUARD-PINNED" => ("P", "legacy"),
        "LANG" | "PRIMARY-SHA256" | "ABI" | "MECHANISM" => ("L", "lb"),
        _ => {
            let b = name.as_bytes();
            if b.len() >= 2 && b[0] == b'R' && b[1..].iter().all(|x| x.is_ascii_digit()) {
                return Some(("P", "lb"));
            }
            return None;
        }
    };
    Some(r)
}

fn is_name(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn attrs(t: &[char]) -> (String, Vec<(String, String)>) {
    let n = t.len();
    let mut groups: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_st(t[i]) {
            let mut j = i;
            while j < n && is_st(t[j]) {
                j += 1;
            }
            let mut found = false;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                if t[j..].starts_with(&k) {
                    let e = j + k.len();
                    if e == n || is_st(t[e]) {
                        groups.push((i, e, kw));
                        i = e;
                        found = true;
                        break;
                    }
                }
            }
            if !found {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    if groups.is_empty() {
        return (trim_ws(t), Vec::new());
    }
    let body = trim_ws(&t[..groups[0].0]);
    let mut out = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        out.push((g.2.to_string(), trim_ws(&t[g.1..end])));
    }
    (body, out)
}

fn store(m: &mut Map<String, Value>, k: &str, v: String) {
    if let Some(Value::String(s)) = m.get_mut(k) {
        s.push_str("; ");
        s.push_str(&v);
    } else {
        m.insert(k.to_string(), Value::String(v));
    }
}

fn diag(code: &str, line: usize, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), Value::from(code));
    m.insert("line".into(), Value::from(line as u64));
    if let Some(s) = msg {
        m.insert("msg".into(), Value::String(s));
    }
    Value::Object(m)
}

fn first40(c: &[char]) -> String {
    c.iter().take(40).collect()
}

struct Node {
    name: String,
    args: String,
    attrs: Map<String, Value>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: String,
    body: Option<String>,
}

fn continuation(node: &mut Node, code: &[char], comment: Option<String>) {
    let mut t = vec![' '];
    t.extend_from_slice(code);
    let (body, at) = attrs(&t);
    node.cont.push(body);
    for (k, v) in at {
        store(&mut node.attrs, &k, v);
    }
    if let Some(c) = comment {
        node.comments.push(c);
    }
}

pub fn sir_parse(text: &str) -> Value {
    let lines = split_lines(text);
    let mut ast: Vec<Node> = Vec::new();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut current: Option<usize> = None;

    for (idx, l) in lines.iter().enumerate() {
        let line = idx + 1;
        if l.iter().all(|&c| is_ws(c)) {
            continue;
        }
        let ind = l.iter().take_while(|&&c| is_st(c)).count();
        let content = &l[ind..];
        if content[0] == '#' {
            warnings.push(diag("W_LEGACY_COMMENT", line, None));
            let mut p = 0;
            while p < content.len() && content[p] == '#' {
                p += 1;
            }
            if p < content.len() && is_ws(content[p]) {
                p += 1;
            }
            let ctext = s_of(&content[p..]);
            if let Some(ci) = current {
                ast[ci].comments.push(ctext);
            } else {
                ast.push(Node {
                    name: "#".into(),
                    args: String::new(),
                    attrs: Map::new(),
                    cont: Vec::new(),
                    comments: vec![s_of(content)],
                    line,
                    register: None,
                    kind: "comment".into(),
                    body: Some(s_of(content)),
                });
            }
            continue;
        }
        let mut marker = None;
        for i in 1..content.len() {
            if content[i] == '#' && is_ws(content[i - 1]) && (i + 1 == content.len() || is_ws(content[i + 1])) {
                marker = Some(i);
                break;
            }
        }
        let (code, comment): (Vec<char>, Option<String>) = match marker {
            Some(i) => {
                warnings.push(diag("W_LEGACY_TRAILING_COMMENT", line, None));
                let code = s_of(&content[..i - 1]).trim_end_matches(is_ws).chars().collect();
                (code, Some(trim_ws(&content[i + 1..])))
            }
            None => (content.to_vec(), None),
        };

        let mut prose = false;
        if ind == 0 {
            let ne = code.iter().position(|&c| is_st(c)).unwrap_or(code.len());
            let mut name = s_of(&code[..ne]);
            let mut rest_start = ne;
            while rest_start < code.len() && is_st(code[rest_start]) {
                rest_start += 1;
            }
            let rest = &code[rest_start..];
            if let Some(stripped) = name.strip_suffix(':') {
                if is_name(stripped) {
                    let st = stripped.to_string();
                    warnings.push(diag("W_LEGACY_COLON", line, Some(st.clone())));
                    name = st;
                }
            }
            if is_name(&name) {
                let reg = registry(&name);
                if reg.is_none() {
                    warnings.push(diag("W_UNKNOWN_DIRECTIVE", line, Some(name.clone())));
                }
                let (body, at) = attrs(rest);
                let mut am = Map::new();
                for (k, v) in at {
                    store(&mut am, &k, v);
                }
                ast.push(Node {
                    name: name.clone(),
                    args: body,
                    attrs: am,
                    cont: Vec::new(),
                    comments: comment.into_iter().collect(),
                    line,
                    register: reg.map(|r| r.0),
                    kind: reg.map(|r| r.1).unwrap_or("unknown").to_string(),
                    body: None,
                });
                current = Some(ast.len() - 1);
                continue;
            }
            prose = true;
        }
        match current {
            None => {
                let code_name = if prose { "E_NO_DIRECTIVE" } else { "E_ORPHAN_CONTINUATION" };
                errors.push(diag(code_name, line, Some(first40(&code))));
            }
            Some(ci) => {
                continuation(&mut ast[ci], &code, comment);
                if prose {
                    warnings.push(diag("W_UNINDENTED_CONTINUATION", line, None));
                }
            }
        }
    }

    let nodes: Vec<Value> = ast
        .into_iter()
        .map(|n| {
            let mut m = Map::new();
            m.insert("directive".into(), Value::String(n.name.clone()));
            m.insert("name".into(), Value::String(n.name));
            m.insert("args".into(), Value::String(n.args));
            m.insert("attrs".into(), Value::Object(n.attrs));
            m.insert("cont".into(), Value::Array(n.cont.into_iter().map(Value::String).collect()));
            m.insert("comments".into(), Value::Array(n.comments.into_iter().map(Value::String).collect()));
            m.insert("line".into(), Value::from(n.line as u64));
            m.insert("register".into(), n.register.map(Value::from).unwrap_or(Value::Null));
            m.insert("kind".into(), Value::String(n.kind));
            if let Some(b) = n.body {
                m.insert("body".into(), Value::String(b));
            }
            Value::Object(m)
        })
        .collect();
    let mut out = Map::new();
    out.insert("ast".into(), Value::Array(nodes));
    out.insert("errors".into(), Value::Array(errors));
    out.insert("warnings".into(), Value::Array(warnings));
    Value::Object(out)
}
