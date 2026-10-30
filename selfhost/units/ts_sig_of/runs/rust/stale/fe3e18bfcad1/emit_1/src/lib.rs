fn is_blank(b: u8) -> bool {
    b == b' ' || b == b'\t'
}

fn is_ws(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}'
        | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn is_break_at(b: &[u8], i: usize) -> bool {
    if i >= b.len() {
        return false;
    }
    b[i] == b'\n'
        || b[i] == b'\r'
        || (b[i] == 0xE2 && i + 2 < b.len() + 0 && b[i + 1] == 0x80 && (b[i + 2] == 0xA8 || b[i + 2] == 0xA9))
}

fn mask(b: &[u8]) -> Vec<u8> {
    let n = b.len();
    let mut m = b.to_vec();
    let mut i = 0;
    while i < n {
        if b[i] == b'"' || b[i] == b'\'' {
            let q = b[i];
            let mut j = i + 1;
            let mut close = None;
            while j < n {
                let c = b[j];
                if c == b'\\' {
                    if j + 1 >= n || is_break_at(b, j + 1) {
                        break;
                    }
                    j += 2;
                } else if c == q {
                    close = Some(j);
                    break;
                } else {
                    j += 1;
                }
            }
            if let Some(e) = close {
                for k in (i + 1)..e {
                    m[k] = b' ';
                }
                i = e + 1;
                continue;
            }
        }
        i += 1;
    }
    m
}

fn find_close(m: &[u8], c: usize, open: u8, close: u8, arrow: bool) -> Option<usize> {
    let mut depth = 0i64;
    for k in c..m.len() {
        if m[k] == open {
            depth += 1;
        } else if m[k] == close {
            if arrow && k > 0 && m[k - 1] == b'=' {
                continue;
            }
            depth -= 1;
            if depth == 0 {
                return Some(k);
            }
        }
    }
    None
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s = sig.trim_matches(|c| c == ' ' || c == '\t');
    let b = s.as_bytes();
    let n = b.len();
    let err = |m: &str| Err(format!("{}: {}", m, sig));
    let not_fn = "SIG is not an exported function declaration";

    let lit = |pos: usize, w: &str| -> Option<usize> {
        if b[pos..].starts_with(w.as_bytes()) {
            Some(pos + w.len())
        } else {
            None
        }
    };
    let blanks = |mut pos: usize| -> usize {
        while pos < n && is_blank(b[pos]) {
            pos += 1;
        }
        pos
    };

    let mut p = match lit(0, "export") {
        Some(p) => p,
        None => return err(not_fn),
    };
    let q = blanks(p);
    if q == p {
        return err(not_fn);
    }
    p = q;
    let mut is_default = false;
    if let Some(d) = lit(p, "default") {
        let q = blanks(d);
        if q > d {
            if let Some(f) = lit(q, "function") {
                is_default = true;
                p = f;
            }
        }
    }
    if !is_default {
        p = match lit(p, "function") {
            Some(f) => f,
            None => return err(not_fn),
        };
    }
    let q = blanks(p);
    if q == p {
        return err(not_fn);
    }
    p = q;
    let ns = p;
    if p < n && (b[p].is_ascii_alphabetic() || b[p] == b'_' || b[p] == b'$') {
        p += 1;
        while p < n && is_word(b[p]) {
            p += 1;
        }
    } else {
        return err(not_fn);
    }
    let name = &s[ns..p];
    let mut c = blanks(p);

    let m = mask(b);
    let mn = m.len();

    for i in 0..mn {
        let ch = m[i];
        let bad = match ch {
            b';' | b'`' | b'\r' | b'\n' => true,
            0xE2 => is_break_at(&m, i),
            b'/' => i + 1 < mn && (m[i + 1] == b'/' || m[i + 1] == b'*'),
            b'*' => i + 1 < mn && m[i + 1] == b'/',
            b'=' => !(i + 1 < mn && m[i + 1] == b'>'),
            _ => false,
        };
        if bad {
            return err("SIG is more than one declaration");
        }
    }

    for w in ["any", "never", "typeof", "import", "infer"] {
        let wb = w.as_bytes();
        let mut i = 0;
        while i + wb.len() <= mn {
            if &m[i..i + wb.len()] == wb {
                let pre_ok = i == 0 || !(is_word(m[i - 1]) || m[i - 1] == b'.');
                let post_ok = i + wb.len() >= mn || !is_word(m[i + wb.len()]);
                if pre_ok && post_ok {
                    return err("SIG uses any or never / typeof / import / infer");
                }
            }
            i += 1;
        }
    }

    let mut generics = "";
    if c < mn && m[c] == b'<' {
        match find_close(&m, c, b'<', b'>', true) {
            Some(e) => {
                generics = &s[c..=e];
                c = e + 1;
            }
            None => return err("unbalanced <>"),
        }
    }
    c = blanks(c);
    if c >= mn || m[c] != b'(' {
        return err("SIG has no parameter list");
    }
    let e = match find_close(&m, c, b'(', b')', false) {
        Some(e) => e,
        None => return err("unbalanced ()"),
    };
    let params = &s[c..=e];
    let rest = s[e + 1..].trim_start_matches(|ch| ch == ' ' || ch == '\t');
    if !rest.starts_with(':') {
        return err("SIG declares no return type");
    }
    let after = &rest[1..];
    if !after.chars().any(|ch| !is_ws(ch)) {
        return err("SIG declares no return type");
    }
    let ret = after.trim_start_matches(|ch| ch == ' ' || ch == '\t');
    let ft = format!("{}{} => {}", generics, params, ret);
    Ok((if is_default { None } else { Some(name.to_string()) }, ft))
}
