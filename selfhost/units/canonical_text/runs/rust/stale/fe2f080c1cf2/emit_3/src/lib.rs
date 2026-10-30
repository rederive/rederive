fn is_pad(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn push_line(out: &mut String, line: &str) {
    let l = line.trim_start_matches('\u{feff}');
    let l = l.trim_end_matches(is_pad);
    if l.is_empty() {
        return;
    }
    if l.starts_with(is_pad) {
        out.push_str("  ");
        out.push_str(l.trim_start_matches(is_pad));
    } else {
        out.push_str(l);
    }
    out.push('\n');
}

pub fn canonical_text(text: &str) -> String {
    let mut out = String::new();
    let mut start = 0usize;
    let mut iter = text.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c == '\r' {
            push_line(&mut out, &text[start..i]);
            if let Some(&(_, '\n')) = iter.peek() {
                iter.next();
                start = i + 2;
            } else {
                start = i + 1;
            }
        } else if c == '\n' {
            push_line(&mut out, &text[start..i]);
            start = i + 1;
        }
    }
    push_line(&mut out, &text[start..]);
    out
}
