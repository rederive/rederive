use serde_json::{json, Map, Value};

struct Node {
    name: String,
    args: String,
    attr_list: Vec<(String, String)>,
    attrs: Map<String, Value>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: &'static str,
    body: Option<String>,
}

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_sep(c: char) -> bool {
    matches!(c, '\u{b}' | '\u{c}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn shaped(n: &str) -> bool {
    let mut it = n.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn registry(n: &str) -> (Option<&'static str>, &'static str) {
    match n {
        "UNIT" | "SIG" | "ENVELOPE" | "DEPENDS-ON" | "PINNED" | "EARNED" | "CARRIED" => (Some("B"), "lb"),
        "DESCRIPTION" | "NOTE" | "RATIONALE" | "PROVENANCE" => (Some("B"), "pr"),
        "KIND" | "FIDELITY" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS" | "TRACE-SEAM" | "SEAM"
        | "BEHAVIOR" | "TABLE" | "UNGUARDED-PRECONDITION" | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE"
        | "CANONICAL-SHA256" | "AUTHORITY" | "STATE" | "EMIT" | "REQUEST" | "BRANCH" | "ON-ERROR" | "PAR"
        | "RING" | "LIFECYCLE" | "EFFECT" | "SURFACE" => (Some("P"), "lb"),
        "INVARIANT" | "SCOPE" => (Some("P"), "pr"),
        "SIR" | "VARIANT" | "CARRIED-DATA" | "NOTES" | "GUARD-PINNED" => (Some("P"), "legacy"),
        "LANG" | "PRIMARY-SHA256" | "ABI" | "MECHANISM" => (Some("L"), "lb"),
        _ => {
            if n.len() >= 2 && n.starts_with('R') && n[1..].chars().all(|c| c.is_ascii_digit()) {
                (Some("P"), "lb")
            } else {
                (None, "unknown")
            }
        }
    }
}

fn trim_sp(s: &[char]) -> String {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_sp(s[a]) {
        a += 1;
    }
    while b > a && is_sp(s[b - 1]) {
        b -= 1;
    }
    s[a..b].iter().collect()
}

fn attrs_of(t: &[char]) -> (String, Vec<(String, String)>) {
    let n = t.len();
    let mut groups: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_sp(t[i]) {
            let mut j = i;
            while j < n && is_sp(t[j]) {
                j += 1;
            }
            let mut found = None;
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                let k: Vec<char> = kw.chars().collect();
                if j + k.len() <= n && t[j..j + k.len()] == k[..] {
                    let e = j + k.len();
                    if e == n || is_sp(t[e]) {
                        found = Some((e, kw));
                    }
                    break;
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
    if groups.is_empty() {
        return (trim_sp(t), Vec::new());
    }
    let body = trim_sp(&t[..groups[0].0]);
    let mut list = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        list.push((g.2.to_string(), trim_sp(&t[g.1..end])));
    }
    (body, list)
}

fn store(node: &mut Node, list: Vec<(String, String)>) {
    for (k, v) in list {
        node.attr_list.push((k.clone(), v));
        let joined = node
            .attr_list
            .iter()
            .filter(|(kk, vv)| *kk == k && !vv.is_empty())
            .map(|(_, vv)| vv.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        node.attrs.insert(k, Value::String(joined));
    }
}

fn diag(code: &str, line: usize, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("code".into(), json!(code));
    m.insert("line".into(), Value::from(line as u64));
    if let Some(s) = msg {
        m.insert("msg".into(), Value::String(s));
    }
    Value::Object(m)
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
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

fn first40(s: &str) -> String {
    s.chars().take(40).collect()
}

fn node_value(n: &Node) -> Value {
    let mut m = Map::new();
    m.insert("directive".into(), json!(n.name));
    m.insert("name".into(), json!(n.name));
    m.insert("args".into(), json!(n.args));
    m.insert("attrs".into(), Value::Object(n.attrs.clone()));
    m.insert(
        "attrList".into(),
        Value::Array(n.attr_list.iter().map(|(k, v)| json!([k, v])).collect()),
    );
    m.insert("cont".into(), json!(n.cont));
    m.insert("comments".into(), json!(n.comments));
    m.insert("line".into(), Value::from(n.line as u64));
    m.insert("register".into(), match n.register {
        Some(r) => json!(r),
        None => Value::Null,
    });
    m.insert("kind".into(), json!(n.kind));
    if let Some(b) = &n.body {
        m.insert("body".into(), json!(b));
    }
    Value::Object(m)
}

pub fn sir_parse(text: &str) -> serde_json::Value {
    let lines = split_lines(text);
    let mut ast: Vec<Node> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut current: Option<usize> = None;

    for (idx, raw) in lines.iter().enumerate() {
        let ln = idx + 1;
        let mut a = 0;
        while a < raw.len() && raw[a] == '\u{feff}' {
            a += 1;
        }
        let mut b = raw.len();
        while b > a && is_sp(raw[b - 1]) {
            b -= 1;
        }
        let line = &raw[a..b];
        if line.is_empty() {
            continue;
        }
        let mut ind = 0;
        while ind < line.len() && is_sp(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];
        let n = content.len();
        if content.first() == Some(&'#') {
            warnings.push(diag("W_LEGACY_COMMENT", ln, None));
            let mut s = 0;
            while s < n && content[s] == '#' {
                s += 1;
            }
            if s < n && is_sp(content[s]) {
                s += 1;
            }
            let ctext: String = content[s..].iter().collect();
            match current {
                Some(ci) => ast[ci].comments.push(ctext),
                None => {
                    let full: String = content.iter().collect();
                    ast.push(Node {
                        name: "#".into(),
                        args: String::new(),
                        attr_list: Vec::new(),
                        attrs: Map::new(),
                        cont: Vec::new(),
                        comments: vec![full.clone()],
                        line: ln,
                        register: None,
                        kind: "comment",
                        body: Some(full),
                    });
                }
            }
            continue;
        }
        // quoted spans
        let mut in_span = vec![false; n];
        let mut i = 0;
        while i < n {
            if content[i] == '"' {
                let mut j = i + 1;
                let mut ok = false;
                loop {
                    if j >= n {
                        break;
                    }
                    let ch = content[j];
                    if ch == '"' {
                        ok = true;
                        break;
                    } else if ch == '\\' {
                        if j + 1 < n && content[j + 1] != '\u{2028}' && content[j + 1] != '\u{2029}' {
                            j += 2;
                        } else {
                            break;
                        }
                    } else {
                        j += 1;
                    }
                }
                if ok {
                    for x in i..=j {
                        in_span[x] = true;
                    }
                    i = j + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
        let mut marker = None;
        for k in 1..n {
            if content[k] == '#' && is_sp(content[k - 1]) && (k + 1 == n || is_sp(content[k + 1])) && !in_span[k] {
                marker = Some(k);
                break;
            }
        }
        let code: Vec<char>;
        let comment: Option<String>;
        if let Some(k) = marker {
            let mut e = k;
            while e > 0 && is_sp(content[e - 1]) {
                e -= 1;
            }
            code = content[..e].to_vec();
            comment = Some(trim_sp(&content[k + 1..]));
            warnings.push(diag("W_LEGACY_TRAILING_COMMENT", ln, None));
        } else {
            code = content.to_vec();
            comment = None;
        }

        if ind == 0 {
            let mut e = 0;
            while e < code.len() && !is_sp(code[e]) {
                e += 1;
            }
            let mut name: String = code[..e].iter().collect();
            let rest: Vec<char> = code[e..].to_vec();
            if name.ends_with(':') && shaped(&name[..name.len() - 1]) {
                name.pop();
                warnings.push(diag("W_LEGACY_COLON", ln, Some(name.clone())));
            }
            if shaped(&name) && name != "CITED" {
                let (reg, kind) = registry(&name);
                if reg.is_none() {
                    warnings.push(diag("W_UNKNOWN_DIRECTIVE", ln, Some(name.clone())));
                }
                let (body, list) = attrs_of(&rest);
                let mut node = Node {
                    name,
                    args: body,
                    attr_list: Vec::new(),
                    attrs: Map::new(),
                    cont: Vec::new(),
                    comments: comment.into_iter().collect(),
                    line: ln,
                    register: reg,
                    kind,
                    body: None,
                };
                store(&mut node, list);
                ast.push(node);
                current = Some(ast.len() - 1);
                continue;
            }
            let nc: Vec<char> = name.chars().collect();
            if !nc.is_empty() && nc[0].is_ascii_uppercase() {
                let mut g = 1;
                while g < nc.len() && (nc[g].is_ascii_uppercase() || nc[g].is_ascii_digit() || nc[g] == '-') {
                    g += 1;
                }
                if g < nc.len() && is_sep(nc[g]) {
                    let gs: String = nc[..g].iter().collect();
                    warnings.push(diag(
                        "W_NAME_SEPARATOR",
                        ln,
                        Some(format!(
                            "{} is followed by U+{:04X}, not a space or tab: not a directive",
                            gs, nc[g] as u32
                        )),
                    ));
                }
            }
            match current {
                Some(ci) => {
                    cont(&mut ast[ci], &code, comment);
                    warnings.push(diag("W_UNINDENTED_CONTINUATION", ln, None));
                }
                None => {
                    let s: String = code.iter().collect();
                    errors.push(diag("E_NO_DIRECTIVE", ln, Some(first40(&s))));
                }
            }
        } else {
            match current {
                None => {
                    let s: String = code.iter().collect();
                    errors.push(diag("E_ORPHAN_CONTINUATION", ln, Some(first40(&s))));
                }
                Some(ci) => cont(&mut ast[ci], &code, comment),
            }
        }
    }

    let mut out = Map::new();
    out.insert("ast".into(), Value::Array(ast.iter().map(node_value).collect()));
    out.insert("errors".into(), Value::Array(errors));
    out.insert("warnings".into(), Value::Array(warnings));
    Value::Object(out)
}

fn cont(node: &mut Node, code: &[char], comment: Option<String>) {
    let mut t = vec![' '];
    t.extend_from_slice(code);
    let (body, list) = attrs_of(&t);
    store(node, list);
    if !body.is_empty() {
        node.cont.push(body);
    }
    if let Some(c) = comment {
        node.comments.push(c);
    }
}
