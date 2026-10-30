use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{B}' | '\u{C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}'
        | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn trim_ws(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_ws(s[a]) {
        a += 1;
    }
    while b > a && is_ws(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn s(c: &[char]) -> String {
    c.iter().collect()
}

fn split_lines(t: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = t.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' || c == '\n' {
            if c == '\r' && i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn nameshape(n: &str) -> bool {
    let mut it = n.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn rule_name(n: &str) -> bool {
    n.len() >= 2 && n.starts_with('R') && n[1..].chars().all(|c| c.is_ascii_digit())
}

fn starts(c: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for pc in p.chars() {
        if k >= c.len() || c[k] != pc {
            return false;
        }
        k += 1;
    }
    true
}

fn starts_ci(c: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for pc in p.chars() {
        if k >= c.len() || !c[k].eq_ignore_ascii_case(&pc) {
            return false;
        }
        k += 1;
    }
    true
}

fn body(c: &[char]) -> String {
    let n = c.len();
    let mut i = 0;
    while i < n {
        if is_st(c[i]) {
            let mut j = i;
            while j < n && is_st(c[j]) {
                j += 1;
            }
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                if starts(c, j, kw) {
                    let e = j + kw.len();
                    if e >= n || is_st(c[e]) {
                        return s(trim_ws(&c[..i]));
                    }
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    s(trim_ws(c))
}

struct Node {
    name: String,
    line: usize,
    segs: Vec<String>,
    args: String,
    cont: Vec<String>,
    comments: Vec<String>,
    comment: bool,
}

fn parse(text: &str) -> Vec<Node> {
    let mut nodes: Vec<Node> = Vec::new();
    let mut cur: Option<usize> = None;
    for (idx, raw) in split_lines(text).into_iter().enumerate() {
        let line = idx + 1;
        let mut a = 0;
        while a < raw.len() && raw[a] == '\u{FEFF}' {
            a += 1;
        }
        let mut b = raw.len();
        while b > a && is_st(raw[b - 1]) {
            b -= 1;
        }
        let l = &raw[a..b];
        if l.iter().all(|&c| is_ws(c)) {
            continue;
        }
        let mut k = 0;
        while k < l.len() && is_st(l[k]) {
            k += 1;
        }
        let indent = k;
        let content = &l[k..];
        if content[0] == '#' {
            let mut h = 0;
            while h < content.len() && content[h] == '#' {
                h += 1;
            }
            if h < content.len() && is_ws(content[h]) {
                h += 1;
            }
            if let Some(ci) = cur {
                nodes[ci].comments.push(s(&content[h..]));
            } else {
                nodes.push(Node {
                    name: "#".into(),
                    line,
                    segs: vec![s(content)],
                    args: String::new(),
                    cont: vec![],
                    comments: vec![],
                    comment: true,
                });
            }
            continue;
        }
        let mut code: &[char] = content;
        let mut trailer: Option<String> = None;
        for i in 1..content.len() {
            if content[i] == '#' && is_ws(content[i - 1]) && (i + 1 == content.len() || is_ws(content[i + 1])) {
                let mut e = i - 1;
                while e > 0 && is_ws(content[e - 1]) {
                    e -= 1;
                }
                code = &content[..e];
                trailer = Some(s(trim_ws(&content[i + 1..])));
                break;
            }
        }
        if indent == 0 {
            let sp = code.iter().position(|&c| is_st(c));
            let (nm, rest): (&[char], &[char]) = match sp {
                Some(p) => {
                    let mut r = p + 1;
                    while r < code.len() && is_st(code[r]) {
                        r += 1;
                    }
                    (&code[..p], &code[r..])
                }
                None => (code, &code[code.len()..]),
            };
            let mut name = s(nm);
            if name.ends_with(':') && nameshape(&name[..name.len() - 1]) {
                name.pop();
            }
            if nameshape(&name) {
                nodes.push(Node {
                    name,
                    line,
                    segs: vec![],
                    args: body(rest),
                    cont: vec![],
                    comments: trailer.into_iter().collect(),
                    comment: false,
                });
                cur = Some(nodes.len() - 1);
                continue;
            }
        }
        if let Some(ci) = cur {
            let mut v = vec![' '];
            v.extend_from_slice(code);
            nodes[ci].cont.push(body(&v));
            if let Some(t) = trailer {
                nodes[ci].comments.push(t);
            }
        }
    }
    for n in nodes.iter_mut() {
        if !n.comment {
            let mut v = vec![n.args.clone()];
            v.extend(n.cont.iter().cloned());
            v.extend(n.comments.iter().cloned());
            n.segs = v;
        }
    }
    nodes
}

fn display(x: &str) -> String {
    let cs: Vec<char> = x.chars().collect();
    let t = trim_ws(&cs);
    let mut out = String::new();
    let mut u = 0;
    for &c in t {
        let w = c.len_utf16();
        if u + w > 96 {
            break;
        }
        u += w;
        out.push(c);
    }
    out
}

fn blank(c: &[char]) -> Vec<char> {
    let n = c.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if c[i] != '"' {
            out.push(c[i]);
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end: Option<usize> = None;
        while j < n {
            if c[j] == '"' {
                end = Some(j);
                break;
            }
            if c[j] == '\\' {
                if j + 1 < n && !matches!(c[j + 1], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                    j += 2;
                    continue;
                }
                break;
            }
            j += 1;
        }
        match end {
            Some(e) => {
                out.push('"');
                out.push('"');
                i = e + 1;
            }
            None => {
                out.push('"');
                i += 1;
            }
        }
    }
    out
}

fn row_anchored(c: &[char]) -> bool {
    let n = c.len();
    for i in 0..n {
        if starts(c, i, "/^") {
            let mut j = i + 2;
            while j < n {
                if matches!(c[j], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                    break;
                }
                if starts(c, j, "$/") {
                    return true;
                }
                j += 1;
            }
        }
    }
    false
}

fn any_at<F: Fn(usize) -> bool>(c: &[char], f: F) -> bool {
    (0..c.len()).any(|i| (i == 0 || !is_word(c[i - 1])) && f(i))
}

fn nf(c: &[char], i: usize, len: usize) -> bool {
    i + len >= c.len() || !is_word(c[i + len])
}

fn rows(c: &[char]) -> Vec<&'static str> {
    let mut h = Vec::new();
    if row_anchored(c) {
        h.push("anchored regex literal");
    }
    let n = c.len();
    if (0..n).any(|i| {
        c[i] == '\\' && i + 1 < n && "wsdWSDbB".contains(c[i + 1]) && (i + 2 >= n || !is_word(c[i + 2]))
    }) {
        h.push("regex class escape");
    }
    if (0..n).any(|i| c[i] == '\\' && starts(c, i + 1, "p{")) {
        h.push("regex property escape");
    }
    if any_at(c, |i| {
        (starts(c, i, "Math.") && i + 5 < n && is_word(c[i + 5]))
            || ["String.prototype", "parseInt", "parseFloat", "BigInt"]
                .iter()
                .any(|p| starts(c, i, p) && nf(c, i, p.chars().count()))
            || [
                "Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(", "charCodeAt(",
                "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd(",
            ]
            .iter()
            .any(|p| starts(c, i, p))
    }) {
        h.push("JS API name");
    }
    if any_at(c, |i| {
        ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl"].iter().any(|p| {
            let l = p.len();
            starts(c, i, p) && i + l + 1 < n && c[i + l] == '.' && c[i + l + 1].is_ascii_lowercase()
        })
    }) {
        h.push("JS API name");
    }
    if any_at(c, |i| {
        ["fancy-regex", "fancy_regex", "to_lowercase"]
            .iter()
            .any(|p| starts(c, i, p) && nf(c, i, p.len()))
            || [
                "f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap", "BTreeMap",
            ]
            .iter()
            .any(|p| starts(c, i, p) && starts(c, i + p.len(), "::"))
            || starts(c, i, "Option<")
            || starts(c, i, "Vec<")
            || (starts(c, i, "&str") && nf(c, i, 4))
    }) {
        h.push("Rust API name");
    }
    if any_at(c, |i| {
        starts_ci(c, i, "line")
            && (starts_ci(c, i + 4, "terminator")
                || (i + 4 < n && (c[i + 4] == '-' || c[i + 4] == ' ') && starts_ci(c, i + 5, "terminator")))
    }) {
        h.push("line-terminator mechanism");
    }
    if any_at(c, |i| {
        (starts(c, i, "null") && nf(c, i, 4)) || (starts(c, i, "undefined") && nf(c, i, 9))
    }) {
        h.push("JS value name (say none)");
    }
    h
}

fn p_name(n: &str) -> bool {
    rule_name(n)
        || [
            "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM",
            "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE",
            "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE", "EMIT", "REQUEST", "BRANCH",
            "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE", "NOTES", "GUARD-PINNED",
        ]
        .contains(&n)
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let nodes = parse(text);
    let mut hits = Vec::new();
    for n in &nodes {
        if is_primary {
            for seg in &n.segs {
                let b = blank(&seg.chars().collect::<Vec<char>>());
                for what in rows(&b) {
                    hits.push(json!({
                        "line": n.line as u64,
                        "what": what,
                        "text": display(&format!("{} {}", n.name, seg)),
                    }));
                }
            }
        } else if !n.comment && p_name(&n.name) {
            hits.push(json!({
                "line": n.line as u64,
                "what": "behavior in a language file",
                "text": display(&format!("{} {}", n.name, n.args)),
            }));
        }
    }
    json!({ "hits": hits })
}
