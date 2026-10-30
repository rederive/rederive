const WHAT: &str = "carried data declared under DEPENDS-ON \u{2014} use CARRIED (\u{a7}18)";

fn is_sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim_sp(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_sp(s[a]) {
        a += 1;
    }
    while b > a && is_sp(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
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
    let mut lead = 0;
    while lead < l.len() && (is_sp(l[lead]) || l[lead] == '\u{feff}') {
        lead += 1;
    }
    let mut v: Vec<char> = l[..lead].iter().copied().filter(|&c| c != '\u{feff}').collect();
    v.extend_from_slice(&l[lead..]);
    while let Some(&c) = v.last() {
        if is_sp(c) {
            v.pop();
        } else {
            break;
        }
    }
    v
}

fn is_opener(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn spans(p: &[char]) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < p.len() {
        if p[i] == '"' {
            let follows = out.last().map_or(false, |&(_, c)| c + 1 == i);
            if i == 0 || is_opener(p[i - 1]) || follows {
                let mut j = i + 1;
                let mut close = None;
                while j < p.len() {
                    if p[j] == '\\' {
                        j += 2;
                        continue;
                    }
                    if p[j] == '"' {
                        close = Some(j);
                        break;
                    }
                    j += 1;
                }
                match close {
                    Some(c) => {
                        out.push((i, c));
                        i = c + 1;
                        continue;
                    }
                    None => break,
                }
            }
        }
        i += 1;
    }
    out
}

fn in_span(sp: &[(usize, usize)], i: usize) -> bool {
    sp.iter().any(|&(a, b)| a < i && i < b)
}

fn s(v: &[char]) -> String {
    v.iter().collect()
}

fn attrs(code: &[char]) -> (String, Vec<String>) {
    let mut p = vec![' '];
    p.extend_from_slice(code);
    let n = p.len();
    let sp = spans(&p);
    let words = ["CITED", "EARNED", "ANCHOR"];
    let mut marks: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < n {
        if is_sp(p[i]) && (i == 0 || !is_sp(p[i - 1])) {
            let mut j = i;
            while j < n && is_sp(p[j]) {
                j += 1;
            }
            let mut found = false;
            for w in words.iter() {
                let wc: Vec<char> = w.chars().collect();
                let e = j + wc.len();
                if e <= n && p[j..e] == wc[..] && (e == n || is_sp(p[e])) && !in_span(&sp, j) {
                    marks.push((i, e));
                    i = e;
                    found = true;
                    break;
                }
            }
            if !found {
                i = j;
            }
        } else {
            i += 1;
        }
    }
    let body_end = marks.first().map_or(n, |m| m.0);
    let body = s(trim_sp(&p[..body_end]));
    let mut vals = Vec::new();
    for k in 0..marks.len() {
        let st = marks[k].1;
        let en = if k + 1 < marks.len() { marks[k + 1].0 } else { n };
        vals.push(s(trim_sp(&p[st..en])));
    }
    (body, vals)
}

fn valid_name(w: &[char]) -> bool {
    if w.is_empty() || !w[0].is_ascii_uppercase() {
        return false;
    }
    w.iter().all(|&c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
}

struct Dir {
    line: u64,
    text: String,
    args: String,
    conts: Vec<String>,
    attrs: Vec<String>,
    comments: Vec<String>,
}

fn word_hit(content: &[char]) -> bool {
    let lc: Vec<char> = content.iter().map(|c| c.to_ascii_lowercase()).collect();
    let w: Vec<char> = "carried".chars().collect();
    let n = lc.len();
    let m = w.len();
    if n < m {
        return false;
    }
    for i in 0..=(n - m) {
        if lc[i..i + m] == w[..] {
            let before = i == 0 || !lc[i - 1].is_ascii_alphabetic();
            let after = i + m == n || !lc[i + m].is_ascii_alphabetic();
            if before && after {
                return true;
            }
        }
    }
    false
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn name_hit(content: &[char], name: &[char]) -> bool {
    let n = content.len();
    let m = name.len();
    if m == 0 || n < m {
        return false;
    }
    for i in 0..=(n - m) {
        if content[i..i + m] == name[..] {
            let before = i == 0 || !is_word(content[i - 1]);
            let after = i + m == n || !is_word(content[i + m]);
            if before && after {
                return true;
            }
        }
    }
    false
}

pub fn schema_lint(text: &str, carried_name: Option<&str>) -> (Vec<(u64, String, String)>,) {
    let mut dirs: Vec<(Dir, bool)> = Vec::new();
    let mut cur: Option<usize> = None;
    for (idx, raw) in split_lines(text).iter().enumerate() {
        let line = trim_line(raw);
        if line.is_empty() {
            continue;
        }
        let lead = line.iter().take_while(|&&c| is_sp(c)).count();
        let part = &line[lead..];
        if part[0] == '#' {
            let mut k = 0;
            while k < part.len() && part[k] == '#' {
                k += 1;
            }
            if k < part.len() && is_sp(part[k]) {
                k += 1;
            }
            if let Some(c) = cur {
                dirs[c].0.comments.push(s(&part[k..]));
            }
            continue;
        }
        let sp = spans(part);
        let mut code_end = part.len();
        let mut comment: Option<String> = None;
        for k in 1..part.len() {
            if part[k] == '#' && is_sp(part[k - 1]) && (k + 1 == part.len() || is_sp(part[k + 1])) && !in_span(&sp, k) {
                code_end = k;
                comment = Some(s(trim_sp(&part[k + 1..])));
                break;
            }
        }
        let mut ce = code_end;
        while ce > 0 && is_sp(part[ce - 1]) {
            ce -= 1;
        }
        let code = &part[..ce];
        let mut opened = false;
        if lead == 0 {
            let tl = code.iter().position(|&c| is_sp(c)).unwrap_or(code.len());
            let tok = &code[..tl];
            let w = if tok.last() == Some(&':') { &tok[..tok.len() - 1] } else { tok };
            if valid_name(w) && s(w) != "CITED" {
                let (body, vals) = attrs(&code[tl..]);
                let is_dep = s(w) == "DEPENDS-ON";
                dirs.push((
                    Dir {
                        line: idx as u64 + 1,
                        text: s(&line),
                        args: body,
                        conts: Vec::new(),
                        attrs: vals,
                        comments: Vec::new(),
                    },
                    is_dep,
                ));
                cur = Some(dirs.len() - 1);
                opened = true;
            }
        }
        if !opened {
            if let Some(c) = cur {
                let (body, vals) = attrs(code);
                if !body.is_empty() {
                    dirs[c].0.conts.push(body);
                }
                dirs[c].0.attrs.extend(vals);
            }
        }
        if let (Some(c), Some(cm)) = (cur, comment) {
            dirs[c].0.comments.push(cm);
        }
    }
    let name: Option<Vec<char>> = match carried_name {
        Some(n) if !n.is_empty() && n != "none" => Some(n.chars().collect()),
        _ => None,
    };
    let mut hits = Vec::new();
    for (d, is_dep) in dirs.iter() {
        if !*is_dep {
            continue;
        }
        let mut pieces: Vec<&str> = vec![d.args.as_str()];
        pieces.extend(d.conts.iter().map(|x| x.as_str()));
        pieces.extend(d.attrs.iter().map(|x| x.as_str()));
        pieces.extend(d.comments.iter().map(|x| x.as_str()));
        let content: Vec<char> = pieces.join(" ").chars().collect();
        let hit = word_hit(&content) || name.as_ref().map_or(false, |nm| name_hit(&content, nm));
        if hit {
            hits.push((d.line, WHAT.to_string(), d.text.chars().take(96).collect::<String>()));
        }
    }
    (hits,)
}
