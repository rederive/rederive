use std::collections::HashMap;

type Hits = Vec<(String, usize)>;
type Memo = HashMap<(usize, usize), Hits>;

fn is_ws(c: char) -> bool {
    matches!(c as u32, 0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
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
fn is_break(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}
fn is_key_blank(c: char) -> bool {
    (is_ws(c) && !is_break(c)) || c == '\u{85}' || c == '\u{200B}'
}

fn trim_ws(ctx: &[char]) -> &[char] {
    let mut n = ctx.len();
    while n > 0 && is_ws(ctx[n - 1]) {
        n -= 1;
    }
    &ctx[..n]
}

fn dir_idx(s: &str) -> Option<usize> {
    let l = s.to_ascii_lowercase();
    let mut best: Option<usize> = None;
    for n in ["@ts-ignore", "@ts-expect-error", "@ts-nocheck"] {
        if let Some(b) = l.find(n) {
            best = Some(match best {
                Some(x) if x <= b => x,
                _ => b,
            });
        }
    }
    best.map(|b| s[..b].chars().map(|c| c.len_utf16()).sum())
}

fn prefix_kw(w: &[char]) -> bool {
    let s: String = w.iter().collect();
    matches!(
        s.as_str(),
        "return" | "typeof" | "void" | "in" | "of" | "case" | "delete" | "await" | "yield" | "throw" | "else" | "do" | "instanceof" | "new" | "extends"
    )
}

fn ends_with(t: &[char], s: &str) -> bool {
    let v: Vec<char> = s.chars().collect();
    t.len() >= v.len() && t[t.len() - v.len()..] == v[..]
}

fn record(hits: &mut Hits, label: &str, line: usize) {
    if !hits.iter().any(|(l, n)| l == label && *n == line) {
        hits.push((label.to_string(), line));
    }
}

fn scan(chars: &[char], s: usize, e: usize, memo: &mut Memo) -> Hits {
    if let Some(h) = memo.get(&(s, e)) {
        return h.clone();
    }
    let at = |k: usize| -> Option<char> { if k < e { Some(chars[k]) } else { None } };
    let mut i = s;
    let mut line = 1usize;
    let mut ctx: Vec<char> = Vec::new();
    let mut depth: i64 = 0;
    let mut stack: Vec<i64> = Vec::new();
    let mut hits: Hits = Vec::new();
    let mut text = false;
    while i < e {
        if text {
            let c = chars[i];
            if c == '\\' {
                if at(i + 1) == Some('\n') {
                    line += 1;
                }
                i = (i + 2).min(e);
            } else if c == '\n' {
                line += 1;
                ctx.clear();
                i += 1;
            } else if c == '`' {
                ctx.push('`');
                i += 1;
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
        let c = chars[i];
        let n = at(i + 1);
        if c == '\n' {
            line += 1;
            ctx.clear();
            i += 1;
            continue;
        }
        if c == '/' && n == Some('/') {
            let mut j = i + 2;
            while j < e && !is_break(chars[j]) {
                j += 1;
            }
            let raw: String = chars[i..j].iter().collect();
            if dir_idx(&raw).is_some() || dir_idx(&raw.to_lowercase()).is_some() {
                record(&mut hits, "@ts-ignore", line);
            }
            i = j;
            continue;
        }
        if c == '/' && n == Some('*') {
            let mut end = e;
            let mut k = i + 2;
            while k + 1 < e {
                if chars[k] == '*' && chars[k + 1] == '/' {
                    end = k + 2;
                    break;
                }
                k += 1;
            }
            let raw: String = chars[i..end].iter().collect();
            let low = raw.to_lowercase();
            let p = dir_idx(&raw);
            let q = dir_idx(&low);
            if p.is_some() || q.is_some() {
                let at_i = p.unwrap_or(0).max(q.unwrap_or(0));
                let base = if p.is_some() { &raw } else { &low };
                let mut units = 0usize;
                let mut cnt = 0usize;
                for ch in base.chars() {
                    if units >= at_i {
                        break;
                    }
                    if ch == '\n' {
                        cnt += 1;
                    }
                    units += ch.len_utf16();
                }
                record(&mut hits, "@ts-ignore", line + cnt);
            }
            let lfs = chars[i..end].iter().filter(|&&x| x == '\n').count();
            line += lfs;
            if lfs > 0 {
                ctx.clear();
            }
            ctx.push(' ');
            i = end;
            continue;
        }
        if c == '"' || c == '\'' {
            let q = c;
            i += 1;
            while i < e {
                let ch = chars[i];
                if ch == '\\' {
                    let n1 = at(i + 1);
                    if n1 == Some('\r') && at(i + 2) == Some('\n') {
                        line += 1;
                        i += 3;
                    } else if n1 == Some('\n') {
                        line += 1;
                        i += 2;
                    } else {
                        i += 2;
                    }
                } else if ch == q {
                    i += 1;
                    break;
                } else if ch == '\n' {
                    break;
                } else {
                    i += 1;
                }
            }
            i = i.min(e);
            ctx.push('"');
            continue;
        }
        if c == '`' {
            i += 1;
            text = true;
            continue;
        }
        if c == '/' {
            let t = trim_ws(&ctx);
            let empty = t.is_empty();
            let punct = !empty && "(,=:[!&|?{};+-*%<>~^".contains(t[t.len() - 1]);
            let mut kw = false;
            if !empty && !punct {
                for k in ["return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "throw", "delete", "new"] {
                    if ends_with(t, k) {
                        let pre = t.len() - k.len();
                        if pre == 0 || !is_ident(t[pre - 1]) {
                            kw = true;
                        }
                    }
                }
            }
            let incdec = ends_with(t, "++") || ends_with(t, "--");
            if (empty || punct || kw) && !incdec {
                let mut j = i + 1;
                let mut cls = false;
                let mut found = false;
                while j < e {
                    let ch = chars[j];
                    if ch == '\\' {
                        j += 2;
                        continue;
                    }
                    if ch == '[' {
                        cls = true;
                    } else if ch == ']' {
                        cls = false;
                    } else if ch == '/' && !cls {
                        found = true;
                        break;
                    } else if ch == '\n' {
                        break;
                    }
                    j += 1;
                }
                if found {
                    if empty || kw {
                        let r = scan(chars, i + 1, e, memo);
                        for (l, ln) in r {
                            record(&mut hits, &l, line + ln - 1);
                        }
                    }
                    let b = scan(chars, i + 1, j, memo);
                    for (l, _) in b {
                        record(&mut hits, &l, line);
                    }
                    i = j + 1;
                    while i < e && chars[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    ctx.push(' ');
                    continue;
                }
            }
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
        if c == '{' {
            depth += 1;
            ctx.push(c);
            i += 1;
            continue;
        }
        if is_word_char(c) {
            let mut j = i;
            while j < e && is_word_char(chars[j]) {
                j += 1;
            }
            if j - i == 3 && chars[i] == 'a' && chars[i + 1] == 'n' && chars[i + 2] == 'y' {
                let t = trim_ws(&ctx);
                let member = t.last() == Some(&'.') && (t.len() == 1 || t[t.len() - 2] != '.');
                let mut key = false;
                {
                    let mut k = j;
                    while k < e && is_key_blank(chars[k]) {
                        k += 1;
                    }
                    if k < e && (chars[k] == '!' || chars[k] == '?') {
                        k += 1;
                    }
                    if k < e && chars[k] == ':' {
                        key = t.is_empty() || matches!(t[t.len() - 1], '{' | '(' | ',' | ';');
                    }
                }
                if !member && !key {
                    let label = if ends_with(t, "as") && (t.len() == 2 || !is_word(t[t.len() - 3])) {
                        "as any"
                    } else if t.last() == Some(&'<') && {
                        let mut k = j;
                        while k < e && is_ws(chars[k]) {
                            k += 1;
                        }
                        k < e && chars[k] == '>'
                    } {
                        "<any>"
                    } else if t.last() == Some(&':') {
                        ": any"
                    } else {
                        "any"
                    };
                    record(&mut hits, label, line);
                }
            }
            ctx.extend_from_slice(&chars[i..j]);
            i = j;
            continue;
        }
        if c == '!' && n != Some('=') {
            let mut m = ctx.len();
            while m > 0 && (ctx[m - 1] == ' ' || ctx[m - 1] == '\t') {
                m -= 1;
            }
            let b = &ctx[..m];
            if m > 0 && is_operand_end(b[m - 1]) {
                let mut st = m;
                while st > 0 && is_ident(b[st - 1]) {
                    st -= 1;
                }
                if !prefix_kw(&b[st..]) {
                    record(&mut hits, "non-null assertion", line);
                }
            }
        }
        ctx.push(c);
        i += 1;
    }
    let mut out = hits;
    out.sort_by_key(|h| h.1);
    memo.insert((s, e), out.clone());
    out
}

pub fn any_ban_hits(src: &str) -> Vec<String> {
    let chars: Vec<char> = src.chars().collect();
    let mut memo = Memo::new();
    scan(&chars, 0, chars.len(), &mut memo)
        .into_iter()
        .map(|(l, n)| format!("{}@{}", l, n))
        .collect()
}
