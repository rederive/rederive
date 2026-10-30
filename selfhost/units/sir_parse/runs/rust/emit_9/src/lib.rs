use serde_json::{json, Map, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_sp(s: &str) -> &str {
    s.trim_matches(|c| sp(c))
}

fn is_glue(c: char) -> bool {
    let u = c as u32;
    matches!(u,
        0x0A..=0x0D | 0x85 | 0xA0 | 0xAD | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F | 0x890 | 0x891 | 0x8E2
        | 0x1680 | 0x180E | 0x2000..=0x200F | 0x2028..=0x202F | 0x205F..=0x2064 | 0x2066..=0x206F
        | 0x3000 | 0xFEFF | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F
        | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
}

fn hex(c: char) -> String {
    format!("U+{:04X}", c as u32)
}

fn word_char(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-'
}

fn shaped(n: &[char]) -> bool {
    !n.is_empty() && n[0].is_ascii_uppercase() && n[1..].iter().all(|&c| word_char(c))
}

fn registry(name: &str) -> Option<(&'static str, &'static str)> {
    let r = match name {
        "UNIT" | "SIG" | "ENVELOPE" | "DEPENDS-ON" | "PINNED" | "EARNED" | "CARRIED" => ("B", "lb"),
        "DESCRIPTION" | "NOTE" | "RATIONALE" | "PROVENANCE" => ("B", "pr"),
        "KIND" | "FIDELITY" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS" | "TRACE-SEAM"
        | "SEAM" | "BEHAVIOR" | "TABLE" | "UNGUARDED-PRECONDITION" | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE"
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

fn spans(c: &[char]) -> Vec<(usize, usize)> {
    const OP: [char; 16] = [' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~'];
    let mut out = vec![];
    let mut last: Option<usize> = None;
    let mut i = 0;
    while i < c.len() {
        if c[i] == '"' && (i == 0 || OP.contains(&c[i - 1]) || last == Some(i - 1)) {
            let mut j = i + 1;
            let mut found = false;
            while j < c.len() {
                if c[j] == '\\' {
                    j += 2;
                } else if c[j] == '"' {
                    found = true;
                    break;
                } else {
                    j += 1;
                }
            }
            if found {
                out.push((i, j));
                last = Some(j);
                i = j + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn sub(t: &[char], a: usize, b: usize) -> String {
    t[a..b].iter().collect()
}

fn attrs_of(t: &[char]) -> (String, Vec<(String, String)>) {
    const KW: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let n = t.len();
    let sps = spans(t);
    let mut groups: Vec<(usize, usize, usize)> = vec![];
    let mut i = 0;
    while i < n {
        if sp(t[i]) {
            let mut j = i;
            while j < n && sp(t[j]) {
                j += 1;
            }
            let mut hit = false;
            for kw in KW {
                let k: Vec<char> = kw.chars().collect();
                let l = k.len();
                if j + l <= n && t[j..j + l] == k[..] && (j + l == n || sp(t[j + l])) {
                    groups.push((i, j, j + l));
                    i = j + l;
                    hit = true;
                    break;
                }
            }
            if !hit {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    let kept: Vec<_> = groups
        .into_iter()
        .filter(|g| !sps.iter().any(|&(o, c)| o < g.1 && g.1 < c))
        .collect();
    if kept.is_empty() {
        return (trim_sp(&sub(t, 0, n)).to_string(), vec![]);
    }
    let body = trim_sp(&sub(t, 0, kept[0].0)).to_string();
    let mut list = vec![];
    for (idx, g) in kept.iter().enumerate() {
        let end = if idx + 1 < kept.len() { kept[idx + 1].0 } else { n };
        list.push((sub(t, g.1, g.2), trim_sp(&sub(t, g.2, end)).to_string()));
    }
    (body, list)
}

struct Node {
    name: String,
    args: String,
    attr_list: Vec<(String, String)>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: &'static str,
}

fn store(n: &mut Node, list: Vec<(String, String)>) {
    for kv in list {
        n.attr_list.push(kv);
    }
}

fn cont(n: &mut Node, code: &str, comment: Option<String>) {
    let t: Vec<char> = format!(" {}", code).chars().collect();
    let (body, list) = attrs_of(&t);
    store(n, list);
    if !body.is_empty() {
        n.cont.push(body);
    }
    if let Some(c) = comment {
        n.comments.push(c);
    }
}

fn diag(code: &str, line: usize, msg: Option<String>) -> Value {
    match msg {
        Some(m) => json!({"code": code, "line": line as u64, "msg": m}),
        None => json!({"code": code, "line": line as u64}),
    }
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = vec![];
    let mut cur = vec![];
    let mut i = 0;
    while i < cs.len() {
        match cs[i] {
            '\r' => {
                if i + 1 < cs.len() && cs[i + 1] == '\n' {
                    i += 1;
                }
                lines.push(std::mem::take(&mut cur));
            }
            '\n' => lines.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
        i += 1;
    }
    lines.push(cur);
    lines
}

fn clean(l: &[char]) -> Vec<char> {
    let mut k = 0;
    while k < l.len() && (sp(l[k]) || l[k] == '\u{feff}') {
        k += 1;
    }
    let mut out: Vec<char> = l[..k].iter().copied().filter(|&c| c != '\u{feff}').collect();
    out.extend_from_slice(&l[k..]);
    while out.last().map_or(false, |&c| sp(c)) {
        out.pop();
    }
    out
}

fn first40(s: &str) -> String {
    s.chars().take(40).collect()
}

fn name_sep(code: &[char]) -> Option<String> {
    let n = code.len();
    if n > 0 && code[0].is_ascii_uppercase() {
        let mut e = 1;
        while e < n && word_char(code[e]) {
            e += 1;
        }
        let g = sub(code, 0, e);
        let mut p = e;
        if p < n && code[p] == ':' {
            p += 1;
        }
        if p < n && is_glue(code[p]) {
            return Some(format!(
                "{} is followed by {}, not a space or tab: not {}",
                g,
                hex(code[p]),
                if g == "CITED" { "an attribute" } else { "a directive" }
            ));
        }
    }
    let mut r = 0;
    while r < n && is_glue(code[r]) {
        r += 1;
    }
    if r == 0 || r >= n {
        return None;
    }
    let pre = format!("the line starts with {} (whitespace or an invisible character) before ", hex(code[0]));
    if code[r] == '#' {
        return Some(format!("{}a comment marker: not a comment", pre));
    }
    if code[r].is_ascii_uppercase() {
        let mut e = r + 1;
        while e < n && word_char(code[e]) {
            e += 1;
        }
        if e == n || sp(code[e]) || code[e] == ':' || is_glue(code[e]) {
            let w = sub(code, r, e);
            return Some(format!(
                "{}a directive-shaped name: not {}",
                pre,
                if w == "CITED" { "an attribute" } else { "a directive" }
            ));
        }
    }
    None
}

pub fn sir_parse(text: &str) -> Value {
    let mut nodes: Vec<Node> = vec![];
    let mut comment_nodes: Vec<(usize, String)> = vec![];
    let mut order: Vec<(bool, usize)> = vec![];
    let mut errors: Vec<Value> = vec![];
    let mut warnings: Vec<Value> = vec![];
    let mut current: Option<usize> = None;

    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
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
            warnings.push(diag("W_LEGACY_COMMENT", ln, None));
            let mut k = 0;
            while k < content.len() && content[k] == '#' {
                k += 1;
            }
            if k < content.len() && sp(content[k]) {
                k += 1;
            }
            let ctext = sub(content, k, content.len());
            match current {
                Some(c) => nodes[c].comments.push(ctext),
                None => {
                    comment_nodes.push((ln, sub(content, 0, content.len())));
                    order.push((true, comment_nodes.len() - 1));
                }
            }
            continue;
        }
        let sps = spans(content);
        let mut marker = None;
        for p in 1..content.len() {
            if content[p] == '#'
                && sp(content[p - 1])
                && (p + 1 == content.len() || sp(content[p + 1]))
                && !sps.iter().any(|&(o, c)| o < p && p < c)
            {
                marker = Some(p);
                break;
            }
        }
        let (code, comment): (Vec<char>, Option<String>) = match marker {
            Some(p) => {
                warnings.push(diag("W_LEGACY_TRAILING_COMMENT", ln, None));
                let mut cd = content[..p].to_vec();
                while cd.last().map_or(false, |&c| sp(c)) {
                    cd.pop();
                }
                (cd, Some(trim_sp(&sub(content, p + 1, content.len())).to_string()))
            }
            None => (content.to_vec(), None),
        };
        let code_s: String = code.iter().collect();
        if ind == 0 {
            let e = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let mut name: Vec<char> = code[..e].to_vec();
            let rest: Vec<char> = code[e..].to_vec();
            if name.len() >= 2 && *name.last().unwrap() == ':' {
                let base = &name[..name.len() - 1];
                if shaped(base) && sub(base, 0, base.len()) != "CITED" {
                    name.pop();
                    warnings.push(diag("W_LEGACY_COLON", ln, Some(name.iter().collect())));
                }
            }
            let ns: String = name.iter().collect();
            if shaped(&name) && ns != "CITED" {
                let (register, kind) = match registry(&ns) {
                    Some((r, k)) => (Some(r), k),
                    None => {
                        warnings.push(diag("W_UNKNOWN_DIRECTIVE", ln, Some(ns.clone())));
                        (None, "unknown")
                    }
                };
                let (body, list) = attrs_of(&rest);
                let mut node = Node {
                    name: ns,
                    args: body,
                    attr_list: vec![],
                    cont: vec![],
                    comments: comment.into_iter().collect(),
                    line: ln,
                    register,
                    kind,
                };
                store(&mut node, list);
                nodes.push(node);
                current = Some(nodes.len() - 1);
                order.push((false, nodes.len() - 1));
            } else {
                if let Some(m) = name_sep(&code) {
                    warnings.push(diag("W_NAME_SEPARATOR", ln, Some(m)));
                }
                match current {
                    Some(c) => {
                        cont(&mut nodes[c], &code_s, comment);
                        warnings.push(diag("W_UNINDENTED_CONTINUATION", ln, None));
                    }
                    None => errors.push(diag("E_NO_DIRECTIVE", ln, Some(first40(&code_s)))),
                }
            }
        } else {
            match current {
                Some(c) => cont(&mut nodes[c], &code_s, comment),
                None => errors.push(diag("E_ORPHAN_CONTINUATION", ln, Some(first40(&code_s)))),
            }
        }
    }

    let ast: Vec<Value> = order
        .iter()
        .map(|&(is_c, i)| {
            if is_c {
                let (ln, body) = &comment_nodes[i];
                json!({"directive": "#", "name": "#", "body": body, "args": "", "attrs": {},
                       "attrList": [], "cont": [], "comments": [body], "line": *ln as u64,
                       "register": Value::Null, "kind": "comment"})
            } else {
                let n = &nodes[i];
                let mut attrs = Map::new();
                for (k, _) in &n.attr_list {
                    if !attrs.contains_key(k) {
                        let vals: Vec<&str> = n
                            .attr_list
                            .iter()
                            .filter(|(kk, v)| kk == k && !v.is_empty())
                            .map(|(_, v)| v.as_str())
                            .collect();
                        attrs.insert(k.clone(), Value::String(vals.join("; ")));
                    }
                }
                let al: Vec<Value> = n.attr_list.iter().map(|(k, v)| json!([k, v])).collect();
                json!({"directive": n.name, "name": n.name, "args": n.args, "attrs": attrs,
                       "attrList": al, "cont": n.cont, "comments": n.comments, "line": n.line as u64,
                       "register": n.register.map(Value::from).unwrap_or(Value::Null), "kind": n.kind})
            }
        })
        .collect();
    json!({"ast": ast, "errors": errors, "warnings": warnings})
}
