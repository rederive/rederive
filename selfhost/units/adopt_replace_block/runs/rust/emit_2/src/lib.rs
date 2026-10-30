const HEADER: &str = "## Project rules (kept by `rdv init --adopt` \u{2014} review and merge)";

fn is_ws(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{d}' | '\u{20}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn is_cf(c: char) -> bool {
    matches!(c, '\u{ad}' | '\u{600}'..='\u{605}' | '\u{61c}' | '\u{6dd}' | '\u{70f}'
        | '\u{890}'..='\u{891}' | '\u{8e2}' | '\u{180e}' | '\u{200b}'..='\u{200f}'
        | '\u{202a}'..='\u{202e}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{206f}'
        | '\u{feff}' | '\u{fff9}'..='\u{fffb}' | '\u{110bd}' | '\u{110cd}'
        | '\u{13430}'..='\u{1343f}' | '\u{1bca0}'..='\u{1bca3}' | '\u{1d173}'..='\u{1d17a}'
        | '\u{e0001}' | '\u{e0020}'..='\u{e007f}')
}

fn visible(s: &str) -> bool {
    s.chars().any(|c| !is_ws(c) && !is_cf(c))
}

fn blank(s: &str) -> bool {
    s.chars().all(|c| c == ' ' || c == '\t' || c == '\r')
}

fn convert(s: &str, eol: &str) -> String {
    let mut out = String::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\r' {
            if it.peek() == Some(&'\n') {
                it.next();
            }
            out.push_str(eol);
        } else if c == '\n' {
            out.push_str(eol);
        } else {
            out.push(c);
        }
    }
    out
}

pub fn adopt_replace_block(existing: &str, block: (&str, i64, i64), managed: &str, kept: &[&str]) -> String {
    let lines: Vec<&str> = existing.split('\n').collect();
    let n = lines.len() as i64;
    let (s, e) = (block.1, block.2);
    if !(0 <= s && s < e && e <= n) {
        panic!("adopt: block lines not a range");
    }
    if !visible(managed) {
        panic!("adopt: the managed section is empty");
    }
    let (s, e, n) = (s as usize, e as usize, n as usize);
    let mut starts = Vec::with_capacity(n);
    let mut off = 0usize;
    for l in &lines {
        starts.push(off);
        off += l.len() + 1;
    }
    let outside: Vec<usize> = (0..s).chain(e..n).collect();
    let mut crlf = false;
    if outside.len() > 1 {
        for &i in &outside[..outside.len() - 1] {
            if lines[i].ends_with('\r') {
                crlf = true;
                break;
            }
        }
    }
    let eol = if crlf { "\r\n" } else { "\n" };

    let mut before = String::new();
    if let Some(p) = (0..s).rev().find(|&i| !blank(lines[i])) {
        let mut end = starts[p] + lines[p].len();
        if crlf && lines[p].ends_with('\r') {
            end -= 1;
        }
        before = existing[..end].to_string();
    }
    let mut after = String::new();
    if let Some(q) = (e..n).find(|&i| !blank(lines[i])) {
        after = existing[starts[q]..].to_string();
    }

    let managed_s = convert(managed.trim_matches(is_ws), eol);
    let rules: Vec<String> = kept
        .iter()
        .filter(|k| visible(k))
        .map(|k| convert(k.trim_end_matches(['\r', '\n']), eol))
        .collect();
    let mut rules_s = String::new();
    if !rules.is_empty() {
        let sep = format!("{eol}{eol}");
        rules_s = format!("{HEADER}{sep}{}", rules.join(&sep));
    }

    let after_empty = after.is_empty();
    let parts: Vec<String> = [before, managed_s, rules_s, after]
        .into_iter()
        .filter(|p| !p.is_empty())
        .collect();
    let mut result = parts.join(&format!("{eol}{eol}"));
    if after_empty {
        result.push_str(eol);
    }
    result
}
