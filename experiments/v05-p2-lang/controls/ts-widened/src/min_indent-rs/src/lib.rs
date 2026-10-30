fn is_break(c: char) -> bool {
    matches!(c, '\u{A}' | '\u{D}' | '\u{2028}' | '\u{2029}')
}

fn is_blank(c: char) -> bool {
    matches!(
        c,
        '\u{9}'
            | '\u{A}'
            | '\u{B}'
            | '\u{C}'
            | '\u{D}'
            | '\u{20}'
            | '\u{A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

/// Smallest indent among content lines, 0 if none.
pub fn min_indent(input: &str) -> u64 {
    let mut best: Option<u64> = None;
    for line in input.split(is_break) {
        let mut n: u64 = 0;
        let mut next: Option<char> = None;
        for c in line.chars() {
            if c == ' ' || c == '\t' {
                n += 1;
            } else {
                next = Some(c);
                break;
            }
        }
        if let Some(c) = next {
            if !is_blank(c) {
                best = Some(match best {
                    Some(b) if b <= n => b,
                    _ => n,
                });
            }
        }
    }
    best.unwrap_or(0)
}
