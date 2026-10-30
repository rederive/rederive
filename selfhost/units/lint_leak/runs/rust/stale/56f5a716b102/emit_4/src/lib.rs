use serde_json::{json, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn starts(s: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for c in p.chars() {
        if k >= s.len() || s[k] != c {
            return false;
        }
        k += 1;
    }
    true
}
fn starts_ci(s: &[char], i: usize, p: &str) -> bool {
    let mut k = i;
    for c in p.chars() {
        if k >= s.len() || !s[k].eq_ignore_ascii_case(&c) {
            return false;
        }
        k += 1;
    }
    true
}
fn prev_ok(s: &[char], i: usize) -> bool {
    i == 0 || !is_word(s[i - 1])
}
fn next_ok(s: &[char], j: usize) -> bool {
    j >= s.len() || !is_word(s[j])
}
fn trim_end_sp(s: &[char]) -> &[char] {
    let mut e = s.len();
    while e > 0 && sp(s[e - 1]) {
        e -= 1;
    }
    &s[..e]
}
fn trim_sp(s: &[char]) -> &[char] {
    let mut b = 0;
    while b < s.len() && sp(s[b]) {
        b += 1;
    }
    trim_end_sp(&s[b..])
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
        let mut close = None;
        while j < s.len() {
            let c = s[j];
            if c == '\\' {
                if j + 1 < s.len() && s[j + 1] != '\u{2028}' && s[j + 1] != '\u{2029}' {
                    j += 2;
                } else {
                    break;
                }
            } else if c == '"' {
                close = Some(j);
                break;
            } else {
                j += 1;
            }
        }
        match close {
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
    let mut out = Vec::new();
    let mut i = 0;
    for (a, b) in literals(s) {
        out.extend_from_slice(&s[i..a]);
        out.push('"');
        out.push('"');
        i = b + 1;
    }
    out.extend_from_slice(&s[i..]);
    out
}

fn nameshape(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn row_anchored(s: &[char]) -> bool {
    for p in 0..s.len() {
        if starts(s, p, "/^") {
            let mut k = p + 2;
            while k < s.len() && s[k] != '\u{2028}' && s[k] != '\u{2029}' {
                if starts(s, k, "$/") {
                    return true;
                }
                k += 1;
            }
        }
    }
    false
}
fn row_class(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        s[i] == '\\'
            && i + 1 < s.len()
            && "wsdWSDbB".contains(s[i + 1])
            && next_ok(s, i + 2)
    })
}
fn row_prop(s: &[char]) -> bool {
    (0..s.len()).any(|i| s[i] == '\\' && starts(s, i + 1, "p{"))
}
fn row_js1(s: &[char]) -> bool {
    const BOUNDED: [&str; 4] = ["String.prototype", "parseInt", "parseFloat", "BigInt"];
    const CALLS: [&str; 4] = ["Number(", "String(", "Boolean(", "BigInt("];
    const METHODS: [&str; 8] = [
        "toLowerCase(", "toUpperCase(", "charCodeAt(", "codePointAt(", "localeCompare(",
        "normalize(", "padStart(", "padEnd(",
    ];
    for i in 0..s.len() {
        if !prev_ok(s, i) {
            continue;
        }
        if starts(s, i, "Math.") && i + 5 < s.len() && is_word(s[i + 5]) {
            return true;
        }
        for b in BOUNDED {
            if starts(s, i, b) && next_ok(s, i + b.chars().count()) {
                return true;
            }
        }
        if CALLS.iter().any(|c| starts(s, i, c)) || METHODS.iter().any(|c| starts(s, i, c)) {
            return true;
        }
    }
    false
}
fn row_js2(s: &[char]) -> bool {
    const NAMES: [&str; 13] = [
        "JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String", "BigInt",
        "Boolean", "Date", "RegExp", "Promise",
    ];
    for i in 0..s.len() {
        if !prev_ok(s, i) {
            continue;
        }
        for n in NAMES {
            let l = n.chars().count();
            if starts(s, i, n) && i + l + 1 < s.len() && s[i + l] == '.' && s[i + l + 1].is_ascii_alphabetic() {
                return true;
            }
        }
    }
    false
}
fn row_rust(s: &[char]) -> bool {
    const WORDS: [&str; 3] = ["fancy-regex", "fancy_regex", "to_lowercase"];
    const TYPES: [&str; 12] = [
        "f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap",
        "BTreeMap",
    ];
    for i in 0..s.len() {
        if starts(s, i, "&str") && next_ok(s, i + 4) {
            return true;
        }
        if !prev_ok(s, i) {
            continue;
        }
        for w in WORDS {
            if starts(s, i, w) && next_ok(s, i + w.chars().count()) {
                return true;
            }
        }
        for t in TYPES {
            if starts(s, i, t) && starts(s, i + t.chars().count(), "::") {
                return true;
            }
        }
        if starts(s, i, "Option<") || starts(s, i, "Vec<") {
            return true;
        }
    }
    false
}
fn row_lt(s: &[char]) -> bool {
    for i in 0..s.len() {
        if !prev_ok(s, i) {
            continue;
        }
        let mut ks = vec![i];
        if starts_ci(s, i, "new") {
            ks.push(i + 3);
        }
        for k in ks {
            if !starts_ci(s, k, "line") {
                continue;
            }
            let m = k + 4;
            let mut ms = vec![m];
            if m < s.len() && (s[m] == '-' || s[m] == ' ') {
                ms.push(m + 1);
            }
            if ms.into_iter().any(|m2| starts_ci(s, m2, "terminator")) {
                return true;
            }
        }
    }
    false
}
fn row_null(s: &[char]) -> bool {
    for i in 0..s.len() {
        for w in ["null", "undefined"] {
            if starts(s, i, w) && prev_ok(s, i) && next_ok(s, i + w.chars().count()) {
                return true;
            }
        }
    }
    false
}

fn judge(seg: &[char], labels: &mut Vec<&'static str>) {
    let b = blank(seg);
    let rows: [(fn(&[char]) -> bool, &'static str); 8] = [
        (row_anchored, "anchored regex literal"),
        (row_class, "regex class escape"),
        (row_prop, "regex property escape"),
        (row_js1, "JS API name"),
        (row_js2, "JS API name"),
        (row_rust, "Rust API name"),
        (row_lt, "line-terminator mechanism"),
        (row_null, "JS value name (say none)"),
    ];
    for (f, l) in rows {
        if f(&b) && !labels.contains(&l) {
            labels.push(l);
        }
    }
}

const P: [&str; 36] = [
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS",
    "TRACE-SEAM", "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION",
    "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE",
    "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    "NOTES", "GUARD-PINNED", "", "",
];

fn is_p(n: &[char]) -> bool {
    let s: String = n.iter().collect();
    if s.is_empty() {
        return false;
    }
    if P.contains(&s.as_str()) {
        return true;
    }
    s.len() >= 2 && s.starts_with('R') && s[1..].chars().all(|c| c.is_ascii_digit())
}

fn is_glue(c: char) -> bool {
    matches!(c, '\u{0B}' | '\u{0C}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
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

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (idx, raw) in split_lines(text).into_iter().enumerate() {
        let mut b = 0;
        while b < raw.len() && raw[b] == '\u{FEFF}' {
            b += 1;
        }
        let line: Vec<char> = trim_end_sp(&raw[b..]).to_vec();
        let mut ind = 0;
        while ind < line.len() && sp(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];
        if content.is_empty() {
            continue;
        }
        let display: String = line[ind..].iter().take(96).collect();
        let mut labels: Vec<&'static str> = Vec::new();
        if is_primary {
            let mut segs: Vec<Vec<char>> = Vec::new();
            if content[0] == '#' {
                let mut k = 0;
                while k < content.len() && content[k] == '#' {
                    k += 1;
                }
                segs.push(content[k..].to_vec());
            } else {
                let lits = literals(content);
                let mut code: &[char] = content;
                let mut comment: Option<&[char]> = None;
                for i in 1..content.len() {
                    if content[i] == '#'
                        && sp(content[i - 1])
                        && (i + 1 == content.len() || sp(content[i + 1]))
                        && !lits.iter().any(|&(a, e)| i >= a && i <= e)
                    {
                        code = trim_end_sp(&content[..i]);
                        comment = Some(trim_sp(&content[i + 1..]));
                        break;
                    }
                }
                if ind == 0 {
                    let e = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
                    let mut name = &code[..e];
                    if name.last() == Some(&':') {
                        name = &name[..name.len() - 1];
                    }
                    if nameshape(name) {
                        code = &code[e..];
                    }
                }
                let mut t: Vec<char> = vec![' '];
                t.extend_from_slice(code);
                let mut end = None;
                'o: for i in 0..t.len() {
                    if !sp(t[i]) {
                        continue;
                    }
                    let mut j = i;
                    while j < t.len() && sp(t[j]) {
                        j += 1;
                    }
                    for kw in ["CITED", "EARNED", "ANCHOR"] {
                        let l = kw.len();
                        if starts(&t, j, kw) && (j + l == t.len() || sp(t[j + l])) {
                            end = Some(i);
                            break 'o;
                        }
                    }
                }
                let body = match end {
                    Some(i) => trim_sp(&t[..i]).to_vec(),
                    None => trim_sp(&t).to_vec(),
                };
                segs.push(body);
                if let Some(c) = comment {
                    segs.push(c.to_vec());
                }
            }
            for s in &segs {
                judge(s, &mut labels);
            }
        } else {
            if ind != 0 || content[0] == '#' {
                continue;
            }
            let e = content.iter().position(|&c| sp(c)).unwrap_or(content.len());
            let mut tok = &content[..e];
            if tok.last() == Some(&':') {
                tok = &tok[..tok.len() - 1];
            }
            let mut hit = is_p(tok);
            if !hit {
                let mut r = 0;
                if content[0].is_ascii_uppercase() {
                    r = 1;
                    while r < content.len()
                        && (content[r].is_ascii_uppercase()
                            || content[r].is_ascii_digit()
                            || content[r] == '-')
                    {
                        r += 1;
                    }
                }
                if r > 0 && r < content.len() && is_glue(content[r]) && is_p(&content[..r]) {
                    hit = true;
                }
            }
            if hit {
                labels.push("behavior in a language file");
            }
        }
        for l in labels {
            hits.push(json!({"line": idx + 1, "what": l, "text": display}));
        }
    }
    json!({ "hits": hits })
}
