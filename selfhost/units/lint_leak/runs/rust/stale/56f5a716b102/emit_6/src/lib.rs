use serde_json::{json, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn brk(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}
fn glue(c: char) -> bool {
    matches!(c, '\u{0B}' | '\u{0C}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
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
fn starts_ci(s: &[char], i: usize, p: &str) -> Option<usize> {
    let mut k = i;
    for c in p.chars() {
        if k >= s.len() || !s[k].eq_ignore_ascii_case(&c) {
            return None;
        }
        k += 1;
    }
    Some(k)
}
fn next_word(s: &[char], k: usize) -> bool {
    k < s.len() && word(s[k])
}

fn literals(s: &[char]) -> Vec<(usize, usize)> {
    let n = s.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if s[i] == '"' {
            let mut j = i + 1;
            let mut end = None;
            while j < n {
                let c = s[j];
                if c == '\\' {
                    if j + 1 < n && !brk(s[j + 1]) {
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
            if let Some(e) = end {
                out.push((i, e));
                i = e + 1;
                continue;
            }
        }
        i += 1;
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

fn nameshape(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

const P: &[&str] = &[
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS",
    "TRACE-SEAM", "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION",
    "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE",
    "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    "NOTES", "GUARD-PINNED",
];

fn is_p(s: &[char]) -> bool {
    let t: String = s.iter().collect();
    if P.contains(&t.as_str()) {
        return true;
    }
    s.len() >= 2 && s[0] == 'R' && s[1..].iter().all(|c| c.is_ascii_digit())
}

fn row_anchored(s: &[char]) -> bool {
    for i in 0..s.len() {
        if starts(s, i, "/^") {
            let mut j = i + 2;
            while j < s.len() {
                if brk(s[j]) {
                    break;
                }
                if starts(s, j, "$/") {
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
        if s[i] == '\\' && i + 1 < s.len() && "wsdWSDbB".contains(s[i + 1]) && !next_word(s, i + 2) {
            return true;
        }
    }
    false
}
fn row_prop(s: &[char]) -> bool {
    (0..s.len()).any(|i| starts(s, i, "\\p{"))
}
fn row_js(s: &[char]) -> bool {
    for i in 0..s.len() {
        if i > 0 && word(s[i - 1]) {
            continue;
        }
        if starts(s, i, "Math.") && next_word(s, i + 5) {
            return true;
        }
        for kw in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
            if starts(s, i, kw) && !next_word(s, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in [
            "Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(",
            "charCodeAt(", "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd(",
        ] {
            if starts(s, i, kw) {
                return true;
            }
        }
        for kw in [
            "JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String", "BigInt",
            "Boolean", "Date", "RegExp", "Promise",
        ] {
            if starts(s, i, kw) {
                let k = i + kw.chars().count();
                if k + 1 < s.len() && s[k] == '.' && s[k + 1].is_ascii_alphabetic() {
                    return true;
                }
            }
        }
    }
    false
}
fn row_rust(s: &[char]) -> bool {
    for i in 0..s.len() {
        if starts(s, i, "&str") && !next_word(s, i + 4) {
            return true;
        }
        if i > 0 && word(s[i - 1]) {
            continue;
        }
        for kw in ["fancy-regex", "fancy_regex", "to_lowercase"] {
            if starts(s, i, kw) && !next_word(s, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in [
            "f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap",
            "BTreeMap",
        ] {
            if starts(s, i, kw) && starts(s, i + kw.chars().count(), "::") {
                return true;
            }
        }
        if starts(s, i, "Option<") || starts(s, i, "Vec<") {
            return true;
        }
    }
    false
}
fn row_term(s: &[char]) -> bool {
    for i in 0..s.len() {
        if i > 0 && word(s[i - 1]) {
            continue;
        }
        let mut starts_at = vec![i];
        if let Some(k) = starts_ci(s, i, "new") {
            starts_at.push(k);
        }
        for a in starts_at {
            if let Some(k) = starts_ci(s, a, "line") {
                let mut ks = vec![k];
                if k < s.len() && (s[k] == '-' || s[k] == ' ') {
                    ks.push(k + 1);
                }
                for k2 in ks {
                    if starts_ci(s, k2, "terminator").is_some() {
                        return true;
                    }
                }
            }
        }
    }
    false
}
fn row_value(s: &[char]) -> bool {
    for i in 0..s.len() {
        if i > 0 && word(s[i - 1]) {
            continue;
        }
        for kw in ["null", "undefined"] {
            if starts(s, i, kw) && !next_word(s, i + kw.chars().count()) {
                return true;
            }
        }
    }
    false
}

fn rows(s: &[char]) -> Vec<&'static str> {
    let mut out = Vec::new();
    if row_anchored(s) {
        out.push("anchored regex literal");
    }
    if row_class(s) {
        out.push("regex class escape");
    }
    if row_prop(s) {
        out.push("regex property escape");
    }
    if row_js(s) {
        out.push("JS API name");
    }
    if row_rust(s) {
        out.push("Rust API name");
    }
    if row_term(s) {
        out.push("line-terminator mechanism");
    }
    if row_value(s) {
        out.push("JS value name (say none)");
    }
    out
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    lines.push(cur);
    lines
}

fn primary_segments(content: &[char], indent_empty: bool) -> Vec<Vec<char>> {
    if content[0] == '#' {
        let mut k = 0;
        while k < content.len() && content[k] == '#' {
            k += 1;
        }
        return vec![content[k..].to_vec()];
    }
    let lits = literals(content);
    let mut split = None;
    for k in 1..content.len() {
        if content[k] == '#'
            && sp(content[k - 1])
            && (k + 1 == content.len() || sp(content[k + 1]))
            && !lits.iter().any(|&(a, b)| k > a && k < b)
        {
            split = Some(k);
            break;
        }
    }
    let (mut code, comment): (Vec<char>, Option<Vec<char>>) = match split {
        Some(k) => (
            trim_sp(&content[..k]).to_vec(),
            Some(trim_sp(&content[k + 1..]).to_vec()),
        ),
        None => (content.to_vec(), None),
    };
    if indent_empty {
        let idx = code.iter().position(|c| sp(*c)).unwrap_or(code.len());
        let mut name = &code[..idx];
        if name.last() == Some(&':') {
            name = &name[..name.len() - 1];
        }
        if nameshape(name) {
            code = code[idx..].to_vec();
        }
    }
    let mut s = vec![' '];
    s.extend_from_slice(&code);
    let mut cut = s.len();
    for j in 1..s.len() {
        if !sp(s[j - 1]) {
            continue;
        }
        let mut found = false;
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            let l = kw.chars().count();
            if starts(&s, j, kw) && (j + l == s.len() || sp(s[j + l])) {
                found = true;
            }
        }
        if found {
            cut = j;
            break;
        }
    }
    let mut segs = vec![trim_sp(&s[..cut]).to_vec()];
    if let Some(c) = comment {
        segs.push(c);
    }
    segs
}

fn lang_hit(content: &[char]) -> bool {
    if content[0] == '#' {
        return false;
    }
    let idx = content.iter().position(|c| sp(*c)).unwrap_or(content.len());
    let tok = &content[..idx];
    if is_p(tok) {
        return true;
    }
    if tok.last() == Some(&':') && is_p(&tok[..tok.len() - 1]) {
        return true;
    }
    let mut r = 0;
    if !tok.is_empty() && tok[0].is_ascii_uppercase() {
        r = 1;
        while r < content.len()
            && (content[r].is_ascii_uppercase() || content[r].is_ascii_digit() || content[r] == '-')
        {
            r += 1;
        }
    }
    r > 0 && r < content.len() && glue(content[r]) && is_p(&content[..r])
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (ln, raw) in split_lines(text).into_iter().enumerate() {
        let mut a = 0;
        while a < raw.len() && raw[a] == '\u{FEFF}' {
            a += 1;
        }
        let mut b = raw.len();
        while b > a && sp(raw[b - 1]) {
            b -= 1;
        }
        let line = &raw[a..b];
        let ind = line.iter().take_while(|c| sp(**c)).count();
        let content = &line[ind..];
        if content.is_empty() {
            continue;
        }
        let display: String = content.iter().take(96).collect();
        let mut labels: Vec<&'static str> = Vec::new();
        if is_primary {
            for seg in primary_segments(content, ind == 0) {
                let bl = blank(&seg);
                for l in rows(&bl) {
                    if !labels.contains(&l) {
                        labels.push(l);
                    }
                }
            }
        } else if ind == 0 && lang_hit(content) {
            labels.push("behavior in a language file");
        }
        for l in labels {
            hits.push(json!({"line": ln + 1, "what": l, "text": display}));
        }
    }
    json!({ "hits": hits })
}
