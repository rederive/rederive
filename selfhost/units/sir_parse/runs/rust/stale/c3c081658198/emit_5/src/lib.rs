use serde_json::{json, Map, Value};

struct Node {
    directive: String,
    body: Option<String>,
    args: String,
    attr_list: Vec<(String, String)>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: &'static str,
}

type Diag = (usize, &'static str, Option<String>);

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_sp(s: &str) -> &str {
    s.trim_matches([' ', '\t'])
}

fn is_sep(c: char) -> bool {
    matches!(c, '\u{b}' | '\u{c}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn split_lines(text: &str) -> Vec<String> {
    let cs: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
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

fn shaped(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn registry(name: &str) -> (Option<&'static str>, &'static str) {
    match name {
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
            if name.len() > 1 && name.starts_with('R') && name[1..].chars().all(|c| c.is_ascii_digit()) {
                (Some("P"), "lb")
            } else {
                (None, "unknown")
            }
        }
    }
}

fn inside_spans(cs: &[char]) -> Vec<bool> {
    let n = cs.len();
    let mut ins = vec![false; n];
    let mut i = 0;
    while i < n {
        if cs[i] == '"' {
            let mut j = i + 1;
            let mut close = None;
            while j < n {
                let c = cs[j];
                if c == '"' {
                    close = Some(j);
                    break;
                } else if c == '\\' {
                    if j + 1 < n && cs[j + 1] != '\u{2028}' && cs[j + 1] != '\u{2029}' {
                        j += 2;
                    } else {
                        break;
                    }
                } else {
                    j += 1;
                }
            }
            if let Some(e) = close {
                for k in i..=e {
                    ins[k] = true;
                }
                i = e + 1;
                continue;
            }
        }
        i += 1;
    }
    ins
}

fn attrs(t: &str) -> (String, Vec<(String, String)>) {
    let cs: Vec<char> = t.chars().collect();
    let n = cs.len();
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut groups: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_sp(cs[i]) {
            let mut j = i;
            while j < n && is_sp(cs[j]) {
                j += 1;
            }
            let mut hit = None;
            for k in kws {
                let kc: Vec<char> = k.chars().collect();
                let e = j + kc.len();
                if e <= n && cs[j..e] == kc[..] && (e == n || is_sp(cs[e])) {
                    hit = Some((e, k));
                    break;
                }
            }
            if let Some((e, k)) = hit {
                groups.push((i, e, k));
                i = e;
            } else {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    let s = |a: usize, b: usize| -> String { cs[a..b].iter().collect() };
    if groups.is_empty() {
        return (trim_sp(t).to_string(), Vec::new());
    }
    let body = trim_sp(&s(0, groups[0].0)).to_string();
    let mut list = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        list.push((g.2.to_string(), trim_sp(&s(g.1, end)).to_string()));
    }
    (body, list)
}

fn store(node: &mut Node, list: Vec<(String, String)>) {
    for kv in list {
        node.attr_list.push(kv);
    }
}

fn cont_line(node: &mut Node, code: &str, comment: &Option<String>) {
    let (body, list) = attrs(&format!(" {}", code));
    store(node, list);
    if !body.is_empty() {
        node.cont.push(body);
    }
    if let Some(c) = comment {
        node.comments.push(c.clone());
    }
}

fn diag(d: &Diag) -> Value {
    let mut m = Map::new();
    m.insert("line".into(), Value::from(d.0 as u64));
    m.insert("code".into(), Value::from(d.1));
    if let Some(msg) = &d.2 {
        m.insert("msg".into(), Value::from(msg.clone()));
    }
    Value::Object(m)
}

fn node_value(n: &Node) -> Value {
    let mut attrs_map = Map::new();
    for (k, _) in &n.attr_list {
        let vals: Vec<&str> = n.attr_list.iter().filter(|(k2, v)| k2 == k && !v.is_empty()).map(|(_, v)| v.as_str()).collect();
        attrs_map.insert(k.clone(), Value::from(vals.join("; ")));
    }
    let list: Vec<Value> = n.attr_list.iter().map(|(k, v)| json!([k, v])).collect();
    let mut m = Map::new();
    m.insert("directive".into(), Value::from(n.directive.clone()));
    m.insert("name".into(), Value::from(n.directive.clone()));
    if let Some(b) = &n.body {
        m.insert("body".into(), Value::from(b.clone()));
    }
    m.insert("args".into(), Value::from(n.args.clone()));
    m.insert("attrs".into(), Value::Object(attrs_map));
    m.insert("attrList".into(), Value::Array(list));
    m.insert("cont".into(), json!(n.cont));
    m.insert("comments".into(), json!(n.comments));
    m.insert("line".into(), Value::from(n.line as u64));
    m.insert("register".into(), match n.register {
        Some(r) => Value::from(r),
        None => Value::Null,
    });
    m.insert("kind".into(), Value::from(n.kind));
    Value::Object(m)
}

pub fn sir_parse(text: &str) -> Value {
    let mut nodes: Vec<Node> = Vec::new();
    let mut errors: Vec<Diag> = Vec::new();
    let mut warnings: Vec<Diag> = Vec::new();
    let mut current: Option<usize> = None;

    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
        let line = raw.trim_start_matches('\u{feff}').trim_end_matches([' ', '\t']);
        if line.is_empty() {
            continue;
        }
        let indent_empty = !line.starts_with(is_sp);
        let content = line.trim_start_matches([' ', '\t']);

        if content.starts_with('#') {
            warnings.push((ln, "W_LEGACY_COMMENT", None));
            let rest = content.trim_start_matches('#');
            let rest = match rest.chars().next() {
                Some(c) if is_sp(c) => &rest[c.len_utf8()..],
                _ => rest,
            };
            if let Some(ci) = current {
                nodes[ci].comments.push(rest.to_string());
            } else {
                nodes.push(Node {
                    directive: "#".into(),
                    body: Some(content.to_string()),
                    args: String::new(),
                    attr_list: Vec::new(),
                    cont: Vec::new(),
                    comments: vec![content.to_string()],
                    line: ln,
                    register: None,
                    kind: "comment",
                });
            }
            continue;
        }

        let cs: Vec<char> = content.chars().collect();
        let ins = inside_spans(&cs);
        let mut marker = None;
        for i in 1..cs.len() {
            if cs[i] == '#' && !ins[i] && is_sp(cs[i - 1]) && (i + 1 == cs.len() || is_sp(cs[i + 1])) {
                marker = Some(i);
                break;
            }
        }
        let (code, comment): (String, Option<String>) = match marker {
            Some(i) => {
                let c: String = cs[..i].iter().collect();
                let m: String = cs[i + 1..].iter().collect();
                warnings.push((ln, "W_LEGACY_TRAILING_COMMENT", None));
                (c.trim_end_matches([' ', '\t']).to_string(), Some(trim_sp(&m).to_string()))
            }
            None => (content.to_string(), None),
        };

        if indent_empty {
            let (name_raw, rest) = match code.find(is_sp) {
                Some(p) => (&code[..p], &code[p..]),
                None => (&code[..], ""),
            };
            let mut name = name_raw.to_string();
            if name.ends_with(':') && shaped(&name[..name.len() - 1]) {
                name.pop();
                warnings.push((ln, "W_LEGACY_COLON", Some(name.clone())));
            }
            if shaped(&name) && name != "CITED" {
                let (register, kind) = registry(&name);
                if register.is_none() {
                    warnings.push((ln, "W_UNKNOWN_DIRECTIVE", Some(name.clone())));
                }
                let (body, list) = attrs(rest);
                let mut node = Node {
                    directive: name,
                    body: None,
                    args: body,
                    attr_list: Vec::new(),
                    cont: Vec::new(),
                    comments: match &comment {
                        Some(c) => vec![c.clone()],
                        None => Vec::new(),
                    },
                    line: ln,
                    register,
                    kind,
                };
                store(&mut node, list);
                nodes.push(node);
                current = Some(nodes.len() - 1);
                continue;
            }
            let nc: Vec<char> = name.chars().collect();
            if !nc.is_empty() && nc[0].is_ascii_uppercase() {
                let mut e = 1;
                while e < nc.len() && (nc[e].is_ascii_uppercase() || nc[e].is_ascii_digit() || nc[e] == '-') {
                    e += 1;
                }
                if e < nc.len() && is_sep(nc[e]) {
                    let g: String = nc[..e].iter().collect();
                    warnings.push((
                        ln,
                        "W_NAME_SEPARATOR",
                        Some(format!("{} is followed by U+{:04X}, not a space or tab: not a directive", g, nc[e] as u32)),
                    ));
                }
            }
            match current {
                Some(ci) => {
                    cont_line(&mut nodes[ci], &code, &comment);
                    warnings.push((ln, "W_UNINDENTED_CONTINUATION", None));
                }
                None => {
                    errors.push((ln, "E_NO_DIRECTIVE", Some(code.chars().take(40).collect())));
                }
            }
        } else {
            match current {
                Some(ci) => cont_line(&mut nodes[ci], &code, &comment),
                None => errors.push((ln, "E_ORPHAN_CONTINUATION", Some(code.chars().take(40).collect()))),
            }
        }
    }

    json!({
        "ast": nodes.iter().map(node_value).collect::<Vec<Value>>(),
        "errors": errors.iter().map(diag).collect::<Vec<Value>>(),
        "warnings": warnings.iter().map(diag).collect::<Vec<Value>>(),
    })
}
