fn blank(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_break_at(b: &[u8], i: usize) -> bool {
    if i >= b.len() {
        return false;
    }
    b[i] == b'\n'
        || b[i] == b'\r'
        || (b[i] == 0xE2 && i + 2 < b.len() + 0 && b[i + 1] == 0x80 && (b[i + 2] == 0xA8 || b[i + 2] == 0xA9))
}

fn mask(s: &[u8]) -> Vec<u8> {
    let mut m = s.to_vec();
    let n = s.len();
    let mut i = 0;
    while i < n {
        let q = s[i];
        if q != b'"' && q != b'\'' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut close = None;
        while j < n {
            let c = s[j];
            if c == b'\\' {
                if j + 1 >= n || is_break_at(s, j + 1) {
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
        match close {
            Some(e) => {
                for k in (i + 1)..e {
                    m[k] = b' ';
                }
                i = e + 1;
            }
            None => i += 1,
        }
    }
    m
}

fn word_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'$'
}

fn has_word(m: &[u8], w: &[u8]) -> bool {
    let n = m.len();
    let l = w.len();
    if n < l {
        return false;
    }
    for i in 0..=(n - l) {
        if &m[i..i + l] != w {
            continue;
        }
        if i > 0 && (word_char(m[i - 1]) || m[i - 1] == b'.') {
            continue;
        }
        if i + l < n && word_char(m[i + l]) {
            continue;
        }
        return true;
    }
    false
}

fn multi(m: &[u8]) -> bool {
    let n = m.len();
    for i in 0..n {
        let c = m[i];
        let nx = if i + 1 < n { Some(m[i + 1]) } else { None };
        if c == b';' || c == b'`' || c == b'\r' || c == b'\n' {
            return true;
        }
        if c == b'/' && (nx == Some(b'/') || nx == Some(b'*')) {
            return true;
        }
        if c == b'*' && nx == Some(b'/') {
            return true;
        }
        if c == b'=' && nx != Some(b'>') {
            return true;
        }
        if is_break_at(m, i) && c == 0xE2 {
            return true;
        }
    }
    false
}

fn close_of(m: &[u8], start: usize, open: u8, close: u8, arrow: bool) -> Option<usize> {
    let mut d: i64 = 0;
    for j in start..m.len() {
        let c = m[j];
        if c == open {
            d += 1;
        } else if c == close {
            if arrow && j > 0 && m[j - 1] == b'=' {
                continue;
            }
            d -= 1;
            if d == 0 {
                return Some(j);
            }
        }
    }
    None
}

fn skip_blank(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t') {
        i += 1;
    }
    i
}

fn lit(b: &[u8], i: usize, w: &[u8]) -> Option<usize> {
    if b.len() >= i + w.len() && &b[i..i + w.len()] == w {
        Some(i + w.len())
    } else {
        None
    }
}

fn blanks1(b: &[u8], i: usize) -> Option<usize> {
    let j = skip_blank(b, i);
    if j > i {
        Some(j)
    } else {
        None
    }
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s = sig.trim_matches(blank);
    let b = s.as_bytes();
    let err = |m: &str| Err(format!("{}: {}", m, sig));
    let head = (|| {
        let i = lit(b, 0, b"export")?;
        let mut i = blanks1(b, i)?;
        let mut def = false;
        if let Some(k) = lit(b, i, b"default") {
            if let Some(k2) = blanks1(b, k) {
                def = true;
                i = k2;
            }
        }
        let i = lit(b, i, b"function")?;
        let i = blanks1(b, i)?;
        if i >= b.len() || !(b[i].is_ascii_alphabetic() || b[i] == b'_' || b[i] == b'$') {
            return None;
        }
        let mut e = i + 1;
        while e < b.len() && word_char(b[e]) {
            e += 1;
        }
        let c = skip_blank(b, e);
        Some((def, i, e, c))
    })();
    let (def, ns, ne, mut c) = match head {
        Some(h) => h,
        None => return err("SIG is not an exported function declaration"),
    };
    let m = mask(b);
    if multi(&m) {
        return err("SIG is more than one declaration");
    }
    for w in [&b"any"[..], b"never"] {
        if has_word(&m, w) {
            return err("SIG uses any or never");
        }
    }
    for w in [&b"typeof"[..], b"import", b"infer"] {
        if has_word(&m, w) {
            return err("SIG uses typeof / import / infer");
        }
    }
    let mut generics = "";
    if c < m.len() && m[c] == b'<' {
        match close_of(&m, c, b'<', b'>', true) {
            Some(e) => {
                generics = &s[c..=e];
                c = e + 1;
            }
            None => return err("unbalanced <>"),
        }
    }
    c = skip_blank(b, c);
    if c >= m.len() || m[c] != b'(' {
        return err("SIG has no parameter list");
    }
    let pe = match close_of(&m, c, b'(', b')', false) {
        Some(e) => e,
        None => return err("unbalanced ()"),
    };
    let params = &s[c..=pe];
    let rest = s[pe + 1..].trim_start_matches(blank);
    if !rest.starts_with(':') {
        return err("SIG declares no return type");
    }
    let after = &rest[1..];
    if !after.chars().any(|ch| !is_ws(ch)) {
        return err("SIG declares no return type");
    }
    let ret = after.trim_start_matches(blank);
    let name = if def { None } else { Some(s[ns..ne].to_string()) };
    Ok((name, format!("{}{} => {}", generics, params, ret)))
}
