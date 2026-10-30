use serde_json::{json, Value};

const P_NAMES: &[&str] = &[
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS",
    "TRACE-SEAM", "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION",
    "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE",
    "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    "NOTES", "GUARD-PINNED",
];

fn is_glue(c: char) -> bool {
    matches!(c as u32,
        0x0B..=0x0C | 0x85 | 0xA0 | 0xAD | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F | 0x890..=0x891
        | 0x8E2 | 0x1680 | 0x180E | 0x2000..=0x200F | 0x2028..=0x202F | 0x205F..=0x2064
        | 0x2066..=0x206F | 0x3000 | 0xFEFF | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD
        | 0x13430..=0x1343F | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A | 0xE0001
        | 0xE0020..=0xE007F)
}

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn m(c: &[char], i: usize, s: &str) -> bool {
    let mut k = i;
    for x in s.chars() {
        if k >= c.len() || c[k] != x {
            return false;
        }
        k += 1;
    }
    true
}

fn mi(c: &[char], i: usize, s: &str) -> bool {
    let mut k = i;
    for x in s.chars() {
        if k >= c.len() || !c[k].eq_ignore_ascii_case(&x) {
            return false;
        }
        k += 1;
    }
    true
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut raw: Vec<Vec<char>> = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(ch) = it.next() {
        if ch == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            raw.push(std::mem::take(&mut cur));
        } else if ch == '\n' {
            raw.push(std::mem::take(&mut cur));
        } else {
            cur.push(ch);
        }
    }
    raw.push(cur);
    raw.into_iter()
        .map(|l| {
            let mut out = Vec::new();
            let mut i = 0;
            while i < l.len() && (sp(l[i]) || l[i] == '\u{FEFF}') {
                if l[i] != '\u{FEFF}' {
                    out.push(l[i]);
                }
                i += 1;
            }
            out.extend_from_slice(&l[i..]);
            while let Some(&last) = out.last() {
                if sp(last) {
                    out.pop();
                } else {
                    break;
                }
            }
            out
        })
        .collect()
}

fn opener(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn literals(c: &[char]) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut i = 0;
    let mut last_end: Option<usize> = None;
    while i < c.len() {
        if c[i] == '"' && (i == 0 || last_end.map_or(false, |e| e + 1 == i) || opener(c[i - 1])) {
            let mut j = i + 1;
            let mut close = None;
            while j < c.len() {
                if c[j] == '\\' {
                    j += 2;
                } else if c[j] == '"' {
                    close = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match close {
                None => break,
                Some(e) => {
                    spans.push((i, e));
                    last_end = Some(e);
                    i = e + 1;
                }
            }
        } else {
            i += 1;
        }
    }
    spans
}

fn blank(c: &[char]) -> Vec<char> {
    let spans = literals(c);
    let mut out = Vec::new();
    let mut i = 0;
    for (s, e) in spans {
        out.extend_from_slice(&c[i..s]);
        out.push('"');
        out.push('"');
        i = e + 1;
    }
    out.extend_from_slice(&c[i..]);
    out
}

fn name_run(c: &[char]) -> usize {
    if c.is_empty() || !c[0].is_ascii_uppercase() {
        return 0;
    }
    let mut n = 1;
    while n < c.len() && (c[n].is_ascii_uppercase() || c[n].is_ascii_digit() || c[n] == '-') {
        n += 1;
    }
    n
}

fn is_nameshape(c: &[char]) -> bool {
    !c.is_empty() && name_run(c) == c.len()
}

fn is_rule(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 2 && b[0] == b'R' && b[1..].iter().all(|x| x.is_ascii_digit())
}

fn is_p(s: &str) -> bool {
    P_NAMES.contains(&s) || is_rule(s)
}

fn trim_sp(c: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = c.len();
    while a < b && sp(c[a]) {
        a += 1;
    }
    while b > a && sp(c[b - 1]) {
        b -= 1;
    }
    &c[a..b]
}

fn in_span(spans: &[(usize, usize)], k: usize) -> bool {
    spans.iter().any(|&(s, e)| k >= s && k <= e)
}

fn rows(c: &[char]) -> Vec<&'static str> {
    let n = c.len();
    let mut hits = Vec::new();
    let pw = |i: usize| i > 0 && word(c[i - 1]);
    let nw = |i: usize| i < n && word(c[i]);
    // row 1
    let mut r1 = false;
    for a in 0..n {
        if m(c, a, "/^") {
            let mut b = a + 2;
            while b < n {
                if c[b] == '\u{2028}' || c[b] == '\u{2029}' {
                    break;
                }
                if m(c, b, "$/") {
                    r1 = true;
                    break;
                }
                b += 1;
            }
        }
        if r1 {
            break;
        }
    }
    if r1 {
        hits.push("anchored regex literal");
    }
    let mut r2 = false;
    let mut r3 = false;
    for i in 0..n {
        if c[i] == '\\' && i + 1 < n {
            if "wsdWSDbB".contains(c[i + 1]) && !nw(i + 2) {
                r2 = true;
            }
            if m(c, i + 1, "p{") {
                r3 = true;
            }
        }
    }
    if r2 {
        hits.push("regex class escape");
    }
    if r3 {
        hits.push("regex property escape");
    }
    // JS API
    let mut js = false;
    let obj = ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String", "BigInt",
        "Boolean", "Date", "RegExp", "Promise"];
    let meth = ["toLowerCase(", "toUpperCase(", "charCodeAt(", "codePointAt(", "localeCompare(",
        "normalize(", "padStart(", "padEnd("];
    for i in 0..n {
        if !pw(i) {
            if m(c, i, "Math.") && nw(i + 5) {
                js = true;
            }
            for s in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
                if m(c, i, s) && !nw(i + s.chars().count()) {
                    js = true;
                }
            }
            for s in ["Number(", "String(", "Boolean(", "BigInt("] {
                if m(c, i, s) {
                    js = true;
                }
            }
            for s in obj {
                let l = s.chars().count();
                if m(c, i, s) && i + l + 1 < n && c[i + l] == '.' && c[i + l + 1].is_ascii_alphabetic() {
                    js = true;
                }
            }
        }
        if !pw(i) || c[i - 1] == '.' {
            for s in meth {
                if m(c, i, s) {
                    js = true;
                }
            }
        }
    }
    if js {
        hits.push("JS API name");
    }
    // Rust API
    let mut rs = false;
    let tys = ["f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap", "BTreeMap"];
    for i in 0..n {
        if m(c, i, "&str") && !nw(i + 4) {
            rs = true;
        }
        if !pw(i) {
            for s in ["fancy-regex", "fancy_regex", "to_lowercase"] {
                if m(c, i, s) && !nw(i + s.chars().count()) {
                    rs = true;
                }
            }
            for s in tys {
                if m(c, i, s) && m(c, i + s.chars().count(), "::") {
                    rs = true;
                }
            }
            if m(c, i, "Option<") || m(c, i, "Vec<") {
                rs = true;
            }
        }
    }
    if rs {
        hits.push("Rust API name");
    }
    // line-terminator
    let mut lt = false;
    for i in 0..n {
        if pw(i) {
            continue;
        }
        let mut starts = vec![i];
        if mi(c, i, "new") {
            starts.push(i + 3);
        }
        for s in starts {
            if mi(c, s, "line") {
                let t = s + 4;
                if mi(c, t, "terminator") || ((c.get(t) == Some(&'-') || c.get(t) == Some(&' ')) && mi(c, t + 1, "terminator")) {
                    lt = true;
                }
            }
        }
    }
    if lt {
        hits.push("line-terminator mechanism");
    }
    let mut jv = false;
    for i in 0..n {
        if !pw(i) {
            for s in ["null", "undefined"] {
                if m(c, i, s) && !nw(i + s.chars().count()) {
                    jv = true;
                }
            }
        }
    }
    if jv {
        hits.push("JS value name (say none)");
    }
    hits
}

fn display(line: &[char]) -> String {
    let mut i = 0;
    while i < line.len() && sp(line[i]) {
        i += 1;
    }
    line[i..].iter().take(96).collect()
}

fn primary_line(line: &[char]) -> Vec<&'static str> {
    let mut ind = 0;
    while ind < line.len() && sp(line[ind]) {
        ind += 1;
    }
    let content = &line[ind..];
    if content.is_empty() {
        return vec![];
    }
    let mut segs: Vec<Vec<char>> = Vec::new();
    if content[0] == '#' {
        let mut k = 0;
        while k < content.len() && content[k] == '#' {
            k += 1;
        }
        segs.push(content[k..].to_vec());
    } else {
        let lits = literals(content);
        let mut split = None;
        for i in 1..content.len() {
            if content[i] == '#'
                && sp(content[i - 1])
                && (i + 1 == content.len() || sp(content[i + 1]))
                && !in_span(&lits, i)
            {
                split = Some(i);
                break;
            }
        }
        let (mut code, comment): (&[char], Option<&[char]>) = match split {
            Some(i) => {
                let mut e = i;
                while e > 0 && sp(content[e - 1]) {
                    e -= 1;
                }
                (&content[..e], Some(trim_sp(&content[i + 1..])))
            }
            None => (content, None),
        };
        if ind == 0 {
            let mut e = 0;
            while e < code.len() && !sp(code[e]) {
                e += 1;
            }
            let mut name = &code[..e];
            if name.last() == Some(&':') {
                name = &name[..name.len() - 1];
            }
            let ns: String = name.iter().collect();
            if is_nameshape(name) && ns != "CITED" {
                code = &code[e..];
            }
        }
        let mut at: Vec<char> = vec![' '];
        at.extend_from_slice(code);
        let al = literals(&at);
        let mut cut = at.len();
        for k in 1..at.len() {
            if sp(at[k - 1]) {
                for kw in ["CITED", "EARNED", "ANCHOR"] {
                    if m(&at, k, kw) {
                        let e = k + kw.len();
                        if (e == at.len() || sp(at[e])) && !in_span(&al, k) {
                            cut = k;
                        }
                    }
                }
                if cut != at.len() {
                    break;
                }
            }
        }
        segs.push(trim_sp(&at[..cut]).to_vec());
        if let Some(cm) = comment {
            segs.push(cm.to_vec());
        }
    }
    let mut out: Vec<&'static str> = Vec::new();
    for s in segs {
        for h in rows(&blank(&s)) {
            if !out.contains(&h) {
                out.push(h);
            }
        }
    }
    out
}

fn language_line(line: &[char]) -> bool {
    if line.is_empty() || sp(line[0]) || line[0] == '#' {
        return false;
    }
    let s = |c: &[char]| -> String { c.iter().collect() };
    let mut e = 0;
    while e < line.len() && !sp(line[e]) {
        e += 1;
    }
    let mut tok = &line[..e];
    if tok.last() == Some(&':') {
        tok = &tok[..tok.len() - 1];
    }
    if is_p(&s(tok)) {
        return true;
    }
    let r = name_run(line);
    if r > 0 && is_p(&s(&line[..r])) {
        if r < line.len() && is_glue(line[r]) {
            return true;
        }
        if r + 1 < line.len() && line[r] == ':' && is_glue(line[r + 1]) {
            return true;
        }
    }
    if is_glue(line[0]) {
        let mut g = 0;
        while g < line.len() && is_glue(line[g]) {
            g += 1;
        }
        let rest = &line[g..];
        let r = name_run(rest);
        if r > 0 && is_p(&s(&rest[..r])) {
            if r == rest.len() {
                return true;
            }
            let f = rest[r];
            if sp(f) || f == ':' || is_glue(f) {
                return true;
            }
        }
    }
    false
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (idx, line) in split_lines(text).iter().enumerate() {
        let labels: Vec<&str> = if is_primary {
            primary_line(line)
        } else if language_line(line) {
            vec!["behavior in a language file"]
        } else {
            vec![]
        };
        for l in labels {
            hits.push(json!({"line": idx + 1, "what": l, "text": display(line)}));
        }
    }
    json!({ "hits": hits })
}
