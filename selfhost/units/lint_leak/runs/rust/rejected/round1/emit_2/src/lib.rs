use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{B}' | '\u{C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}
fn display(s: &str) -> String {
    let t = trim_ws(s);
    let mut out = String::new();
    let mut u = 0;
    for ch in t.chars() {
        let l = ch.len_utf16();
        if u + l > 96 {
            break;
        }
        u += l;
        out.push(ch);
    }
    out
}

fn split_lines(text: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut cur = String::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    lines.push(cur);
    lines
}

fn at(c: &[char], i: usize, s: &str) -> bool {
    let mut k = i;
    for ch in s.chars() {
        if k >= c.len() || c[k] != ch {
            return false;
        }
        k += 1;
    }
    true
}
fn pre_ok(c: &[char], i: usize) -> bool {
    i == 0 || !word(c[i - 1])
}
fn nw(c: &[char], i: usize) -> bool {
    i >= c.len() || !word(c[i])
}

fn body(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let n = c.len();
    let mut i = 0;
    while i < n {
        if is_st(c[i]) {
            let mut j = i;
            while j < n && is_st(c[j]) {
                j += 1;
            }
            for kw in ["CITED", "EARNED", "ANCHOR"] {
                if at(&c, j, kw) {
                    let e = j + kw.len();
                    if e >= n || is_st(c[e]) {
                        let t: String = c[..i].iter().collect();
                        return trim_ws(&t).to_string();
                    }
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    trim_ws(s).to_string()
}

struct Node {
    name: String,
    line: usize,
    args: String,
    cont: Vec<String>,
    comments: Vec<String>,
    is_comment: bool,
}

fn nameshape(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}
fn rule_name(s: &str) -> bool {
    let mut it = s.chars();
    it.next() == Some('R') && !s[1..].is_empty() && s[1..].chars().all(|c| c.is_ascii_digit())
}

fn parse(text: &str) -> Vec<Node> {
    let mut nodes: Vec<Node> = Vec::new();
    let mut cur: Option<usize> = None;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let lineno = idx + 1;
        let l = raw.trim_start_matches('\u{FEFF}').trim_end_matches(is_st);
        if l.chars().all(is_ws) {
            continue;
        }
        let content = l.trim_start_matches(is_st);
        let indent_empty = content.len() == l.len();
        if content.starts_with('#') {
            let rest = content.trim_start_matches('#');
            let mut ch = rest.chars();
            let rest = match ch.next() {
                Some(c) if is_ws(c) => ch.as_str(),
                _ => rest,
            };
            match cur {
                Some(ci) => nodes[ci].comments.push(rest.to_string()),
                None => nodes.push(Node {
                    name: "#".into(),
                    line: lineno,
                    args: String::new(),
                    cont: vec![],
                    comments: vec![content.to_string()],
                    is_comment: true,
                }),
            }
            continue;
        }
        let cc: Vec<char> = content.chars().collect();
        let mut code: String = content.to_string();
        let mut trailer: Option<String> = None;
        for k in 1..cc.len() {
            if cc[k] == '#' && is_ws(cc[k - 1]) && (k + 1 == cc.len() || is_ws(cc[k + 1])) {
                let a: String = cc[..k - 1].iter().collect();
                code = a.trim_end_matches(is_ws).to_string();
                let b: String = cc[k + 1..].iter().collect();
                trailer = Some(trim_ws(&b).to_string());
                break;
            }
        }
        if indent_empty {
            let (nm, rest) = match code.find(is_st) {
                Some(p) => (&code[..p], code[p + 1..].trim_start_matches(is_st)),
                None => (&code[..], ""),
            };
            let mut name = nm.to_string();
            if let Some(stripped) = nm.strip_suffix(':') {
                if nameshape(stripped) {
                    name = stripped.to_string();
                }
            }
            if nameshape(&name) {
                nodes.push(Node {
                    name,
                    line: lineno,
                    args: body(rest),
                    cont: vec![],
                    comments: trailer.into_iter().collect(),
                    is_comment: false,
                });
                cur = Some(nodes.len() - 1);
                continue;
            }
        }
        if let Some(ci) = cur {
            nodes[ci].cont.push(body(&format!(" {}", code)));
            if let Some(t) = trailer {
                nodes[ci].comments.push(t);
            }
        }
    }
    nodes
}

fn blank(s: &str) -> Vec<char> {
    let c: Vec<char> = s.chars().collect();
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
        let mut end = None;
        while j < n {
            let x = c[j];
            if x == '"' {
                end = Some(j);
                break;
            }
            if x == '\\' {
                if j + 1 < n && !matches!(c[j + 1], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                    j += 2;
                } else {
                    break;
                }
            } else {
                j += 1;
            }
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

fn is_term(c: char) -> bool {
    matches!(c, '\r' | '\n' | '\u{2028}' | '\u{2029}')
}

fn row_anchor(c: &[char]) -> bool {
    for i in 0..c.len() {
        if at(c, i, "/^") {
            let mut j = i + 2;
            while j < c.len() {
                if is_term(c[j]) {
                    break;
                }
                if at(c, j, "$/") {
                    return true;
                }
                j += 1;
            }
        }
    }
    false
}
fn row_class(c: &[char]) -> bool {
    (0..c.len()).any(|i| {
        c[i] == '\\' && i + 1 < c.len() && "wsdWSDbB".contains(c[i + 1]) && nw(c, i + 2)
    })
}
fn row_prop(c: &[char]) -> bool {
    (0..c.len()).any(|i| at(c, i, "\\p{"))
}
fn row_js1(c: &[char]) -> bool {
    let plain = ["String.prototype", "parseInt", "parseFloat", "BigInt"];
    let paren = [
        "Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(", "charCodeAt(",
        "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd(",
    ];
    (0..c.len()).any(|i| {
        pre_ok(c, i)
            && ((at(c, i, "Math.") && i + 5 < c.len() && word(c[i + 5]))
                || plain.iter().any(|p| at(c, i, p) && nw(c, i + p.len()))
                || paren.iter().any(|p| at(c, i, p)))
    })
}
fn row_js2(c: &[char]) -> bool {
    let names = ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl"];
    (0..c.len()).any(|i| {
        pre_ok(c, i)
            && names.iter().any(|p| {
                let e = i + p.len();
                at(c, i, p) && e + 1 < c.len() && c[e] == '.' && c[e + 1].is_ascii_lowercase()
            })
    })
}
fn row_rust(c: &[char]) -> bool {
    let w = ["fancy-regex", "fancy_regex", "to_lowercase", "&str"];
    let t = [
        "f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap", "BTreeMap",
    ];
    (0..c.len()).any(|i| {
        pre_ok(c, i)
            && (w.iter().any(|p| at(c, i, p) && nw(c, i + p.len()))
                || t.iter().any(|p| at(c, i, p) && at(c, i + p.len(), "::"))
                || at(c, i, "Option<")
                || at(c, i, "Vec<"))
    })
}
fn row_lt(c: &[char]) -> bool {
    let term: Vec<char> = "terminator".chars().collect();
    let line: Vec<char> = "line".chars().collect();
    let m = |i: usize, p: &[char]| -> bool {
        i + p.len() <= c.len() && (0..p.len()).all(|k| c[i + k].eq_ignore_ascii_case(&p[k]))
    };
    (0..c.len()).any(|i| {
        if !pre_ok(c, i) || !m(i, &line) {
            return false;
        }
        let a = i + 4;
        m(a, &term) || (a < c.len() && (c[a] == '-' || c[a] == ' ') && m(a + 1, &term))
    })
}
fn row_null(c: &[char]) -> bool {
    (0..c.len()).any(|i| {
        pre_ok(c, i) && ["null", "undefined"].iter().any(|p| at(c, i, p) && nw(c, i + p.len()))
    })
}

const P_NAMES: &[&str] = &[
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM",
    "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE",
    "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE", "EMIT", "REQUEST", "BRANCH", "ON-ERROR",
    "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE", "NOTES", "GUARD-PINNED",
];

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let nodes = parse(text);
    let mut hits: Vec<Value> = Vec::new();
    let mut push = |line: usize, what: &str, t: String| {
        hits.push(json!({"line": line, "what": what, "text": t}));
    };
    let rows: [(&str, fn(&[char]) -> bool); 8] = [
        ("anchored regex literal", row_anchor),
        ("regex class escape", row_class),
        ("regex property escape", row_prop),
        ("JS API name", row_js1),
        ("JS API name", row_js2),
        ("Rust API name", row_rust),
        ("line-terminator mechanism", row_lt),
        ("JS value name (say none)", row_null),
    ];
    for n in &nodes {
        if is_primary {
            let mut segs: Vec<&String> = Vec::new();
            if n.is_comment {
                segs.extend(n.comments.iter());
            } else {
                segs.push(&n.args);
                segs.extend(n.cont.iter());
                segs.extend(n.comments.iter());
            }
            for s in segs {
                let b = blank(s);
                for (label, f) in rows.iter() {
                    if f(&b) {
                        let bs: String = b.iter().collect();
                        push(n.line, label, display(&format!("{} {}", n.name, bs)));
                    }
                }
            }
        } else if !n.is_comment && (P_NAMES.contains(&n.name.as_str()) || rule_name(&n.name)) {
            push(n.line, "behavior in a language file", display(&format!("{} {}", n.name, n.args)));
        }
    }
    json!({ "hits": hits })
}
