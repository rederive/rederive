use serde_json::{json, Map, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn normalize(line: &[char]) -> Vec<char> {
    let mut k = 0;
    while k < line.len() && matches!(line[k], ' ' | '\t' | '\u{FEFF}') {
        k += 1;
    }
    let mut v: Vec<char> = line[..k].iter().copied().filter(|&c| c != '\u{FEFF}').collect();
    v.extend_from_slice(&line[k..]);
    while let Some(&c) = v.last() {
        if c == ' ' || c == '\t' {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn strip_quoted(l: &[char]) -> Vec<char> {
    const OPENERS: [char; 16] = [' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~'];
    let n = l.len();
    let mut out = Vec::with_capacity(n);
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        let c = l[i];
        if c == '"' && (i == 0 || OPENERS.contains(&l[i - 1]) || last_close == Some(i)) {
            let mut j = i + 1;
            let mut closed = false;
            while j < n {
                if l[j] == '\\' {
                    if j + 1 >= n {
                        break;
                    }
                    j += 2;
                } else if l[j] == '"' {
                    closed = true;
                    break;
                } else {
                    j += 1;
                }
            }
            if closed {
                out.push('"');
                out.push('"');
                i = j + 1;
                last_close = Some(i);
            } else {
                out.extend_from_slice(&l[i..]);
                break;
            }
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

fn at(s: &[char], p: usize, lit: &str) -> bool {
    let mut k = p;
    for c in lit.chars() {
        if k >= s.len() || s[k] != c {
            return false;
        }
        k += 1;
    }
    true
}

fn boundary(s: &[char], p: usize) -> bool {
    let b = p > 0 && p <= s.len() && is_word(s[p - 1]);
    let a = p < s.len() && is_word(s[p]);
    b != a
}

fn skip_ws(s: &[char], mut p: usize) -> usize {
    while p < s.len() && is_ws(s[p]) {
        p += 1;
    }
    p
}

fn bounded(s: &[char], w: &str) -> bool {
    let len = w.chars().count();
    (0..s.len()).any(|p| at(s, p, w) && boundary(s, p) && boundary(s, p + len))
}

fn method_call(s: &[char]) -> bool {
    let names = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|p| {
        s[p] == '.' && names.iter().any(|nm| {
            let q = p + 1 + nm.len();
            at(s, p + 1, nm) && q < s.len() && s[q] == '('
        })
    })
}

fn js_builtin(s: &[char]) -> bool {
    let names = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|p| {
        boundary(s, p) && names.iter().any(|nm| {
            if !at(s, p, nm) {
                return false;
            }
            let q = skip_ws(s, p + nm.len());
            q < s.len() && (s[q] == '.' || s[q] == '(')
        })
    })
}

fn if_paren(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        if !(boundary(s, p) && at(s, p, "if")) {
            return false;
        }
        let q = skip_ws(s, p + 2);
        q < s.len() && s[q] == '('
    })
}

fn loop_shape(s: &[char]) -> bool {
    let n = s.len();
    (0..n).any(|p| {
        if !boundary(s, p) {
            return false;
        }
        if at(s, p, "for") {
            let q = p + 3;
            let r = skip_ws(s, q);
            if r > q {
                let mut w = r;
                while w < n && is_word(s[w]) {
                    w += 1;
                }
                if w > r {
                    let x = skip_ws(s, w);
                    if x > w && at(s, x, "in") && boundary(s, x + 2) {
                        return true;
                    }
                }
            }
            let r2 = skip_ws(s, q);
            if r2 < n && s[r2] == '(' {
                return true;
            }
        }
        if at(s, p, "while") {
            let r = skip_ws(s, p + 5);
            if r < n && s[r] == '(' {
                return true;
            }
        }
        false
    })
}

fn narration(s: &[char]) -> bool {
    let n = s.len();
    let mut p = skip_ws(s, 0);
    if p < n && s[p] == '#' {
        p += 1;
    }
    p = skip_ws(s, p);
    for kw in ["STEP", "NODE", "BRANCH", "GATE"] {
        let k: Vec<char> = kw.chars().collect();
        if p + k.len() <= n && (0..k.len()).all(|i| s[p + i].eq_ignore_ascii_case(&k[i])) {
            let q = p + k.len();
            let r = skip_ws(s, q);
            if r > q && r < n && (is_word(s[r]) || s[r] == '-') {
                return true;
            }
        }
    }
    false
}

fn indexed_assign(s: &[char]) -> bool {
    let n = s.len();
    let ops = ["", "**", "<<", ">>", ">>>", "&&", "||", "??", "-", "+", "*", "/", "%", "&", "|", "^"];
    for p in 0..n {
        if !(is_word(s[p]) && p + 1 < n && s[p + 1] == '[') {
            continue;
        }
        let mut q = p + 2;
        while q < n && is_word(s[q]) {
            q += 1;
        }
        if q == p + 2 || q >= n || s[q] != ']' {
            continue;
        }
        let r = skip_ws(s, q + 1);
        for op in ops {
            if !at(s, r, op) {
                continue;
            }
            let e = r + op.chars().count();
            if e < n && s[e] == '=' {
                let nx = if e + 1 < n { Some(s[e + 1]) } else { None };
                if nx != Some('=') && nx != Some('>') {
                    return true;
                }
            }
        }
    }
    false
}

fn regex_literal(s: &[char]) -> bool {
    let n = s.len();
    for i in 0..n {
        if at(s, i, "/^") {
            let mut j = i + 2;
            while j + 1 < n {
                if s[j] == '$' && s[j + 1] == '/' {
                    return true;
                }
                if is_lt(s[j]) {
                    break;
                }
                j += 1;
            }
        }
    }
    false
}

fn assignment(s: &[char]) -> bool {
    let n = s.len();
    let last = match (0..n).rev().find(|&i| !is_ws(s[i])) {
        Some(i) if s[i] == ';' => i,
        _ => return false,
    };
    for e in 0..n {
        if s[e] != '=' {
            continue;
        }
        let mut k = e;
        while k > 0 && is_ws(s[k - 1]) {
            k -= 1;
        }
        if k == 0 || !is_word(s[k - 1]) {
            continue;
        }
        let mut st = k;
        let mut has = false;
        while st > 0 && is_word(s[st - 1]) {
            st -= 1;
            if s[st].is_ascii_alphabetic() || s[st] == '_' {
                has = true;
            }
        }
        if !has {
            continue;
        }
        let c = skip_ws(s, e + 1);
        if c >= n || s[c] == '=' {
            continue;
        }
        if last > c && !s[c + 1..last].iter().any(|&x| is_lt(x)) {
            return true;
        }
    }
    false
}

fn group_ref(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        boundary(s, p) && at(s, p, "group") && p + 5 < s.len() && s[p + 5].is_ascii_digit() && boundary(s, p + 6)
    })
}

pub fn lint_transcription(text: &str) -> Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let norm = normalize(raw);
        let first = norm.iter().find(|&&c| !is_ws(c));
        let first = match first {
            None => continue,
            Some(&c) => c,
        };
        lines += 1;
        if first == '#' {
            comments += 1;
        }
        let s = strip_quoted(&norm);
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded(&s, "typeof")),
            ("arrow fn", at_any(&s, "=>")),
            ("method call", method_call(&s)),
            ("JS builtin", js_builtin(&s)),
            ("if (", if_paren(&s)),
            ("return", bounded(&s, "return")),
            ("loop", loop_shape(&s)),
            ("STEP/NODE/BRANCH narration", narration(&s)),
            ("indexed assignment", indexed_assign(&s)),
            ("dialect regex literal", regex_literal(&s)),
            ("JS value name (say none)", bounded(&s, "null") || bounded(&s, "undefined")),
            ("assignment statement", assignment(&s)),
            ("capture-group reference", group_ref(&s)),
        ];
        let mut st = 0;
        let mut en = norm.len();
        while st < en && is_ws(norm[st]) {
            st += 1;
        }
        while en > st && is_ws(norm[en - 1]) {
            en -= 1;
        }
        let t: String = norm[st..en].iter().take(96).collect();
        let mut any = false;
        for (what, m) in rows.iter() {
            if *m {
                any = true;
                let mut o = Map::new();
                o.insert("line".into(), json!((idx + 1) as f64));
                o.insert("what".into(), json!(what));
                o.insert("text".into(), json!(t));
                hits.push(Value::Object(o));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    let mut m = Map::new();
    m.insert("hits".into(), Value::Array(hits));
    m.insert("hitLines".into(), json!(hit_lines as f64));
    m.insert("lines".into(), json!(lines as f64));
    m.insert("commentLines".into(), json!(comments as f64));
    m.insert("density".into(), json!(density));
    Value::Object(m)
}

fn at_any(s: &[char], lit: &str) -> bool {
    (0..s.len()).any(|p| at(s, p, lit))
}
