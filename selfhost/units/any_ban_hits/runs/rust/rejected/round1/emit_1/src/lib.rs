use std::collections::HashMap;

type Hits = Vec<(String, usize)>;

fn is_ws(c: char) -> bool {
    matches!(c as u32, 9..=13 | 0x20 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000 | 0xfeff)
}
fn is_ident(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}
fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn is_word_char(c: char) -> bool {
    is_ident(c) || ((c as u32) >= 0x80 && !is_ws(c) && c != '\u{85}' && c != '\u{200b}')
}
fn is_operand_end(c: char) -> bool {
    is_ident(c) || c == ')' || c == ']' || c == '"' || (c as u32) >= 0x80
}
fn key_ws(c: char) -> bool {
    (is_ws(c) && !matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')) || c == '\u{85}' || c == '\u{200b}'
}

const PREFIX: [&str; 14] = [
    "return", "typeof", "void", "in", "of", "case", "delete", "await", "yield", "throw", "else", "do", "instanceof", "new",
];
const KW: [&str; 12] = [
    "return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "throw", "delete",
];
const DIRS: [&str; 3] = ["@ts-ignore", "@ts-expect-error", "@ts-nocheck"];

fn record(h: &mut Hits, label: &str, line: usize) {
    if !h.iter().any(|(l, n)| l == label && *n == line) {
        h.push((label.to_string(), line));
    }
}

fn trim_ws(ctx: &[char]) -> &[char] {
    let mut e = ctx.len();
    while e > 0 && is_ws(ctx[e - 1]) {
        e -= 1;
    }
    &ctx[..e]
}

fn ends_with(t: &[char], s: &str) -> bool {
    let sc: Vec<char> = s.chars().collect();
    t.len() >= sc.len() && t[t.len() - sc.len()..] == sc[..]
}

fn dir_index(units: &[u16]) -> Option<usize> {
    let low: Vec<u16> = units
        .iter()
        .map(|&u| if (65..=90).contains(&u) { u + 32 } else { u })
        .collect();
    let mut best: Option<usize> = None;
    for d in DIRS.iter() {
        let p: Vec<u16> = d.encode_utf16().collect();
        if low.len() >= p.len() {
            for k in 0..=(low.len() - p.len()) {
                if low[k..k + p.len()] == p[..] {
                    best = Some(best.map_or(k, |b| b.min(k)));
                    break;
                }
            }
        }
    }
    best
}

struct Lexer {
    all: Vec<char>,
    memo: HashMap<(usize, usize), Hits>,
}

impl Lexer {
    fn rest(&mut self, lo: usize, hi: usize) -> Hits {
        if let Some(r) = self.memo.get(&(lo, hi)) {
            return r.clone();
        }
        let r = self.scan(lo, hi);
        self.memo.insert((lo, hi), r.clone());
        r
    }

    fn scan(&mut self, lo: usize, hi: usize) -> Hits {
        let mut hits: Hits = Vec::new();
        let mut line = 1usize;
        let mut ctx: Vec<char> = Vec::new();
        let mut depth: i64 = 0;
        let mut stack: Vec<i64> = Vec::new();
        let mut text = false;
        let mut i = lo;
        while i < hi {
            let c = self.all[i];
            let at = |all: &Vec<char>, j: usize| -> Option<char> { if j < hi { Some(all[j]) } else { None } };
            if text {
                if c == '\\' {
                    if at(&self.all, i + 1) == Some('\n') {
                        line += 1;
                    }
                    i += 2;
                } else if c == '\n' {
                    line += 1;
                    ctx.clear();
                    i += 1;
                } else if c == '`' {
                    ctx.push('`');
                    text = false;
                    i += 1;
                } else if c == '$' && at(&self.all, i + 1) == Some('{') {
                    stack.push(depth);
                    depth += 1;
                    ctx.push(' ');
                    text = false;
                    i += 2;
                } else {
                    i += 1;
                }
                continue;
            }
            let next = at(&self.all, i + 1);
            if c == '\n' {
                line += 1;
                ctx.clear();
                i += 1;
                continue;
            }
            if c == '/' && next == Some('/') {
                let mut j = i;
                while j < hi && !matches!(self.all[j], '\n' | '\r' | '\u{2028}' | '\u{2029}') {
                    j += 1;
                }
                let s: String = self.all[i..j].iter().collect();
                if DIRS.iter().any(|d| s.to_ascii_lowercase().contains(d))
                    || DIRS.iter().any(|d| s.to_lowercase().contains(d))
                {
                    record(&mut hits, "@ts-ignore", line);
                }
                i = j;
                continue;
            }
            if c == '/' && next == Some('*') {
                let mut end = hi;
                let mut j = i + 2;
                while j + 1 < hi {
                    if self.all[j] == '*' && self.all[j + 1] == '/' {
                        end = j + 2;
                        break;
                    }
                    j += 1;
                }
                let raw: String = self.all[i..end].iter().collect();
                let low = raw.to_lowercase();
                let ru: Vec<u16> = raw.encode_utf16().collect();
                let lu: Vec<u16> = low.encode_utf16().collect();
                let p = dir_index(&ru);
                let q = dir_index(&lu);
                if p.is_some() || q.is_some() {
                    let at_i = p.unwrap_or(0).max(q.unwrap_or(0));
                    let base = if p.is_some() { &ru } else { &lu };
                    let n = at_i.min(base.len());
                    let l = line + base[..n].iter().filter(|&&u| u == 10).count();
                    record(&mut hits, "@ts-ignore", l);
                }
                let lf = self.all[i..end].iter().filter(|&&x| x == '\n').count();
                line += lf;
                if lf > 0 {
                    ctx.clear();
                }
                ctx.push(' ');
                i = end;
                continue;
            }
            if c == '"' || c == '\'' {
                let mut j = i + 1;
                while j < hi {
                    let d = self.all[j];
                    if d == '\\' {
                        if at(&self.all, j + 1) == Some('\r') && at(&self.all, j + 2) == Some('\n') {
                            j += 3;
                            line += 1;
                        } else if let Some(c2) = at(&self.all, j + 1) {
                            j += 2;
                            if c2 == '\n' {
                                line += 1;
                            }
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
                i = j.min(hi);
                continue;
            }
            if c == '`' {
                text = true;
                i += 1;
                continue;
            }
            if c == '/' {
                let t = trim_ws(&ctx);
                let mut kind = 0;
                if !(ends_with(t, "++") || ends_with(t, "--")) {
                    if t.is_empty() {
                        kind = 1;
                    } else if "(,=:[!&|?{};+-*%<>~^".contains(t[t.len() - 1]) {
                        kind = 2;
                    } else {
                        for k in KW.iter() {
                            if ends_with(t, k) {
                                let n = k.len();
                                if t.len() == n || !is_ident(t[t.len() - n - 1]) {
                                    kind = 1;
                                }
                            }
                        }
                    }
                }
                if kind != 0 {
                    let mut j = i + 1;
                    let mut cls = false;
                    let mut close: Option<usize> = None;
                    while j < hi {
                        let d = self.all[j];
                        if d == '\\' {
                            j += 2;
                        } else if d == '[' {
                            cls = true;
                            j += 1;
                        } else if d == ']' {
                            cls = false;
                            j += 1;
                        } else if d == '/' && !cls {
                            close = Some(j);
                            break;
                        } else if d == '\n' {
                            break;
                        } else {
                            j += 1;
                        }
                    }
                    if let Some(k) = close {
                        if kind == 1 {
                            let r = self.rest(i + 1, hi);
                            for (l, ln) in r {
                                record(&mut hits, &l, line + ln - 1);
                            }
                        }
                        let b = self.scan(i + 1, k);
                        for (l, _) in b {
                            record(&mut hits, &l, line);
                        }
                        i = k + 1;
                        while i < hi && self.all[i].is_ascii_alphabetic() {
                            i += 1;
                        }
                        ctx.push(' ');
                        continue;
                    }
                }
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
                        text = true;
                        i += 1;
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
                while j < hi && is_word_char(self.all[j]) {
                    j += 1;
                }
                let is_any = j - i == 3 && self.all[i..j].iter().collect::<String>() == "any";
                if is_any {
                    let t = trim_ws(&ctx);
                    let member = !t.is_empty() && t[t.len() - 1] == '.' && !(t.len() >= 2 && t[t.len() - 2] == '.');
                    let mut k = j;
                    while k < hi && key_ws(self.all[k]) {
                        k += 1;
                    }
                    if k < hi && (self.all[k] == '!' || self.all[k] == '?') {
                        k += 1;
                    }
                    let key = k < hi
                        && self.all[k] == ':'
                        && (t.is_empty() || "{(,;".contains(t[t.len() - 1]));
                    if !member && !key {
                        let label = if ends_with(t, "as") && (t.len() == 2 || !is_word(t[t.len() - 3])) {
                            "as any"
                        } else if !t.is_empty() && t[t.len() - 1] == '<' && {
                            let mut m = j;
                            while m < hi && is_ws(self.all[m]) {
                                m += 1;
                            }
                            m < hi && self.all[m] == '>'
                        } {
                            "<any>"
                        } else if !t.is_empty() && t[t.len() - 1] == ':' {
                            ": any"
                        } else {
                            "any"
                        };
                        record(&mut hits, label, line);
                    }
                }
                let w: Vec<char> = self.all[i..j].to_vec();
                ctx.extend(w);
                i = j;
                continue;
            }
            if c == '!' && next != Some('=') {
                let mut e = ctx.len();
                while e > 0 && (ctx[e - 1] == ' ' || ctx[e - 1] == '\t') {
                    e -= 1;
                }
                let b = &ctx[..e];
                if !b.is_empty() && is_operand_end(b[b.len() - 1]) {
                    let mut s = b.len();
                    while s > 0 && is_ident(b[s - 1]) {
                        s -= 1;
                    }
                    let run: String = b[s..].iter().collect();
                    if !PREFIX.contains(&run.as_str()) {
                        record(&mut hits, "non-null assertion", line);
                    }
                }
            }
            ctx.push(c);
            i += 1;
        }
        hits.sort_by_key(|h| h.1);
        hits
    }
}

pub fn any_ban_hits(src: &str) -> Vec<String> {
    let all: Vec<char> = src.chars().collect();
    let n = all.len();
    let mut lx = Lexer { all, memo: HashMap::new() };
    lx.scan(0, n).into_iter().map(|(l, n)| format!("{}@{}", l, n)).collect()
}
