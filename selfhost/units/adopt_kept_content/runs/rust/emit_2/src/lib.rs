use std::collections::HashSet;

fn is_blank(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn is_notdot(c: char) -> bool {
    matches!(c, '\u{D}' | '\u{2028}' | '\u{2029}')
}
fn trim_b(s: &str) -> &str {
    s.trim_matches(is_blank)
}

fn split_lines(s: &str) -> Vec<&str> {
    s.split('\n').map(|p| p.strip_suffix('\r').unwrap_or(p)).collect()
}
fn lf_read(s: &str) -> String {
    split_lines(s).join("\n")
}

fn starts(v: &[char], i: usize, pat: &str) -> bool {
    let p: Vec<char> = pat.chars().collect();
    i + p.len() <= v.len() && v[i..i + p.len()] == p[..]
}
fn find_from(v: &[char], from: usize, pat: &str) -> Option<usize> {
    (from..v.len()).find(|&i| starts(v, i, pat))
}

fn skip_blank(v: &[char], mut i: usize) -> usize {
    while i < v.len() && is_blank(v[i]) {
        i += 1;
    }
    i
}

fn find_begin(v: &[char]) -> Option<usize> {
    let mut i = 0;
    while let Some(s) = find_from(v, i, "<!--") {
        let j = skip_blank(v, s + 4);
        if starts(v, j, "rederive:begin") {
            let e = j + 14;
            let ok = e >= v.len() || !(v[e].is_ascii_alphanumeric() || v[e] == '_');
            if ok {
                if let Some(q) = find_from(v, e, "-->") {
                    if (e..q).all(|k| !starts(v, k, "<!--")) {
                        return Some(q + 3);
                    }
                }
            }
        }
        i = s + 1;
    }
    None
}

fn find_end(v: &[char]) -> Option<usize> {
    let mut i = 0;
    while let Some(s) = find_from(v, i, "<!--") {
        let j = skip_blank(v, s + 4);
        if starts(v, j, "rederive:end") {
            let k = skip_blank(v, j + 12);
            if starts(v, k, "-->") {
                return Some(s);
            }
        }
        i = s + 1;
    }
    None
}

fn prep_managed(m: &str) -> String {
    let mut v: Vec<char> = lf_read(m).chars().collect();
    if let Some(e) = find_begin(&v) {
        v = v[e..].to_vec();
    }
    if let Some(s) = find_end(&v) {
        v.truncate(s);
    }
    let s: String = v.into_iter().collect();
    trim_b(&s).to_string()
}

enum Item {
    Prose(String, String),
    Fence(Vec<String>),
}

fn one_line_fence(line: &str) -> bool {
    let t = trim_b(line);
    t.starts_with("```") && t.ends_with("```") && t.chars().count() >= 7 && !t.chars().any(is_notdot)
}
fn is_fence_line(line: &str) -> bool {
    let t = trim_b(line);
    t.starts_with("```") || t.starts_with("~~~")
}
fn fence_run(line: &str) -> (char, usize) {
    let t = trim_b(line);
    let c = t.chars().next().unwrap_or('`');
    (c, t.chars().take_while(|&x| x == c).count())
}
fn closes(line: &str, c: char, n: usize) -> bool {
    let t = trim_b(line);
    let k = t.chars().count();
    k >= n && k > 0 && t.chars().all(|x| x == c)
}

fn heading(line: &str) -> Option<(String, String)> {
    let v: Vec<char> = line.chars().collect();
    let n = v.iter().take_while(|&&c| c == '#').count();
    if n == 0 || n > 6 {
        return None;
    }
    let r = &v[n..];
    if r.is_empty() || !is_blank(r[0]) {
        return None;
    }
    let k = match r.iter().rposition(|&c| is_notdot(c)) {
        Some(p) => (p + 1).max(1),
        None => 1,
    };
    if k < r.len() && r[..k].iter().all(|&c| is_blank(c)) {
        let body: String = r.iter().collect();
        return Some(("#".repeat(n), trim_b(&body).to_string()));
    }
    None
}

fn list_item(line: &str) -> Option<(String, String)> {
    let v: Vec<char> = line.chars().collect();
    let i = skip_blank(&v, 0);
    let mut j = i;
    if j < v.len() && v[j].is_ascii_digit() {
        while j < v.len() && v[j].is_ascii_digit() {
            j += 1;
        }
        if j < v.len() && v[j] == '.' {
            j += 1;
        } else {
            return None;
        }
    } else if j < v.len() && (v[j] == '-' || v[j] == '*') {
        j += 1;
    } else {
        return None;
    }
    let m = skip_blank(&v, j);
    if m == j {
        return None;
    }
    if v[m..].iter().any(|&c| is_notdot(c)) {
        return None;
    }
    Some((v[i..j].iter().collect(), v[m..].iter().collect()))
}

fn extract_items(text: &str) -> Vec<Item> {
    let mut items = Vec::new();
    let mut prose: Option<(String, String)> = None;
    let mut fence: Option<(Vec<String>, char, usize)> = None;
    fn close(items: &mut Vec<Item>, prose: &mut Option<(String, String)>) {
        if let Some((m, b)) = prose.take() {
            if b.chars().any(|c| !is_blank(c)) {
                items.push(Item::Prose(m, b));
            }
        }
    }
    for line in split_lines(text) {
        if let Some((lines, c, n)) = fence.as_mut() {
            lines.push(line.to_string());
            if closes(line, *c, *n) {
                let (l, _, _) = fence.take().unwrap();
                items.push(Item::Fence(l));
            }
            continue;
        }
        if one_line_fence(line) {
            close(&mut items, &mut prose);
            items.push(Item::Fence(vec![trim_b(line).to_string()]));
        } else if is_fence_line(line) {
            close(&mut items, &mut prose);
            let (c, n) = fence_run(line);
            fence = Some((vec![line.to_string()], c, n));
        } else if let Some((m, b)) = heading(line) {
            close(&mut items, &mut prose);
            items.push(Item::Prose(m, b));
        } else if trim_b(line).is_empty() {
            close(&mut items, &mut prose);
        } else if let Some((m, b)) = list_item(line) {
            close(&mut items, &mut prose);
            prose = Some((m, b));
        } else if let Some((_, b)) = prose.as_mut() {
            b.push(' ');
            b.push_str(trim_b(line));
        } else {
            prose = Some((String::new(), trim_b(line).to_string()));
        }
    }
    close(&mut items, &mut prose);
    if let Some((l, _, _)) = fence {
        items.push(Item::Fence(l));
    }
    items
}

fn fragments(body: &str) -> Vec<String> {
    if body.contains('\u{0}') || body.contains('\u{1}') {
        let t = trim_b(body);
        return if t.is_empty() { vec![] } else { vec![t.to_string()] };
    }
    let v: Vec<char> = body.chars().collect();
    let mut masked: Vec<char> = Vec::new();
    let mut spans: Vec<String> = Vec::new();
    let mut i = 0;
    while i < v.len() {
        if v[i] == '`' {
            if let Some(off) = v[i + 1..].iter().position(|&c| c == '`') {
                let j = i + 1 + off;
                masked.push('\u{0}');
                masked.extend(spans.len().to_string().chars());
                masked.push('\u{0}');
                spans.push(v[i..=j].iter().collect());
                i = j + 1;
                continue;
            }
        }
        masked.push(v[i]);
        i += 1;
    }
    let term = |c: char| matches!(c, '.' | '!' | '?');
    let closer = |c: char| matches!(c, '"' | '\'' | ')' | ']');
    let start = |c: char| c.is_ascii_uppercase() || c == '`' || c == '(' || c == '\u{0}';
    let mut pieces: Vec<Vec<char>> = vec![Vec::new()];
    let mut k = 0;
    while k < masked.len() {
        if is_blank(masked[k]) {
            let s = k;
            while k < masked.len() && is_blank(masked[k]) {
                k += 1;
            }
            let pre = s >= 1 && (term(masked[s - 1]) || (closer(masked[s - 1]) && s >= 2 && term(masked[s - 2])));
            let post = k < masked.len() && start(masked[k]);
            if pre && post {
                pieces.push(Vec::new());
            } else {
                pieces.last_mut().unwrap().extend(&masked[s..k]);
            }
        } else {
            pieces.last_mut().unwrap().push(masked[k]);
            k += 1;
        }
    }
    let mut out = Vec::new();
    for p in pieces {
        let mut s = String::new();
        let mut x = 0;
        while x < p.len() {
            if p[x] == '\u{0}' {
                let mut y = x + 1;
                let mut num = 0usize;
                while y < p.len() && p[y].is_ascii_digit() {
                    num = num * 10 + p[y].to_digit(10).unwrap() as usize;
                    y += 1;
                }
                s.push_str(&spans[num]);
                x = y + 1;
            } else {
                s.push(p[x]);
                x += 1;
            }
        }
        let t = trim_b(&s);
        if !t.is_empty() {
            out.push(t.to_string());
        }
    }
    out
}

fn collapse(s: &str) -> String {
    let mut o = String::new();
    let mut inb = false;
    for c in s.chars() {
        if is_blank(c) {
            if !inb {
                o.push(' ');
            }
            inb = true;
        } else {
            o.push(c);
            inb = false;
        }
    }
    o.trim_matches(' ').to_string()
}

fn key(frag: &str) -> String {
    if frag.contains('\u{0}') || frag.contains('\u{1}') {
        return format!("\u{2}{}", frag);
    }
    let parts: Vec<&str> = frag.split('`').collect();
    let mut out = String::new();
    let n = parts.len();
    for (idx, p) in parts.iter().enumerate() {
        let is_span = idx % 2 == 1 && idx + 1 < n;
        if is_span {
            out.push('\u{1}');
            out.push_str(p);
            out.push('\u{1}');
        } else {
            if idx % 2 == 1 {
                out.push_str(&p.to_lowercase().chars().fold(String::from("`"), |mut a, c| {
                    a.push(c);
                    a
                }));
            } else {
                out.push_str(&p.to_lowercase());
            }
        }
    }
    collapse(&out)
}

fn key_lines(lines: &[String]) -> Vec<String> {
    if lines.len() == 1 {
        return if one_line_fence(&lines[0]) { vec![lines[0].clone()] } else { vec![] };
    }
    let (c, n) = fence_run(&lines[0]);
    if lines.len() >= 2 && closes(&lines[lines.len() - 1], c, n) {
        let mut v = vec![lines[0].clone()];
        for l in &lines[1..lines.len() - 1] {
            if !trim_b(l).is_empty() {
                v.push(l.clone());
            }
        }
        v
    } else {
        vec![]
    }
}

fn block_key(lines: &[String]) -> Option<String> {
    let k = key_lines(lines);
    if k.is_empty() {
        None
    } else {
        Some(k.iter().map(|l| collapse(l)).collect::<Vec<_>>().join("\n"))
    }
}

pub fn adopt_kept_content(unmanaged: &str, managed: &str) -> Vec<String> {
    let un = lf_read(unmanaged);
    let un = trim_b(&un).to_string();
    let mg = prep_managed(managed);
    let mut lists: Vec<Vec<String>> = Vec::new();
    let mut blocks: HashSet<String> = HashSet::new();
    for it in extract_items(&mg) {
        match it {
            Item::Prose(_, b) => lists.push(fragments(&b).iter().map(|f| key(f)).collect()),
            Item::Fence(l) => {
                if let Some(k) = block_key(&l) {
                    blocks.insert(k);
                }
            }
        }
    }
    let mut res = Vec::new();
    for it in extract_items(&un) {
        match it {
            Item::Prose(m, b) => {
                let keys: Vec<String> = fragments(&b).iter().map(|f| key(f)).collect();
                let rep = !keys.is_empty() && lists.iter().any(|l| l.windows(keys.len()).any(|w| w == &keys[..]));
                if !rep {
                    res.push(if m.is_empty() { b } else { format!("{} {}", m, b) });
                }
            }
            Item::Fence(l) => {
                let rep = match block_key(&l) {
                    Some(k) => blocks.contains(&k),
                    None => false,
                };
                if !rep {
                    res.push(l.join("\n"));
                }
            }
        }
    }
    res
}
