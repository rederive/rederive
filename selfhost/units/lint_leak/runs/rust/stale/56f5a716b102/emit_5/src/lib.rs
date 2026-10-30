use serde_json::{json, Value};

const P_NAMES: &[&str] = &[
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS",
    "TRACE-SEAM", "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION",
    "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE",
    "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    "NOTES", "GUARD-PINNED",
];

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn glue(c: char) -> bool {
    matches!(c, '\u{0B}' | '\u{0C}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn at(s: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for c in p.chars() {
        if k >= s.len() || s[k] != c {
            return false;
        }
        k += 1;
    }
    true
}
fn at_ci(s: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for c in p.chars() {
        if k >= s.len() || !s[k].eq_ignore_ascii_case(&c) {
            return false;
        }
        k += 1;
    }
    true
}
fn nonword_at(s: &[char], j: usize) -> bool {
    j >= s.len() || !word(s[j])
}
fn prev_ok(s: &[char], i: usize) -> bool {
    i == 0 || !word(s[i - 1])
}

fn literals(s: &[char]) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if s[i] != '"' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end = None;
        while j < s.len() {
            let c = s[j];
            if c == '\\' {
                if j + 1 < s.len() && s[j + 1] != '\u{2028}' && s[j + 1] != '\u{2029}' {
                    j += 2;
                } else {
                    break;
                }
            } else if c == '"' {
                end = Some(j);
                break;
            } else {
                j += 1;
            }
        }
        match end {
            Some(e) => {
                out.push((i, e));
                i = e + 1;
            }
            None => i += 1,
        }
    }
    out
}

fn blank(s: &[char]) -> Vec<char> {
    let lits = literals(s);
    let mut out = Vec::new();
    let mut i = 0;
    for (a, b) in lits {
        out.extend_from_slice(&s[i..a]);
        out.push('"');
        out.push('"');
        i = b + 1;
    }
    out.extend_from_slice(&s[i..]);
    out
}

fn row_anchored(s: &[char]) -> bool {
    for i in 0..s.len() {
        if at(s, i, "/^") {
            let mut j = i + 2;
            while j < s.len() && s[j] != '\u{2028}' && s[j] != '\u{2029}' {
                if s[j] == '$' && j + 1 < s.len() && s[j + 1] == '/' {
                    return true;
                }
                j += 1;
            }
        }
    }
    false
}
fn row_class(s: &[char]) -> bool {
    for i in 0..s.len() {
        if s[i] == '\\' && i + 1 < s.len() && "wsdWSDbB".contains(s[i + 1]) && nonword_at(s, i + 2) {
            return true;
        }
    }
    false
}
fn row_prop(s: &[char]) -> bool {
    (0..s.len()).any(|i| s[i] == '\\' && at(s, i + 1, "p{"))
}
fn row_js(s: &[char]) -> bool {
    for i in 0..s.len() {
        if !prev_ok(s, i) {
            continue;
        }
        if at(s, i, "Math.") && i + 5 < s.len() && word(s[i + 5]) {
            return true;
        }
        for kw in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
            if at(s, i, kw) && nonword_at(s, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in [
            "Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(",
            "charCodeAt(", "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd(",
        ] {
            if at(s, i, kw) {
                return true;
            }
        }
        for kw in [
            "JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String", "BigInt",
            "Boolean", "Date", "RegExp", "Promise",
        ] {
            if at(s, i, kw) {
                let j = i + kw.chars().count();
                if j + 1 < s.len() && s[j] == '.' && s[j + 1].is_ascii_alphabetic() {
                    return true;
                }
            }
        }
    }
    false
}
fn row_rust(s: &[char]) -> bool {
    for i in 0..s.len() {
        if at(s, i, "&str") && nonword_at(s, i + 4) {
            return true;
        }
        if !prev_ok(s, i) {
            continue;
        }
        for kw in ["fancy-regex", "fancy_regex", "to_lowercase"] {
            if at(s, i, kw) && nonword_at(s, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in [
            "f64::", "u8::", "u64::", "i64::", "usize::", "String::", "Vec::", "char::", "str::",
            "Box::", "HashMap::", "BTreeMap::", "Option<", "Vec<",
        ] {
            if at(s, i, kw) {
                return true;
            }
        }
    }
    false
}
fn row_lt(s: &[char]) -> bool {
    for i in 0..s.len() {
        if !prev_ok(s, i) {
            continue;
        }
        for pre in [3usize, 0] {
            if pre == 3 && !at_ci(s, i, "new") {
                continue;
            }
            let j = i + pre;
            if !at_ci(s, j, "line") {
                continue;
            }
            let j = j + 4;
            if at_ci(s, j, "terminator") {
                return true;
            }
            if j < s.len() && (s[j] == '-' || s[j] == ' ') && at_ci(s, j + 1, "terminator") {
                return true;
            }
        }
    }
    false
}
fn row_val(s: &[char]) -> bool {
    for i in 0..s.len() {
        if prev_ok(s, i) {
            for kw in ["null", "undefined"] {
                if at(s, i, kw) && nonword_at(s, i + kw.len()) {
                    return true;
                }
            }
        }
    }
    false
}

fn is_nameshape(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn is_rule(n: &str) -> bool {
    n.len() > 1 && n.starts_with('R') && n[1..].chars().all(|c| c.is_ascii_digit())
}

fn display(line: &[char]) -> String {
    line.iter().skip_while(|c| sp(**c)).take(96).collect()
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        match cs[i] {
            '\r' => {
                lines.push(std::mem::take(&mut cur));
                if i + 1 < cs.len() && cs[i + 1] == '\n' {
                    i += 1;
                }
            }
            '\n' => lines.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
        i += 1;
    }
    lines.push(cur);
    lines
        .into_iter()
        .map(|l| {
            let st = l.iter().take_while(|c| **c == '\u{FEFF}').count();
            let mut l: Vec<char> = l[st..].to_vec();
            while l.last().map_or(false, |c| sp(*c)) {
                l.pop();
            }
            l
        })
        .collect()
}

fn find_mark(p: &[char]) -> usize {
    for i in 0..p.len() {
        if !sp(p[i]) {
            continue;
        }
        let mut j = i;
        while j < p.len() && sp(p[j]) {
            j += 1;
        }
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            if at(p, j, kw) && (j + kw.len() >= p.len() || sp(p[j + kw.len()])) {
                return i;
            }
        }
    }
    p.len()
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && sp(s[a]) {
        a += 1;
    }
    while b > a && sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn primary_line(line: &[char]) -> Vec<&'static str> {
    let ind = line.iter().take_while(|c| sp(**c)).count();
    let content = &line[ind..];
    let mut segs: Vec<Vec<char>> = Vec::new();
    if content[0] == '#' {
        let k = content.iter().take_while(|c| **c == '#').count();
        segs.push(content[k..].to_vec());
    } else {
        let lits = literals(content);
        let mut code: &[char] = content;
        let mut comment: Option<&[char]> = None;
        for i in 1..content.len() {
            if content[i] == '#'
                && sp(content[i - 1])
                && (i + 1 == content.len() || sp(content[i + 1]))
                && !lits.iter().any(|(a, b)| *a <= i && i <= *b)
            {
                let mut c = &content[..i];
                while c.last().map_or(false, |x| sp(*x)) {
                    c = &c[..c.len() - 1];
                }
                code = c;
                comment = Some(trim_sp(&content[i + 1..]));
                break;
            }
        }
        if ind == 0 {
            let e = code.iter().position(|c| sp(*c)).unwrap_or(code.len());
            let mut name = &code[..e];
            if name.last() == Some(&':') {
                name = &name[..name.len() - 1];
            }
            if is_nameshape(name) {
                code = &code[e..];
            }
        }
        let mut p = vec![' '];
        p.extend_from_slice(code);
        let m = find_mark(&p);
        segs.push(trim_sp(&p[..m]).to_vec());
        if let Some(c) = comment {
            segs.push(c.to_vec());
        }
    }
    let rows: [(fn(&[char]) -> bool, &'static str); 7] = [
        (row_anchored, "anchored regex literal"),
        (row_class, "regex class escape"),
        (row_prop, "regex property escape"),
        (row_js, "JS API name"),
        (row_rust, "Rust API name"),
        (row_lt, "line-terminator mechanism"),
        (row_val, "JS value name (say none)"),
    ];
    let mut out: Vec<&'static str> = Vec::new();
    for sg in segs {
        let b = blank(&sg);
        for (f, label) in rows.iter() {
            if f(&b) && !out.contains(label) {
                out.push(*label);
            }
        }
    }
    out
}

fn language_hit(line: &[char]) -> bool {
    if line.is_empty() || sp(line[0]) || line[0] == '#' {
        return false;
    }
    let e = line.iter().position(|c| sp(*c)).unwrap_or(line.len());
    let tok: String = line[..e].iter().collect();
    let mut t = tok.as_str();
    let known = |n: &str| P_NAMES.contains(&n) || is_rule(n);
    if known(t) {
        return true;
    }
    if let Some(x) = t.strip_suffix(':') {
        t = x;
        if known(t) {
            return true;
        }
    }
    let tc = &line[..e];
    let mut k = 0;
    if !tc.is_empty() && tc[0].is_ascii_uppercase() {
        k = 1;
        while k < tc.len() && (tc[k].is_ascii_uppercase() || tc[k].is_ascii_digit() || tc[k] == '-') {
            k += 1;
        }
    }
    if k > 0 && k < tc.len() && glue(tc[k]) {
        let run: String = tc[..k].iter().collect();
        return known(&run);
    }
    false
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (n, line) in split_lines(text).iter().enumerate() {
        let ind = line.iter().take_while(|c| sp(**c)).count();
        if ind == line.len() {
            continue;
        }
        if is_primary {
            for what in primary_line(line) {
                hits.push(json!({"line": n + 1, "what": what, "text": display(line)}));
            }
        } else if language_hit(line) {
            hits.push(json!({"line": n + 1, "what": "behavior in a language file", "text": display(line)}));
        }
    }
    json!({ "hits": hits })
}
