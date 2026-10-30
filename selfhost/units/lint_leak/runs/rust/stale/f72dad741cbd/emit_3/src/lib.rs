use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_st(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_ws(s: &str) -> &str {
    s.trim_matches(is_ws)
}

fn display(s: &str) -> String {
    let t = trim_ws(s);
    let mut out = String::new();
    let mut units = 0;
    for ch in t.chars() {
        let l = ch.len_utf16();
        if units + l > 96 {
            break;
        }
        units += l;
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

fn is_nameshape(s: &str) -> bool {
    let mut it = s.chars();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return false,
    }
    it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

fn is_rule_name(s: &str) -> bool {
    match s.strip_prefix('R') {
        Some(r) => !r.is_empty() && r.chars().all(|c| c.is_ascii_digit()),
        None => false,
    }
}

fn body(s: &str) -> String {
    let cs: Vec<char> = s.chars().collect();
    let mut cut = cs.len();
    for i in 0..cs.len() {
        if !is_st(cs[i]) {
            continue;
        }
        let mut j = i;
        while j < cs.len() && is_st(cs[j]) {
            j += 1;
        }
        let rest: String = cs[j..].iter().collect();
        let mut hit = false;
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            if let Some(after) = rest.strip_prefix(kw) {
                if after.is_empty() || after.starts_with(|c| is_st(c)) {
                    hit = true;
                }
            }
        }
        if hit {
            cut = i;
            break;
        }
    }
    let t: String = cs[..cut].iter().collect();
    trim_ws(&t).to_string()
}

fn split_trailer(content: &str) -> (String, Option<String>) {
    let cs: Vec<char> = content.chars().collect();
    for k in 1..cs.len() {
        if cs[k] == '#' && is_ws(cs[k - 1]) && (k + 1 == cs.len() || is_ws(cs[k + 1])) {
            let code: String = cs[..k - 1].iter().collect();
            let tr: String = cs[k + 1..].iter().collect();
            return (trim_ws(&code).to_string(), Some(trim_ws(&tr).to_string()));
        }
    }
    (content.to_string(), None)
}

struct Node {
    name: String,
    line: usize,
    args: String,
    cont: Vec<String>,
    comments: Vec<String>,
    comment_node: bool,
}

fn read_nodes(text: &str) -> Vec<Node> {
    let mut nodes: Vec<Node> = Vec::new();
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
        let l1 = raw.trim_start_matches('\u{FEFF}');
        let line = l1.trim_end_matches(|c| is_st(c));
        if line.chars().all(is_ws) {
            continue;
        }
        let content = line.trim_start_matches(|c| is_st(c));
        let indent_empty = content.len() == line.len();
        if content.starts_with('#') {
            let stripped = content.trim_start_matches('#');
            let mut ch = stripped.chars();
            let text = match ch.next() {
                Some(c) if is_ws(c) => ch.as_str(),
                _ => stripped,
            };
            let cur_exists = nodes.iter().any(|n| !n.comment_node);
            if cur_exists {
                let n = nodes.iter_mut().rev().find(|n| !n.comment_node).unwrap();
                n.comments.push(text.to_string());
            } else {
                nodes.push(Node { name: "#".into(), line: ln, args: content.to_string(), cont: vec![], comments: vec![], comment_node: true });
            }
            continue;
        }
        let (code, trailer) = split_trailer(content);
        if indent_empty {
            let (mut name, rest) = match code.find(|c| is_st(c)) {
                Some(p) => (code[..p].to_string(), code[p + 1..].trim_start_matches(|c| is_st(c)).to_string()),
                None => (code.clone(), String::new()),
            };
            if let Some(p) = name.strip_suffix(':') {
                if is_nameshape(p) {
                    name = p.to_string();
                }
            }
            if is_nameshape(&name) {
                nodes.push(Node { name, line: ln, args: body(&rest), cont: vec![], comments: trailer.into_iter().collect(), comment_node: false });
                continue;
            }
        }
        if let Some(n) = nodes.iter_mut().rev().find(|n| !n.comment_node) {
            n.cont.push(body(&format!(" {}", code)));
            if let Some(t) = trailer {
                n.comments.push(t);
            }
        }
    }
    nodes
}

fn blank(seg: &str) -> Vec<char> {
    let cs: Vec<char> = seg.chars().collect();
    let n = cs.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if cs[i] != '"' {
            out.push(cs[i]);
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end = None;
        while j < n {
            let c = cs[j];
            if c == '"' {
                end = Some(j);
                break;
            }
            if c == '\\' {
                if j + 1 < n && !matches!(cs[j + 1], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
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

fn at(cs: &[char], i: usize, lit: &str) -> bool {
    let mut k = i;
    for c in lit.chars() {
        if k >= cs.len() || cs[k] != c {
            return false;
        }
        k += 1;
    }
    true
}

fn at_ci(cs: &[char], i: usize, lit: &str) -> bool {
    let mut k = i;
    for c in lit.chars() {
        if k >= cs.len() || !cs[k].eq_ignore_ascii_case(&c) {
            return false;
        }
        k += 1;
    }
    true
}

fn nw_before(cs: &[char], i: usize) -> bool {
    i == 0 || !is_word(cs[i - 1])
}

fn nw_at(cs: &[char], j: usize) -> bool {
    j >= cs.len() || !is_word(cs[j])
}

fn any_pos(cs: &[char], f: impl Fn(usize) -> bool) -> bool {
    (0..cs.len()).any(|i| nw_before(cs, i) && f(i))
}

fn row_anchored(cs: &[char]) -> bool {
    for p in 0..cs.len() {
        if at(cs, p, "/^") {
            let mut q = p + 2;
            while q < cs.len() {
                if matches!(cs[q], '\r' | '\n' | '\u{2028}' | '\u{2029}') {
                    break;
                }
                if at(cs, q, "$/") {
                    return true;
                }
                q += 1;
            }
        }
    }
    false
}

fn row_class(cs: &[char]) -> bool {
    (0..cs.len()).any(|i| {
        cs[i] == '\\' && i + 1 < cs.len() && "wsdWSDbB".contains(cs[i + 1]) && nw_at(cs, i + 2)
    })
}

fn row_prop(cs: &[char]) -> bool {
    (0..cs.len()).any(|i| cs[i] == '\\' && at(cs, i + 1, "p{"))
}

fn row_js1(cs: &[char]) -> bool {
    any_pos(cs, |i| {
        if at(cs, i, "Math.") && i + 5 < cs.len() && is_word(cs[i + 5]) {
            return true;
        }
        for w in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
            if at(cs, i, w) && nw_at(cs, i + w.chars().count()) {
                return true;
            }
        }
        for w in ["Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(", "charCodeAt(", "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd("] {
            if at(cs, i, w) {
                return true;
            }
        }
        false
    })
}

fn row_js2(cs: &[char]) -> bool {
    any_pos(cs, |i| {
        for w in ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl"] {
            if at(cs, i, w) {
                let k = i + w.len();
                if k + 1 < cs.len() && cs[k] == '.' && cs[k + 1].is_ascii_lowercase() {
                    return true;
                }
            }
        }
        false
    })
}

fn row_rust(cs: &[char]) -> bool {
    any_pos(cs, |i| {
        for w in ["fancy-regex", "fancy_regex", "to_lowercase"] {
            if at(cs, i, w) && nw_at(cs, i + w.len()) {
                return true;
            }
        }
        for w in ["f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap", "BTreeMap"] {
            if at(cs, i, w) && at(cs, i + w.len(), "::") {
                return true;
            }
        }
        if at(cs, i, "Option<") || at(cs, i, "Vec<") {
            return true;
        }
        at(cs, i, "&str") && nw_at(cs, i + 4)
    })
}

fn row_lt(cs: &[char]) -> bool {
    any_pos(cs, |i| {
        if !at_ci(cs, i, "line") {
            return false;
        }
        let k = i + 4;
        if at_ci(cs, k, "terminator") {
            return true;
        }
        if k < cs.len() && (cs[k] == '-' || cs[k] == ' ') {
            return at_ci(cs, k + 1, "terminator");
        }
        false
    })
}

fn row_null(cs: &[char]) -> bool {
    any_pos(cs, |i| {
        (at(cs, i, "null") && nw_at(cs, i + 4)) || (at(cs, i, "undefined") && nw_at(cs, i + 9))
    })
}

const ROWS: [(fn(&[char]) -> bool, &str); 8] = [
    (row_anchored, "anchored regex literal"),
    (row_class, "regex class escape"),
    (row_prop, "regex property escape"),
    (row_js1, "JS API name"),
    (row_js2, "JS API name"),
    (row_rust, "Rust API name"),
    (row_lt, "line-terminator mechanism"),
    (row_null, "JS value name (say none)"),
];

fn is_p(name: &str) -> bool {
    matches!(
        name,
        "SIR" | "KIND" | "FIDELITY" | "VARIANT" | "ANCHOR" | "SRC" | "TRIGGER" | "REACH" | "ORACLE-CLASS" | "TRACE-SEAM" | "SEAM" | "BEHAVIOR" | "INVARIANT" | "TABLE" | "SCOPE"
            | "UNGUARDED-PRECONDITION" | "OUT-OF-DOMAIN" | "ORACLE" | "SHAPE" | "CANONICAL-SHA256" | "AUTHORITY" | "CARRIED-DATA" | "STATE" | "EMIT" | "REQUEST"
            | "BRANCH" | "ON-ERROR" | "PAR" | "RING" | "LIFECYCLE" | "EFFECT" | "SURFACE" | "NOTES" | "GUARD-PINNED"
    ) || is_rule_name(name)
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let nodes = read_nodes(text);
    let mut hits: Vec<Value> = Vec::new();
    if is_primary {
        for n in &nodes {
            let mut segs: Vec<&String> = Vec::new();
            segs.push(&n.args);
            if !n.comment_node {
                segs.extend(n.cont.iter());
                segs.extend(n.comments.iter());
            }
            for seg in segs {
                let b = blank(seg);
                let t = display(&format!("{} {}", n.name, seg));
                for (f, label) in ROWS.iter() {
                    if f(&b) {
                        hits.push(json!({"line": n.line, "what": label, "text": t}));
                    }
                }
            }
        }
    } else {
        for n in &nodes {
            if !n.comment_node && is_p(&n.name) {
                hits.push(json!({"line": n.line, "what": "behavior in a language file", "text": display(&format!("{} {}", n.name, n.args))}));
            }
        }
    }
    json!({ "hits": hits })
}
