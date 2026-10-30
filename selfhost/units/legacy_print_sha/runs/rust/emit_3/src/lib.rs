const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256_hex(data: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let mut m = data.to_vec();
    m.push(0x80);
    while m.len() % 64 != 56 {
        m.push(0);
    }
    m.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for chunk in m.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[4 * i], chunk[4 * i + 1], chunk[4 * i + 2], chunk[4 * i + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let mj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(mj);
            v[7] = v[6];
            v[6] = v[5];
            v[5] = v[4];
            v[4] = v[3].wrapping_add(t1);
            v[3] = v[2];
            v[2] = v[1];
            v[1] = v[0];
            v[0] = t1.wrapping_add(t2);
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    h.iter().map(|x| format!("{:08x}", x)).collect()
}

fn is_ws(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}'
            | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}

fn is_lt(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

fn trim_ws(s: &[char]) -> &[char] {
    let mut a = 0;
    let mut b = s.len();
    while a < b && is_ws(s[a]) {
        a += 1;
    }
    while b > a && is_ws(s[b - 1]) {
        b -= 1;
    }
    &s[a..b]
}

fn collect(s: &[char]) -> String {
    s.iter().collect()
}

const KEYWORDS: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];

fn extract(s: &[char]) -> (String, Vec<(&'static str, String)>) {
    let mut s: &[char] = s;
    let mut a: Vec<(&'static str, String)> = Vec::new();
    loop {
        let mut found: Option<(usize, &'static str, usize)> = None;
        'scan: for p in 1..s.len() {
            if !is_ws(s[p - 1]) {
                continue;
            }
            for kw in KEYWORDS.iter() {
                let kc: Vec<char> = kw.chars().collect();
                if s.len() >= p + kc.len() && s[p..p + kc.len()] == kc[..] {
                    let r = &s[p + kc.len()..];
                    let mut ok = false;
                    if !r.is_empty() && is_ws(r[0]) {
                        for j in 1..r.len() {
                            if !is_ws(r[j - 1]) {
                                break;
                            }
                            if !r[j..].iter().any(|&c| is_lt(c)) {
                                ok = true;
                                break;
                            }
                        }
                    }
                    if ok {
                        found = Some((p, kw, kc.len()));
                        break 'scan;
                    }
                }
            }
        }
        let (p, kw, kl) = match found {
            Some(f) => f,
            None => break,
        };
        let value = collect(trim_ws(&s[p + kl..]));
        if let Some(e) = a.iter_mut().find(|e| e.0 == kw) {
            if !e.1.is_empty() {
                e.1 = format!("{} {}", e.1, value);
            } else {
                e.1 = value;
            }
        } else {
            a.push((kw, value));
        }
        let mut start = p;
        while start > 0 && is_ws(s[start - 1]) {
            start -= 1;
        }
        s = &s[..start];
    }
    (collect(trim_ws(s)), a)
}

struct Directive {
    name: String,
    args: String,
    attrs: Vec<(&'static str, String)>,
    conts: Vec<String>,
}

fn valid_name(n: &[char]) -> bool {
    !n.is_empty() && n[0].is_ascii_uppercase() && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

pub fn legacy_print_sha(text: &str) -> String {
    let mut dirs: Vec<Directive> = Vec::new();
    for raw in text.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        let chars: Vec<char> = line.chars().collect();
        if chars.iter().all(|&c| is_ws(c)) {
            continue;
        }
        let ind = chars.iter().take_while(|&&c| c == ' ' || c == '\t').count();
        let content = &chars[ind..];
        if content[0] == '#' {
            continue;
        }
        let lts: Vec<usize> = (0..content.len()).filter(|&i| is_lt(content[i])).collect();
        let mut code: &[char] = content;
        for k in 1..content.len() {
            if content[k] == '#'
                && is_ws(content[k - 1])
                && (k + 1 == content.len() || is_ws(content[k + 1]))
                && lts.iter().all(|&i| i == k - 1)
            {
                let mut e = k - 1;
                while e > 0 && is_ws(content[e - 1]) {
                    e -= 1;
                }
                code = &content[..e];
                break;
            }
        }
        if ind == 0 {
            let nl = code.iter().take_while(|&&c| !is_ws(c)).count();
            let mut started = false;
            if nl > 0 {
                let mut name: Vec<char> = code[..nl].to_vec();
                let mut t = nl;
                while t < code.len() && is_ws(code[t]) {
                    t += 1;
                }
                let tail = &code[t..];
                if !tail.iter().any(|&c| is_lt(c)) {
                    if name.len() >= 2 && *name.last().unwrap() == ':' && valid_name(&name[..name.len() - 1]) {
                        name.pop();
                    }
                    if valid_name(&name) {
                        let (body, a) = extract(tail);
                        dirs.push(Directive { name: collect(&name), args: body, attrs: a, conts: Vec::new() });
                        started = true;
                    }
                }
            }
            if !started {
                if let Some(d) = dirs.last_mut() {
                    d.conts.push(collect(code));
                }
            }
        } else if let Some(d) = dirs.last_mut() {
            let (body, a) = extract(code);
            d.conts.push(body);
            for (k, v) in a {
                if let Some(e) = d.attrs.iter_mut().find(|e| e.0 == k) {
                    e.1 = v;
                } else {
                    d.attrs.push((k, v));
                }
            }
        }
    }
    let mut p = String::new();
    if dirs.is_empty() {
        p.push('\n');
    }
    for d in &dirs {
        p.push_str(&d.name);
        if !d.args.is_empty() {
            p.push(' ');
            p.push_str(&d.args);
        }
        for (k, v) in &d.attrs {
            p.push(' ');
            p.push_str(k);
            p.push(' ');
            p.push_str(v);
        }
        p.push('\n');
        for c in &d.conts {
            p.push_str("  ");
            p.push_str(c);
            p.push('\n');
        }
    }
    sha256_hex(p.as_bytes())
}
