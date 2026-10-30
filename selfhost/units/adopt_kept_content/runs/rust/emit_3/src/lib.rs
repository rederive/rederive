use std::collections::HashSet;

fn is_blank(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | '\u{20}' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn is_notdot(c: char) -> bool {
    matches!(c, '\u{D}' | '\u{2028}' | '\u{2029}')
}

fn trim(s: &str) -> &str {
    s.trim_matches(is_blank)
}

fn split_lines(s: &str) -> Vec<String> {
    s.split('\n')
        .map(|p| p.strip_suffix('\r').unwrap_or(p).to_string())
        .collect()
}

fn lf_read(s: &str) -> String {
    split_lines(s).join("\n")
}

fn matches_at(c: &[char], i: usize, pat: &str) -> bool {
    let p: Vec<char> = pat.chars().collect();
    i + p.len() <= c.len() && c[i..i + p.len()] == p[..]
}

fn find_from(c: &[char], from: usize, pat: &str) -> Option<usize> {
    (from..c.len()).find(|&i| matches_at(c, i, pat))
}

fn skip_blank(c: &[char], mut j: usize) -> usize {
    while j < c.len() && is_blank(c[j]) {
        j += 1;
    }
    j
}

fn begin_end(c: &[char]) -> Option<usize> {
    for i in 0..c.len() {
        if !matches_at(c, i, "<!--") {
            continue;
        }
        let j = skip_blank(c, i + 4);
        if !matches_at(c, j, "rederive:begin") {
            continue;
        }
        let e = j + 14;
        if e < c.len() && (c[e].is_ascii_alphanumeric() || c[e] == '_') {
            continue;
        }
        if let Some(q) = find_from(c, e, "-->") {
            if !(e..q).any(|k| matches_at(c, k, "<!--")) {
                return Some(q + 3);
            }
        }
    }
    None
}

fn end_start(c: &[char]) -> Option<usize> {
    for i in 0..c.len() {
        if !matches_at(c, i, "<!--") {
            continue;
        }
        let j = skip_blank(c, i + 4);
        if !matches_at(c, j, "rederive:end") {
            continue;
        }
        let k = skip_blank(c, j + 12);
        if matches_at(c, k, "-->") {
            return Some(i);
        }
    }
    None
}

fn prepare_managed(s: &str) -> String {
    let mut c: Vec<char> = lf_read(s).chars().collect();
    if let Some(e) = begin_end(&c) {
        c = c[e..].to_vec();
    }
    if let Some(i) = end_start(&c) {
        c.truncate(i);
    }
    let t: String = c.into_iter().collect();
    trim(&t).to_string()
}

fn one_line_fence(t: &str) -> bool {
    t.starts_with("```") && t.ends_with("```") && t.chars().count() >= 7 && !t.chars().any(is_notdot)
}

fn run_of(t: &str) -> (char, usize) {
    let ch = t.chars().next().unwrap_or('`');
    (ch, t.chars().take_while(|&c| c == ch).count())
}

fn closes(line: &str, ch: char, n: usize) -> bool {
    let t = trim(line);
    t.chars().count() >= n && t.chars().all(|c| c == ch)
}

fn heading(line: &str) -> Option<(String, String)> {
    let cs: Vec<char> = line.chars().collect();
    let h = cs.iter().take_while(|&&c| c == '#').count();
    if h == 0 || h > 6 || h >= cs.len() {
        return None;
    }
    let r = &cs[h..];
    if !is_blank(r[0]) {
        return None;
    }
    let last = r.iter().rposition(|&c| is_notdot(c));
    let k = std::cmp::max(1, last.map_or(0, |p| p + 1));
    if k < r.len() && r[..k].iter().all(|&c| is_blank(c)) {
        let body: String = r.iter().collect();
        Some(("#".repeat(h), trim(&body).to_string()))
    } else {
        None
    }
}

fn list_item(line: &str) -> Option<(String, String)> {
    let cs: Vec<char> = line.chars().collect();
    let mut i = skip_blank(&cs, 0);
    let ms = i;
    if i < cs.len() && cs[i].is_ascii_digit() {
        while i < cs.len() && cs[i].is_ascii_digit() {
            i += 1;
        }
        if i < cs.len() && cs[i] == '.' {
            i += 1;
        } else {
            return None;
        }
    } else if i < cs.len() && (cs[i] == '-' || cs[i] == '*') {
        i += 1;
    } else {
        return None;
    }
    let marker: String = cs[ms..i].iter().collect();
    let j = skip_blank(&cs, i);
    if j == i {
        return None;
    }
    let body = &cs[j..];
    if body.iter().any(|&c| is_notdot(c)) {
        return None;
    }
    Some((marker, body.iter().collect()))
}

enum Item {
    Prose(String, String),
    Fence(Vec<String>),
}

fn items(text: &str) -> Vec<Item> {
    let mut out = Vec::new();
    let mut prose: Option<(String, String)> = None;
    let mut fence: Option<(Vec<String>, char, usize)> = None;
    fn close(prose: &mut Option<(String, String)>, out: &mut Vec<Item>) {
        if let Some((m, b)) = prose.take() {
            if b.chars().any(|c| !is_blank(c)) {
                out.push(Item::Prose(m, b));
            }
        }
    }
    for line in split_lines(text) {
        if let Some((ls, ch, n)) = fence.as_mut() {
            ls.push(line.clone());
            if closes(&line, *ch, *n) {
                let l = std::mem::take(ls);
                fence = None;
                out.push(Item::Fence(l));
            }
            continue;
        }
        let t = trim(&line);
        if one_line_fence(t) {
            close(&mut prose, &mut out);
            out.push(Item::Fence(vec![t.to_string()]));
        } else if t.starts_with("```") || t.starts_with("~~~") {
            close(&mut prose, &mut out);
            let (ch, n) = run_of(t);
            fence = Some((vec![line.clone()], ch, n));
        } else if let Some((m, b)) = heading(&line) {
            close(&mut prose, &mut out);
            out.push(Item::Prose(m, b));
        } else if t.is_empty() {
            close(&mut prose, &mut out);
        } else if let Some((m, b)) = list_item(&line) {
            close(&mut prose, &mut out);
            prose = Some((m, b));
        } else if let Some((_, b)) = prose.as_mut() {
            b.push(' ');
            b.push_str(t);
        } else {
            prose = Some((String::new(), t.to_string()));
        }
    }
    close(&mut prose, &mut out);
    if let Some((ls, _, _)) = fence {
        out.push(Item::Fence(ls));
    }
    out
}

fn fragments(body: &str) -> Vec<String> {
    if body.contains('\0') || body.contains('\u{1}') {
        return vec![trim(body).to_string()];
    }
    let cs: Vec<char> = body.chars().collect();
    let mut m: Vec<char> = Vec::new();
    let mut spans: Vec<String> = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == '`' {
            if let Some(off) = cs[i + 1..].iter().position(|&c| c == '`') {
                let e = i + 1 + off;
                m.push('\0');
                m.extend(spans.len().to_string().chars());
                m.push('\0');
                spans.push(cs[i..=e].iter().collect());
                i = e + 1;
                continue;
            }
        }
        m.push(cs[i]);
        i += 1;
    }
    let term = |c: char| matches!(c, '.' | '!' | '?');
    let closer = |c: char| matches!(c, '"' | '\'' | ')' | ']');
    let start = |c: char| c.is_ascii_uppercase() || c == '`' || c == '(' || c == '\0';
    let mut pieces: Vec<Vec<char>> = Vec::new();
    let mut cur: Vec<char> = Vec::new();
    let mut i = 0;
    while i < m.len() {
        if is_blank(m[i]) {
            let s = i;
            while i < m.len() && is_blank(m[i]) {
                i += 1;
            }
            let pre = (s >= 1 && term(m[s - 1])) || (s >= 2 && closer(m[s - 1]) && term(m[s - 2]));
            if pre && i < m.len() && start(m[i]) {
                pieces.push(std::mem::take(&mut cur));
            } else {
                cur.extend(&m[s..i]);
            }
        } else {
            cur.push(m[i]);
            i += 1;
        }
    }
    pieces.push(cur);
    let mut res = Vec::new();
    for p in pieces {
        let mut s = String::new();
        let mut j = 0;
        while j < p.len() {
            if p[j] == '\0' {
                let mut k = j + 1;
                let mut idx = 0usize;
                while k < p.len() && p[k].is_ascii_digit() {
                    idx = idx * 10 + p[k].to_digit(10).unwrap() as usize;
                    k += 1;
                }
                s.push_str(&spans[idx]);
                j = k + 1;
            } else {
                s.push(p[j]);
                j += 1;
            }
        }
        let t = trim(&s);
        if !t.is_empty() {
            res.push(t.to_string());
        }
    }
    res
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

fn key(f: &str) -> String {
    if f.contains('\0') || f.contains('\u{1}') {
        return format!("\u{2}{}", f);
    }
    let mut out = String::new();
    let mut rest = f;
    loop {
        if let Some(a) = rest.find('`') {
            if let Some(b) = rest[a + 1..].find('`') {
                out.push_str(&rest[..a].to_lowercase());
                out.push('\u{1}');
                out.push_str(&rest[a + 1..a + 1 + b]);
                out.push('\u{1}');
                rest = &rest[a + 1 + b + 1..];
                continue;
            }
        }
        out.push_str(&rest.to_lowercase());
        break;
    }
    collapse(&out)
}

fn key_lines(ls: &[String]) -> Vec<String> {
    if ls.len() == 1 {
        return if one_line_fence(trim(&ls[0])) { vec![ls[0].clone()] } else { vec![] };
    }
    if ls.len() >= 2 {
        let (ch, n) = run_of(trim(&ls[0]));
        if closes(&ls[ls.len() - 1], ch, n) {
            let mut v = vec![ls[0].clone()];
            for l in &ls[1..ls.len() - 1] {
                if !trim(l).is_empty() {
                    v.push(l.clone());
                }
            }
            return v;
        }
    }
    vec![]
}

fn block_key(kl: &[String]) -> String {
    kl.iter().map(|l| collapse(l)).collect::<Vec<_>>().join("\n")
}

pub fn adopt_kept_content(unmanaged: &str, managed: &str) -> Vec<String> {
    let u = lf_read(unmanaged);
    let u = trim(&u).to_string();
    let m = prepare_managed(managed);
    let mut lists: Vec<Vec<String>> = Vec::new();
    let mut blocks: HashSet<String> = HashSet::new();
    for it in items(&m) {
        match it {
            Item::Prose(_, b) => lists.push(fragments(&b).iter().map(|f| key(f)).collect()),
            Item::Fence(ls) => {
                blocks.insert(block_key(&key_lines(&ls)));
            }
        }
    }
    let mut res = Vec::new();
    for it in items(&u) {
        match it {
            Item::Prose(mk, b) => {
                let keys: Vec<String> = fragments(&b).iter().map(|f| key(f)).collect();
                let rep = !keys.is_empty()
                    && lists.iter().any(|l| l.windows(keys.len()).any(|w| w == &keys[..]));
                if !rep {
                    res.push(if mk.is_empty() { b } else { format!("{} {}", mk, b) });
                }
            }
            Item::Fence(ls) => {
                let kl = key_lines(&ls);
                if kl.is_empty() || !blocks.contains(&block_key(&kl)) {
                    res.push(ls.join("\n"));
                }
            }
        }
    }
    res
}
