const WIDTH: usize = 80;

fn invisible(u: u32) -> bool {
    matches!(u,
        0x0A..=0x0D | 0x7F..=0xA0 | 0xAD | 0x34F | 0x600..=0x605 | 0x61C | 0x6DD | 0x70F
        | 0x890 | 0x891 | 0x8E2 | 0x115F | 0x1160 | 0x1680 | 0x180B..=0x180E
        | 0x2000..=0x200F | 0x2028..=0x202F | 0x205F..=0x2064 | 0x2066..=0x206F
        | 0x2800 | 0x3000 | 0x3164 | 0xFE00..=0xFE0F | 0xFEFF | 0xFFA0 | 0xFFF9..=0xFFFB
        | 0x110BD | 0x110CD | 0x13430..=0x1343F | 0x1BCA0..=0x1BCA3 | 0x1D173..=0x1D17A
        | 0xE0001 | 0xE0020..=0xE007F | 0xE0100..=0xE01EF)
}

fn escape(c: char, out: &mut String) {
    let u = c as u32;
    match c {
        '"' => out.push_str("\\\""),
        '\\' => out.push_str("\\\\"),
        '\u{8}' => out.push_str("\\b"),
        '\t' => out.push_str("\\t"),
        '\u{c}' => out.push_str("\\f"),
        '\r' => out.push_str("\\r"),
        _ if u <= 0x1F => out.push_str(&format!("\\u{:04x}", u)),
        _ if invisible(u) => {
            if u <= 0xFFFF {
                out.push_str(&format!("\\u{:04x}", u));
            } else {
                out.push_str(&format!("\\u{{{:x}}}", u));
            }
        }
        _ => out.push(c),
    }
}

fn window(s: &[char], c: usize) -> String {
    let l = s.len();
    let mut out = String::from("\"");
    if c > 0 {
        out.push('\u{2026}');
    }
    let end = std::cmp::min(c + WIDTH, l);
    if c < end {
        for &ch in &s[c..end] {
            escape(ch, &mut out);
        }
    }
    if c + WIDTH < l {
        out.push('\u{2026}');
    }
    out.push('"');
    out
}

pub fn diff_hint(existing: &str, profile: &str) -> String {
    let e: Vec<Vec<char>> = existing.split('\n').map(|l| l.chars().collect()).collect();
    let p: Vec<Vec<char>> = profile.split('\n').map(|l| l.chars().collect()).collect();
    let n = std::cmp::max(e.len(), p.len());
    for i in 0..n {
        match (e.get(i), p.get(i)) {
            (None, Some(pl)) => {
                return format!(
                    "line {}: existing has no line {}, profile has {}",
                    i + 1,
                    i + 1,
                    window(pl, 0)
                )
            }
            (Some(el), None) => {
                return format!(
                    "line {}: profile has no line {}, existing has {}",
                    i + 1,
                    i + 1,
                    window(el, 0)
                )
            }
            (Some(el), Some(pl)) => {
                if el != pl {
                    let c = el.iter().zip(pl.iter()).take_while(|(a, b)| a == b).count();
                    return format!(
                        "line {}, col {}: existing {} vs profile {}",
                        i + 1,
                        c + 1,
                        window(el, c),
                        window(pl, c)
                    );
                }
            }
            (None, None) => {}
        }
    }
    "binary difference (the texts decode to the same UTF-8)".to_string()
}
