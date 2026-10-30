const OPENERS: &str = " \t([{,=:;|<>!&-~";

const INVISIBLE: &[(u32, u32)] = &[
    (0x9, 0xD), (0x20, 0x20), (0x22, 0x22), (0x27, 0x27), (0xA0, 0xA0), (0xAD, 0xAD),
    (0x600, 0x605), (0x61C, 0x61C), (0x6DD, 0x6DD), (0x70F, 0x70F), (0x890, 0x891),
    (0x8E2, 0x8E2), (0x1680, 0x1680), (0x180E, 0x180E), (0x2000, 0x200F), (0x2028, 0x202F),
    (0x205F, 0x2064), (0x2066, 0x206F), (0x3000, 0x3000), (0xFEFF, 0xFEFF),
    (0xFFF9, 0xFFFB), (0x110BD, 0x110BD), (0x110CD, 0x110CD), (0x13430, 0x1343F),
    (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A), (0xE0001, 0xE0001), (0xE0020, 0xE007F),
];

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn visible(cs: &[char]) -> bool {
    cs.iter().any(|&c| {
        let u = c as u32;
        !INVISIBLE.iter().any(|&(a, b)| u >= a && u <= b)
    })
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut out = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out
}

fn normalize(l: &[char]) -> Vec<char> {
    let mut i = 0;
    let mut out = Vec::new();
    while i < l.len() && (is_sp(l[i]) || l[i] == '\u{FEFF}') {
        if l[i] != '\u{FEFF}' {
            out.push(l[i]);
        }
        i += 1;
    }
    out.extend_from_slice(&l[i..]);
    while let Some(&c) = out.last() {
        if is_sp(c) {
            out.pop();
        } else {
            break;
        }
    }
    out
}

fn spans(cs: &[char]) -> Vec<(usize, usize)> {
    let n = cs.len();
    let mut res = Vec::new();
    let mut prev_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if cs[i] == '"' && (i == 0 || OPENERS.contains(cs[i - 1]) || prev_close == Some(i - 1)) {
            let mut k = i + 1;
            let mut close = None;
            while k < n {
                if cs[k] == '\\' {
                    k += 2;
                    continue;
                }
                if cs[k] == '"' {
                    close = Some(k);
                    break;
                }
                k += 1;
            }
            match close {
                Some(j) => {
                    res.push((i, j));
                    prev_close = Some(j);
                    i = j + 1;
                }
                None => break,
            }
        } else {
            i += 1;
        }
    }
    res
}

fn inside(sp: &[(usize, usize)], p: usize) -> bool {
    sp.iter().any(|&(o, c)| p > o && p <= c)
}

fn code_of(content: &[char]) -> Vec<char> {
    let n = content.len();
    let sp = spans(content);
    for i in 1..n {
        if content[i] == '#'
            && is_sp(content[i - 1])
            && (i + 1 == n || is_sp(content[i + 1]))
            && !inside(&sp, i)
        {
            let mut e = i;
            while e > 0 && is_sp(content[e - 1]) {
                e -= 1;
            }
            return content[..e].to_vec();
        }
    }
    content.to_vec()
}

fn attrs(piece: &[char]) -> (Vec<(usize, usize)>, Vec<Vec<char>>) {
    let n = piece.len();
    let sp = spans(piece);
    let words: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut starts: Vec<(usize, usize)> = Vec::new();
    for i in 1..n {
        if !is_sp(piece[i - 1]) {
            continue;
        }
        for w in words.iter() {
            let wc: Vec<char> = w.chars().collect();
            let e = i + wc.len();
            if e <= n
                && piece[i..e] == wc[..]
                && (e == n || is_sp(piece[e]))
                && !inside(&sp, i)
            {
                starts.push((i, wc.len()));
                break;
            }
        }
    }
    let mut vals = Vec::new();
    for k in 0..starts.len() {
        let from = starts[k].0 + starts[k].1;
        let mut end = if k + 1 < starts.len() { starts[k + 1].0 } else { n };
        if k + 1 < starts.len() {
            while end > from && is_sp(piece[end - 1]) {
                end -= 1;
            }
        }
        vals.push(piece[from..end].to_vec());
    }
    (starts, vals)
}

fn name_form(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Cur {
    line: i64,
    pin: bool,
    earned: bool,
    cited: bool,
    text: String,
}

fn finish(cur: Option<Cur>, hits: &mut Vec<(i64, String, String)>) {
    if let Some(c) = cur {
        if c.pin && !c.cited {
            hits.push((c.line, "pin without a citation".to_string(), c.text));
        }
    }
}

fn piece_cited(piece: &[char], earned: bool) -> bool {
    let (starts, vals) = attrs(piece);
    if vals.iter().any(|v| visible(v)) {
        return true;
    }
    if earned {
        let end = starts.first().map(|s| s.0).unwrap_or(piece.len());
        return visible(&piece[..end]);
    }
    false
}

pub fn pin_lint(text: &str) -> (Vec<(i64, String, String)>, i64) {
    let mut hits = Vec::new();
    let mut pins: i64 = 0;
    let mut cur: Option<Cur> = None;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let line = normalize(raw);
        if line.is_empty() {
            continue;
        }
        let indent = line.iter().take_while(|&&c| is_sp(c)).count();
        let content = &line[indent..];
        if content[0] == '#' {
            continue;
        }
        let code = code_of(content);
        let mut directive: Option<(usize, String)> = None;
        if indent == 0 {
            let nlen = code.iter().take_while(|&&c| !is_sp(c)).count();
            let name = &code[..nlen];
            let base = if name.last() == Some(&':') { &name[..nlen - 1] } else { name };
            if name_form(base) {
                let b: String = base.iter().collect();
                if b != "CITED" {
                    directive = Some((nlen, b));
                }
            }
        }
        match directive {
            Some((nlen, b)) => {
                finish(cur.take(), &mut hits);
                let pin = b == "PINNED" || b == "EARNED";
                let earned = b == "EARNED";
                let mut cited = false;
                if pin {
                    pins += 1;
                    cited = piece_cited(&code[nlen..], earned);
                }
                cur = Some(Cur {
                    line: (idx + 1) as i64,
                    pin,
                    earned,
                    cited,
                    text: line.iter().take(96).collect(),
                });
            }
            None => {
                if let Some(c) = cur.as_mut() {
                    if c.pin && !c.cited {
                        let mut piece = vec![' '];
                        piece.extend_from_slice(&code);
                        if piece_cited(&piece, c.earned) {
                            c.cited = true;
                        }
                    }
                }
            }
        }
    }
    finish(cur.take(), &mut hits);
    (hits, pins)
}
