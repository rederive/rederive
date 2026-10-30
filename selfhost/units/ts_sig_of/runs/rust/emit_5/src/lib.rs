fn is_blank(b: u8) -> bool {
    b == b' ' || b == b'\t'
}

fn is_ws(c: char) -> bool {
    matches!(c,
        '\u{9}'..='\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}'
        | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_brk_at(s: &[u8], i: usize) -> bool {
    match s.get(i) {
        Some(b'\n') | Some(b'\r') => true,
        Some(0xE2) => s.get(i + 1) == Some(&0x80) && matches!(s.get(i + 2), Some(0xA8) | Some(0xA9)),
        _ => false,
    }
}

fn is_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
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
        let mut close = None;
        loop {
            if j >= n {
                break;
            }
            let c = s[j];
            if c == b'\\' {
                if j + 1 >= n || is_brk_at(s, j + 1) {
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
            Some(j) => {
                for k in (i + 1)..j {
                    m[k] = b' ';
                }
                i = j + 1;
            }
            None => i += 1,
        }
    }
    m
}

fn find_close(m: &[u8], c: usize, open: u8, close: u8, arrow: bool) -> Option<usize> {
    let mut d: i64 = 0;
    for k in c..m.len() {
        let b = m[k];
        if b == open {
            d += 1;
        } else if b == close {
            if arrow && k > 0 && m[k - 1] == b'=' {
                continue;
            }
            d -= 1;
            if d == 0 {
                return Some(k);
            }
        }
    }
    None
}

pub fn ts_sig_of(sig: &str) -> Result<(Option<String>, String), String> {
    let s_str = sig.trim_matches(|c| c == ' ' || c == '\t');
    let s = s_str.as_bytes();
    let n = s.len();
    let bad_head = || Err("SIG is not an exported function declaration".to_string());

    let lit = |p: usize, w: &[u8]| -> bool { s.len() >= p + w.len() && &s[p..p + w.len()] == w };
    let skip_blank = |mut p: usize| -> usize {
        while p < n && is_blank(s[p]) {
            p += 1;
        }
        p
    };

    let mut p = 0;
    if !lit(p, b"export") {
        return bad_head();
    }
    p += 6;
    let q = skip_blank(p);
    if q == p {
        return bad_head();
    }
    p = q;
    let mut default = false;
    if lit(p, b"default") {
        let q = skip_blank(p + 7);
        if q > p + 7 {
            default = true;
            p = q;
        }
    }
    if !lit(p, b"function") {
        return bad_head();
    }
    p += 8;
    let q = skip_blank(p);
    if q == p {
        return bad_head();
    }
    p = q;
    if p >= n || !(s[p].is_ascii_alphabetic() || s[p] == b'_' || s[p] == b'$') {
        return bad_head();
    }
    let ns = p;
    while p < n && is_word(s[p]) {
        p += 1;
    }
    let name = &s_str[ns..p];
    let mut c = skip_blank(p);

    let m = mask(s);

    // R4
    let mut t = m.clone();
    let mut depth: usize = 0;
    for k in 0..t.len() {
        match t[k] {
            b'{' => depth += 1,
            b'}' => depth = depth.saturating_sub(1),
            b';' if depth > 0 => t[k] = b' ',
            _ => {}
        }
    }
    for k in 0..t.len() {
        let b = t[k];
        if b == b';' || b == b'`' || b == b'\r' || b == b'\n' || is_brk_at(&t, k) {
            return Err("SIG is more than one declaration".to_string());
        }
        if b == b'/' && matches!(t.get(k + 1), Some(b'/') | Some(b'*')) {
            return Err("SIG is more than one declaration".to_string());
        }
        if b == b'*' && t.get(k + 1) == Some(&b'/') {
            return Err("SIG is more than one declaration".to_string());
        }
        if b == b'=' && t.get(k + 1) != Some(&b'>') {
            return Err("SIG is more than one declaration".to_string());
        }
    }

    // R5
    for w in ["any", "never", "typeof", "import", "infer"] {
        let wb = w.as_bytes();
        let mut k = 0;
        while k + wb.len() <= m.len() {
            if &m[k..k + wb.len()] == wb {
                let pre_ok = k == 0 || !(is_word(m[k - 1]) || m[k - 1] == b'.');
                let post_ok = k + wb.len() >= m.len() || !is_word(m[k + wb.len()]);
                if pre_ok && post_ok {
                    return Err("SIG uses any/never/typeof/import/infer".to_string());
                }
            }
            k += 1;
        }
    }

    // R6
    let mut generics = "";
    if m.get(c) == Some(&b'<') {
        match find_close(&m, c, b'<', b'>', true) {
            Some(e) => {
                generics = &s_str[c..=e];
                c = e + 1;
            }
            None => return Err("unbalanced <>".to_string()),
        }
    }
    // R7
    c = skip_blank(c);
    // R8
    if m.get(c) != Some(&b'(') {
        return Err("SIG has no parameter list".to_string());
    }
    let e = match find_close(&m, c, b'(', b')', false) {
        Some(e) => e,
        None => return Err("unbalanced ()".to_string()),
    };
    let params = &s_str[c..=e];
    // R9
    let rest = s_str[e + 1..].trim_start_matches(|ch| ch == ' ' || ch == '\t');
    let after = match rest.strip_prefix(':') {
        Some(a) => a,
        None => return Err("SIG declares no return type".to_string()),
    };
    if !after.chars().any(|ch| !is_ws(ch)) {
        return Err("SIG declares no return type".to_string());
    }
    let ret = after.trim_start_matches(|ch| ch == ' ' || ch == '\t');

    let name_out = if default { None } else { Some(name.to_string()) };
    Ok((name_out, format!("{}{} => {}", generics, params, ret)))
}
