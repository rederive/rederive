use serde_json::{json, Map, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_glue(c: char) -> bool {
    let u = c as u32;
    matches!(u,
        0xa..=0xd | 0x85 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000
        | 0xad | 0x600..=0x605 | 0x61c | 0x6dd | 0x70f | 0x890 | 0x891 | 0x8e2 | 0x180e
        | 0x200b..=0x200f | 0x202a..=0x202e | 0x2060..=0x2064 | 0x2066..=0x206f | 0xfeff
        | 0xfff9..=0xfffb | 0x110bd | 0x110cd | 0x13430..=0x1343f | 0x1bca0..=0x1bca3
        | 0x1d173..=0x1d17a | 0xe0001 | 0xe0020..=0xe007f)
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

fn clean(line: &[char]) -> Vec<char> {
    let mut n = 0;
    while n < line.len() && (sp(line[n]) || line[n] == '\u{feff}') {
        n += 1;
    }
    let mut v: Vec<char> = line[..n].iter().copied().filter(|&c| c != '\u{feff}').collect();
    v.extend_from_slice(&line[n..]);
    while let Some(&l) = v.last() {
        if sp(l) {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn trim(s: &[char]) -> String {
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

fn opener_prev(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn spans(s: &[char]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < s.len() {
        if s[i] == '"'
            && (i == 0 || opener_prev(s[i - 1]) || last_close.map_or(false, |l| l + 1 == i))
        {
            let mut k = i + 1;
            let mut close = None;
            while k < s.len() {
                if s[k] == '\\' {
                    k += 2;
                } else if s[k] == '"' {
                    close = Some(k);
                    break;
                } else {
                    k += 1;
                }
            }
            if let Some(c) = close {
                out.push((i, c));
                last_close = Some(c);
                i = c + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn inside(sp_: &[(usize, usize)], j: usize) -> bool {
    sp_.iter().any(|&(o, c)| o < j && j < c)
}

fn attrs(t: &[char]) -> (String, Vec<(String, String)>) {
    let n = t.len();
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut groups: Vec<(usize, usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(t[i]) {
            let mut j = i;
            while j < n && sp(t[j]) {
                j += 1;
            }
            let mut m = None;
            for kw in kws {
                let k: Vec<char> = kw.chars().collect();
                if j + k.len() <= n && t[j..j + k.len()] == k[..] && (j + k.len() == n || sp(t[j + k.len()])) {
                    m = Some((kw, k.len()));
                    break;
                }
            }
            match m {
                Some((kw, l)) => {
                    groups.push((i, j, j + l, kw));
                    i = j + l;
                }
                None => i = j,
            }
        } else {
            i += 1;
        }
    }
    let ss = spans(t);
    let groups: Vec<_> = groups.into_iter().filter(|g| !inside(&ss, g.1)).collect();
    if groups.is_empty() {
        return (trim(t), Vec::new());
    }
    let body = trim(&t[..groups[0].0]);
    let mut list = Vec::new();
    for (idx, g) in groups.iter().enumerate() {
        let end = if idx + 1 < groups.len() { groups[idx + 1].0 } else { n };
        list.push((g.3.to_string(), trim(&t[g.2..end])));
    }
    (body, list)
}

struct Node {
    name: String,
    args: String,
    attr_list: Vec<(String, String)>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: u64,
    register: Option<&'static str>,
    kind: &'static str,
}

fn store(node: &mut Node, list: Vec<(String, String)>) {
    node.attr_list.extend(list);
}

fn shaped(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
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
            let b = name.as_bytes();
            if b.len() >= 2 && b[0] == b'R' && b[1..].iter().all(|c| c.is_ascii_digit()) {
                (Some("P"), "lb")
            } else {
                (None, "unknown")
            }
        }
    }
}

fn hex(c: char) -> String {
    format!("U+{:04X}", c as u32)
}

fn word_len(s: &[char], at: usize) -> Option<usize> {
    if at < s.len() && s[at].is_ascii_uppercase() {
        let mut k = at + 1;
        while k < s.len() && (s[k].is_ascii_uppercase() || s[k].is_ascii_digit() || s[k] == '-') {
            k += 1;
        }
        Some(k - at)
    } else {
        None
    }
}

fn which(w: &str) -> &'static str {
    if w == "CITED" {
        "an attribute"
    } else {
        "a directive"
    }
}

fn separator_msg(code: &[char]) -> Option<String> {
    if let Some(wl) = word_len(code, 0) {
        let g: String = code[..wl].iter().collect();
        let mut p = wl;
        if p < code.len() && code[p] == ':' {
            p += 1;
        }
        if p < code.len() && is_glue(code[p]) {
            return Some(format!(
                "{} is followed by {}, not a space or tab: not {}",
                g,
                hex(code[p]),
                which(&g)
            ));
        }
    }
    let mut r = 0;
    while r < code.len() && is_glue(code[r]) {
        r += 1;
    }
    if r == 0 || r >= code.len() {
        return None;
    }
    let head = format!("the line starts with {} (whitespace or an invisible character) before ", hex(code[0]));
    if code[r] == '#' {
        return Some(format!("{}a comment marker: not a comment", head));
    }
    if let Some(wl) = word_len(code, r) {
        let e = r + wl;
        if e >= code.len() || sp(code[e]) || code[e] == ':' || is_glue(code[e]) {
            let w: String = code[r..e].iter().collect();
            return Some(format!("{}a directive-shaped name: not {}", head, which(&w)));
        }
    }
    None
}

fn first40(code: &[char]) -> String {
    code.iter().take(40).collect()
}

fn diag(line: u64, code: &str, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("line".into(), Value::from(line));
    m.insert("code".into(), Value::from(code));
    if let Some(s) = msg {
        m.insert("msg".into(), Value::from(s));
    }
    Value::Object(m)
}

fn strs(v: &[String]) -> Value {
    Value::Array(v.iter().map(|s| Value::from(s.as_str())).collect())
}

fn node_value(n: &Node) -> Value {
    let mut attrs_m = Map::new();
    for (k, _) in &n.attr_list {
        let vals: Vec<&str> = n
            .attr_list
            .iter()
            .filter(|(k2, v)| k2 == k && !v.is_empty())
            .map(|(_, v)| v.as_str())
            .collect();
        attrs_m.insert(k.clone(), Value::from(vals.join("; ")));
    }
    let al: Vec<Value> = n.attr_list.iter().map(|(k, v)| json!([k, v])).collect();
    json!({
        "directive": n.name,
        "name": n.name,
        "args": n.args,
        "attrs": Value::Object(attrs_m),
        "attrList": al,
        "cont": strs(&n.cont),
        "comments": strs(&n.comments),
        "line": n.line,
        "register": match n.register { Some(r) => Value::from(r), None => Value::Null },
        "kind": n.kind,
    })
}

pub fn sir_parse(text: &str) -> Value {
    let lines = split_lines(text);
    let mut ast: Vec<Value> = Vec::new();
    let mut nodes: Vec<(Option<Node>, Option<Value>)> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut cur: Option<usize> = None;
    for (li, raw) in lines.iter().enumerate() {
        let ln = (li + 1) as u64;
        let line = clean(raw);
        if line.is_empty() {
            continue;
        }
        let mut ind = 0;
        while ind < line.len() && sp(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];
        if content[0] == '#' {
            warnings.push(diag(ln, "W_LEGACY_COMMENT", None));
            if let Some(ci) = cur {
                let mut k = 0;
                while k < content.len() && content[k] == '#' {
                    k += 1;
                }
                if k < content.len() && sp(content[k]) {
                    k += 1;
                }
                let s: String = content[k..].iter().collect();
                nodes[ci].0.as_mut().unwrap().comments.push(s);
            } else {
                let c: String = content.iter().collect();
                nodes.push((
                    None,
                    Some(json!({
                        "directive": "#", "name": "#", "body": c, "args": "", "attrs": {}, "attrList": [],
                        "cont": [], "comments": [c], "line": ln, "register": Value::Null, "kind": "comment"
                    })),
                ));
            }
            continue;
        }
        let ss = spans(content);
        let mut marker = None;
        for j in 1..content.len() {
            if content[j] == '#'
                && sp(content[j - 1])
                && (j + 1 == content.len() || sp(content[j + 1]))
                && !inside(&ss, j)
            {
                marker = Some(j);
                break;
            }
        }
        let (code, comment): (Vec<char>, Option<String>) = match marker {
            Some(j) => {
                warnings.push(diag(ln, "W_LEGACY_TRAILING_COMMENT", None));
                let mut e = j;
                while e > 0 && sp(content[e - 1]) {
                    e -= 1;
                }
                (content[..e].to_vec(), Some(trim(&content[j + 1..])))
            }
            None => (content.to_vec(), None),
        };
        if ind == 0 {
            let sidx = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let mut name: Vec<char> = code[..sidx].to_vec();
            let rest: Vec<char> = code[sidx..].to_vec();
            if name.len() >= 2 && *name.last().unwrap() == ':' {
                let before = &name[..name.len() - 1];
                let bs: String = before.iter().collect();
                if shaped(before) && bs != "CITED" {
                    name.pop();
                    warnings.push(diag(ln, "W_LEGACY_COLON", Some(name.iter().collect())));
                }
            }
            let ns: String = name.iter().collect();
            if shaped(&name) && ns != "CITED" {
                let (register, kind) = registry(&ns);
                if register.is_none() {
                    warnings.push(diag(ln, "W_UNKNOWN_DIRECTIVE", Some(ns.clone())));
                }
                let (body, list) = attrs(&rest);
                let mut node = Node {
                    name: ns,
                    args: body,
                    attr_list: Vec::new(),
                    cont: Vec::new(),
                    comments: comment.into_iter().collect(),
                    line: ln,
                    register,
                    kind,
                };
                store(&mut node, list);
                nodes.push((Some(node), None));
                cur = Some(nodes.len() - 1);
            } else {
                if let Some(m) = separator_msg(&code) {
                    warnings.push(diag(ln, "W_NAME_SEPARATOR", Some(m)));
                }
                if let Some(ci) = cur {
                    continue_line(nodes[ci].0.as_mut().unwrap(), &code, comment);
                    warnings.push(diag(ln, "W_UNINDENTED_CONTINUATION", None));
                } else {
                    errors.push(diag(ln, "E_NO_DIRECTIVE", Some(first40(&code))));
                }
            }
        } else if let Some(ci) = cur {
            continue_line(nodes[ci].0.as_mut().unwrap(), &code, comment);
        } else {
            errors.push(diag(ln, "E_ORPHAN_CONTINUATION", Some(first40(&code))));
        }
    }
    for (n, v) in &nodes {
        match (n, v) {
            (Some(n), _) => ast.push(node_value(n)),
            (None, Some(v)) => ast.push(v.clone()),
            _ => {}
        }
    }
    json!({"ast": ast, "errors": errors, "warnings": warnings})
}

fn continue_line(node: &mut Node, code: &[char], comment: Option<String>) {
    let mut t = vec![' '];
    t.extend_from_slice(code);
    let (body, list) = attrs(&t);
    store(node, list);
    if !body.is_empty() {
        node.cont.push(body);
    }
    if let Some(c) = comment {
        node.comments.push(c);
    }
}
