use serde_json::{json, Value};

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}
fn wd(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn bnd(s: &[char], i: usize) -> bool {
    let a = i > 0 && wd(s[i - 1]);
    let b = i < s.len() && wd(s[i]);
    a != b
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
fn skip_ws(s: &[char], mut i: usize) -> usize {
    while i < s.len() && ws(s[i]) {
        i += 1;
    }
    i
}
fn skip_wd(s: &[char], mut i: usize) -> usize {
    while i < s.len() && wd(s[i]) {
        i += 1;
    }
    i
}

fn split_lines(t: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = t.chars().collect();
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
                if j + 1 >= n || lt(l[j + 1]) {
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

fn bounded_word(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    (0..s.len()).any(|i| at(s, i, w) && bnd(s, i) && bnd(s, i + n))
}

fn is_method(s: &[char]) -> bool {
    let names = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|i| {
        s[i] == '.'
            && names.iter().any(|nm| at(s, i + 1, nm) && at(s, i + 1 + nm.len(), "("))
    })
}

fn is_builtin(s: &[char]) -> bool {
    let names = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|i| {
        bnd(s, i)
            && names.iter().any(|nm| {
                if !at(s, i, nm) {
                    return false;
                }
                let k = skip_ws(s, i + nm.len());
                k < s.len() && (s[k] == '.' || s[k] == '(')
            })
    })
}

fn is_if(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !(bnd(s, i) && at(s, i, "if")) {
            return false;
        }
        let k = skip_ws(s, i + 2);
        k < s.len() && s[k] == '('
    })
}

fn is_loop(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !bnd(s, i) {
            return false;
        }
        if at(s, i, "for") {
            let a = skip_ws(s, i + 3);
            if a > i + 3 {
                let b = skip_wd(s, a);
                if b > a {
                    let c = skip_ws(s, b);
                    if c > b && at(s, c, "in") && bnd(s, c + 2) {
                        return true;
                    }
                }
            }
        }
        for kw in ["for", "while"] {
            if at(s, i, kw) {
                let k = skip_ws(s, i + kw.len());
                if k < s.len() && s[k] == '(' {
                    return true;
                }
            }
        }
        false
    })
}

fn is_narration(s: &[char]) -> bool {
    let mut i = skip_ws(s, 0);
    if i < s.len() && s[i] == '#' {
        i += 1;
    }
    i = skip_ws(s, i);
    for kw in ["STEP", "NODE", "BRANCH", "GATE"] {
        let n = kw.len();
        if i + n <= s.len() {
            let w: String = s[i..i + n].iter().collect();
            if w.eq_ignore_ascii_case(kw) {
                let k = skip_ws(s, i + n);
                if k > i + n && k < s.len() && (wd(s[k]) || s[k] == '-') {
                    return true;
                }
            }
        }
    }
    false
}

fn is_indexed(s: &[char]) -> bool {
    let n = s.len();
    (0..n).any(|i| {
        if !wd(s[i]) || i + 1 >= n || s[i + 1] != '[' {
            return false;
        }
        let a = i + 2;
        let b = skip_wd(s, a);
        if b == a || b >= n || s[b] != ']' {
            return false;
        }
        let c = skip_ws(s, b + 1);
        c < n && s[c] == '=' && c + 1 < n && s[c + 1] != '='
    })
}

fn is_regex(s: &[char]) -> bool {
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
            if lt(s[j]) {
                return false;
            }
            j += 1;
        }
        false
    })
}

fn is_assign(s: &[char]) -> bool {
    let n = s.len();
    let end = match (0..n).rev().find(|&i| !ws(s[i])) {
        Some(e) => e,
        None => return false,
    };
    if s[end] != ';' {
        return false;
    }
    (0..n).any(|e| {
        if s[e] != '=' {
            return false;
        }
        let mut p = e;
        while p > 0 && ws(s[p - 1]) {
            p -= 1;
        }
        let mut q = p;
        while q > 0 && wd(s[q - 1]) {
            q -= 1;
        }
        if !s[q..p].iter().any(|&c| c.is_ascii_alphabetic() || c == '_') {
            return false;
        }
        let k = skip_ws(s, e + 1);
        if k >= n || s[k] == '=' {
            return false;
        }
        end > k && !s[k..end].iter().any(|&c| lt(c))
    })
}

fn is_group(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        bnd(s, i) && at(s, i, "group") && i + 5 < s.len() + 0 && s[i + 5].is_ascii_digit() && bnd(s, i + 6)
    })
}

pub fn lint_transcription(text: &str) -> serde_json::Value {
    let mut hits: Vec<Value> = Vec::new();
    let mut lines = 0usize;
    let mut comments = 0usize;
    let mut hit_lines = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let l = normalize(raw);
        let first = l.iter().position(|&c| !ws(c));
        let first = match first {
            Some(f) => f,
            None => continue,
        };
        lines += 1;
        if l[first] == '#' {
            comments += 1;
        }
        let s = strip_quoted(&l);
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded_word(&s, "typeof")),
            ("arrow fn", at_any(&s, "=>")),
            ("method call", is_method(&s)),
            ("JS builtin", is_builtin(&s)),
            ("if (", is_if(&s)),
            ("return", bounded_word(&s, "return")),
            ("loop", is_loop(&s)),
            ("STEP/NODE/BRANCH narration", is_narration(&s)),
            ("indexed assignment", is_indexed(&s)),
            ("dialect regex literal", is_regex(&s)),
            (
                "JS value name (say none)",
                bounded_word(&s, "null") || bounded_word(&s, "undefined"),
            ),
            ("assignment statement", is_assign(&s)),
            ("capture-group reference", is_group(&s)),
        ];
        let mut e = l.len();
        while e > first && ws(l[e - 1]) {
            e -= 1;
        }
        let txt: String = l[first..e].iter().take(96).collect();
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
