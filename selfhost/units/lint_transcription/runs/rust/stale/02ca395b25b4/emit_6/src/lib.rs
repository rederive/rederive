use serde_json::{Map, Value};

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
            }
            if c == '\\' {
                if j + 1 >= n || is_lt(l[j + 1]) || l[j + 1] == '\n' {
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
fn at_ci(s: &[char], i: usize, w: &str) -> bool {
    let mut k = i;
    for c in w.chars() {
        if k >= s.len() || !s[k].eq_ignore_ascii_case(&c) {
            return false;
        }
        k += 1;
    }
    true
}
fn boundary(s: &[char], p: usize) -> bool {
    let l = p > 0 && is_word(s[p - 1]);
    let r = p < s.len() && is_word(s[p]);
    l != r
}
fn skip_ws(s: &[char], mut i: usize) -> usize {
    while i < s.len() && is_ws(s[i]) {
        i += 1;
    }
    i
}
fn any_pos<F: Fn(usize) -> bool>(s: &[char], f: F) -> bool {
    (0..=s.len()).any(f)
}
fn bounded_word(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    any_pos(s, |i| at(s, i, w) && boundary(s, i) && boundary(s, i + n))
}

fn sh_method(s: &[char]) -> bool {
    let names = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    any_pos(s, |i| {
        s.get(i) == Some(&'.')
            && names.iter().any(|w| at(s, i + 1, w) && at(s, i + 1 + w.len(), "("))
    })
}
fn sh_builtin(s: &[char]) -> bool {
    let names = ["parseInt", "parseFloat", "Number", "String", "Math"];
    any_pos(s, |i| {
        boundary(s, i)
            && names.iter().any(|w| {
                at(s, i, w) && {
                    let k = skip_ws(s, i + w.len());
                    k < s.len() && (s[k] == '.' || s[k] == '(')
                }
            })
    })
}
fn sh_if(s: &[char]) -> bool {
    any_pos(s, |i| {
        boundary(s, i) && at(s, i, "if") && {
            let k = skip_ws(s, i + 2);
            k < s.len() && s[k] == '('
        }
    })
}
fn sh_loop(s: &[char]) -> bool {
    any_pos(s, |i| {
        if !boundary(s, i) {
            return false;
        }
        if at(s, i, "for") {
            let mut k = i + 3;
            let k0 = k;
            k = skip_ws(s, k);
            if k > k0 {
                let w0 = k;
                while k < s.len() && is_word(s[k]) {
                    k += 1;
                }
                if k > w0 {
                    let k1 = k;
                    k = skip_ws(s, k);
                    if k > k1 && at(s, k, "in") && boundary(s, k + 2) {
                        return true;
                    }
                }
            }
        }
        for w in ["for", "while"] {
            if at(s, i, w) {
                let k = skip_ws(s, i + w.len());
                if k < s.len() && s[k] == '(' {
                    return true;
                }
            }
        }
        false
    })
}
fn sh_narration(s: &[char]) -> bool {
    let mut k = skip_ws(s, 0);
    if k < s.len() && s[k] == '#' {
        k += 1;
    }
    k = skip_ws(s, k);
    for w in ["STEP", "NODE", "BRANCH", "GATE"] {
        if at_ci(s, k, w) {
            let k1 = k + w.len();
            let k2 = skip_ws(s, k1);
            if k2 > k1 && k2 < s.len() && (is_word(s[k2]) || s[k2] == '-') {
                return true;
            }
        }
    }
    false
}
fn sh_indexed(s: &[char]) -> bool {
    any_pos(s, |i| {
        if !(i < s.len() && is_word(s[i]) && at(s, i + 1, "[")) {
            return false;
        }
        let mut k = i + 2;
        let k0 = k;
        while k < s.len() && is_word(s[k]) {
            k += 1;
        }
        if k == k0 || !at(s, k, "]") {
            return false;
        }
        k = skip_ws(s, k + 1);
        k < s.len() && s[k] == '=' && !(k + 1 < s.len() && s[k + 1] == '=')
    })
}
fn sh_regex(s: &[char]) -> bool {
    any_pos(s, |i| {
        if !at(s, i, "/^") {
            return false;
        }
        let mut j = i + 2;
        while j < s.len() {
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
fn sh_assign(s: &[char]) -> bool {
    let last = match s.iter().rposition(|&c| !is_ws(c)) {
        Some(l) => l,
        None => return false,
    };
    if s[last] != ';' {
        return false;
    }
    for e in 0..s.len() {
        if s[e] != '=' {
            continue;
        }
        let mut p = e;
        while p > 0 && is_ws(s[p - 1]) {
            p -= 1;
        }
        let mut b = p;
        while b > 0 && is_word(s[b - 1]) {
            b -= 1;
        }
        if b == p || !s[b..p].iter().any(|&c| c.is_ascii_alphabetic() || c == '_') {
            continue;
        }
        let c = skip_ws(s, e + 1);
        if c >= s.len() || s[c] == '=' {
            continue;
        }
        if last > c && !s[c..last].iter().any(|&x| is_lt(x)) {
            return true;
        }
    }
    false
}
fn sh_group(s: &[char]) -> bool {
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
        let norm = normalize(raw);
        let first = norm.iter().find(|&&c| !is_ws(c));
        let first = match first {
            Some(c) => *c,
            None => continue,
        };
        lines += 1;
        if first == '#' {
            comments += 1;
        }
        let s = strip_quoted(&norm);
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded_word(&s, "typeof")),
            ("arrow fn", any_pos(&s, |i| at(&s, i, "=>"))),
            ("method call", sh_method(&s)),
            ("JS builtin", sh_builtin(&s)),
            ("if (", sh_if(&s)),
            ("return", bounded_word(&s, "return")),
            ("loop", sh_loop(&s)),
            ("STEP/NODE/BRANCH narration", sh_narration(&s)),
            ("indexed assignment", sh_indexed(&s)),
            ("dialect regex literal", sh_regex(&s)),
            (
                "JS value name (say none)",
                bounded_word(&s, "null") || bounded_word(&s, "undefined"),
            ),
            ("assignment statement", sh_assign(&s)),
            ("capture-group reference", sh_group(&s)),
        ];
        let st = norm.iter().position(|&c| !is_ws(c)).unwrap_or(0);
        let en = norm.iter().rposition(|&c| !is_ws(c)).map(|p| p + 1).unwrap_or(0);
        let t: String = norm[st..en].iter().take(96).collect();
        let mut any = false;
        for (what, m) in rows.iter() {
            if *m {
                any = true;
                let mut h = Map::new();
                h.insert("line".into(), Value::from((idx + 1) as f64));
                h.insert("what".into(), Value::from(*what));
                h.insert("text".into(), Value::from(t.clone()));
                hits.push(Value::Object(h));
            }
        }
        if any {
            hit_lines += 1;
        }
    }
    let density = if lines == 0 { 0.0 } else { hit_lines as f64 / lines as f64 };
    let mut m = Map::new();
    m.insert("hits".into(), Value::Array(hits));
    m.insert("hitLines".into(), Value::from(hit_lines as f64));
    m.insert("lines".into(), Value::from(lines as f64));
    m.insert("commentLines".into(), Value::from(comments as f64));
    m.insert("density".into(), Value::from(density));
    Value::Object(m)
}
