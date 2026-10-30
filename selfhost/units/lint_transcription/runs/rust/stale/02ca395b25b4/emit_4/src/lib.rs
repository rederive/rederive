use serde_json::{json, Value};

fn ws(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn wat(s: &[char], i: isize) -> bool {
    i >= 0 && (i as usize) < s.len() && word(s[i as usize])
}
fn bound(s: &[char], i: usize) -> bool {
    wat(s, i as isize - 1) != wat(s, i as isize)
}
fn at(s: &[char], i: usize, w: &str) -> bool {
    let n = w.chars().count();
    i + n <= s.len() && s[i..i + n].iter().copied().eq(w.chars())
}
fn skipws(s: &[char], mut i: usize) -> usize {
    while i < s.len() && ws(s[i]) {
        i += 1;
    }
    i
}
fn word_b(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    (0..s.len()).any(|i| at(s, i, w) && bound(s, i) && bound(s, i + n))
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

fn normalize(l: Vec<char>) -> Vec<char> {
    let mut a = 0;
    while a < l.len() && l[a] == '\u{FEFF}' {
        a += 1;
    }
    let mut b = l.len();
    while b > a && (l[b - 1] == ' ' || l[b - 1] == '\t') {
        b -= 1;
    }
    l[a..b].to_vec()
}

fn strip(l: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < l.len() {
        if l[i] != '"' {
            out.push(l[i]);
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end = None;
        while j < l.len() {
            let c = l[j];
            if c == '"' {
                end = Some(j);
                break;
            }
            if c == '\\' {
                if j + 1 >= l.len() || lt(l[j + 1]) {
                    break;
                }
                j += 2;
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

fn is_assign(s: &[char]) -> bool {
    let last = match s.iter().rposition(|&c| !ws(c)) {
        Some(p) if s[p] == ';' => p,
        _ => return false,
    };
    for e in 0..s.len() {
        if s[e] != '=' {
            continue;
        }
        let mut p = e;
        while p > 0 && ws(s[p - 1]) {
            p -= 1;
        }
        if p == 0 || !word(s[p - 1]) {
            continue;
        }
        let mut st = p;
        while st > 0 && word(s[st - 1]) {
            st -= 1;
        }
        if !s[st..p].iter().any(|&c| c.is_ascii_alphabetic() || c == '_') {
            continue;
        }
        let c = skipws(s, e + 1);
        if c >= s.len() || s[c] == '=' {
            continue;
        }
        if last > c && !s[c..last].iter().any(|&x| lt(x)) {
            return true;
        }
    }
    false
}

fn m_method(s: &[char]) -> bool {
    let ms = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|i| {
        s[i] == '.'
            && ms.iter().any(|m| {
                at(s, i + 1, m) && i + 1 + m.len() < s.len() && s[i + 1 + m.len()] == '('
            })
    })
}

fn m_builtin(s: &[char]) -> bool {
    let ws_ = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|i| {
        bound(s, i)
            && ws_.iter().any(|w| {
                at(s, i, w) && {
                    let k = skipws(s, i + w.len());
                    k < s.len() && (s[k] == '.' || s[k] == '(')
                }
            })
    })
}

fn m_if(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        bound(s, i) && at(s, i, "if") && {
            let k = skipws(s, i + 2);
            k < s.len() && s[k] == '('
        }
    })
}

fn m_loop(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !bound(s, i) {
            return false;
        }
        if at(s, i, "for") {
            let a = skipws(s, i + 3);
            if a > i + 3 {
                let mut b = a;
                while b < s.len() && word(s[b]) {
                    b += 1;
                }
                if b > a {
                    let c = skipws(s, b);
                    if c > b && at(s, c, "in") && bound(s, c + 2) {
                        return true;
                    }
                }
            }
        }
        for w in ["for", "while"] {
            if at(s, i, w) {
                let k = skipws(s, i + w.len());
                if k < s.len() && s[k] == '(' {
                    return true;
                }
            }
        }
        false
    })
}

fn m_narr(s: &[char]) -> bool {
    let mut i = skipws(s, 0);
    if i < s.len() && s[i] == '#' {
        i += 1;
    }
    i = skipws(s, i);
    for w in ["STEP", "NODE", "BRANCH", "GATE"] {
        let n = w.len();
        if i + n <= s.len() && s[i..i + n].iter().zip(w.chars()).all(|(a, b)| a.is_ascii() && a.eq_ignore_ascii_case(&b)) {
            let k = skipws(s, i + n);
            if k > i + n && k < s.len() && (word(s[k]) || s[k] == '-') {
                return true;
            }
        }
    }
    false
}

fn m_index(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !word(s[i]) || i + 1 >= s.len() || s[i + 1] != '[' {
            return false;
        }
        let mut j = i + 2;
        while j < s.len() && word(s[j]) {
            j += 1;
        }
        if j == i + 2 || j >= s.len() || s[j] != ']' {
            return false;
        }
        let k = skipws(s, j + 1);
        k < s.len() && s[k] == '=' && !(k + 1 < s.len() && s[k + 1] == '=')
    })
}

fn m_regex(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !at(s, i, "/^") {
            return false;
        }
        let mut k = i + 2;
        while k < s.len() {
            if at(s, k, "$/") {
                return true;
            }
            if lt(s[k]) {
                return false;
            }
            k += 1;
        }
        false
    })
}

fn m_group(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        bound(s, i)
            && at(s, i, "group")
            && i + 5 < s.len()
            && s[i + 5].is_ascii_digit()
            && bound(s, i + 6)
    })
}

pub fn lint_transcription(text: &str) -> serde_json::Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).into_iter().enumerate() {
        let n = normalize(raw);
        let blank = n.iter().all(|&c| ws(c));
        if blank {
            continue;
        }
        lines += 1;
        let first = n.iter().find(|&&c| !ws(c)).copied();
        if first == Some('#') {
            comments += 1;
        }
        let s = strip(&n);
        let rows: [(&str, bool); 13] = [
            ("typeof", word_b(&s, "typeof")),
            ("arrow fn", at_any(&s, "=>")),
            ("method call", m_method(&s)),
            ("JS builtin", m_builtin(&s)),
            ("if (", m_if(&s)),
            ("return", word_b(&s, "return")),
            ("loop", m_loop(&s)),
            ("STEP/NODE/BRANCH narration", m_narr(&s)),
            ("indexed assignment", m_index(&s)),
            ("dialect regex literal", m_regex(&s)),
            ("JS value name (say none)", word_b(&s, "null") || word_b(&s, "undefined")),
            ("assignment statement", is_assign(&s)),
            ("capture-group reference", m_group(&s)),
        ];
        let st = n.iter().position(|&c| !ws(c)).unwrap_or(0);
        let en = n.iter().rposition(|&c| !ws(c)).map(|p| p + 1).unwrap_or(0);
        let txt: String = n[st..en].iter().take(96).collect();
        let mut any = false;
        for (what, m) in rows.iter() {
            if *m {
                any = true;
                hits.push(json!({"line": (idx + 1) as u64, "what": what, "text": txt}));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    json!({
        "hits": hits,
        "hitLines": hit_lines as u64,
        "lines": lines as u64,
        "commentLines": comments as u64,
        "density": density
    })
}

fn at_any(s: &[char], w: &str) -> bool {
    (0..s.len()).any(|i| at(s, i, w))
}
