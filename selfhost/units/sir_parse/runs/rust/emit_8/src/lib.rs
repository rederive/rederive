use serde_json::{Map, Value};

fn sp(c: char) -> bool {
    c == ' ' || c == '\t'
}

fn trim(s: &[char]) -> &[char] {
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

fn is_glue(c: char) -> bool {
    let u = c as u32;
    matches!(u,
        0xa..=0xd | 0x85 | 0xa0 | 0x1680 | 0x2000..=0x200a | 0x2028 | 0x2029 | 0x202f | 0x205f | 0x3000
        | 0xad | 0x600..=0x605 | 0x61c | 0x6dd | 0x70f | 0x890 | 0x891 | 0x8e2 | 0x180e
        | 0x200b..=0x200f | 0x202a..=0x202e | 0x2060..=0x2064 | 0x2066..=0x206f | 0xfeff
        | 0xfff9..=0xfffb | 0x110bd | 0x110cd | 0x13430..=0x1343f | 0x1bca0..=0x1bca3
        | 0x1d173..=0x1d17a | 0xe0001 | 0xe0020..=0xe007f)
}

fn opener_prev(c: char) -> bool {
    matches!(c, ' ' | '\t' | '(' | '[' | '{' | ',' | '=' | ':' | ';' | '|' | '<' | '>' | '!' | '&' | '-' | '~')
}

fn spans(t: &[char]) -> Vec<(usize, usize)> {
    let n = t.len();
    let mut out = Vec::new();
    let mut last_close: Option<usize> = None;
    let mut i = 0;
    while i < n {
        if t[i] == '"' {
            let opener = i == 0 || opener_prev(t[i - 1]) || last_close.map_or(false, |c| c + 1 == i);
            if opener {
                let mut j = i + 1;
                let mut close = None;
                while j < n {
                    if t[j] == '\\' {
                        j += 2;
                    } else if t[j] == '"' {
                        close = Some(j);
                        break;
                    } else {
                        j += 1;
                    }
                }
                if let Some(c) = close {
                    out.push((i, c));
                    last_close = Some(c);
                    i = c + 1;
                    continue;
                }
            }
        }
        i += 1;
    }
    out
}

fn inside(sp_: &[(usize, usize)], p: usize) -> bool {
    sp_.iter().any(|&(a, b)| a < p && p < b)
}

fn attrs(t: &[char]) -> (String, Vec<(String, String)>) {
    let n = t.len();
    let sps = spans(t);
    let kws = ["CITED", "EARNED", "ANCHOR"];
    let mut groups: Vec<(usize, usize, &str)> = Vec::new();
    let mut i = 0;
    while i < n {
        if sp(t[i]) {
            let mut j = i;
            while j < n && sp(t[j]) {
                j += 1;
            }
            let mut found = false;
            for kw in kws.iter() {
                let k: Vec<char> = kw.chars().collect();
                if t[j..].starts_with(&k) && (j + k.len() == n || sp(t[j + k.len()])) {
                    if !inside(&sps, j) {
                        groups.push((i, j + k.len(), kw));
                    }
                    i = j + k.len();
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
    if groups.is_empty() {
        return (st(trim(t)), Vec::new());
    }
    let body = st(trim(&t[..groups[0].0]));
    let mut list = Vec::new();
    for (gi, g) in groups.iter().enumerate() {
        let end = if gi + 1 < groups.len() { groups[gi + 1].0 } else { n };
        list.push((g.2.to_string(), st(trim(&t[g.1..end]))));
    }
    (body, list)
}

struct Node {
    name: String,
    args: String,
    attrs: Map<String, Value>,
    attr_list: Vec<(String, String)>,
    cont: Vec<String>,
    comments: Vec<String>,
    line: usize,
    register: Option<&'static str>,
    kind: &'static str,
    body: Option<String>,
}

impl Node {
    fn store(&mut self, k: &str, v: &str) {
        self.attr_list.push((k.to_string(), v.to_string()));
        let vals: Vec<&str> = self
            .attr_list
            .iter()
            .filter(|(kk, vv)| kk == k && !vv.is_empty())
            .map(|(_, vv)| vv.as_str())
            .collect();
        self.attrs.insert(k.to_string(), Value::from(vals.join("; ")));
    }
    fn to_value(&self) -> Value {
        let mut m = Map::new();
        m.insert("directive".into(), Value::from(self.name.clone()));
        m.insert("name".into(), Value::from(self.name.clone()));
        m.insert("args".into(), Value::from(self.args.clone()));
        m.insert("attrs".into(), Value::Object(self.attrs.clone()));
        m.insert(
            "attrList".into(),
            Value::Array(
                self.attr_list
                    .iter()
                    .map(|(k, v)| Value::Array(vec![Value::from(k.clone()), Value::from(v.clone())]))
                    .collect(),
            ),
        );
        m.insert("cont".into(), Value::from(self.cont.clone()));
        m.insert("comments".into(), Value::from(self.comments.clone()));
        m.insert("line".into(), Value::from(self.line as u64));
        m.insert("register".into(), self.register.map_or(Value::Null, Value::from));
        m.insert("kind".into(), Value::from(self.kind));
        if let Some(b) = &self.body {
            m.insert("body".into(), Value::from(b.clone()));
        }
        Value::Object(m)
    }
}

fn shaped(s: &[char]) -> bool {
    !s.is_empty()
        && s[0].is_ascii_uppercase()
        && s[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn registry(name: &str) -> (Option<&'static str>, &'static str) {
    let b = ["UNIT", "SIG", "ENVELOPE", "DEPENDS-ON", "PINNED", "EARNED", "CARRIED"];
    let bpr = ["DESCRIPTION", "NOTE", "RATIONALE", "PROVENANCE"];
    let plb = [
        "KIND", "FIDELITY", "ANCHOR", "SRC", "TRIGGER", "REACH", "ORACLE-CLASS", "TRACE-SEAM", "SEAM", "BEHAVIOR",
        "TABLE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "ORACLE", "SHAPE", "CANONICAL-SHA256", "AUTHORITY",
        "STATE", "EMIT", "REQUEST", "BRANCH", "ON-ERROR", "PAR", "RING", "LIFECYCLE", "EFFECT", "SURFACE",
    ];
    let ppr = ["INVARIANT", "SCOPE"];
    let pleg = ["SIR", "VARIANT", "CARRIED-DATA", "NOTES", "GUARD-PINNED"];
    let llb = ["LANG", "PRIMARY-SHA256", "ABI", "MECHANISM"];
    if b.contains(&name) {
        return (Some("B"), "lb");
    }
    if bpr.contains(&name) {
        return (Some("B"), "pr");
    }
    if plb.contains(&name) || (name.len() >= 2 && name.starts_with('R') && name[1..].bytes().all(|c| c.is_ascii_digit())) {
        return (Some("P"), "lb");
    }
    if ppr.contains(&name) {
        return (Some("P"), "pr");
    }
    if pleg.contains(&name) {
        return (Some("P"), "legacy");
    }
    if llb.contains(&name) {
        return (Some("L"), "lb");
    }
    (None, "unknown")
}

fn diag(line: usize, code: &str, msg: Option<String>) -> Value {
    let mut m = Map::new();
    m.insert("line".into(), Value::from(line as u64));
    m.insert("code".into(), Value::from(code));
    if let Some(s) = msg {
        m.insert("msg".into(), Value::from(s));
    }
    Value::Object(m)
}

fn hex(c: char) -> String {
    format!("U+{:04X}", c as u32)
}

fn word_end(code: &[char], s: usize) -> usize {
    let mut e = s + 1;
    while e < code.len() && (code[e].is_ascii_uppercase() || code[e].is_ascii_digit() || code[e] == '-') {
        e += 1;
    }
    e
}

fn name_sep(code: &[char]) -> Option<String> {
    if code.is_empty() {
        return None;
    }
    if code[0].is_ascii_uppercase() {
        let p = word_end(code, 0);
        let q = if p < code.len() && code[p] == ':' { p + 1 } else { p };
        if q < code.len() && is_glue(code[q]) {
            let g = st(&code[..p]);
            let what = if g == "CITED" { "an attribute" } else { "a directive" };
            return Some(format!("{} is followed by {}, not a space or tab: not {}", g, hex(code[q]), what));
        }
        return None;
    }
    let mut k = 0;
    while k < code.len() && is_glue(code[k]) {
        k += 1;
    }
    if k == 0 || k >= code.len() {
        return None;
    }
    let pre = format!("the line starts with {} (whitespace or an invisible character) before ", hex(code[0]));
    if code[k] == '#' {
        return Some(format!("{}a comment marker: not a comment", pre));
    }
    if code[k].is_ascii_uppercase() {
        let w = word_end(code, k);
        if w == code.len() || sp(code[w]) || code[w] == ':' || is_glue(code[w]) {
            let what = if st(&code[k..w]) == "CITED" { "an attribute" } else { "a directive" };
            return Some(format!("{}a directive-shaped name: not {}", pre, what));
        }
    }
    None
}

fn split_lines(text: &str) -> Vec<Vec<char>> {
    let cs: Vec<char> = text.chars().collect();
    let mut lines = Vec::new();
    let mut cur = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        match cs[i] {
            '\r' => {
                if i + 1 < cs.len() && cs[i + 1] == '\n' {
                    i += 1;
                }
                lines.push(std::mem::take(&mut cur));
            }
            '\n' => lines.push(std::mem::take(&mut cur)),
            c => cur.push(c),
        }
        i += 1;
    }
    lines.push(cur);
    lines
}

fn cut40(code: &[char]) -> String {
    code.iter().take(40).collect()
}

fn continue_(node: &mut Node, code: &[char], comment: &Option<String>) {
    let mut t = vec![' '];
    t.extend_from_slice(code);
    let (body, list) = attrs(&t);
    for (k, v) in list {
        node.store(&k, &v);
    }
    if !body.is_empty() {
        node.cont.push(body);
    }
    if let Some(c) = comment {
        node.comments.push(c.clone());
    }
}

pub fn sir_parse(text: &str) -> Value {
    let mut nodes: Vec<Node> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();
    let mut warnings: Vec<Value> = Vec::new();
    let mut current: Option<usize> = None;

    for (idx, raw) in split_lines(text).iter().enumerate() {
        let ln = idx + 1;
        let mut lead_end = 0;
        while lead_end < raw.len() && (sp(raw[lead_end]) || raw[lead_end] == '\u{feff}') {
            lead_end += 1;
        }
        let mut line: Vec<char> = raw[..lead_end].iter().copied().filter(|c| *c != '\u{feff}').collect();
        line.extend_from_slice(&raw[lead_end..]);
        while line.last().map_or(false, |c| sp(*c)) {
            line.pop();
        }
        if line.is_empty() {
            continue;
        }
        let mut ind = 0;
        while ind < line.len() && sp(line[ind]) {
            ind += 1;
        }
        let content = &line[ind..];

        if content[0] == '#' {
            warnings.push(diag(ln, "W_LEGACY_COMMENT", None));
            if let Some(ci) = current {
                let mut p = 0;
                while p < content.len() && content[p] == '#' {
                    p += 1;
                }
                if p < content.len() && sp(content[p]) {
                    p += 1;
                }
                nodes[ci].comments.push(st(&content[p..]));
            } else {
                let s = st(content);
                nodes.push(Node {
                    name: "#".into(),
                    args: String::new(),
                    attrs: Map::new(),
                    attr_list: Vec::new(),
                    cont: Vec::new(),
                    comments: vec![s.clone()],
                    line: ln,
                    register: None,
                    kind: "comment",
                    body: Some(s),
                });
            }
            continue;
        }

        let sps = spans(content);
        let mut marker = None;
        for p in 1..content.len() {
            if content[p] == '#'
                && sp(content[p - 1])
                && (p + 1 == content.len() || sp(content[p + 1]))
                && !inside(&sps, p)
            {
                marker = Some(p);
                break;
            }
        }
        let (code, comment): (&[char], Option<String>) = match marker {
            Some(p) => {
                warnings.push(diag(ln, "W_LEGACY_TRAILING_COMMENT", None));
                let mut e = p;
                while e > 0 && sp(content[e - 1]) {
                    e -= 1;
                }
                (&content[..e], Some(st(trim(&content[p + 1..]))))
            }
            None => (content, None),
        };

        if ind == 0 {
            let ne = code.iter().position(|c| sp(*c)).unwrap_or(code.len());
            let mut name: Vec<char> = code[..ne].to_vec();
            let rest = &code[ne..];
            if name.len() >= 2 && *name.last().unwrap() == ':' {
                let before = &name[..name.len() - 1];
                if shaped(before) && st(before) != "CITED" {
                    let nm = st(before);
                    warnings.push(diag(ln, "W_LEGACY_COLON", Some(nm)));
                    name.pop();
                }
            }
            let ns = st(&name);
            if shaped(&name) && ns != "CITED" {
                let (reg, kind) = registry(&ns);
                if reg.is_none() {
                    warnings.push(diag(ln, "W_UNKNOWN_DIRECTIVE", Some(ns.clone())));
                }
                let (body, list) = attrs(rest);
                let mut node = Node {
                    name: ns,
                    args: body,
                    attrs: Map::new(),
                    attr_list: Vec::new(),
                    cont: Vec::new(),
                    comments: comment.into_iter().collect(),
                    line: ln,
                    register: reg,
                    kind,
                    body: None,
                };
                for (k, v) in list {
                    node.store(&k, &v);
                }
                nodes.push(node);
                current = Some(nodes.len() - 1);
                continue;
            }
            if let Some(m) = name_sep(code) {
                warnings.push(diag(ln, "W_NAME_SEPARATOR", Some(m)));
            }
            match current {
                Some(ci) => {
                    continue_(&mut nodes[ci], code, &comment);
                    warnings.push(diag(ln, "W_UNINDENTED_CONTINUATION", None));
                }
                None => errors.push(diag(ln, "E_NO_DIRECTIVE", Some(cut40(code)))),
            }
        } else {
            match current {
                Some(ci) => continue_(&mut nodes[ci], code, &comment),
                None => errors.push(diag(ln, "E_ORPHAN_CONTINUATION", Some(cut40(code)))),
            }
        }
    }

    let mut out = Map::new();
    out.insert("ast".into(), Value::Array(nodes.iter().map(|n| n.to_value()).collect()));
    out.insert("errors".into(), Value::Array(errors));
    out.insert("warnings".into(), Value::Array(warnings));
    Value::Object(out)
}
