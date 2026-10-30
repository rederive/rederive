const RANGES: &[(u32, u32)] = &[
    (0x9, 0xD), (0x20, 0x20), (0x22, 0x22), (0x27, 0x27), (0xA0, 0xA0), (0xAD, 0xAD),
    (0x600, 0x605), (0x61C, 0x61C), (0x6DD, 0x6DD), (0x70F, 0x70F), (0x890, 0x891),
    (0x8E2, 0x8E2), (0x1680, 0x1680), (0x180E, 0x180E), (0x2000, 0x200F), (0x2028, 0x202F),
    (0x205F, 0x2064), (0x2066, 0x206F), (0x3000, 0x3000), (0xFEFF, 0xFEFF), (0xFFF9, 0xFFFB),
    (0x110BD, 0x110BD), (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3),
    (0x1D173, 0x1D17A), (0xE0001, 0xE0001), (0xE0020, 0xE007F),
];

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn visible(s: &[char]) -> bool {
    s.iter().any(|&c| {
        let u = c as u32;
        !RANGES.iter().any(|&(a, b)| u >= a && u <= b)
    })
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && sp(s[a]) {
        a += 1;
    }
    while b > a && sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn is_opener(c: char) -> bool {
    " \t([{,=:;|<>!&-~".contains(c)
}

fn spans(s: &[char]) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = Vec::new();
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < s.len() {
        if s[i] == '"' {
            let opens = i == 0
                || is_opener(s[i - 1])
                || last_close.map_or(false, |c| c + 1 == i);
            if opens {
                let mut j = i + 1;
                let mut found = None;
                while j < s.len() {
                    if s[j] == '\\' {
                        j += 2;
                        continue;
                    }
                    if s[j] == '"' {
                        found = Some(j);
                        break;
                    }
                    j += 1;
                }
                match found {
                    Some(c) => {
                        out.push((i, c));
                        last_close = Some(c);
                        i = c + 1;
                        continue;
                    }
                    None => break,
                }
            }
        }
        i += 1;
    }
    out
}

fn inside(sp_: &[(usize, usize)], p: usize) -> bool {
    sp_.iter().any(|&(a, b)| p > a && p <= b)
}

fn back_run(s: &[char], mut p: usize) -> usize {
    while p > 0 && sp(s[p - 1]) {
        p -= 1;
    }
    p
}

// (start, word_end) of each attribute
fn attrs(piece: &[char]) -> Vec<(usize, usize)> {
    let sps = spans(piece);
    let mut out = Vec::new();
    for i in 1..piece.len() {
        if !sp(piece[i - 1]) {
            continue;
        }
        for w in ["CITED", "EARNED", "ANCHOR"] {
            let wc: Vec<char> = w.chars().collect();
            let e = i + wc.len();
            if e <= piece.len()
                && piece[i..e] == wc[..]
                && (e == piece.len() || sp(piece[e]))
                && !inside(&sps, i)
            {
                out.push((i, e));
            }
        }
    }
    out
}

fn values_visible(piece: &[char], at: &[(usize, usize)]) -> bool {
    for k in 0..at.len() {
        let end = if k + 1 < at.len() {
            back_run(piece, at[k + 1].0).max(at[k].1)
        } else {
            piece.len()
        };
        if visible(trim_sp(&piece[at[k].1..end])) {
            return true;
        }
    }
    false
}

fn lead_part<'a>(piece: &'a [char], at: &[(usize, usize)]) -> &'a [char] {
    match at.first() {
        Some(&(s, _)) => &piece[..back_run(piece, s)],
        None => piece,
    }
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    lines.push(cur);
    lines
}

fn normalize(l: &[char]) -> Vec<char> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < l.len() && (sp(l[i]) || l[i] == '\u{FEFF}') {
        if l[i] != '\u{FEFF}' {
            out.push(l[i]);
        }
        i += 1;
    }
    out.extend_from_slice(&l[i..]);
    while let Some(&c) = out.last() {
        if sp(c) {
            out.pop();
        } else {
            break;
        }
    }
    out
}

fn name_form(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Pin {
    line: usize,
    text: String,
    cited: bool,
    earned: bool,
}

pub fn pin_lint(text: &str) -> (Vec<(i64, String, String)>, i64) {
    let mut pins: Vec<Pin> = Vec::new();
    let mut cur: Option<usize> = None;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let line = normalize(raw);
        if line.is_empty() {
            continue;
        }
        let ind = line.iter().take_while(|&&c| sp(c)).count();
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        let csp = spans(content);
        let mut code: &[char] = content;
        for i in 1..content.len() {
            if content[i] == '#'
                && sp(content[i - 1])
                && (i + 1 == content.len() || sp(content[i + 1]))
                && !inside(&csp, i)
            {
                code = &content[..back_run(content, i)];
                break;
            }
        }
        let mut is_dir = false;
        let mut nlen = 0;
        if ind == 0 {
            nlen = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let name = &code[..nlen];
            let base = if name.last() == Some(&':') { &name[..name.len() - 1] } else { name };
            let b: String = base.iter().collect();
            if name_form(base) && b != "CITED" {
                is_dir = true;
            }
        }
        if is_dir {
            let rest = &code[nlen..];
            let at = attrs(rest);
            let mut name: String = code[..nlen].iter().collect();
            if name.ends_with(':') {
                name.pop();
            }
            if name == "PINNED" || name == "EARNED" {
                let earned = name == "EARNED";
                let mut cited = values_visible(rest, &at);
                if earned && visible(trim_sp(lead_part(rest, &at))) {
                    cited = true;
                }
                pins.push(Pin {
                    line: idx + 1,
                    text: line.iter().take(96).collect(),
                    cited,
                    earned,
                });
                cur = Some(pins.len() - 1);
            } else {
                cur = None;
            }
        } else if let Some(p) = cur {
            let mut piece = vec![' '];
            piece.extend_from_slice(code);
            let at = attrs(&piece);
            let mut c = values_visible(&piece, &at);
            if pins[p].earned && visible(lead_part(&piece, &at)) {
                c = true;
            }
            if c {
                pins[p].cited = true;
            }
        }
    }
    let n = pins.len() as i64;
    let hits = pins
        .into_iter()
        .filter(|p| !p.cited)
        .map(|p| (p.line as i64, "pin without a citation".to_string(), p.text))
        .collect();
    (hits, n)
}
