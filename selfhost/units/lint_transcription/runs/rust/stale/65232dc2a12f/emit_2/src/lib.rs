use serde_json::{json, Value};

fn ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn wd(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn lt(c: char) -> bool {
    c == '\u{2028}' || c == '\u{2029}'
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
fn bnd(s: &[char], i: usize) -> bool {
    let a = i > 0 && wd(s[i - 1]);
    let b = i < s.len() && wd(s[i]);
    a != b
}
fn skip_ws(s: &[char], mut i: usize) -> usize {
    while i < s.len() && ws(s[i]) {
        i += 1;
    }
    i
}
fn word_at(s: &[char], w: &str) -> bool {
    let n = w.chars().count();
    (0..s.len()).any(|i| at(s, i, w) && bnd(s, i) && bnd(s, i + n))
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
            } else if c == '\\' {
                if j + 1 < l.len() && !lt(l[j + 1]) && l[j + 1] != '\n' {
                    j += 2;
                } else {
                    break;
                }
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

fn assign(s: &[char]) -> bool {
    let mut last = None;
    for k in (0..s.len()).rev() {
        if !ws(s[k]) {
            last = Some(k);
            break;
        }
    }
    let last = match last {
        Some(k) if s[k] == ';' => k,
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
        let mut q = p;
        while q > 0 && wd(s[q - 1]) {
            q -= 1;
        }
        if q == p || !s[q..p].iter().any(|c| c.is_ascii_alphabetic() || *c == '_') {
            continue;
        }
        let c = skip_ws(s, e + 1);
        if c >= s.len() || s[c] == '=' {
            continue;
        }
        if last > c && !s[c + 1..last].iter().any(|x| lt(*x)) {
            return true;
        }
    }
    false
}

fn shapes(s: &[char]) -> Vec<&'static str> {
    let n = s.len();
    let mut r = Vec::new();
    if word_at(s, "typeof") {
        r.push("typeof");
    }
    if (0..n).any(|i| at(s, i, "=>")) {
        r.push("arrow fn");
    }
    let ms = ["match", "reduce", "slice", "test", "exec", "split", "map", "filter"];
    if (0..n).any(|i| s[i] == '.' && ms.iter().any(|m| at(s, i + 1, m) && at(s, i + 1 + m.len(), "("))) {
        r.push("method call");
    }
    let bs = ["parseInt", "parseFloat", "Number", "String", "Math"];
    if (0..n).any(|i| {
        bnd(s, i)
            && bs.iter().any(|b| {
                at(s, i, b) && {
                    let k = skip_ws(s, i + b.len());
                    k < n && (s[k] == '.' || s[k] == '(')
                }
            })
    }) {
        r.push("JS builtin");
    }
    if (0..n).any(|i| bnd(s, i) && at(s, i, "if") && {
        let k = skip_ws(s, i + 2);
        k < n && s[k] == '('
    }) {
        r.push("if (");
    }
    if word_at(s, "return") {
        r.push("return");
    }
    let lp = (0..n).any(|i| {
        if !bnd(s, i) {
            return false;
        }
        if at(s, i, "for") {
            let a = skip_ws(s, i + 3);
            if a > i + 3 {
                let mut b = a;
                while b < n && wd(s[b]) {
                    b += 1;
                }
                if b > a {
                    let c = skip_ws(s, b);
                    if c > b && at(s, c, "in") && bnd(s, c + 2) {
                        return true;
                    }
                }
            }
        }
        for w in ["for", "while"] {
            if at(s, i, w) {
                let k = skip_ws(s, i + w.len());
                if k < n && s[k] == '(' {
                    return true;
                }
            }
        }
        false
    });
    if lp {
        r.push("loop");
    }
    {
        let mut k = skip_ws(s, 0);
        if k < n && s[k] == '#' {
            k += 1;
        }
        k = skip_ws(s, k);
        let mut ok = false;
        for w in ["STEP", "NODE", "BRANCH", "GATE"] {
            let m = w.len();
            if k + m <= n && s[k..k + m].iter().zip(w.chars()).all(|(a, b)| a.eq_ignore_ascii_case(&b)) {
                let a = skip_ws(s, k + m);
                if a > k + m && a < n && (wd(s[a]) || s[a] == '-') {
                    ok = true;
                }
            }
        }
        if ok {
            r.push("STEP/NODE/BRANCH narration");
        }
    }
    if (0..n).any(|i| {
        wd(s[i]) && i + 1 < n && s[i + 1] == '[' && {
            let mut k = i + 2;
            while k < n && wd(s[k]) {
                k += 1;
            }
            k > i + 2 && k < n && s[k] == ']' && {
                let e = skip_ws(s, k + 1);
                e < n && s[e] == '=' && e + 1 < n && s[e + 1] != '='
            }
        }
    }) {
        r.push("indexed assignment");
    }
    if (0..n).any(|i| {
        at(s, i, "/^")
            && (i + 2..n).any(|j| at(s, j, "$/") && !s[i + 2..j].iter().any(|c| lt(*c)))
    }) {
        r.push("dialect regex literal");
    }
    if word_at(s, "null") || word_at(s, "undefined") {
        r.push("JS value name (say none)");
    }
    if assign(s) {
        r.push("assignment statement");
    }
    if (0..n).any(|i| bnd(s, i) && at(s, i, "group") && i + 5 < n && s[i + 5].is_ascii_digit() && bnd(s, i + 6))
        || (0..n).any(|i| bnd(s, i) && at(s, i, "group") && i + 5 < n && s[i + 5].is_ascii_digit() && i + 6 == n)
    {
        r.push("capture-group reference");
    }
    r
}

pub fn lint_transcription(text: &str) -> Value {
    let mut hits = Vec::new();
    let mut hit_lines = 0usize;
    let mut lines = 0usize;
    let mut comments = 0usize;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let l = normalize(raw);
        let first = l.iter().find(|c| !ws(**c));
        if first.is_none() {
            continue;
        }
        lines += 1;
        if *first.unwrap() == '#' {
            comments += 1;
        }
        let s = strip(&l);
        let sh = shapes(&s);
        if sh.is_empty() {
            continue;
        }
        hit_lines += 1;
        let a = l.iter().position(|c| !ws(*c)).unwrap();
        let b = l.iter().rposition(|c| !ws(*c)).unwrap();
        let t: String = l[a..=b].iter().take(96).collect();
        for w in sh {
            hits.push(json!({"line": idx + 1, "what": w, "text": t}));
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
