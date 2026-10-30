fn is_pad(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn clean_line(line: &str) -> Option<String> {
    let mut j = line.len();
    for (i, c) in line.char_indices() {
        if !(is_pad(c) || c == '\u{feff}') {
            j = i;
            break;
        }
    }
    let mut s: String = line[..j].chars().filter(|&c| c != '\u{feff}').collect();
    s.push_str(&line[j..]);
    let t = s.trim_end_matches(is_pad);
    if t.is_empty() {
        return None;
    }
    if t.starts_with(is_pad) {
        let rest = t.trim_start_matches(is_pad);
        let mut out = String::from("  ");
        out.push_str(rest);
        Some(out)
    } else {
        Some(t.to_string())
    }
}

pub fn canonical_text(text: &str) -> String {
    let mut lines: Vec<&str> = Vec::new();
    let mut start = 0;
    let mut it = text.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if c == '\r' {
            lines.push(&text[start..i]);
            if let Some(&(_, '\n')) = it.peek() {
                it.next();
                start = i + 2;
            } else {
                start = i + 1;
            }
        } else if c == '\n' {
            lines.push(&text[start..i]);
            start = i + 1;
        }
    }
    lines.push(&text[start..]);
    let mut out = String::new();
    for l in lines {
        if let Some(k) = clean_line(l) {
            out.push_str(&k);
            out.push('\n');
        }
    }
    out
}
