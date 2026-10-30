use serde_json::{json, Map, Value};

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}'
        | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn is_lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
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

fn normalize(l: &[char]) -> Vec<char> {
    let mut s = 0;
    while s < l.len() && l[s] == '\u{FEFF}' {
        s += 1;
    }
    let mut e = l.len();
    while e > s && (l[e - 1] == ' ' || l[e - 1] == '\t') {
        e -= 1;
    }
    l[s..e].to_vec()
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
            } else if c == '\\' {
                if j + 1 >= n || is_lt(l[j + 1]) {
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

fn at(s: &[char], i: usize, w: &str) -> bool {
    let mut k = i;
    for c in w.chars() {
        if k >= s.len() || s[k] != c {
            return false;
        }
        k += 1;
    }
    true
}

fn wc(s: &[char], i: isize) -> bool {
    i >= 0 && (i as usize) < s.len() && is_word(s[i as usize])
}
fn boundary(s: &[char], i: usize) -> bool {
    wc(s, i as isize - 1) != wc(s, i as isize)
}
fn skip_ws(s: &[char], mut i: usize) -> usize {
    while i < s.len() && is_ws(s[i]) {
        i += 1;
    }
    i
}
fn any_pos(s: &[char], f: impl Fn(usize) -> bool) -> bool {
    (0..=s.len()).any(f)
}
fn bounded_word(s: &[char], w: &str) -> bool {
    let len = w.chars().count();
    any_pos(s, |i| at(s, i, w) && boundary(s, i) && boundary(s, i + len))
}

fn method_call(s: &[char]) -> bool {
    let names = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    any_pos(s, |i| {
        i < s.len()
            && s[i] == '.'
            && names.iter().any(|n| {
                at(s, i + 1, n) && at(s, i + 1 + n.len(), "(")
            })
    })
}

fn js_builtin(s: &[char]) -> bool {
    let names = ["parseInt", "parseFloat", "Number", "String", "Math"];
    any_pos(s, |i| {
        boundary(s, i)
            && names.iter().any(|n| {
                if !at(s, i, n) {
                    return false;
                }
                let k = skip_ws(s, i + n.len());
                k < s.len() && (s[k] == '.' || s[k] == '(')
            })
    })
}

fn if_paren(s: &[char]) -> bool {
    any_pos(s, |i| {
        if !(boundary(s, i) && at(s, i, "if")) {
            return false;
        }
        let k = skip_ws(s, i + 2);
        k < s.len() && s[k] == '('
    })
}

fn loop_shape(s: &[char]) -> bool {
    any_pos(s, |i| {
        if !boundary(s, i) {
            return false;
        }
        if at(s, i, "for") {
            let a = i + 3;
            let b = skip_ws(s, a);
            if b > a {
                let mut c = b;
                while c < s.len() && is_word(s[c]) {
                    c += 1;
                }
                if c > b {
                    let d = skip_ws(s, c);
                    if d > c && at(s, d, "in") && boundary(s, d + 2) {
                        return true;
                    }
                }
            }
            let k = skip_ws(s, a);
            if k < s.len() && s[k] == '(' {
                return true;
            }
        }
        if at(s, i, "while") {
            let k = skip_ws(s, i + 5);
            if k < s.len() && s[k] == '(' {
                return true;
            }
        }
        false
    })
}

fn narration(s: &[char]) -> bool {
    let mut i = skip_ws(s, 0);
    if i < s.len() && s[i] == '#' {
        i += 1;
    }
    i = skip_ws(s, i);
    for kw in ["STEP", "NODE", "BRANCH", "GATE"] {
        let k: Vec<char> = kw.chars().collect();
        if i + k.len() <= s.len()
            && k.iter().enumerate().all(|(x, c)| s[i + x].eq_ignore_ascii_case(c))
        {
            let a = i + k.len();
            let b = skip_ws(s, a);
            if b > a && b < s.len() && (is_word(s[b]) || s[b] == '-') {
                return true;
            }
        }
    }
    false
}

fn indexed_assign(s: &[char]) -> bool {
    let n = s.len();
    (0..n).any(|i| {
        if !(is_word(s[i]) && i + 1 < n && s[i + 1] == '[') {
            return false;
        }
        let mut j = i + 2;
        while j < n && is_word(s[j]) {
            j += 1;
        }
        if j == i + 2 || j >= n || s[j] != ']' {
            return false;
        }
        let k = skip_ws(s, j + 1);
        k < n && s[k] == '=' && k + 1 < n && s[k + 1] != '='
    })
}

fn regex_lit(s: &[char]) -> bool {
    let n = s.len();
    (0..n).any(|i| {
        if !at(s, i, "/^") {
            return false;
        }
        let mut j = i + 2;
        while j < n {
            if at(s, j, "$/") {
                return true;
            }
            if is_lt(s[j]) {
                return false;
            }
            j += 1;
        }
        false
    })
}

fn assign(s: &[char]) -> bool {
    let n = s.len();
    let last = match (0..n).rev().find(|&i| !is_ws(s[i])) {
        Some(l) if s[l] == ';' => l,
        _ => return false,
    };
    (0..n).any(|e| {
        if s[e] != '=' {
            return false;
        }
        let mut b = e;
        while b > 0 && is_ws(s[b - 1]) {
            b -= 1;
        }
        let mut a = b;
        while a > 0 && is_word(s[a - 1]) {
            a -= 1;
        }
        if a == b || !s[a..b].iter().any(|c| c.is_ascii_alphabetic() || *c == '_') {
            return false;
        }
        let c = skip_ws(s, e + 1);
        if c >= n || s[c] == '=' {
            return false;
        }
        last > c && !s[c + 1..last].iter().any(|x| is_lt(*x))
    })
}

fn group_ref(s: &[char]) -> bool {
    any_pos(s, |i| {
        boundary(s, i)
            && at(s, i, "group")
            && i + 5 < s.len()
            && s[i + 5].is_ascii_digit()
            && boundary(s, i + 6)
    })
}

pub fn lint_transcription(text: &str) -> serde_json::Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let l = normalize(raw);
        let blank = l.iter().all(|c| is_ws(*c));
        if blank {
            continue;
        }
        lines += 1;
        let start = l.iter().position(|c| !is_ws(*c)).unwrap();
        if l[start] == '#' {
            comments += 1;
        }
        let s = strip_quoted(&l);
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded_word(&s, "typeof")),
            ("arrow fn", at_any(&s, "=>")),
            ("method call", method_call(&s)),
            ("JS builtin", js_builtin(&s)),
            ("if (", if_paren(&s)),
            ("return", bounded_word(&s, "return")),
            ("loop", loop_shape(&s)),
            ("STEP/NODE/BRANCH narration", narration(&s)),
            ("indexed assignment", indexed_assign(&s)),
            ("dialect regex literal", regex_lit(&s)),
            ("JS value name (say none)", bounded_word(&s, "null") || bounded_word(&s, "undefined")),
            ("assignment statement", assign(&s)),
            ("capture-group reference", group_ref(&s)),
        ];
        let mut end = l.len();
        while end > start && is_ws(l[end - 1]) {
            end -= 1;
        }
        let txt: String = l[start..end].iter().take(96).collect();
        let mut any = false;
        for (what, m) in rows.iter() {
            if *m {
                any = true;
                hits.push(json!({"line": idx + 1, "what": what, "text": txt}));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    let mut m = Map::new();
    m.insert("hits".to_string(), Value::Array(hits));
    m.insert("hitLines".to_string(), json!(hit_lines));
    m.insert("lines".to_string(), json!(lines));
    m.insert("commentLines".to_string(), json!(comments));
    m.insert("density".to_string(), json!(density));
    Value::Object(m)
}

fn at_any(s: &[char], w: &str) -> bool {
    (0..s.len()).any(|i| at(s, i, w))
}
