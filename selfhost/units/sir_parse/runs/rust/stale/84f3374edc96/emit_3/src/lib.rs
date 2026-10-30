use serde_json::{json, Map, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_ws(s: &[char]) -> String {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_ws(s[a]) {
        a += 1;
    }
    while b > a && is_ws(s[b - 1]) {
        b -= 1;
    }
    s[a..b].iter().collect()
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

const KW: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];

fn attrs(t: &str) -> (String, Vec<(&'static str, String)>) {
    let c: Vec<char> = t.chars().collect();
    let n = c.len();
    let mut groups: Vec<(usize, usize, &'static str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_st(c[i]) {
            let mut e = i;
            while e < n && is_st(c[e]) {
                e += 1;
            }
            let mut found = false;
            for k in KW.iter() {
                let kc: Vec<char> = k.chars().collect();
                let kl = kc.len();
                if e + kl <= n && c[e..e + kl] == kc[..] && (e + kl == n || is_st(c[e + kl])) {
                    groups.push((i, e + kl, *k));
                    i = e + kl;
                    found = true;
                    break;
                }
            }
            if !found {
                i = e;
            }
        } else {
            i += 1;
        }
    }
    if groups.is_empty() {
        return (trim_ws(&c), Vec::new());
    }
    let body = trim_ws(&c[..groups[0].0]);
    let mut vals = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        vals.push((g.2, trim_ws(&c[g.1..end])));
    }
    (body, vals)
}

fn store(map: &mut Map<String, Value>, k: &str, v: String) {
    if let Some(Value::String(old)) = map.get_mut(k) {
        old.push_str("; ");
        old.push_str(&v);
    } else {
        map.insert(k.to_string(), Value::String(v));
    }
}

struct Node {
    name: String,
    args: String,
    attrs: Map<String, Value>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: &'static str,
    body: Option<String>,
}

fn registry(name: &str) -> Option<(&'static str, &'static str)> {
    let b_lb = ["UNIT", "SIG", "ENVELOPE", "DEPENDS-ON", "PINNED", "EARNED", "CARRIED"];
    let b_pr = ["DESCRIPTION", "NOTE", "RATIONALE", "PROVENANCE"];
    let p_lb = [
        "KIND", "FIDELITY", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM", "SEAM", "BEHAVIOR",
        "TABLE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY",
        "STATE", "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    ];
    let p_pr = ["INVARIANT", "SCOPE"];
    let p_leg = ["SIR", "VARIANT", "CARRIED-DATA", "NOTES", "GUARD-PINNED"];
    let l_lb = ["LANG", "PRIMARY-SHA256", "ABI", "MECHANISM"];
    if b_lb.contains(&name) {
        return Some(("B", "lb"));
    }
    if b_pr.contains(&name) {
        return Some(("B", "pr"));
    }
    if p_lb.contains(&name) {
        return Some(("P", "lb"));
    }
    if p_pr.contains(&name) {
        return Some(("P", "pr"));
    }
    if p_leg.contains(&name) {
        return Some(("P", "legacy"));
    }
    if l_lb.contains(&name) {
        return Some(("L", "lb"));
    }
    let r: Vec<char> = name.chars().collect();
    if r.len() >= 2 && r[0] == 'R' && r[1..].iter().all(|c| c.is_ascii_digit()) {
        return Some(("P", "lb"));
    }
    None
}

fn name_ok(name: &str) -> bool {
    let mut it = name.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn diag(line: usize, code: &str, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("line".to_string(), Value::from(line as u64));
    m.insert("code".to_string(), Value::String(code.to_string()));
    if let Some(s) = msg {
        m.insert("msg".to_string(), Value::String(s));
    }
    Value::Object(m)
}

fn cut40(s: &str) -> String {
    s.chars().take(40).collect()
}

pub fn sir_parse(text: &str) -> Value {
    let mut ast: Vec<Node> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut current: Option<usize> = None;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
        let line = raw.trim_start_matches('\u{feff}').trim_end_matches([' ', '\t']);
        if line.chars().all(is_ws) {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut p = 0;
        while p < chars.len() && is_st(chars[p]) {
            p += 1;
        }
        let indented = p > 0;
        let content: &[char] = &chars[p..];
        if content.first() == Some(&'#') {
            warnings.push(diag(ln, "W_LEGACY_COMMENT", None));
            let mut q = 0;
            while q < content.len() && content[q] == '#' {
                q += 1;
            }
            if q < content.len() && is_ws(content[q]) {
                q += 1;
            }
            let ctext: String = content[q..].iter().collect();
            if let Some(ci) = current {
                ast[ci].comments.push(ctext);
            } else {
                let whole: String = content.iter().collect();
                ast.push(Node {
                    name: "#".to_string(),
                    args: String::new(),
                    attrs: Map::new(),
                    cont: Vec::new(),
                    comments: vec![whole.clone()],
                    line: ln,
                    register: None,
                    kind: "comment",
                    body: Some(whole),
                });
            }
            continue;
        }
        let mut marker: Option<usize> = None;
        for i in 1..content.len() {
            if content[i] == '#' && is_ws(content[i - 1]) && (i + 1 == content.len() || is_ws(content[i + 1])) {
                marker = Some(i);
                break;
            }
        }
        let (code, comment): (String, Option<String>) = match marker {
            Some(i) => {
                warnings.push(diag(ln, "W_LEGACY_TRAILING_COMMENT", None));
                (trim_end_chars(&content[..i - 1]), Some(trim_ws(&content[i + 1..])))
            }
            None => (content.iter().collect(), None),
        };
        if indented {
            match current {
                None => errors.push(diag(ln, "E_ORPHAN_CONTINUATION", Some(cut40(&code)))),
                Some(ci) => {
                    continuation(&mut ast[ci], &code, comment);
                }
            }
            continue;
        }
        let cc: Vec<char> = code.chars().collect();
        let mut e = 0;
        while e < cc.len() && !is_st(cc[e]) {
            e += 1;
        }
        let mut name: String = cc[..e].iter().collect();
        let mut r = e;
        while r < cc.len() && is_st(cc[r]) {
            r += 1;
        }
        let rest: String = cc[r.min(cc.len())..].iter().collect();
        if name.ends_with(':') {
            let base = &name[..name.len() - 1];
            if name_ok(base) {
                warnings.push(diag(ln, "W_LEGACY_COLON", Some(base.to_string())));
                name = base.to_string();
            }
        }
        if name_ok(&name) {
            let (register, kind) = match registry(&name) {
                Some((a, b)) => (Some(a), b),
                None => {
                    warnings.push(diag(ln, "W_UNKNOWN_DIRECTIVE", Some(name.clone())));
                    (None, "unknown")
                }
            };
            let (body, list) = attrs(&rest);
            let mut m = Map::new();
            for (k, v) in list {
                store(&mut m, k, v);
            }
            ast.push(Node {
                name,
                args: body,
                attrs: m,
                cont: Vec::new(),
                comments: comment.into_iter().collect(),
                line: ln,
                register,
                kind,
                body: None,
            });
            current = Some(ast.len() - 1);
        } else {
            match current {
                Some(ci) => {
                    continuation(&mut ast[ci], &code, comment);
                    warnings.push(diag(ln, "W_UNINDENTED_CONTINUATION", None));
                }
                None => errors.push(diag(ln, "E_NO_DIRECTIVE", Some(cut40(&code)))),
            }
        }
    }
    let nodes: Vec<Value> = ast
        .into_iter()
        .map(|n| {
            let mut m = Map::new();
            m.insert("directive".to_string(), Value::String(n.name.clone()));
            m.insert("name".to_string(), Value::String(n.name));
            m.insert("args".to_string(), Value::String(n.args));
            m.insert("attrs".to_string(), Value::Object(n.attrs));
            m.insert("cont".to_string(), json!(n.cont));
            m.insert("comments".to_string(), json!(n.comments));
            m.insert("line".to_string(), Value::from(n.line as u64));
            m.insert(
                "register".to_string(),
                match n.register {
                    Some(r) => Value::String(r.to_string()),
                    None => Value::Null,
                },
            );
            m.insert("kind".to_string(), Value::String(n.kind.to_string()));
            if let Some(b) = n.body {
                m.insert("body".to_string(), Value::String(b));
            }
            Value::Object(m)
        })
        .collect();
    let mut out = Map::new();
    out.insert("ast".to_string(), Value::Array(nodes));
    out.insert("errors".to_string(), Value::Array(errors));
    out.insert("warnings".to_string(), Value::Array(warnings));
    Value::Object(out)
}

fn trim_end_chars(s: &[char]) -> String {
    let mut b = s.len();
    while b > 0 && is_ws(s[b - 1]) {
        b -= 1;
    }
    s[..b].iter().collect()
}

fn continuation(node: &mut Node, code: &str, comment: Option<String>) {
    let (body, list) = attrs(&format!(" {}", code));
    node.cont.push(body);
    for (k, v) in list {
        store(&mut node.attrs, k, v);
    }
    if let Some(c) = comment {
        node.comments.push(c);
    }
}
