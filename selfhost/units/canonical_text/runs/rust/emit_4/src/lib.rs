fn is_pad(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn process_line(line: &str, out: &mut String) {
    let j = line
        .char_indices()
        .find(|&(_, c)| !(is_pad(c) || c == '\u{feff}'))
        .map(|(i, _)| i)
        .unwrap_or(line.len());
    let mut s = String::with_capacity(line.len());
    for c in line[..j].chars() {
        if c != '\u{feff}' {
            s.push(c);
        }
    }
    s.push_str(&line[j..]);
    let t = s.trim_end_matches(is_pad);
    if t.is_empty() {
        return;
    }
    if t.starts_with(is_pad) {
        out.push_str("  ");
        out.push_str(t.trim_start_matches(is_pad));
    } else {
        out.push_str(t);
    }
    out.push('\n');
}

pub fn canonical_text(text: &str) -> String {
    let mut out = String::new();
    let mut start = 0usize;
    let mut iter = text.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c == '\r' {
            process_line(&text[start..i], &mut out);
            start = i + 1;
            if let Some(&(k, '\n')) = iter.peek() {
                iter.next();
                start = k + 1;
            }
        } else if c == '\n' {
            process_line(&text[start..i], &mut out);
            start = i + 1;
        }
    }
    process_line(&text[start..], &mut out);
    out
}
