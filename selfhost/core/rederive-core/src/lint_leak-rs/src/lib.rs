use serde_json::{json, Value};

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_glue(c: char) -> bool {
    matches!(c,
        '\u{0B}'..='\u{0C}' | '\u{85}' | '\u{A0}' | '\u{AD}' | '\u{600}'..='\u{605}' | '\u{61C}'
        | '\u{6DD}' | '\u{70F}' | '\u{890}'..='\u{891}' | '\u{8E2}' | '\u{1680}' | '\u{180E}'
        | '\u{2000}'..='\u{200F}' | '\u{2028}'..='\u{202F}' | '\u{205F}'..='\u{2064}'
        | '\u{2066}'..='\u{206F}' | '\u{3000}' | '\u{FEFF}' | '\u{FFF9}'..='\u{FFFB}'
        | '\u{110BD}' | '\u{110CD}' | '\u{13430}'..='\u{1343F}' | '\u{1BCA0}'..='\u{1BCA3}'
        | '\u{1D173}'..='\u{1D17A}' | '\u{E0001}' | '\u{E0020}'..='\u{E007F}')
}

fn is_opener(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' || c == '\n' {
            if c == '\r' && i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    lines.push(cur);
    lines
        .into_iter()
        .map(|l| {
            let mut out = Vec::new();
            let mut lead = true;
            for c in l {
                if lead {
                    if c == '\u{FEFF}' {
                        continue;
                    }
                    if !is_sp(c) {
                        lead = false;
                    }
                }
                out.push(c);
            }
            while out.last().map_or(false, |&c| is_sp(c)) {
                out.pop();
            }
            out
        })
        .collect()
}

fn literals(c: &[char]) -> Vec<(usize, usize)> {
    let n = c.len();
    let mut spans = Vec::new();
    let mut last_end: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if c[i] == '"' {
            let ts = i == 0 || last_end == Some(i - 1) || is_opener(c[i - 1]);
            if ts {
                let mut j = i + 1;
                let mut close = None;
                while j < n {
                    if c[j] == '\\' {
                        j += 2;
                        continue;
                    }
                    if c[j] == '"' {
                        close = Some(j);
                        break;
                    }
                    j += 1;
                }
                match close {
                    Some(e) => {
                        spans.push((i, e));
                        last_end = Some(e);
                        i = e + 1;
                        continue;
                    }
                    None => break,
                }
            }
        }
        i += 1;
    }
    spans
}

fn blank(c: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut p = 0;
    for (s, e) in literals(c) {
        out.extend_from_slice(&c[p..s]);
        out.push('"');
        out.push('"');
        p = e + 1;
    }
    out.extend_from_slice(&c[p..]);
    out
}

fn at(c: &[char], i: usize, s: &str) -> bool {
    let mut k = i;
    for x in s.chars() {
        if k >= c.len() || c[k] != x {
            return false;
        }
        k += 1;
    }
    true
}

fn at_ci(c: &[char], i: usize, s: &str) -> Option<usize> {
    let mut k = i;
    for x in s.chars() {
        if k >= c.len() || !c[k].eq_ignore_ascii_case(&x) {
            return None;
        }
        k += 1;
    }
    Some(k)
}

fn prev_ok(c: &[char], i: usize) -> bool {
    i == 0 || !is_word(c[i - 1])
}

fn not_followed(c: &[char], end: usize) -> bool {
    end >= c.len() || !is_word(c[end])
}

fn row_anchored(c: &[char]) -> bool {
    for a in 0..c.len() {
        if at(c, a, "/^") {
            let mut b = a + 2;
            while b < c.len() {
                if c[b] == '\u{2028}' || c[b] == '\u{2029}' {
                    break;
                }
                if at(c, b, "$/") {
                    return true;
                }
                b += 1;
            }
        }
    }
    false
}

fn row_class(c: &[char]) -> bool {
    for i in 0..c.len() {
        if c[i] == '\\' && i + 1 < c.len() && "wsdWSDbB".contains(c[i + 1]) && not_followed(c, i + 2) {
            return true;
        }
    }
    false
}

fn row_prop(c: &[char]) -> bool {
    (0..c.len()).any(|i| c[i] == '\\' && at(c, i + 1, "p{"))
}

fn row_js_api(c: &[char]) -> bool {
    let methods = ["toLowerCase(", "toUpperCase(", "charCodeAt(", "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd("];
    for i in 0..c.len() {
        if !prev_ok(c, i) {
            continue;
        }
        if at(c, i, "Math.") && i + 5 < c.len() && is_word(c[i + 5]) {
            return true;
        }
        for kw in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
            if at(c, i, kw) && not_followed(c, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in ["Number(", "String(", "Boolean(", "BigInt("] {
            if at(c, i, kw) {
                return true;
            }
        }
        for kw in methods {
            if at(c, i, kw) {
                return true;
            }
        }
    }
    false
}

fn row_js_ns(c: &[char]) -> bool {
    let names = ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String", "BigInt", "Boolean", "Date", "RegExp", "Promise"];
    for i in 0..c.len() {
        if !prev_ok(c, i) {
            continue;
        }
        for kw in names {
            if at(c, i, kw) {
                let e = i + kw.chars().count();
                if e + 1 < c.len() && c[e] == '.' && c[e + 1].is_ascii_alphabetic() {
                    return true;
                }
            }
        }
    }
    false
}

fn row_rust(c: &[char]) -> bool {
    let types = ["f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box", "HashMap", "BTreeMap"];
    for i in 0..c.len() {
        if at(c, i, "&str") && not_followed(c, i + 4) {
            return true;
        }
        if !prev_ok(c, i) {
            continue;
        }
        for kw in ["fancy-regex", "fancy_regex", "to_lowercase"] {
            if at(c, i, kw) && not_followed(c, i + kw.chars().count()) {
                return true;
            }
        }
        for kw in types {
            if at(c, i, kw) && at(c, i + kw.chars().count(), "::") {
                return true;
            }
        }
        if at(c, i, "Option<") || at(c, i, "Vec<") {
            return true;
        }
    }
    false
}

fn line_term_from(c: &[char], j: usize) -> bool {
    if let Some(k) = at_ci(c, j, "line") {
        if at_ci(c, k, "terminator").is_some() {
            return true;
        }
        if k < c.len() && (c[k] == '-' || c[k] == ' ') && at_ci(c, k + 1, "terminator").is_some() {
            return true;
        }
    }
    false
}

fn row_lineterm(c: &[char]) -> bool {
    for i in 0..c.len() {
        if !prev_ok(c, i) {
            continue;
        }
        if let Some(j) = at_ci(c, i, "new") {
            if line_term_from(c, j) {
                return true;
            }
        }
        if line_term_from(c, i) {
            return true;
        }
    }
    false
}

fn row_value(c: &[char]) -> bool {
    for i in 0..c.len() {
        if !prev_ok(c, i) {
            continue;
        }
        for kw in ["null", "undefined"] {
            if at(c, i, kw) && not_followed(c, i + kw.len()) {
                return true;
            }
        }
    }
    false
}

type Row = (&'static str, fn(&[char]) -> bool);

const ROWS: [Row; 8] = [
    ("anchored regex literal", row_anchored),
    ("regex class escape", row_class),
    ("regex property escape", row_prop),
    ("JS API name", row_js_api),
    ("JS API name", row_js_ns),
    ("Rust API name", row_rust),
    ("line-terminator mechanism", row_lineterm),
    ("JS value name (say none)", row_value),
];

fn trim_sp(c: &[char]) -> &[char] {
    let mut s = 0;
    let mut e = c.len();
    while s < e && is_sp(c[s]) {
        s += 1;
    }
    while e > s && is_sp(c[e - 1]) {
        e -= 1;
    }
    &c[s..e]
}

fn is_nameshape(c: &[char]) -> bool {
    !c.is_empty() && c[0].is_ascii_uppercase() && c[1..].iter().all(|&x| x.is_ascii_uppercase() || x.is_ascii_digit() || x == '-')
}

fn segments(content: &[char], indent_empty: bool) -> Vec<Vec<char>> {
    if content[0] == '#' {
        let s = content.iter().position(|&x| x != '#').unwrap_or(content.len());
        return vec![content[s..].to_vec()];
    }
    let spans = literals(content);
    let n = content.len();
    let mut split = None;
    for i in 1..n {
        if content[i] == '#'
            && is_sp(content[i - 1])
            && (i + 1 == n || is_sp(content[i + 1]))
            && !spans.iter().any(|&(s, e)| s <= i && i <= e)
        {
            split = Some(i);
            break;
        }
    }
    let (mut code, comment): (Vec<char>, Option<Vec<char>>) = match split {
        Some(i) => {
            let mut cd = content[..i].to_vec();
            while cd.last().map_or(false, |&x| is_sp(x)) {
                cd.pop();
            }
            (cd, Some(trim_sp(&content[i + 1..]).to_vec()))
        }
        None => (content.to_vec(), None),
    };
    if indent_empty {
        let ne = code.iter().position(|&x| is_sp(x)).unwrap_or(code.len());
        let mut name: Vec<char> = code[..ne].to_vec();
        if name.last() == Some(&':') {
            name.pop();
        }
        let cited: Vec<char> = "CITED".chars().collect();
        if is_nameshape(&name) && name != cited {
            code = code[ne..].to_vec();
        }
    }
    let mut attr = vec![' '];
    attr.extend_from_slice(&code);
    let aspans = literals(&attr);
    let mut body: &[char] = trim_sp(&attr);
    for k in 1..attr.len() {
        if !is_sp(attr[k - 1]) {
            continue;
        }
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            let e = k + kw.len();
            if at(&attr, k, kw)
                && (e >= attr.len() || is_sp(attr[e]))
                && !aspans.iter().any(|&(s, en)| s <= k && k <= en)
            {
                body = trim_sp(&attr[..k]);
                let mut out = vec![body.to_vec()];
                if let Some(cm) = comment {
                    out.push(cm);
                }
                return out;
            }
        }
    }
    let mut out = vec![body.to_vec()];
    if let Some(cm) = comment {
        out.push(cm);
    }
    out
}

const P_NAMES: [&str; 33] = [
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM", "SEAM", "BEHAVIOR",
    "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY",
    "CARRIED-DATA", "STATE", "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE", "NOTES",
];

fn is_p_name(s: &[char]) -> bool {
    let st: String = s.iter().collect();
    if st == "GUARD-PINNED" || P_NAMES.contains(&st.as_str()) {
        return true;
    }
    s.len() >= 2 && s[0] == 'R' && s[1..].iter().all(|x| x.is_ascii_digit())
}

fn lang_hit(content: &[char]) -> bool {
    if content[0] == '#' {
        return false;
    }
    let te = content.iter().position(|&x| is_sp(x)).unwrap_or(content.len());
    let mut tok: Vec<char> = content[..te].to_vec();
    if is_p_name(&tok) {
        return true;
    }
    if tok.last() == Some(&':') {
        tok.pop();
        if is_p_name(&tok) {
            return true;
        }
    }
    let run = |from: usize| -> usize {
        if from >= content.len() || !content[from].is_ascii_uppercase() {
            return from;
        }
        let mut e = from + 1;
        while e < content.len() && (content[e].is_ascii_uppercase() || content[e].is_ascii_digit() || content[e] == '-') {
            e += 1;
        }
        e
    };
    let e = run(0);
    if e > 0 && is_p_name(&content[..e]) {
        if e < content.len() && is_glue(content[e]) {
            return true;
        }
        if e + 1 < content.len() && content[e] == ':' && is_glue(content[e + 1]) {
            return true;
        }
    }
    let mut l = 0;
    while l < content.len() && is_glue(content[l]) {
        l += 1;
    }
    if l > 0 {
        let e = run(l);
        if e > l && is_p_name(&content[l..e]) {
            return e >= content.len() || is_sp(content[e]) || content[e] == ':' || is_glue(content[e]);
        }
    }
    false
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (idx, line) in split_lines(text).iter().enumerate() {
        let ind = line.iter().take_while(|&&x| is_sp(x)).count();
        let content = &line[ind..];
        if content.is_empty() {
            continue;
        }
        let display: String = line[ind..].iter().take(96).collect();
        let mut labels: Vec<&str> = Vec::new();
        if is_primary {
            for seg in segments(content, ind == 0) {
                let b = blank(&seg);
                for (label, f) in ROWS.iter() {
                    if !labels.contains(label) && f(&b) {
                        labels.push(label);
                        hits.push(json!({"line": idx + 1, "what": label, "text": display}));
                    }
                }
            }
        } else if ind == 0 && lang_hit(content) {
            hits.push(json!({"line": idx + 1, "what": "behavior in a language file", "text": display}));
        }
    }
    json!({ "hits": hits })
}
