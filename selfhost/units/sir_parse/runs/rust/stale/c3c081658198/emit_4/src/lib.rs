use serde_json::{json, Map, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_sep(c: char) -> bool {
    matches!(c, '\u{b}' | '\u{c}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
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
    out.into_iter()
        .map(|l| l.trim_start_matches('\u{feff}').trim_end_matches([' ', '\t']).to_string())
        .collect()
}

fn spans(c: &[char]) -> Vec<bool> {
    let n = c.len();
    let mut ins = vec![false; n];
    let mut i = 0;
    while i < n {
        if c[i] == '"' {
            let mut j = i + 1;
            let mut ok = false;
            while j < n {
                let ch = c[j];
                if ch == '"' {
                    ok = true;
                    break;
                } else if ch == '\\' {
                    if j + 1 < n && c[j + 1] != '\u{2028}' && c[j + 1] != '\u{2029}' {
                        j += 2;
                    } else {
                        break;
                    }
                } else {
                    j += 1;
                }
            }
            if ok {
                for k in i..=j {
                    ins[k] = true;
                }
                i = j + 1;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    ins
}

fn trim_sp(s: &[char]) -> String {
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

fn attrs_of(t: &[char]) -> (String, Vec<(String, String)>) {
    let n = t.len();
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut groups: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(t[i]) {
            let mut j = i;
            while j < n && sp(t[j]) {
                j += 1;
            }
            let mut found = false;
            for kw in kws.iter() {
                let k: Vec<char> = kw.chars().collect();
                let e = j + k.len();
                if e <= n && t[j..e] == k[..] && (e == n || sp(t[e])) {
                    groups.push((i, e, kw));
                    i = e;
                    found = true;
                    break;
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
        return (trim_sp(t), vec![]);
    }
    let body = trim_sp(&t[..groups[0].0]);
    let mut list = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        list.push((g.2.to_string(), trim_sp(&t[g.1..end])));
    }
    (body, list)
}

fn shaped(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn registry(name: &str) -> Option<(&'static str, &'static str)> {
    let r = match name {
        "UNIT" | "SIG" | "ENVELOPE" | "DEPENDS-ON" | "PINNED" | "EARNED" | "CARRIED" => ("B", "lb"),
        "DESCRIPTION" | "NOTE" | "RATIONALE" | "PROVENANCE" => ("B", "pr"),
        "KIND" | "FIDELITY" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS" | "TRACE-SEAM" | "SEAM"
        | "BEHAVIOR" | "TABLE" | "UNGUARDED-PRECONDITION" | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE"
        | "CANONICAL-SHA256" | "AUTHORITY" | "STATE" | "EMIT" | "REQUEST" | "BRANCH" | "ON-ERROR" | "PAR"
        | "RING" | "LIFECYCLE" | "EFFECT" | "SURFACE" => ("P", "lb"),
        "INVARIANT" | "SCOPE" => ("P", "pr"),
        "SIR" | "VARIANT" | "CARRIED-DATA" | "NOTES" | "GUARD-PINNED" => ("P", "legacy"),
        "LANG" | "PRIMARY-SHA256" | "ABI" | "MECHANISM" => ("L", "lb"),
        _ => {
            let b = name.as_bytes();
            if b.len() >= 2 && b[0] == b'R' && b[1..].iter().all(|c| c.is_ascii_digit()) {
                ("P", "lb")
            } else {
                return None;
            }
        }
    };
    Some(r)
}

struct Node {
    name: String,
    body: Option<String>,
    args: String,
    list: Vec<(String, String)>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: u64,
    register: Option<&'static str>,
    kind: &'static str,
}

fn diag(code: &str, line: u64, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), json!(code));
    m.insert("line".into(), Value::from(line));
    if let Some(s) = msg {
        m.insert("msg".into(), Value::String(s));
    }
    Value::Object(m)
}

fn first40(c: &[char]) -> String {
    c.iter().take(40).collect()
}

fn cont_into(node: &mut Node, code: &[char], comment: Option<String>) {
    let mut t = vec![' '];
    t.extend_from_slice(code);
    let (body, list) = attrs_of(&t);
    node.list.extend(list);
    if !body.is_empty() {
        node.cont.push(body);
    }
    if let Some(c) = comment {
        node.comments.push(c);
    }
}

fn node_value(n: &Node) -> Value {
    let mut attrs = Map::new();
    let mut order: Vec<&String> = Vec::new();
    for (k, _) in &n.list {
        if !order.contains(&k) {
            order.push(k);
        }
    }
    for k in order {
        let vals: Vec<&str> = n.list.iter().filter(|(kk, v)| kk == k && !v.is_empty()).map(|(_, v)| v.as_str()).collect();
        attrs.insert(k.clone(), Value::String(vals.join("; ")));
    }
    let mut m = Map::new();
    m.insert("directive".into(), json!(n.name));
    m.insert("name".into(), json!(n.name));
    if let Some(b) = &n.body {
        m.insert("body".into(), json!(b));
    }
    m.insert("args".into(), json!(n.args));
    m.insert("attrs".into(), Value::Object(attrs));
    m.insert(
        "attrList".into(),
        Value::Array(n.list.iter().map(|(k, v)| json!([k, v])).collect()),
    );
    m.insert("cont".into(), json!(n.cont));
    m.insert("comments".into(), json!(n.comments));
    m.insert("line".into(), Value::from(n.line));
    m.insert("register".into(), match n.register {
        Some(r) => json!(r),
        None => Value::Null,
    });
    m.insert("kind".into(), json!(n.kind));
    Value::Object(m)
}

pub fn sir_parse(text: &str) -> Value {
    let lines = split_lines(text);
    let mut ast: Vec<Node> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut current: Option<usize> = None;
    for (idx, l) in lines.iter().enumerate() {
        let ln = (idx + 1) as u64;
        if l.is_empty() {
            continue;
        }
        let chars: Vec<char> = l.chars().collect();
        let ind = chars.iter().take_while(|c| sp(**c)).count();
        let content = &chars[ind..];
        if content.is_empty() {
            continue;
        }
        if content[0] == '#' {
            warnings.push(diag("W_LEGACY_COMMENT", ln, None));
            match current {
                Some(ci) => {
                    let mut s = 0;
                    while s < content.len() && content[s] == '#' {
                        s += 1;
                    }
                    if s < content.len() && sp(content[s]) {
                        s += 1;
                    }
                    let c: String = content[s..].iter().collect();
                    ast[ci].comments.push(c);
                }
                None => {
                    let c: String = content.iter().collect();
                    ast.push(Node {
                        name: "#".into(),
                        body: Some(c.clone()),
                        args: String::new(),
                        list: vec![],
                        cont: vec![],
                        comments: vec![c],
                        line: ln,
                        register: None,
                        kind: "comment",
                    });
                }
            }
            continue;
        }
        let ins = spans(content);
        let n = content.len();
        let mut marker = None;
        for i in 1..n {
            if content[i] == '#' && sp(content[i - 1]) && (i + 1 == n || sp(content[i + 1])) && !ins[i] {
                marker = Some(i);
                break;
            }
        }
        let (code, comment): (Vec<char>, Option<String>) = match marker {
            Some(i) => {
                warnings.push(diag("W_LEGACY_TRAILING_COMMENT", ln, None));
                let mut e = i;
                while e > 0 && sp(content[e - 1]) {
                    e -= 1;
                }
                (content[..e].to_vec(), Some(trim_sp(&content[i + 1..])))
            }
            None => (content.to_vec(), None),
        };
        if ind > 0 {
            match current {
                None => errors.push(diag("E_ORPHAN_CONTINUATION", ln, Some(first40(&code)))),
                Some(ci) => cont_into(&mut ast[ci], &code, comment),
            }
            continue;
        }
        let ne = code.iter().position(|c| sp(*c)).unwrap_or(code.len());
        let mut name: Vec<char> = code[..ne].to_vec();
        let rest: Vec<char> = code[ne..].to_vec();
        if name.len() >= 2 && name[name.len() - 1] == ':' && shaped(&name[..name.len() - 1]) {
            name.pop();
            warnings.push(diag("W_LEGACY_COLON", ln, Some(name.iter().collect())));
        }
        let nm: String = name.iter().collect();
        if shaped(&name) && nm != "CITED" {
            let (reg, kind) = match registry(&nm) {
                Some((r, k)) => (Some(r), k),
                None => {
                    warnings.push(diag("W_UNKNOWN_DIRECTIVE", ln, Some(nm.clone())));
                    (None, "unknown")
                }
            };
            let (body, list) = attrs_of(&rest);
            ast.push(Node {
                name: nm,
                body: None,
                args: body,
                list,
                cont: vec![],
                comments: comment.into_iter().collect(),
                line: ln,
                register: reg,
                kind,
            });
            current = Some(ast.len() - 1);
            continue;
        }
        if !name.is_empty() && name[0].is_ascii_uppercase() {
            let mut g = 1;
            while g < name.len() && (name[g].is_ascii_uppercase() || name[g].is_ascii_digit() || name[g] == '-') {
                g += 1;
            }
            if g < name.len() && is_sep(name[g]) {
                let gs: String = name[..g].iter().collect();
                warnings.push(diag(
                    "W_NAME_SEPARATOR",
                    ln,
                    Some(format!("{} is followed by U+{:04X}, not a space or tab: not a directive", gs, name[g] as u32)),
                ));
            }
        }
        match current {
            Some(ci) => {
                cont_into(&mut ast[ci], &code, comment);
                warnings.push(diag("W_UNINDENTED_CONTINUATION", ln, None));
            }
            None => errors.push(diag("E_NO_DIRECTIVE", ln, Some(first40(&code)))),
        }
    }
    let mut m = Map::new();
    m.insert("ast".into(), Value::Array(ast.iter().map(node_value).collect()));
    m.insert("errors".into(), Value::Array(errors));
    m.insert("warnings".into(), Value::Array(warnings));
    Value::Object(m)
}
