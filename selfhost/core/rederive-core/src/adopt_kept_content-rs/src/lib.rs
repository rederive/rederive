use std::collections::HashSet;

fn is_blank(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}
fn is_notdot(c: char) -> bool {
    matches!(c, '\u{D}' | '\u{2028}' | '\u{2029}')
}
fn trim(s: &str) -> &str {
    s.trim_matches(is_blank)
}
fn split_lines(s: &str) -> Vec<String> {
    s.split('\n').map(|p| p.strip_suffix('\r').unwrap_or(p).to_string()).collect()
}
fn lf_read(s: &str) -> String {
    split_lines(s).join("\n")
}
fn at(c: &[char], i: usize, s: &str) -> bool {
    let p: Vec<char> = s.chars().collect();
    i + p.len() <= c.len() && c[i..i + p.len()] == p[..]
}
fn skip_blank(c: &[char], mut i: usize) -> usize {
    while i < c.len() && is_blank(c[i]) {
        i += 1;
    }
    i
}
fn find_from(c: &[char], from: usize, s: &str) -> Option<usize> {
    (from..c.len()).find(|&i| at(c, i, s))
}

fn find_begin(c: &[char]) -> Option<usize> {
    for i in 0..c.len() {
        if !at(c, i, "<!--") {
            continue;
        }
        let j = skip_blank(c, i + 4);
        if !at(c, j, "rederive:begin") {
            continue;
        }
        let e = j + 14;
        if e < c.len() && (c[e].is_ascii_alphanumeric() || c[e] == '_') {
            continue;
        }
        if let Some(q) = find_from(c, e, "-->") {
            if (e..q).all(|k| !at(c, k, "<!--")) {
                return Some(q + 3);
            }
        }
    }
    None
}
fn find_end(c: &[char]) -> Option<usize> {
    for i in 0..c.len() {
        if !at(c, i, "<!--") {
            continue;
        }
        let j = skip_blank(c, i + 4);
        if !at(c, j, "rederive:end") {
            continue;
        }
        let k = skip_blank(c, j + 12);
        if at(c, k, "-->") {
            return Some(i);
        }
    }
    None
}

fn prep_managed(s: &str) -> String {
    let mut c: Vec<char> = lf_read(s).chars().collect();
    if let Some(e) = find_begin(&c) {
        c = c[e..].to_vec();
    }
    if let Some(i) = find_end(&c) {
        c.truncate(i);
    }
    let t: String = c.into_iter().collect();
    trim(&t).to_string()
}

enum Item {
    P(String, String),
    F(Vec<String>, bool),
}

fn is_one_line_fence(t: &str) -> bool {
    let n = t.chars().count();
    n >= 7 && t.starts_with("```") && t.ends_with("```") && !t.chars().any(is_notdot)
}
fn run_of(t: &str) -> (char, usize) {
    let ch = t.chars().next().unwrap_or('`');
    (ch, t.chars().take_while(|&x| x == ch).count())
}
fn closes(line: &str, ch: char, n: usize) -> bool {
    let t = trim(line);
    !t.is_empty() && t.chars().all(|x| x == ch) && t.chars().count() >= n
}
fn heading(line: &str) -> Option<(String, String)> {
    let c: Vec<char> = line.chars().collect();
    let n = c.iter().take_while(|&&x| x == '#').count();
    if n < 1 || n > 6 {
        return None;
    }
    let r = &c[n..];
    if r.is_empty() || !is_blank(r[0]) {
        return None;
    }
    let k = match r.iter().rposition(|&x| is_notdot(x)) {
        Some(p) => (p + 1).max(1),
        None => 1,
    };
    if k < r.len() && r[..k].iter().all(|&x| is_blank(x)) {
        let rest: String = r.iter().collect();
        Some(("#".repeat(n), trim(&rest).to_string()))
    } else {
        None
    }
}
fn list_line(line: &str) -> Option<(String, String)> {
    let c: Vec<char> = line.chars().collect();
    let s = skip_blank(&c, 0);
    let mut i = s;
    if i < c.len() && c[i].is_ascii_digit() {
        while i < c.len() && c[i].is_ascii_digit() {
            i += 1;
        }
        if i < c.len() && c[i] == '.' {
            i += 1;
        } else {
            return None;
        }
    } else if i < c.len() && (c[i] == '-' || c[i] == '*') {
        i += 1;
    } else {
        return None;
    }
    let marker: String = c[s..i].iter().collect();
    if i >= c.len() || !is_blank(c[i]) {
        return None;
    }
    let b = skip_blank(&c, i);
    if c[b..].iter().any(|&x| is_notdot(x)) {
        return None;
    }
    Some((marker, c[b..].iter().collect()))
}

fn close(prose: &mut Option<(String, String)>, items: &mut Vec<Item>) {
    if let Some((m, b)) = prose.take() {
        if b.chars().any(|x| !is_blank(x)) {
            items.push(Item::P(m, b));
        }
    }
}

fn extract(text: &str) -> Vec<Item> {
    let mut items = Vec::new();
    let mut prose: Option<(String, String)> = None;
    let mut fence: Option<(Vec<String>, char, usize)> = None;
    for line in split_lines(text) {
        if let Some((lines, ch, n)) = fence.as_mut() {
            lines.push(line.clone());
            if closes(&line, *ch, *n) {
                let (l, _, _) = fence.take().unwrap();
                items.push(Item::F(l, false));
            }
            continue;
        }
        let t = trim(&line);
        if is_one_line_fence(t) {
            close(&mut prose, &mut items);
            items.push(Item::F(vec![t.to_string()], true));
        } else if t.starts_with("```") || t.starts_with("~~~") {
            close(&mut prose, &mut items);
            let (ch, n) = run_of(t);
            fence = Some((vec![line.clone()], ch, n));
        } else if let Some((m, b)) = heading(&line) {
            close(&mut prose, &mut items);
            items.push(Item::P(m, b));
        } else if t.is_empty() {
            close(&mut prose, &mut items);
        } else if let Some((m, b)) = list_line(&line) {
            close(&mut prose, &mut items);
            prose = Some((m, b));
        } else if let Some((_, b)) = prose.as_mut() {
            b.push(' ');
            b.push_str(t);
        } else {
            prose = Some((String::new(), t.to_string()));
        }
    }
    close(&mut prose, &mut items);
    if let Some((l, _, _)) = fence {
        items.push(Item::F(l, false));
    }
    items
}

fn fragments(body: &str) -> Vec<String> {
    if body.contains('\u{0}') || body.contains('\u{1}') {
        return vec![trim(body).to_string()];
    }
    let c: Vec<char> = body.chars().collect();
    let mut m: Vec<char> = Vec::new();
    let mut spans: Vec<String> = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '`' {
            if let Some(q) = (i + 1..c.len()).find(|&k| c[k] == '`') {
                m.push('\u{0}');
                m.extend(spans.len().to_string().chars());
                m.push('\u{0}');
                spans.push(c[i..=q].iter().collect());
                i = q + 1;
                continue;
            }
        }
        m.push(c[i]);
        i += 1;
    }
    let term = |x: char| matches!(x, '.' | '!' | '?');
    let closer = |x: char| matches!(x, '"' | '\'' | ')' | ']');
    let start = |x: char| x.is_ascii_uppercase() || x == '`' || x == '(' || x == '\u{0}';
    let mut pieces: Vec<Vec<char>> = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut i = 0;
    while i < m.len() {
        if is_blank(m[i]) {
            let j = skip_blank(&m, i);
            let pre = i > 0 && (term(m[i - 1]) || (closer(m[i - 1]) && i >= 2 && term(m[i - 2])));
            if pre && j < m.len() && start(m[j]) {
                pieces.push(std::mem::take(&mut cur));
            } else {
                cur.extend_from_slice(&m[i..j]);
            }
            i = j;
        } else {
            cur.push(m[i]);
            i += 1;
        }
    }
    pieces.push(cur);
    let mut out = Vec::new();
    for p in pieces {
        let mut s = String::new();
        let mut k = 0;
        while k < p.len() {
            if p[k] == '\u{0}' {
                let mut d = 0usize;
                k += 1;
                while k < p.len() && p[k] != '\u{0}' {
                    d = d * 10 + p[k].to_digit(10).unwrap_or(0) as usize;
                    k += 1;
                }
                k += 1;
                s.push_str(&spans[d]);
            } else {
                s.push(p[k]);
                k += 1;
            }
        }
        let t = trim(&s);
        if !t.is_empty() {
            out.push(t.to_string());
        }
    }
    out
}

fn collapse(s: &str) -> String {
    let mut o = String::new();
    let mut inb = false;
    for ch in s.chars() {
        if is_blank(ch) {
            if !inb {
                o.push(' ');
            }
            inb = true;
        } else {
            o.push(ch);
            inb = false;
        }
    }
    o.trim_matches(' ').to_string()
}

fn key(f: &str) -> String {
    if f.contains('\u{0}') || f.contains('\u{1}') {
        return format!("\u{2}{}", f);
    }
    let parts: Vec<&str> = f.split('`').collect();
    let mut o = String::new();
    let n = parts.len();
    let mut idx = 0;
    while idx < n {
        // parts[idx] is prose; parts[idx+1] is a code span if parts[idx+2] exists
        let mut prose = parts[idx].to_string();
        if idx + 2 < n || (idx + 2 == n && false) {
            o.push_str(&prose.to_lowercase());
            o.push('\u{1}');
            o.push_str(parts[idx + 1]);
            o.push('\u{1}');
            idx += 2;
        } else {
            if idx + 1 < n {
                prose.push('`');
                prose.push_str(parts[idx + 1]);
            }
            o.push_str(&prose.to_lowercase());
            break;
        }
    }
    collapse(&o)
}

fn key_lines(lines: &[String], one: bool) -> Vec<String> {
    if one {
        return vec![lines[0].clone()];
    }
    if lines.len() >= 2 {
        let (ch, n) = run_of(trim(&lines[0]));
        if closes(&lines[lines.len() - 1], ch, n) {
            let mut v = vec![lines[0].clone()];
            for l in &lines[1..lines.len() - 1] {
                if !trim(l).is_empty() {
                    v.push(l.clone());
                }
            }
            return v;
        }
    }
    Vec::new()
}

fn block_key(kl: &[String]) -> String {
    kl.iter().map(|l| collapse(l)).collect::<Vec<_>>().join("\n")
}

pub fn adopt_kept_content(unmanaged: &str, managed: &str) -> Vec<String> {
    let u = lf_read(unmanaged);
    let u = trim(&u).to_string();
    let m = prep_managed(managed);
    let mut lists: Vec<Vec<String>> = Vec::new();
    let mut blocks: HashSet<String> = HashSet::new();
    for it in extract(&m) {
        match it {
            Item::P(_, b) => lists.push(fragments(&b).iter().map(|f| key(f)).collect()),
            Item::F(l, one) => {
                blocks.insert(block_key(&key_lines(&l, one)));
            }
        }
    }
    let mut out = Vec::new();
    for it in extract(&u) {
        match it {
            Item::P(mk, b) => {
                let ks: Vec<String> = fragments(&b).iter().map(|f| key(f)).collect();
                let rep = !ks.is_empty()
                    && lists.iter().any(|l| l.len() >= ks.len() && l.windows(ks.len()).any(|w| w == &ks[..]));
                if !rep {
                    out.push(if mk.is_empty() { b } else { format!("{} {}", mk, b) });
                }
            }
            Item::F(l, one) => {
                let kl = key_lines(&l, one);
                if kl.is_empty() || !blocks.contains(&block_key(&kl)) {
                    out.push(l.join("\n"));
                }
            }
        }
    }
    out
}
