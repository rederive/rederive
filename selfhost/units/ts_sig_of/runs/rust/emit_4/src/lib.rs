fn is_blank(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn is_break_at(s: &[u8], i: usize) -> bool {
    if i >= s.len() {
        return false;
    }
    match s[i] {
        b'\n' | b'\r' => true,
        0xE2 => i + 2 < s.len() && s[i + 1] == 0x80 && (s[i + 2] == 0xA8 || s[i + 2] == 0xA9),
        _ => false,
    }
}

fn skip_blank(s: &[u8], mut i: usize) -> usize {
    while i < s.len() && (s[i] == b' ' || s[i] == b'\t') {
        i += 1;
    }
    i
}

fn lit(s: &[u8], i: usize, w: &str) -> bool {
    s[i..].starts_with(w.as_bytes())
}

fn mask(s: &[u8]) -> Vec<u8> {
    let mut m = s.to_vec();
    let mut i = 0;
    while i < s.len() {
        let q = s[i];
        if q != b'"' && q != b'\'' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut close = None;
        while j < s.len() {
            let b = s[j];
            if b == b'\\' {
                if j + 1 >= s.len() || is_break_at(s, j + 1) {
                    break;
                }
                j += 2;
            } else if b == q {
                close = Some(j);
                break;
            } else {
                j += 1;
            }
        }
        match close {
            Some(c) => {
                for k in (i + 1)..c {
                    m[k] = b' ';
                }
                i = c + 1;
            }
            None => i += 1,
        }
    }
    m
}

fn find_close(m: &[u8], c: usize, open: u8, close: u8, arrow: bool) -> Option<usize> {
    let mut n: i64 = 0;
    for k in c..m.len() {
        let b = m[k];
        if b == open {
            n += 1;
        } else if b == close {
            if arrow && k > 0 && m[k - 1] == b'=' {
                continue;
            }
            n -= 1;
            if n == 0 {
                return Some(k);
            }
        }
    }
    None
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s = sig.trim_matches(is_blank);
    let sb = s.as_bytes();
    let err = |m: &str| Err(format!("{}: {}", m, sig));

    // HEAD
    let mut i = 0;
    if !lit(sb, 0, "export") {
        return err("SIG is not an exported function declaration");
    }
    i += 6;
    let j = skip_blank(sb, i);
    if j == i {
        return err("SIG is not an exported function declaration");
    }
    i = j;
    let mut is_default = false;
    if lit(sb, i, "default") {
        let k = skip_blank(sb, i + 7);
        if k > i + 7 {
            is_default = true;
            i = k;
        }
    }
    if !lit(sb, i, "function") {
        return err("SIG is not an exported function declaration");
    }
    i += 8;
    let j = skip_blank(sb, i);
    if j == i {
        return err("SIG is not an exported function declaration");
    }
    i = j;
    let ns = i;
    if i < sb.len() && (sb[i].is_ascii_alphabetic() || sb[i] == b'_' || sb[i] == b'$') {
        i += 1;
        while i < sb.len() && is_word(sb[i]) {
            i += 1;
        }
    } else {
        return err("SIG is not an exported function declaration");
    }
    let name = &s[ns..i];
    let mut c = skip_blank(sb, i);

    let m = mask(sb);

    // R4
    let mut t = m.clone();
    let mut depth: usize = 0;
    for b in t.iter_mut() {
        match *b {
            b'{' => depth += 1,
            b'}' => depth = depth.saturating_sub(1),
            b';' if depth > 0 => *b = b' ',
            _ => {}
        }
    }
    for k in 0..t.len() {
        let b = t[k];
        let nx = t.get(k + 1).copied();
        let bad = match b {
            b';' | b'`' | b'\r' | b'\n' => true,
            0xE2 => is_break_at(&t, k),
            b'/' => nx == Some(b'/') || nx == Some(b'*'),
            b'*' => nx == Some(b'/'),
            b'=' => nx != Some(b'>'),
            _ => false,
        };
        if bad {
            return err("SIG is more than one declaration");
        }
    }

    // R5
    for w in ["any", "never", "typeof", "import", "infer"] {
        let wb = w.as_bytes();
        let mut k = 0;
        while k + wb.len() <= m.len() {
            if &m[k..k + wb.len()] == wb {
                let before_ok = k == 0 || !(is_word(m[k - 1]) || m[k - 1] == b'.');
                let e = k + wb.len();
                let after_ok = e >= m.len() || !is_word(m[e]);
                if before_ok && after_ok {
                    return err("SIG uses any/never/typeof/import/infer");
                }
            }
            k += 1;
        }
    }

    // R6
    let mut generics = "";
    if c < m.len() && m[c] == b'<' {
        match find_close(&m, c, b'<', b'>', true) {
            Some(e) => {
                generics = &s[c..=e];
                c = e + 1;
            }
            None => return err("unbalanced <>"),
        }
    }
    c = skip_blank(sb, c);

    // R8
    if c >= m.len() || m[c] != b'(' {
        return err("SIG has no parameter list");
    }
    let e = match find_close(&m, c, b'(', b')', false) {
        Some(e) => e,
        None => return err("unbalanced ()"),
    };
    let params = &s[c..=e];

    // R9
    let rest = s[e + 1..].trim_start_matches(is_blank);
    if !rest.starts_with(':') {
        return err("SIG declares no return type");
    }
    let after = &rest[1..];
    if !after.chars().any(|ch| !is_ws(ch)) {
        return err("SIG declares no return type");
    }
    let ret = after.trim_start_matches(is_blank);

    let name_out = if is_default { None } else { Some(name.to_string()) };
    Ok((name_out, format!("{} => {}", format!("{}{}", generics, params), ret)))
}
