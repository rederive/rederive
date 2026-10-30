use serde_json::{json, Value};

const P_NAMES: &[&str] = &[
    "SIR", "KIND", "FIDELITY", "VARIANT", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS",
    "TRACE-SEAM", "SEAM", "BEHAVIOR", "INVARIANT", "TABLE", "SCOPE", "UNGUARDED-PRECONDITION",
    "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "STATE",
    "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    "NOTES", "GUARD-PINNED",
];

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

fn split_lines(t: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut it = t.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out
}

fn clean_line(l: &[char]) -> Vec<char> {
    let mut i = 0;
    let mut out = Vec::new();
    while i < l.len() && (is_sp(l[i]) || l[i] == '\u{FEFF}') {
        if l[i] != '\u{FEFF}' {
            out.push(l[i]);
        }
        i += 1;
    }
    out.extend_from_slice(&l[i..]);
    while let Some(&c) = out.last() {
        if is_sp(c) {
            out.pop();
        } else {
            break;
        }
    }
    out
}

fn literals(s: &[char]) -> Vec<(usize, usize)> {
    let mut res = Vec::new();
    let mut i = 0;
    let mut last_close: Option<usize> = None;
    while i < s.len() {
        if s[i] == '"' && (i == 0 || last_close == Some(i - 1) || is_opener(s[i - 1])) {
            let mut j = i + 1;
            let mut close = None;
            while j < s.len() {
                if s[j] == '\\' {
                    j += 2;
                } else if s[j] == '"' {
                    close = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            match close {
                Some(c) => {
                    res.push((i, c));
                    last_close = Some(c);
                    i = c + 1;
                }
                None => break,
            }
        } else {
            i += 1;
        }
    }
    res
}

fn blank(s: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut pos = 0;
    for (o, c) in literals(s) {
        out.extend_from_slice(&s[pos..o]);
        out.push('"');
        out.push('"');
        pos = c + 1;
    }
    out.extend_from_slice(&s[pos..]);
    out
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

fn word_at(s: &[char], i: usize) -> bool {
    i < s.len() && is_word(s[i])
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_sp(s[a]) {
        a += 1;
    }
    while b > a && is_sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn lt_rest(s: &[char], j: usize) -> bool {
    if !starts_ci(s, j, "line") {
        return false;
    }
    let k = j + 4;
    if k < s.len() && (s[k] == '-' || s[k] == ' ') && starts_ci(s, k + 1, "terminator") {
        return true;
    }
    starts_ci(s, k, "terminator")
}

fn dialect(s: &[char]) -> Vec<&'static str> {
    let mut hits = Vec::new();
    let n = s.len();
    // row 1
    let mut r1 = false;
    for i in 0..n {
        if starts(s, i, "/^") {
            let mut j = i + 2;
            while j < n {
                if s[j] == '\u{2028}' || s[j] == '\u{2029}' {
                    break;
                }
                if starts(s, j, "$/") {
                    r1 = true;
                    break;
                }
                j += 1;
            }
            if r1 {
                break;
            }
        }
    }
    if r1 {
        hits.push("anchored regex literal");
    }
    // rows 2, 3
    let mut r2 = false;
    let mut r3 = false;
    for i in 0..n {
        if s[i] == '\\' && i + 1 < n {
            if "wsdWSDbB".contains(s[i + 1]) && !word_at(s, i + 2) {
                r2 = true;
            }
            if starts(s, i + 1, "p{") {
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
    // rows 4, 5
    let mut js = false;
    for i in 0..n {
        if i > 0 && is_word(s[i - 1]) {
            continue;
        }
        if starts(s, i, "Math.") && word_at(s, i + 5) {
            js = true;
        }
        for kw in ["String.prototype", "parseInt", "parseFloat", "BigInt"] {
            if starts(s, i, kw) && !word_at(s, i + kw.chars().count()) {
                js = true;
            }
        }
        for kw in ["Number(", "String(", "Boolean(", "BigInt(", "toLowerCase(", "toUpperCase(",
            "charCodeAt(", "codePointAt(", "localeCompare(", "normalize(", "padStart(", "padEnd("] {
            if starts(s, i, kw) {
                js = true;
            }
        }
        for kw in ["JSON", "Object", "Array", "Reflect", "Symbol", "Intl", "Number", "String",
            "BigInt", "Boolean", "Date", "RegExp", "Promise"] {
            if starts(s, i, kw) {
                let k = i + kw.chars().count();
                if k + 1 < n && s[k] == '.' && s[k + 1].is_ascii_alphabetic() {
                    js = true;
                }
            }
        }
    }
    if js {
        hits.push("JS API name");
    }
    // row 6
    let mut rs = false;
    for i in 0..n {
        if starts(s, i, "&str") && !word_at(s, i + 4) {
            rs = true;
        }
        if i > 0 && is_word(s[i - 1]) {
            continue;
        }
        for kw in ["fancy-regex", "fancy_regex", "to_lowercase"] {
            if starts(s, i, kw) && !word_at(s, i + kw.chars().count()) {
                rs = true;
            }
        }
        for kw in ["f64", "u8", "u64", "i64", "usize", "String", "Vec", "char", "str", "Box",
            "HashMap", "BTreeMap"] {
            if starts(s, i, kw) && starts(s, i + kw.chars().count(), "::") {
                rs = true;
            }
        }
        if starts(s, i, "Option<") || starts(s, i, "Vec<") {
            rs = true;
        }
    }
    if rs {
        hits.push("Rust API name");
    }
    // row 7
    let mut lt = false;
    for i in 0..n {
        if i > 0 && is_word(s[i - 1]) {
            continue;
        }
        if lt_rest(s, i) || (starts_ci(s, i, "new") && lt_rest(s, i + 3)) {
            lt = true;
        }
    }
    if lt {
        hits.push("line-terminator mechanism");
    }
    // row 8
    let mut jv = false;
    for i in 0..n {
        if i > 0 && is_word(s[i - 1]) {
            continue;
        }
        for kw in ["null", "undefined"] {
            if starts(s, i, kw) && !word_at(s, i + kw.chars().count()) {
                jv = true;
            }
        }
    }
    if jv {
        hits.push("JS value name (say none)");
    }
    hits
}

fn is_nameshape_run_char(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-'
}

fn name_run_len(s: &[char]) -> usize {
    if s.is_empty() || !s[0].is_ascii_uppercase() {
        return 0;
    }
    let mut k = 1;
    while k < s.len() && is_nameshape_run_char(s[k]) {
        k += 1;
    }
    k
}

fn is_rule_name(n: &str) -> bool {
    let b = n.as_bytes();
    b.len() >= 2 && b[0] == b'R' && b[1..].iter().all(|c| c.is_ascii_digit())
}

fn is_p_name(n: &str) -> bool {
    P_NAMES.contains(&n) || is_rule_name(n)
}

fn lang_hit(content: &[char]) -> bool {
    if content.is_empty() || content[0] == '#' {
        return false;
    }
    let tok_end = content.iter().position(|&c| is_sp(c)).unwrap_or(content.len());
    let tok: String = content[..tok_end].iter().collect();
    if is_p_name(&tok) {
        return true;
    }
    if let Some(t) = tok.strip_suffix(':') {
        if is_p_name(t) {
            return true;
        }
    }
    let rl = name_run_len(content);
    if rl > 0 {
        let run: String = content[..rl].iter().collect();
        if is_p_name(&run) {
            let k = rl;
            if k < content.len() && is_glue(content[k]) {
                return true;
            }
            if k + 1 < content.len() && content[k] == ':' && is_glue(content[k + 1]) {
                return true;
            }
        }
    }
    let mut g = 0;
    while g < content.len() && is_glue(content[g]) {
        g += 1;
    }
    if g > 0 {
        let rest = &content[g..];
        let rl = name_run_len(rest);
        if rl > 0 {
            let run: String = rest[..rl].iter().collect();
            if is_p_name(&run) {
                if rl == rest.len() {
                    return true;
                }
                let c = rest[rl];
                if is_sp(c) || c == ':' || is_glue(c) {
                    return true;
                }
            }
        }
    }
    false
}

fn segments(content: &[char]) -> Vec<Vec<char>> {
    if content[0] == '#' {
        let mut a = 0;
        while a < content.len() && content[a] == '#' {
            a += 1;
        }
        return vec![content[a..].to_vec()];
    }
    let lits = literals(content);
    let mut split = None;
    for i in 1..content.len() {
        if content[i] == '#'
            && is_sp(content[i - 1])
            && (i + 1 == content.len() || is_sp(content[i + 1]))
            && !lits.iter().any(|&(o, c)| o <= i && i <= c)
        {
            split = Some(i);
            break;
        }
    }
    let (mut code, comment): (Vec<char>, Option<Vec<char>>) = match split {
        Some(i) => {
            let mut c = content[..i].to_vec();
            while let Some(&l) = c.last() {
                if is_sp(l) {
                    c.pop();
                } else {
                    break;
                }
            }
            (c, Some(trim_sp(&content[i + 1..]).to_vec()))
        }
        None => (content.to_vec(), None),
    };
    // indent is empty here only if caller passes content with no indent; handled by caller
    let _ = &mut code;
    let mut out = vec![code];
    if let Some(c) = comment {
        out.push(c);
    }
    out
}

fn body_of(code: &[char], indent_empty: bool) -> Vec<char> {
    let mut code = code.to_vec();
    if indent_empty {
        let e = code.iter().position(|&c| is_sp(c)).unwrap_or(code.len());
        let mut name: Vec<char> = code[..e].to_vec();
        if name.last() == Some(&':') {
            name.pop();
        }
        let shape = !name.is_empty()
            && name[0].is_ascii_uppercase()
            && name[1..].iter().all(|&c| is_nameshape_run_char(c));
        let is_cited = name.iter().collect::<String>() == "CITED";
        if shape && !is_cited {
            code = code[e..].to_vec();
        }
    }
    let mut at = vec![' '];
    at.extend_from_slice(&code);
    let lits = literals(&at);
    let mut end = at.len();
    for k in 1..at.len() {
        if !is_sp(at[k - 1]) {
            continue;
        }
        for kw in ["CITED", "EARNED", "ANCHOR"] {
            if starts(&at, k, kw) {
                let a = k + kw.len();
                if (a == at.len() || is_sp(at[a])) && !lits.iter().any(|&(o, c)| o < k && k <= c) {
                    end = k;
                    break;
                }
            }
        }
        if end != at.len() {
            break;
        }
    }
    trim_sp(&at[..end]).to_vec()
}

fn display(line: &[char]) -> String {
    let mut a = 0;
    while a < line.len() && is_sp(line[a]) {
        a += 1;
    }
    line[a..].iter().take(96).collect()
}

pub fn lint_leak(text: &str, is_primary: bool) -> Value {
    let mut hits: Vec<Value> = Vec::new();
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let line = clean_line(raw);
        let ind = line.iter().take_while(|&&c| is_sp(c)).count();
        let content = &line[ind..];
        if content.is_empty() {
            continue;
        }
        let mut labels: Vec<&'static str> = Vec::new();
        if is_primary {
            let segs: Vec<Vec<char>> = if content[0] == '#' {
                segments(content)
            } else {
                let mut sg = segments(content);
                let first = sg.remove(0);
                let body = body_of(&first, ind == 0);
                let mut v = vec![body];
                v.extend(sg);
                v
            };
            for sg in segs {
                let b = blank(&sg);
                for l in dialect(&b) {
                    if !labels.contains(&l) {
                        labels.push(l);
                    }
                }
            }
        } else if ind == 0 && lang_hit(content) {
            labels.push("behavior in a language file");
        }
        for l in labels {
            hits.push(json!({"line": idx + 1, "what": l, "text": display(&line)}));
        }
    }
    json!({ "hits": hits })
}
