use serde_json::{Map, Value};

fn ws(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}
fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
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

fn strip_quoted(l: &[char]) -> Vec<char> {
    let n = l.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        if l[i] != '"' {
            out.push(l[i]);
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut end = None;
        while j < n {
            let c = l[j];
            if c == '"' {
                end = Some(j);
                break;
            }
            if c == '\\' {
                if j + 1 >= n || lt(l[j + 1]) {
                    break;
                }
                j += 2;
            } else if c == '\n' {
                break;
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

fn at(s: &[char], p: usize, pat: &str) -> bool {
    let mut k = p;
    for c in pat.chars() {
        if k >= s.len() || s[k] != c {
            return false;
        }
        k += 1;
    }
    true
}
fn wd(s: &[char], p: isize) -> bool {
    p >= 0 && (p as usize) < s.len() && word(s[p as usize])
}
fn bnd(s: &[char], p: usize) -> bool {
    wd(s, p as isize - 1) != wd(s, p as isize)
}
fn bounded_word(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    (0..s.len()).any(|p| at(s, p, w) && bnd(s, p) && bnd(s, p + n))
}
fn skip_ws(s: &[char], mut p: usize) -> usize {
    while p < s.len() && ws(s[p]) {
        p += 1;
    }
    p
}

fn method_call(s: &[char]) -> bool {
    let names = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|p| {
        s[p] == '.'
            && names.iter().any(|nm| {
                at(s, p + 1, nm) && p + 1 + nm.len() < s.len() && s[p + 1 + nm.len()] == '('
            })
    })
}

fn js_builtin(s: &[char]) -> bool {
    let names = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|p| {
        bnd(s, p)
            && names.iter().any(|nm| {
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
        if !(bnd(s, p) && at(s, p, "if")) {
            return false;
        }
        let q = skip_ws(s, p + 2);
        q < s.len() && s[q] == '('
    })
}

fn is_loop(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        if !bnd(s, p) {
            return false;
        }
        if at(s, p, "for") {
            let mut q = p + 3;
            let a = skip_ws(s, q);
            if a > q {
                q = a;
                let st = q;
                while q < s.len() && word(s[q]) {
                    q += 1;
                }
                if q > st {
                    let b = skip_ws(s, q);
                    if b > q && at(s, b, "in") && bnd(s, b + 2) {
                        return true;
                    }
                }
            }
        }
        for kw in ["for", "while"] {
            if at(s, p, kw) {
                let q = skip_ws(s, p + kw.len());
                if q < s.len() && s[q] == '(' {
                    return true;
                }
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
    for kw in ["step", "node", "branch", "gate"] {
        let n = kw.len();
        if p + n <= s.len() && s[p..p + n].iter().zip(kw.chars()).all(|(a, b)| a.to_ascii_lowercase() == b) {
            let q = skip_ws(s, p + n);
            if q > p + n && q < s.len() && (word(s[q]) || s[q] == '-') {
                return true;
            }
        }
    }
    false
}

fn indexed(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        if !(word(s[p]) && p + 1 < s.len() && s[p + 1] == '[') {
            return false;
        }
        let mut q = p + 2;
        let st = q;
        while q < s.len() && word(s[q]) {
            q += 1;
        }
        if q == st || q >= s.len() || s[q] != ']' {
            return false;
        }
        let e = skip_ws(s, q + 1);
        e < s.len() && s[e] == '=' && !(e + 1 < s.len() && s[e + 1] == '=')
    })
}

fn regex_lit(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        if !at(s, p, "/^") {
            return false;
        }
        let mut q = p + 2;
        while q < s.len() {
            if at(s, q, "$/") {
                return true;
            }
            if lt(s[q]) {
                return false;
            }
            q += 1;
        }
        false
    })
}

fn group_ref(s: &[char]) -> bool {
    (0..s.len()).any(|p| {
        bnd(s, p) && at(s, p, "group") && p + 5 < s.len() && s[p + 5].is_ascii_digit() && bnd(s, p + 6)
    })
}

fn assign(s: &[char]) -> bool {
    let last = match s.iter().rposition(|&c| !ws(c)) {
        Some(l) if s[l] == ';' => l,
        _ => return false,
    };
    for e in 0..s.len() {
        if s[e] != '=' {
            continue;
        }
        let mut k = e;
        while k > 0 && ws(s[k - 1]) {
            k -= 1;
        }
        let mut m = k;
        while m > 0 && word(s[m - 1]) {
            m -= 1;
        }
        if m == k || !s[m..k].iter().any(|c| c.is_ascii_alphabetic() || *c == '_') {
            continue;
        }
        let c = skip_ws(s, e + 1);
        if c >= s.len() || s[c] == '=' {
            continue;
        }
        if last > c && !s[c..last].iter().any(|&x| lt(x)) {
            return true;
        }
    }
    false
}

pub fn lint_transcription(text: &str) -> serde_json::Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0u64;
    let mut lines = 0u64;
    let mut comments = 0u64;
    for (idx, raw) in split_lines(text).into_iter().enumerate() {
        let mut st = 0;
        while st < raw.len() && raw[st] == '\u{FEFF}' {
            st += 1;
        }
        let mut l: Vec<char> = raw[st..].to_vec();
        while matches!(l.last(), Some(' ') | Some('\t')) {
            l.pop();
        }
        let a = l.iter().position(|&c| !ws(c));
        let a = match a {
            Some(a) => a,
            None => continue,
        };
        lines += 1;
        if l[a] == '#' {
            comments += 1;
        }
        let b = l.iter().rposition(|&c| !ws(c)).unwrap();
        let txt: String = l[a..=b].iter().take(96).collect();
        let s = strip_quoted(&l);
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded_word(&s, "typeof")),
            ("arrow fn", (0..s.len()).any(|p| at(&s, p, "=>"))),
            ("method call", method_call(&s)),
            ("JS builtin", js_builtin(&s)),
            ("if (", if_paren(&s)),
            ("return", bounded_word(&s, "return")),
            ("loop", is_loop(&s)),
            ("STEP/NODE/BRANCH narration", narration(&s)),
            ("indexed assignment", indexed(&s)),
            ("dialect regex literal", regex_lit(&s)),
            ("JS value name (say none)", bounded_word(&s, "null") || bounded_word(&s, "undefined")),
            ("assignment statement", assign(&s)),
            ("capture-group reference", group_ref(&s)),
        ];
        let mut any = false;
        for (what, m) in rows.iter() {
            if *m {
                any = true;
                let mut o = Map::new();
                o.insert("line".into(), Value::from((idx + 1) as f64));
                o.insert("what".into(), Value::from(*what));
                o.insert("text".into(), Value::from(txt.clone()));
                hits.push(Value::Object(o));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    let mut o = Map::new();
    o.insert("hits".into(), Value::Array(hits));
    o.insert("hitLines".into(), Value::from(hit_lines as f64));
    o.insert("lines".into(), Value::from(lines as f64));
    o.insert("commentLines".into(), Value::from(comments as f64));
    o.insert("density".into(), Value::from(density));
    Value::Object(o)
}
