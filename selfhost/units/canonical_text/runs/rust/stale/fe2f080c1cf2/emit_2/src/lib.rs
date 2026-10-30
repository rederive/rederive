fn is_pad(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn keep(line: &str, out: &mut String) {
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
    let mut it = text.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if c == '\r' {
            keep(&text[start..i], &mut out);
            if let Some(&(_, '\n')) = it.peek() {
                it.next();
                start = i + 2;
            } else {
                start = i + 1;
            }
        } else if c == '\n' {
            keep(&text[start..i], &mut out);
            start = i + 1;
        }
    }
    keep(&text[start..], &mut out);
    out
}
