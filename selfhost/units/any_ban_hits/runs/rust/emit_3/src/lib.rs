use std::collections::HashMap;

type Hits = Vec<(String, usize)>;
type Memo = HashMap<(usize, usize), Hits>;

fn is_ws(c: char) -> bool {
    matches!(c as u32, 0x9..=0xD | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn is_ident(c: char) -> bool {
    is_word(c) || c == '$'
}
fn is_word_char(c: char) -> bool {
    is_ident(c) || ((c as u32) >= 0x80 && !is_ws(c) && c != '\u{85}' && c != '\u{200B}')
}
fn is_operand_end(c: char) -> bool {
    is_ident(c) || c == ')' || c == ']' || c == '"' || (c as u32) >= 0x80
}
fn is_key_blank(c: char) -> bool {
    (is_ws(c) && !matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')) || c == '\u{85}' || c == '\u{200B}'
}

const PREFIX_KW: [&str; 14] = [
    "return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new",
];
const PREFIX_KW2: [&str; 1] = ["extends"];
const REGEX_KW: [&str; 14] = [
    "return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "throw", "delete", "new", "x",
];

fn dir_idx(s: &str) -> Option<usize> {
    let mut best: Option<usize> = None;
    for n in ["@ts-ignore", "@ts-expect-error", "@ts-nocheck"] {
        if let Some(b) = s.find(n) {
            best = Some(best.map_or(b, |x| x.min(b)));
        }
    }
    best.map(|b| s[..b].chars().map(|c| c.len_utf16()).sum())
}
fn dir_raw(s: &str) -> Option<usize> {
    dir_idx(&s.to_ascii_lowercase())
}
fn dir_low(s: &str) -> Option<usize> {
    dir_idx(&s.to_lowercase())
}

fn trim_end_ws(ctx: &[char]) -> usize {
    let mut n = ctx.len();
    while n > 0 && is_ws(ctx[n - 1]) {
        n -= 1;
    }
    n
}

fn ends_with(t: &[char], w: &str) -> bool {
    let w: Vec<char> = w.chars().collect();
    t.len() >= w.len() && t[t.len() - w.len()..] == w[..]
}

fn record(h: &mut Hits, label: &str, line: usize) {
    if !h.iter().any(|(l, n)| l == label && *n == line) {
        h.push((label.to_string(), line));
    }
}

fn scan(ch: &[char], s: usize, e: usize, memo: &mut Memo) -> Hits {
    if let Some(r) = memo.get(&(s, e)) {
        return r.clone();
    }
    let at = |k: usize| -> Option<char> { if k < e { Some(ch[k]) } else { None } };
    let mut i = s;
    let mut line = 1usize;
    let mut ctx: Vec<char> = Vec::new();
    let mut depth: i64 = 0;
    let mut stack: Vec<i64> = Vec::new();
    let mut hits: Hits = Vec::new();
    let mut text = false;
    while i < e {
        let c = ch[i];
        if text {
            if c == '\\' {
                if at(i + 1) == Some('\n') {
                    line += 1;
                }
                i += 2;
            } else if c == '\n' {
                line += 1;
                ctx.clear();
                i += 1;
            } else if c == '`' {
                i += 1;
                ctx.push('`');
                text = false;
            } else if c == '$' && at(i + 1) == Some('{') {
                i += 2;
                stack.push(depth);
                depth += 1;
                ctx.push(' ');
                text = false;
            } else {
                i += 1;
            }
            continue;
        }
        let n = at(i + 1);
        if c == '\n' {
            line += 1;
            ctx.clear();
            i += 1;
            continue;
        }
        if c == '/' && n == Some('/') {
            let mut j = i;
            while j < e && !matches!(ch[j], '\n' | '\r' | '\u{2028}' | '\u{2029}') {
                j += 1;
            }
            let txt: String = ch[i..j].iter().collect();
            if dir_raw(&txt).is_some() || dir_low(&txt).is_some() {
                record(&mut hits, "@ts-ignore", line);
            }
            i = j;
            continue;
        }
        if c == '/' && n == Some('*') {
            let mut k = i + 2;
            let mut end = e;
            while k + 1 < e {
                if ch[k] == '*' && ch[k + 1] == '/' {
                    end = k + 2;
                    break;
                }
                k += 1;
            }
            let raw: String = ch[i..end].iter().collect();
            let low = raw.to_lowercase();
            let p = dir_raw(&raw);
            let q = dir_idx(&low);
            if p.is_some() || q.is_some() {
                let atx = p.unwrap_or(0).max(q.unwrap_or(0));
                let base = if p.is_some() { &raw } else { &low };
                let mut units = 0usize;
                let mut lf = 0usize;
                for b in base.chars() {
                    if units >= atx {
                        break;
                    }
                    if b == '\n' {
                        lf += 1;
                    }
                    units += b.len_utf16();
                }
                record(&mut hits, "@ts-ignore", line + lf);
            }
            let cnt = raw.chars().filter(|&x| x == '\n').count();
            line += cnt;
            if cnt >= 1 {
                ctx.clear();
            }
            ctx.push(' ');
            i = end;
            continue;
        }
        if c == '"' || c == '\'' {
            let mut j = i + 1;
            while j < e {
                let d = ch[j];
                if d == '\\' {
                    if at(j + 1) == Some('\r') && at(j + 2) == Some('\n') {
                        j += 3;
                        line += 1;
                    } else if j + 1 < e {
                        if ch[j + 1] == '\n' {
                            line += 1;
                        }
                        j += 2;
                    } else {
                        j += 1;
                    }
                } else if d == c {
                    j += 1;
                    break;
                } else if d == '\n' {
                    break;
                } else {
                    j += 1;
                }
            }
            ctx.push('"');
            i = j;
            continue;
        }
        if c == '`' {
            i += 1;
            text = true;
            continue;
        }
        if c == '/' {
            let tl = trim_end_ws(&ctx);
            let t = &ctx[..tl];
            let empty = tl == 0;
            let punct = tl > 0 && "(,=:[!&|?{};+-*%<>~^".contains(t[tl - 1]);
            let mut kw = false;
            if tl > 0 {
                for w in REGEX_KW.iter().take(13) {
                    if ends_with(t, w) {
                        let wl = w.chars().count();
                        if tl == wl || !is_ident(t[tl - wl - 1]) {
                            kw = true;
                        }
                    }
                }
            }
            let incdec = ends_with(t, "++") || ends_with(t, "--");
            if (empty || punct || kw) && !incdec {
                let guessed = empty || kw;
                let mut j = i + 1;
                let mut cls = false;
                let mut found = false;
                while j < e {
                    let d = ch[j];
                    if d == '\\' {
                        j += 2;
                    } else if d == '[' {
                        cls = true;
                        j += 1;
                    } else if d == ']' {
                        cls = false;
                        j += 1;
                    } else if d == '/' && !cls {
                        found = true;
                        break;
                    } else if d == '\n' {
                        break;
                    } else {
                        j += 1;
                    }
                }
                if found {
                    if guessed {
                        let r = scan(ch, i + 1, e, memo);
                        for (l, ln) in r {
                            record(&mut hits, &l, line + ln - 1);
                        }
                    }
                    let r = scan(ch, i + 1, j, memo);
                    for (l, _) in r {
                        record(&mut hits, &l, line);
                    }
                    let mut k = j + 1;
                    while k < e && ch[k].is_ascii_alphabetic() {
                        k += 1;
                    }
                    ctx.push(' ');
                    i = k;
                    continue;
                }
            }
            ctx.push(c);
            i += 1;
            continue;
        }
        if c == '{' {
            depth += 1;
            ctx.push(c);
            i += 1;
            continue;
        }
        if c == '}' {
            if let Some(&top) = stack.last() {
                if top == depth - 1 {
                    stack.pop();
                    depth -= 1;
                    i += 1;
                    text = true;
                    continue;
                }
            }
            depth -= 1;
            ctx.push(c);
            i += 1;
            continue;
        }
        if is_word_char(c) {
            let mut j = i;
            while j < e && is_word_char(ch[j]) {
                j += 1;
            }
            let word: String = ch[i..j].iter().collect();
            if word == "any" {
                let tl = trim_end_ws(&ctx);
                let t = &ctx[..tl];
                let member = tl > 0 && t[tl - 1] == '.' && !(tl > 1 && t[tl - 2] == '.');
                let mut key = false;
                {
                    let mut k = j;
                    while k < e && is_key_blank(ch[k]) {
                        k += 1;
                    }
                    if k < e && (ch[k] == '!' || ch[k] == '?') {
                        k += 1;
                    }
                    if k < e && ch[k] == ':' {
                        key = tl == 0 || matches!(t[tl - 1], '{' | '(' | ',' | ';');
                    }
                }
                if !member && !key {
                    let label = if ends_with(t, "as") && (tl == 2 || !is_word(t[tl - 3])) {
                        "as any"
                    } else if tl > 0 && t[tl - 1] == '<' && {
                        let mut k = j;
                        while k < e && is_ws(ch[k]) {
                            k += 1;
                        }
                        k < e && ch[k] == '>'
                    } {
                        "<any>"
                    } else if tl > 0 && t[tl - 1] == ':' {
                        ": any"
                    } else {
                        "any"
                    };
                    record(&mut hits, label, line);
                }
            }
            ctx.extend(ch[i..j].iter());
            i = j;
            continue;
        }
        if c == '!' && n != Some('=') {
            let mut bl = ctx.len();
            while bl > 0 && (ctx[bl - 1] == ' ' || ctx[bl - 1] == '\t') {
                bl -= 1;
            }
            let b = &ctx[..bl];
            if bl > 0 && is_operand_end(b[bl - 1]) {
                let mut rs = bl;
                while rs > 0 && is_ident(b[rs - 1]) {
                    rs -= 1;
                }
                let run: String = b[rs..].iter().collect();
                let pre = PREFIX_KW.contains(&run.as_str()) || PREFIX_KW2.contains(&run.as_str());
                if !pre {
                    record(&mut hits, "non-null assertion", line);
                }
            }
        }
        ctx.push(c);
        i += 1;
    }
    hits.sort_by_key(|h| h.1);
    memo.insert((s, e), hits.clone());
    hits
}

pub fn any_ban_hits(src: &str) -> Vec<String> {
    let ch: Vec<char> = src.chars().collect();
    let mut memo: Memo = HashMap::new();
    scan(&ch, 0, ch.len(), &mut memo)
        .into_iter()
        .map(|(l, n)| format!("{}@{}", l, n))
        .collect()
}
