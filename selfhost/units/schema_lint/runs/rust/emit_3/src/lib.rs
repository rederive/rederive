const WHAT: &str = "carried data declared under DEPENDS-ON \u{2014} use CARRIED (\u{a7}18)";

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        if c == '\r' {
            if i + 1 < cs.len() && cs[i + 1] == '\n' {
                i += 1;
            }
            out.push(std::mem::take(&mut cur));
        } else if c == '\n' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
        i += 1;
    }
    out.push(cur);
    out
}

fn trim_line(l: &[char]) -> Vec<char> {
    let mut k = 0;
    while k < l.len() && (sp(l[k]) || l[k] == '\u{feff}') {
        k += 1;
    }
    let mut v: Vec<char> = l[..k].iter().copied().filter(|&c| c != '\u{feff}').collect();
    v.extend_from_slice(&l[k..]);
    while let Some(&c) = v.last() {
        if sp(c) {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn is_opener(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~'
    )
}

fn inside_spans(s: &[char]) -> Vec<bool> {
    let n = s.len();
    let mut inside = vec![false; n];
    let mut i = 0;
    let mut prev_close: Option<usize> = None;
    while i < n {
        if s[i] == '"' {
            let opens = i == 0 || is_opener(s[i - 1]) || prev_close.map_or(false, |p| p + 1 == i);
            if opens {
                let mut j = i + 1;
                let mut close = None;
                while j < n {
                    if s[j] == '\\' {
                        j += 2;
                        continue;
                    }
                    if s[j] == '"' {
                        close = Some(j);
                        break;
                    }
                    j += 1;
                }
                match close {
                    Some(j) => {
                        for p in (i + 1)..j {
                            inside[p] = true;
                        }
                        prev_close = Some(j);
                        i = j + 1;
                        continue;
                    }
                    None => break,
                }
            }
        }
        i += 1;
    }
    inside
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

fn st(s: &[char]) -> String {
    s.iter().collect()
}

fn attrs(code: &[char]) -> (String, Vec<String>) {
    let mut p = vec![' '];
    p.extend_from_slice(code);
    let n = p.len();
    let inside = inside_spans(&p);
    let words: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];
    let mut marks: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(p[i]) && (i == 0 || !sp(p[i - 1])) {
            let mut j = i;
            while j < n && sp(p[j]) {
                j += 1;
            }
            let mut found = None;
            if j < n && !inside[j] {
                for w in words.iter() {
                    let wc: Vec<char> = w.chars().collect();
                    let e = j + wc.len();
                    if e <= n && p[j..e] == wc[..] && (e == n || sp(p[e])) {
                        found = Some(e);
                        break;
                    }
                }
            }
            match found {
                Some(e) => {
                    marks.push((i, e));
                    i = e;
                }
                None => i = j,
            }
        } else {
            i += 1;
        }
    }
    let body_end = marks.first().map_or(n, |m| m.0);
    let body = st(trim_sp(&p[..body_end]));
    let mut vals = Vec::new();
    for k in 0..marks.len() {
        let end = marks.get(k + 1).map_or(n, |m| m.0);
        vals.push(st(trim_sp(&p[marks[k].1..end])));
    }
    (body, vals)
}

fn dir_name_ok(name: &[char]) -> Option<String> {
    let mut w = name;
    let mut colon = false;
    if let Some(&':') = w.last() {
        w = &w[..w.len() - 1];
        colon = true;
    }
    let ws = st(w);
    if ws == "CITED" {
        return None;
    }
    let mut it = w.iter();
    match it.next() {
        Some(c) if c.is_ascii_uppercase() => {}
        _ => return None,
    }
    let _ = colon;
    if it.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-') {
        Some(ws)
    } else {
        None
    }
}

struct Dir {
    line: u64,
    text: String,
    dep: bool,
    args: String,
    conts: Vec<String>,
    attrs: Vec<String>,
    comments: Vec<String>,
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn word_hit(content: &[char]) -> bool {
    let lc: Vec<char> = content.iter().map(|c| c.to_ascii_lowercase()).collect();
    let pat: Vec<char> = "carried".chars().collect();
    let n = lc.len();
    let m = pat.len();
    if n < m {
        return false;
    }
    for i in 0..=(n - m) {
        if lc[i..i + m] == pat[..] {
            let before_ok = i == 0 || !lc[i - 1].is_ascii_alphabetic();
            let after_ok = i + m == n || !lc[i + m].is_ascii_alphabetic();
            if before_ok && after_ok {
                return true;
            }
        }
    }
    false
}

fn name_hit(content: &[char], name: &[char]) -> bool {
    let n = content.len();
    let m = name.len();
    if m == 0 || n < m {
        return false;
    }
    for i in 0..=(n - m) {
        if content[i..i + m] == name[..] {
            let before_ok = i == 0 || !is_word(content[i - 1]);
            let after_ok = i + m == n || !is_word(content[i + m]);
            if before_ok && after_ok {
                return true;
            }
        }
    }
    false
}

pub fn schema_lint(text: &str, carried_name: Option<&str>) -> (Vec<(u64, String, String)>,) {
    let lines = split_lines(text);
    let mut dirs: Vec<Dir> = Vec::new();
    for (idx, raw) in lines.iter().enumerate() {
        let line = trim_line(raw);
        if line.is_empty() {
            continue;
        }
        let lead_sp = sp(line[0]);
        let mut k = 0;
        while k < line.len() && sp(line[k]) {
            k += 1;
        }
        let part = &line[k..];
        if part.is_empty() {
            continue;
        }
        if part[0] == '#' {
            let mut q = 0;
            while q < part.len() && part[q] == '#' {
                q += 1;
            }
            if q < part.len() && sp(part[q]) {
                q += 1;
            }
            if let Some(d) = dirs.last_mut() {
                d.comments.push(st(&part[q..]));
            }
            continue;
        }
        let inside = inside_spans(part);
        let mut marker = None;
        for p in 1..part.len() {
            if part[p] == '#'
                && sp(part[p - 1])
                && (p + 1 == part.len() || sp(part[p + 1]))
                && !inside[p]
            {
                marker = Some(p);
                break;
            }
        }
        let (code, trailing): (&[char], Option<String>) = match marker {
            Some(p) => {
                let mut e = p;
                while e > 0 && sp(part[e - 1]) {
                    e -= 1;
                }
                (&part[..e], Some(st(trim_sp(&part[p + 1..]))))
            }
            None => (part, None),
        };
        let mut opened = false;
        if !lead_sp {
            let mut ne = 0;
            while ne < code.len() && !sp(code[ne]) {
                ne += 1;
            }
            if let Some(w) = dir_name_ok(&code[..ne]) {
                let (body, vals) = attrs(&code[ne..]);
                let lt: String = line.iter().take(96).collect();
                dirs.push(Dir {
                    line: (idx + 1) as u64,
                    text: lt,
                    dep: w == "DEPENDS-ON",
                    args: body,
                    conts: Vec::new(),
                    attrs: vals,
                    comments: Vec::new(),
                });
                opened = true;
            }
        }
        if !opened {
            if let Some(d) = dirs.last_mut() {
                let (body, vals) = attrs(code);
                if !body.is_empty() {
                    d.conts.push(body);
                }
                d.attrs.extend(vals);
            } else {
                continue;
            }
        }
        if let Some(t) = trailing {
            if let Some(d) = dirs.last_mut() {
                d.comments.push(t);
            }
        }
    }
    let name_chars: Option<Vec<char>> = match carried_name {
        Some(s) if !s.is_empty() && s != "none" => Some(s.chars().collect()),
        _ => None,
    };
    let mut hits = Vec::new();
    for d in dirs.iter().filter(|d| d.dep) {
        let mut pieces: Vec<&str> = vec![d.args.as_str()];
        pieces.extend(d.conts.iter().map(|s| s.as_str()));
        pieces.extend(d.attrs.iter().map(|s| s.as_str()));
        pieces.extend(d.comments.iter().map(|s| s.as_str()));
        let content: Vec<char> = pieces.join(" ").chars().collect();
        let hit = word_hit(&content)
            || name_chars.as_ref().map_or(false, |nm| name_hit(&content, nm));
        if hit {
            hits.push((d.line, WHAT.to_string(), d.text.clone()));
        }
    }
    (hits,)
}
