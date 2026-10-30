const INVIS: &[(u32, u32)] = &[
    (0x9, 0xD), (0x20, 0x20), (0x22, 0x22), (0x27, 0x27), (0xA0, 0xA0), (0xAD, 0xAD),
    (0x600, 0x605), (0x61C, 0x61C), (0x6DD, 0x6DD), (0x70F, 0x70F), (0x890, 0x891),
    (0x8E2, 0x8E2), (0x1680, 0x1680), (0x180E, 0x180E), (0x2000, 0x200F), (0x2028, 0x202F),
    (0x205F, 0x2064), (0x2066, 0x206F), (0x3000, 0x3000), (0xFEFF, 0xFEFF), (0xFFF9, 0xFFFB),
    (0x110BD, 0x110BD), (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3),
    (0x1D173, 0x1D17A), (0xE0001, 0xE0001), (0xE0020, 0xE007F),
];

const OPENERS: &str = " \t([{,=:;|<>!&-~";

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn visible(s: &[char]) -> bool {
    s.iter().any(|&c| {
        let u = c as u32;
        !INVIS.iter().any(|&(a, b)| u >= a && u <= b)
    })
}

fn spans(ch: &[char]) -> Vec<(usize, usize)> {
    let n = ch.len();
    let mut out = Vec::new();
    let mut prev_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if ch[i] == '"' {
            let opens = i == 0 || OPENERS.contains(ch[i - 1]) || prev_close == Some(i - 1);
            if opens {
                let mut j = i + 1;
                while j < n {
                    if ch[j] == '\\' {
                        j += 2;
                        continue;
                    }
                    if ch[j] == '"' {
                        break;
                    }
                    j += 1;
                }
                if j < n {
                    out.push((i, j));
                    prev_close = Some(j);
                    i = j + 1;
                    continue;
                } else {
                    break;
                }
            }
        }
        i += 1;
    }
    out
}

fn inside(sp_: &[(usize, usize)], p: usize) -> bool {
    sp_.iter().any(|&(o, c)| p > o && p <= c)
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

fn code_of(content: &[char]) -> Vec<char> {
    let n = content.len();
    let spn = spans(content);
    for i in 1..n {
        if content[i] == '#' && sp(content[i - 1]) && (i + 1 == n || sp(content[i + 1])) && !inside(&spn, i) {
            let mut e = i;
            while e > 0 && sp(content[e - 1]) {
                e -= 1;
            }
            return content[..e].to_vec();
        }
    }
    content.to_vec()
}

// returns (any attribute value visible, text before first attribute visible)
fn analyze(piece: &[char]) -> (bool, bool) {
    let n = piece.len();
    let spn = spans(piece);
    let words: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut attrs: Vec<(usize, usize)> = Vec::new();
    for i in 1..n {
        if !sp(piece[i - 1]) {
            continue;
        }
        for w in words.iter() {
            let wc: Vec<char> = w.chars().collect();
            let e = i + wc.len();
            if e <= n && piece[i..e] == wc[..] && (e == n || sp(piece[e])) && !inside(&spn, i) {
                attrs.push((i, e));
                break;
            }
        }
    }
    let pre_end = attrs.first().map(|a| a.0).unwrap_or(n);
    let pre_vis = visible(trim_sp(&piece[..pre_end]));
    let mut val_vis = false;
    for k in 0..attrs.len() {
        let end = if k + 1 < attrs.len() { attrs[k + 1].0 } else { n };
        if visible(trim_sp(&piece[attrs[k].1..end])) {
            val_vis = true;
        }
    }
    (val_vis, pre_vis)
}

fn nameform(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Pin {
    line: i64,
    text: String,
    earned: bool,
    cited: bool,
}

pub fn pin_lint(text: &str) -> (Vec<(i64, String, String)>, i64) {
    let chars: Vec<char> = text.chars().collect();
    let mut lines: Vec<Vec<char>> = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\r' {
            if i + 1 < chars.len() && chars[i + 1] == '\n' {
                i += 1;
            }
            lines.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            lines.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    lines.push(cur);

    let mut pins: Vec<Pin> = Vec::new();
    let mut count: i64 = 0;
    let mut open = false;
    for (idx, raw) in lines.iter().enumerate() {
        let mut lead = 0;
        while lead < raw.len() && (sp(raw[lead]) || raw[lead] == '\u{FEFF}') {
            lead += 1;
        }
        let mut line: Vec<char> = raw[..lead].iter().filter(|&&c| c != '\u{FEFF}').cloned().collect();
        line.extend_from_slice(&raw[lead..]);
        while let Some(&l) = line.last() {
            if sp(l) {
                line.pop();
            } else {
                break;
            }
        }
        if line.is_empty() {
            continue;
        }
        let ind = line.iter().take_while(|&&c| sp(c)).count();
        let content = &line[ind..];
        if content[0] == '#' {
            continue;
        }
        let code = code_of(content);
        let mut directive = false;
        let mut name_end = 0;
        let mut name: Vec<char> = Vec::new();
        if ind == 0 {
            name_end = code.iter().position(|&c| sp(c)).unwrap_or(code.len());
            let mut nm = code[..name_end].to_vec();
            if nm.last() == Some(&':') {
                nm.pop();
            }
            if nameform(&nm) && nm.iter().collect::<String>() != "CITED" {
                directive = true;
                name = nm;
            }
        }
        if directive {
            let nm: String = name.iter().collect();
            open = true;
            if nm == "PINNED" || nm == "EARNED" {
                count += 1;
                let earned = nm == "EARNED";
                let (v, p) = analyze(&code[name_end..]);
                let t: String = line.iter().take(96).collect();
                pins.push(Pin { line: idx as i64 + 1, text: t, earned, cited: v || (earned && p) });
                // non-pin directives still end the pin above
            } else {
                pins.push(Pin { line: 0, text: String::new(), earned: false, cited: true });
            }
        } else if open {
            if let Some(p) = pins.last_mut() {
                if !p.cited {
                    let mut piece = vec![' '];
                    piece.extend_from_slice(&code);
                    let (v, pre) = analyze(&piece);
                    if v || (p.earned && pre) {
                        p.cited = true;
                    }
                }
            }
        }
    }
    let hits = pins
        .into_iter()
        .filter(|p| p.line != 0 && !p.cited)
        .map(|p| (p.line, "pin without a citation".to_string(), p.text))
        .collect();
    (hits, count)
}
