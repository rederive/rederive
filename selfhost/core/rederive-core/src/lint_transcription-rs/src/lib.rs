use serde_json::{json, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut it = text.chars().peekable();
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

fn normalize(line: &[char]) -> Vec<char> {
    let mut end = 0;
    while end < line.len() && matches!(line[end], ' ' | '\t' | '\u{FEFF}') {
        end += 1;
    }
    let mut v: Vec<char> = line[..end].iter().copied().filter(|&c| c != '\u{FEFF}').collect();
    v.extend_from_slice(&line[end..]);
    while matches!(v.last(), Some(' ') | Some('\t')) {
        v.pop();
    }
    v
}

fn is_opener(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn strip(line: &[char]) -> Vec<char> {
    let n = line.len();
    let mut out = Vec::with_capacity(n);
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        let c = line[i];
        if c == '"' && (i == 0 || is_opener(line[i - 1]) || last_close == Some(i)) {
            let mut j = i + 1;
            let mut closed = false;
            while j < n {
                if line[j] == '\\' {
                    if j + 1 < n {
                        j += 2;
                    } else {
                        break;
                    }
                } else if line[j] == '"' {
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
                out.extend_from_slice(&line[i..]);
                break;
            }
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

fn boundary(s: &[char], p: usize) -> bool {
    let l = p > 0 && is_word(s[p - 1]);
    let r = p < s.len() && is_word(s[p]);
    l != r
}

fn at(s: &[char], p: usize, w: &str) -> bool {
    let mut i = p;
    for c in w.chars() {
        if i >= s.len() || s[i] != c {
            return false;
        }
        i += 1;
    }
    true
}

fn skip_ws(s: &[char], mut p: usize) -> usize {
    while p < s.len() && is_ws(s[p]) {
        p += 1;
    }
    p
}

fn has_word(s: &[char], w: &str) -> bool {
    let len = w.chars().count();
    (0..s.len()).any(|p| at(s, p, w) && boundary(s, p) && boundary(s, p + len))
}

fn has_str(s: &[char], w: &str) -> bool {
    (0..s.len()).any(|p| at(s, p, w))
}

fn method_call(s: &[char]) -> bool {
    const M: [&str; 8] = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|p| {
        s[p] == '.'
            && M.iter().any(|m| at(s, p + 1, m) && at(s, p + 1 + m.len(), "("))
    })
}

fn js_builtin(s: &[char]) -> bool {
    const W: [&str; 5] = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|p| {
        boundary(s, p)
            && W.iter().any(|w| {
                if !at(s, p, w) {
                    return false;
                }
                let q = skip_ws(s, p + w.len());
                q < s.len() && (s[q] == '.' || s[q] == '(')
            })
    })
}

fn if_paren(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        boundary(s, p) && at(s, p, "if") && {
            let q = skip_ws(s, p + 2);
            q < s.len() && s[q] == '('
        }
    })
}

fn loop_shape(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        if !boundary(s, p) {
            return false;
        }
        if at(s, p, "for") {
            let q = p + 3;
            let a = skip_ws(s, q);
            if a > q {
                let mut b = a;
                while b < s.len() && is_word(s[b]) {
                    b += 1;
                }
                if b > a {
                    let c = skip_ws(s, b);
                    if c > b && at(s, c, "in") && boundary(s, c + 2) {
                        return true;
                    }
                }
            }
            let q = skip_ws(s, p + 3);
            if q < s.len() && s[q] == '(' {
                return true;
            }
        }
        if at(s, p, "while") {
            let q = skip_ws(s, p + 5);
            if q < s.len() && s[q] == '(' {
                return true;
            }
        }
        false
    })
}

fn narration(s: &[char]) -> bool {
    let mut p = skip_ws(s, 0);
    if p < s.len() && s[p] == '#' {
        p += 1;
    }
    p = skip_ws(s, p);
    for k in ["STEP", "NODE", "BRANCH", "GATE"] {
        let l = k.len();
        if p + l <= s.len() && s[p..p + l].iter().zip(k.chars()).all(|(a, b)| a.eq_ignore_ascii_case(&b)) {
            let q = skip_ws(s, p + l);
            if q > p + l && q < s.len() && (is_word(s[q]) || s[q] == '-') {
                return true;
            }
        }
    }
    false
}

fn indexed_assign(s: &[char]) -> bool {
    const OPS: [&str; 16] = [
        "", "**", "<<", ">>", ">>>", "&&", "||", "??", "-", "+", "*", "/", "%", "&", "|", "^",
    ];
    for k in 1..s.len() {
        if s[k] != '[' || !is_word(s[k - 1]) {
            continue;
        }
        let mut j = k + 1;
        while j < s.len() && is_word(s[j]) {
            j += 1;
        }
        if j == k + 1 || j >= s.len() || s[j] != ']' {
            continue;
        }
        let q = skip_ws(s, j + 1);
        for op in OPS.iter() {
            if at(s, q, op) {
                let e = q + op.chars().count();
                if e < s.len() && s[e] == '=' {
                    let nx = s.get(e + 1);
                    if nx != Some(&'=') && nx != Some(&'>') {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn regex_lit(s: &[char]) -> bool {
    for p in 0..s.len() {
        if at(s, p, "/^") {
            let mut q = p + 2;
            while q < s.len() {
                if at(s, q, "$/") {
                    return true;
                }
                if is_lt(s[q]) {
                    break;
                }
                q += 1;
            }
        }
    }
    false
}

fn group_ref(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        boundary(s, p) && at(s, p, "group") && p + 5 < s.len() && s[p + 5].is_ascii_digit() && boundary(s, p + 6)
    })
}

fn assign(s: &[char]) -> bool {
    let last = match s.iter().rposition(|&c| !is_ws(c)) {
        Some(l) if s[l] == ';' => l,
        _ => return false,
    };
    for e in 0..s.len() {
        if s[e] != '=' {
            continue;
        }
        let mut k = e;
        while k > 0 && is_ws(s[k - 1]) {
            k -= 1;
        }
        let end = k;
        while k > 0 && is_word(s[k - 1]) {
            k -= 1;
        }
        if k == end || !s[k..end].iter().any(|&c| c.is_ascii_alphabetic() || c == '_') {
            continue;
        }
        let ci = skip_ws(s, e + 1);
        if ci >= s.len() || s[ci] == '=' {
            continue;
        }
        if last > ci && !s[ci..last].iter().any(|&c| is_lt(c)) {
            return true;
        }
    }
    false
}

pub fn lint_transcription(text: &str) -> Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let norm = normalize(raw);
        if norm.iter().all(|&c| is_ws(c)) {
            continue;
        }
        lines += 1;
        if let Some(c) = norm.iter().find(|&&c| !is_ws(c)) {
            if *c == '#' {
                comments += 1;
            }
        }
        let s = strip(&norm);
        let tests: [(&str, bool); 13] = [
            ("typeof", has_word(&s, "typeof")),
            ("arrow fn", has_str(&s, "=>")),
            ("method call", method_call(&s)),
            ("JS builtin", js_builtin(&s)),
            ("if (", if_paren(&s)),
            ("return", has_word(&s, "return")),
            ("loop", loop_shape(&s)),
            ("STEP/NODE/BRANCH narration", narration(&s)),
            ("indexed assignment", indexed_assign(&s)),
            ("dialect regex literal", regex_lit(&s)),
            ("JS value name (say none)", has_word(&s, "null") || has_word(&s, "undefined")),
            ("assignment statement", assign(&s)),
            ("capture-group reference", group_ref(&s)),
        ];
        let mut any = false;
        let mut start = 0;
        while start < norm.len() && is_ws(norm[start]) {
            start += 1;
        }
        let mut end = norm.len();
        while end > start && is_ws(norm[end - 1]) {
            end -= 1;
        }
        let txt: String = norm[start..end].iter().take(96).collect();
        for (what, m) in tests.iter() {
            if *m {
                any = true;
                hits.push(json!({"line": (idx + 1) as f64, "what": what, "text": txt}));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    json!({
        "hits": hits,
        "hitLines": hit_lines as f64,
        "lines": lines as f64,
        "commentLines": comments as f64,
        "density": density
    })
}
