fn is_blank(b: u8) -> bool {
    b == b' ' || b == b'\t'
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn skip_blanks(s: &[u8], mut i: usize) -> usize {
    while i < s.len() && is_blank(s[i]) {
        i += 1;
    }
    i
}

fn is_ws(c: char) -> bool {
    matches!(c as u32,
        0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

fn is_break_at(s: &[u8], j: usize) -> bool {
    if j >= s.len() {
        return false;
    }
    s[j] == b'\n' || s[j] == b'\r' || (s[j] == 0xE2 && j + 2 < s.len() && s[j + 1] == 0x80 && (s[j + 2] == 0xA8 || s[j + 2] == 0xA9))
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
        loop {
            if j >= n {
                break;
            }
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

fn find_close(m: &[u8], c: usize, open: u8, close: u8, arrow: bool) -> Option<usize> {
    let mut depth = 0i64;
    for i in c..m.len() {
        let b = m[i];
        if b == open {
            depth += 1;
        } else if b == close {
            if arrow && i > 0 && m[i - 1] == b'=' {
                continue;
            }
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s = sig.trim_matches(|c| c == ' ' || c == '\t');
    let sb = s.as_bytes();
    let n = sb.len();
    let nohead = || Err("SIG is not an exported function declaration".to_string());

    let mut c = 0;
    if !s.starts_with("export") {
        return nohead();
    }
    c += 6;
    let c2 = skip_blanks(sb, c);
    if c2 == c {
        return nohead();
    }
    c = c2;
    let mut is_default = false;
    if s[c..].starts_with("default") && c + 7 < n && is_blank(sb[c + 7]) {
        is_default = true;
        c = skip_blanks(sb, c + 7);
    }
    if !s[c..].starts_with("function") {
        return nohead();
    }
    c += 8;
    let c2 = skip_blanks(sb, c);
    if c2 == c {
        return nohead();
    }
    c = c2;
    let ns = c;
    if c < n && (sb[c].is_ascii_alphabetic() || sb[c] == b'_' || sb[c] == b'$') {
        c += 1;
        while c < n && is_word(sb[c]) {
            c += 1;
        }
    } else {
        return nohead();
    }
    let name = &s[ns..c];
    c = skip_blanks(sb, c);

    let m = mask(sb);

    for i in 0..n {
        let b = m[i];
        if b == b';' || b == b'`' || b == b'\r' || b == b'\n' || is_break_at(&m, i) {
            return Err("SIG is more than one declaration".into());
        }
        if i + 1 < n {
            let p = (b, m[i + 1]);
            if p == (b'/', b'/') || p == (b'/', b'*') || p == (b'*', b'/') {
                return Err("SIG is more than one declaration".into());
            }
        }
        if b == b'=' && !(i + 1 < n && m[i + 1] == b'>') {
            return Err("SIG is more than one declaration".into());
        }
    }

    for w in ["any", "never", "typeof", "import", "infer"] {
        let wb = w.as_bytes();
        let mut i = 0;
        while i + wb.len() <= n {
            if &m[i..i + wb.len()] == wb {
                let before_ok = i == 0 || !(is_word(m[i - 1]) || m[i - 1] == b'.');
                let e = i + wb.len();
                let after_ok = e >= n || !is_word(m[e]);
                if before_ok && after_ok {
                    return Err("SIG uses any/never/typeof/import/infer".into());
                }
            }
            i += 1;
        }
    }

    let mut generics = "";
    if c < n && m[c] == b'<' {
        match find_close(&m, c, b'<', b'>', true) {
            Some(e) => {
                generics = &s[c..=e];
                c = e + 1;
            }
            None => return Err("unbalanced <>".into()),
        }
    }
    c = skip_blanks(sb, c);
    if c >= n || m[c] != b'(' {
        return Err("SIG has no parameter list".into());
    }
    let pe = match find_close(&m, c, b'(', b')', false) {
        Some(e) => e,
        None => return Err("unbalanced ()".into()),
    };
    let params = &s[c..=pe];
    let rest = s[pe + 1..].trim_start_matches(|c| c == ' ' || c == '\t');
    if !rest.starts_with(':') {
        return Err("SIG declares no return type".into());
    }
    let after = &rest[1..];
    if !after.chars().any(|ch| !is_ws(ch)) {
        return Err("SIG declares no return type".into());
    }
    let ret = after.trim_start_matches(|c| c == ' ' || c == '\t');
    let ft = format!("{}{} => {}", generics, params, ret);
    Ok((if is_default { None } else { Some(name.to_string()) }, ft))
}
