use serde_json::{json, Value};

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
}

fn opener(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
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
    let mut k = 0;
    while k < l.len() && matches!(l[k], ' ' | '\t' | '\u{FEFF}') {
        k += 1;
    }
    let mut v: Vec<char> = l[..k].iter().copied().filter(|&c| c != '\u{FEFF}').collect();
    v.extend_from_slice(&l[k..]);
    while let Some(&c) = v.last() {
        if c == ' ' || c == '\t' {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn strip(l: &[char]) -> Vec<char> {
    let n = l.len();
    let mut out = Vec::new();
    let mut after = usize::MAX;
    let mut i = 0;
    while i < n {
        let c = l[i];
        if c == '"' && (i == 0 || opener(l[i - 1]) || i == after) {
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
            if !closed {
                out.extend_from_slice(&l[i..]);
                return out;
            }
            out.push('"');
            out.push('"');
            after = j + 1;
            i = j + 1;
        } else {
            out.push(c);
            i += 1;
        }
    }
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

fn bnd(s: &[char], i: usize) -> bool {
    let a = i > 0 && word(s[i - 1]);
    let b = i < s.len() && word(s[i]);
    a != b
}

fn bounded(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    (0..s.len()).any(|i| starts(s, i, w) && bnd(s, i) && bnd(s, i + n))
}

fn skip_ws(s: &[char], mut j: usize) -> usize {
    while j < s.len() && ws(s[j]) {
        j += 1;
    }
    j
}

fn skip_word(s: &[char], mut j: usize) -> usize {
    while j < s.len() && word(s[j]) {
        j += 1;
    }
    j
}

fn method_call(s: &[char]) -> bool {
    let ms = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    (0..s.len()).any(|i| {
        s[i] == '.' && ms.iter().any(|m| starts(s, i + 1, m) && s.get(i + 1 + m.len()) == Some(&'('))
    })
}

fn js_builtin(s: &[char]) -> bool {
    let ms = ["parseInt", "parseFloat", "Number", "String", "Math"];
    (0..s.len()).any(|i| {
        bnd(s, i)
            && ms.iter().any(|m| {
                if !starts(s, i, m) {
                    return false;
                }
                let j = skip_ws(s, i + m.len());
                j < s.len() && (s[j] == '.' || s[j] == '(')
            })
    })
}

fn if_paren(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        bnd(s, i) && starts(s, i, "if") && {
            let j = skip_ws(s, i + 2);
            j < s.len() && s[j] == '('
        }
    })
}

fn loop_shape(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !bnd(s, i) {
            return false;
        }
        if starts(s, i, "for") {
            let j = skip_ws(s, i + 3);
            if j > i + 3 {
                let k = skip_word(s, j);
                if k > j {
                    let m = skip_ws(s, k);
                    if m > k && starts(s, m, "in") && bnd(s, m + 2) {
                        return true;
                    }
                }
            }
        }
        for kw in ["for", "while"] {
            if starts(s, i, kw) {
                let j = skip_ws(s, i + kw.len());
                if j < s.len() && s[j] == '(' {
                    return true;
                }
            }
        }
        false
    })
}

fn narration(s: &[char]) -> bool {
    let mut j = skip_ws(s, 0);
    if j < s.len() && s[j] == '#' {
        j += 1;
    }
    j = skip_ws(s, j);
    for kw in ["STEP", "NODE", "BRANCH", "GATE"] {
        let n = kw.len();
        if j + n <= s.len() && s[j..j + n].iter().zip(kw.chars()).all(|(a, b)| a.eq_ignore_ascii_case(&b)) {
            let k = skip_ws(s, j + n);
            if k > j + n && k < s.len() && (word(s[k]) || s[k] == '-') {
                return true;
            }
        }
    }
    false
}

fn indexed_assign(s: &[char]) -> bool {
    let ops = ["", "**", "<<", ">>", ">>>", "&&", "||", "??", "-", "+", "*", "/", "%", "&", "|", "^"];
    (0..s.len()).any(|i| {
        if !(word(s[i]) && s.get(i + 1) == Some(&'[')) {
            return false;
        }
        let k = skip_word(s, i + 2);
        if k == i + 2 || s.get(k) != Some(&']') {
            return false;
        }
        let p = skip_ws(s, k + 1);
        ops.iter().any(|op| {
            let q = p + op.len();
            starts(s, p, op) && s.get(q) == Some(&'=') && !matches!(s.get(q + 1), Some('=') | Some('>'))
        })
    })
}

fn regex_lit(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        if !starts(s, i, "/^") {
            return false;
        }
        let mut k = i + 2;
        while k < s.len() {
            if starts(s, k, "$/") {
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

fn assign(s: &[char]) -> bool {
    let last = match s.iter().rposition(|&c| !ws(c)) {
        Some(p) if s[p] == ';' => p,
        _ => return false,
    };
    (0..s.len()).any(|e| {
        if s[e] != '=' {
            return false;
        }
        let mut b = e;
        while b > 0 && ws(s[b - 1]) {
            b -= 1;
        }
        let mut a = b;
        while a > 0 && word(s[a - 1]) {
            a -= 1;
        }
        if a == b || !s[a..b].iter().any(|c| c.is_ascii_alphabetic() || *c == '_') {
            return false;
        }
        let c = skip_ws(s, e + 1);
        if c >= s.len() || s[c] == '=' {
            return false;
        }
        last > c && !s[c + 1..last].iter().any(|&x| lt(x))
    })
}

fn group_ref(s: &[char]) -> bool {
    (0..s.len()).any(|i| {
        bnd(s, i) && starts(s, i, "group") && s.get(i + 5).map_or(false, |c| c.is_ascii_digit()) && bnd(s, i + 6)
    })
}

pub fn lint_transcription(text: &str) -> Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let norm = normalize(raw);
        if norm.iter().all(|&c| ws(c)) {
            continue;
        }
        lines += 1;
        let first = norm.iter().find(|&&c| !ws(c)).copied();
        if first == Some('#') {
            comments += 1;
        }
        let s = strip(&norm);
        let mut t: &[char] = &norm;
        while let Some((&c, r)) = t.split_first() {
            if ws(c) { t = r } else { break }
        }
        while let Some((&c, r)) = t.split_last() {
            if ws(c) { t = r } else { break }
        }
        let txt: String = t.iter().take(96).collect();
        let rows: [(&str, bool); 13] = [
            ("typeof", bounded(&s, "typeof")),
            ("arrow fn", (0..s.len()).any(|i| starts(&s, i, "=>"))),
            ("method call", method_call(&s)),
            ("JS builtin", js_builtin(&s)),
            ("if (", if_paren(&s)),
            ("return", bounded(&s, "return")),
            ("loop", loop_shape(&s)),
            ("STEP/NODE/BRANCH narration", narration(&s)),
            ("indexed assignment", indexed_assign(&s)),
            ("dialect regex literal", regex_lit(&s)),
            ("JS value name (say none)", bounded(&s, "null") || bounded(&s, "undefined")),
            ("assignment statement", assign(&s)),
            ("capture-group reference", group_ref(&s)),
        ];
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
    json!({
        "hits": hits,
        "hitLines": hit_lines,
        "lines": lines,
        "commentLines": comments,
        "density": density
    })
}
