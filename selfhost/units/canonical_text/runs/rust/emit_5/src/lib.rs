fn is_pad(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn process(line: &str, out: &mut String) {
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
        if c == '\r' || c == '\n' {
            process(&text[start..i], &mut out);
            if c == '\r' {
                if let Some(&(_, '\n')) = iter.peek() {
                    iter.next();
                }
            }
            start = match iter.peek() {
                Some(&(k, _)) => k,
                None => text.len(),
            };
        }
    }
    if start < text.len() {
        process(&text[start..], &mut out);
    }
    out
}
