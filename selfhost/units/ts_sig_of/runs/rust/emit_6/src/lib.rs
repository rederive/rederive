fn is_blank(b: u8) -> bool {
    b == b' ' || b == b'\t'
}

fn is_ws(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}'
        | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_break_at(b: &[u8], i: usize) -> bool {
    if i >= b.len() {
        return false;
    }
    if b[i] == b'\n' || b[i] == b'\r' {
        return true;
    }
    b[i] == 0xE2 && i + 2 < b.len() + 0 && b[i + 1] == 0x80 && (b[i + 2] == 0xA8 || b[i + 2] == 0xA9)
}

fn has_u2028(b: &[u8]) -> bool {
    b.windows(3).any(|w| w[0] == 0xE2 && w[1] == 0x80 && (w[2] == 0xA8 || w[2] == 0xA9))
}

fn mask(s: &[u8]) -> Vec<u8> {
    let n = s.len();
    let mut m = s.to_vec();
    let mut i = 0;
    while i < n {
        let q = s[i];
        if q != b'"' && q != b'\'' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        let mut closed = false;
        while j < n {
            let c = s[j];
            if c == b'\\' {
                if j + 1 >= n || is_break_at(s, j + 1) {
                    break;
                }
                j += 2;
            } else if c == q {
                closed = true;
                break;
            } else {
                j += 1;
            }
        }
        if closed {
            for k in (i + 1)..j {
                m[k] = b' ';
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    m
}

fn is_id(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
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
        if i > 0 && (is_id(m[i - 1]) || m[i - 1] == b'.') {
            continue;
        }
        if i + l < n && is_id(m[i + l]) {
            continue;
        }
        return true;
    }
    false
}

fn skip_blanks(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && is_blank(b[i]) {
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
    let j = skip_blanks(b, i);
    if j > i {
        Some(j)
    } else {
        None
    }
}

fn head(b: &[u8]) -> Option<(bool, usize)> {
    let i = lit(b, 0, b"export")?;
    let i = blanks1(b, i)?;
    let mut def = false;
    let mut at = i;
    if let Some(k) = lit(b, i, b"default") {
        if let Some(k2) = blanks1(b, k) {
            def = true;
            at = k2;
        }
    }
    let k = lit(b, at, b"function")?;
    let k = blanks1(b, k)?;
    let mut e = k;
    if e < b.len() && (b[e].is_ascii_alphabetic() || b[e] == b'_' || b[e] == b'$') {
        e += 1;
        while e < b.len() && is_id(b[e]) {
            e += 1;
        }
    } else {
        return None;
    }
    let _ = def;
    Some((def, e))
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s = sig.trim_matches(|c| c == ' ' || c == '\t');
    let b = s.as_bytes();
    let (def, name_end) = head(b).ok_or_else(|| "SIG is not an exported function declaration".to_string())?;
    let name_start = {
        let mut k = name_end;
        while k > 0 && is_id(b[k - 1]) {
            k -= 1;
        }
        k
    };
    let c0 = skip_blanks(b, name_end);
    let m = mask(b);

    let mut t = m.clone();
    let mut depth: usize = 0;
    for x in t.iter_mut() {
        match *x {
            b'{' => depth += 1,
            b'}' => depth = depth.saturating_sub(1),
            b';' if depth > 0 => *x = b' ',
            _ => {}
        }
    }
    let mut multi = has_u2028(&t);
    for (i, &x) in t.iter().enumerate() {
        match x {
            b';' | b'`' | b'\r' | b'\n' => multi = true,
            b'/' if i + 1 < t.len() && (t[i + 1] == b'/' || t[i + 1] == b'*') => multi = true,
            b'*' if i + 1 < t.len() && t[i + 1] == b'/' => multi = true,
            b'=' if !(i + 1 < t.len() && t[i + 1] == b'>') => multi = true,
            _ => {}
        }
    }
    if multi {
        return Err("SIG is more than one declaration".to_string());
    }
    if has_word(&m, b"any") || has_word(&m, b"never") {
        return Err("SIG uses any or never".to_string());
    }
    if has_word(&m, b"typeof") || has_word(&m, b"import") || has_word(&m, b"infer") {
        return Err("SIG uses typeof / import / infer".to_string());
    }

    let mut c = c0;
    let mut generics = "";
    if c < m.len() && m[c] == b'<' {
        let mut cnt = 0i64;
        let mut close = None;
        for k in c..m.len() {
            if m[k] == b'<' {
                cnt += 1;
            } else if m[k] == b'>' {
                if k > 0 && m[k - 1] == b'=' {
                    continue;
                }
                cnt -= 1;
                if cnt == 0 {
                    close = Some(k);
                    break;
                }
            }
        }
        let k = close.ok_or_else(|| "unbalanced <>".to_string())?;
        generics = &s[c..=k];
        c = k + 1;
    }
    c = skip_blanks(b, c);
    if c >= m.len() || m[c] != b'(' {
        return Err("SIG has no parameter list".to_string());
    }
    let mut cnt = 0i64;
    let mut close = None;
    for k in c..m.len() {
        if m[k] == b'(' {
            cnt += 1;
        } else if m[k] == b')' {
            cnt -= 1;
            if cnt == 0 {
                close = Some(k);
                break;
            }
        }
    }
    let pe = close.ok_or_else(|| "unbalanced ()".to_string())?;
    let params = &s[c..=pe];
    let rest = s[pe + 1..].trim_start_matches(|ch| ch == ' ' || ch == '\t');
    if !rest.starts_with(':') {
        return Err("SIG declares no return type".to_string());
    }
    let after = &rest[1..];
    if !after.chars().any(|ch| !is_ws(ch)) {
        return Err("SIG declares no return type".to_string());
    }
    let ret = after.trim_start_matches(|ch| ch == ' ' || ch == '\t');
    let name = if def { None } else { Some(s[name_start..name_end].to_string()) };
    Ok((name, format!("{}{} => {}", generics, params, ret)))
}
