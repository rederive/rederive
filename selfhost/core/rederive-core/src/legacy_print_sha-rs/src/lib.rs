fn is_ws(c: char) -> bool {
    matches!(c as u32,
        0x9..=0xD | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

fn is_lt(c: char) -> bool {
    matches!(c as u32, 0xA | 0xD | 0x2028 | 0x2029)
}

const KEYS: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];

type Attrs = Vec<(&'static str, String)>;

fn qualifies(r: &[char]) -> bool {
    let len = r.len();
    if len < 2 {
        return false;
    }
    let w = r.iter().take_while(|c| is_ws(**c)).count();
    let m = w.min(len - 1);
    let need = match r.iter().rposition(|c| is_lt(*c)) {
        Some(i) => i + 1,
        None => 1,
    };
    m >= 1 && m >= need
}

fn trim_ws(s: &[char]) -> String {
    let s: String = s.iter().collect();
    s.trim_matches(is_ws).to_string()
}

fn extract(piece: &[char]) -> (String, Attrs) {
    let mut s: Vec<char> = piece.to_vec();
    let mut a: Attrs = Vec::new();
    loop {
        let mut found: Option<(usize, &'static str)> = None;
        'outer: for p in 1..s.len() {
            if !is_ws(s[p - 1]) {
                continue;
            }
            for k in KEYS.iter() {
                let kc: Vec<char> = k.chars().collect();
                if s.len() >= p + kc.len() && s[p..p + kc.len()] == kc[..] && qualifies(&s[p + kc.len()..]) {
                    found = Some((p, k));
                    break 'outer;
                }
            }
        }
        let (p, k) = match found {
            Some(x) => x,
            None => break,
        };
        let value = trim_ws(&s[p + k.len()..]);
        match a.iter_mut().find(|e| e.0 == k) {
            Some(e) => {
                if e.1.is_empty() {
                    e.1 = value;
                } else {
                    e.1 = format!("{} {}", e.1, value);
                }
            }
            None => a.push((k, value)),
        }
        let mut q = p;
        while q > 0 && is_ws(s[q - 1]) {
            q -= 1;
        }
        s.truncate(q);
    }
    (trim_ws(&s), a)
}

struct Directive {
    name: String,
    args: String,
    attrs: Attrs,
    conts: Vec<String>,
}

fn trailing_code(content: &[char]) -> String {
    let n = content.len();
    for k in 1..n {
        if content[k] == '#'
            && is_ws(content[k - 1])
            && (k + 1 == n || is_ws(content[k + 1]))
            && !content.iter().enumerate().any(|(i, c)| is_lt(*c) && i != k - 1)
        {
            let s: String = content[..k - 1].iter().collect();
            return s.trim_end_matches(is_ws).to_string();
        }
    }
    content.iter().collect()
}

fn valid_name(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

fn print_all(text: &str) -> String {
    let mut dirs: Vec<Directive> = Vec::new();
    for piece in text.split('\n') {
        let line = piece.strip_suffix('\r').unwrap_or(piece);
        if line.chars().all(is_ws) {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let ind = chars.iter().take_while(|c| **c == ' ' || **c == '\t').count();
        let content = &chars[ind..];
        if content[0] == '#' {
            continue;
        }
        let code_s = trailing_code(content);
        let code: Vec<char> = code_s.chars().collect();
        if ind == 0 {
            let nl = code.iter().take_while(|c| !is_ws(**c)).count();
            let mut name: Vec<char> = code[..nl].to_vec();
            let rest = &code[nl..];
            let wl = rest.iter().take_while(|c| is_ws(**c)).count();
            let tail = &rest[wl..];
            let mut ok = !name.is_empty() && !tail.iter().any(|c| is_lt(*c));
            if ok {
                if name.len() >= 2 && name[name.len() - 1] == ':' && name[0].is_ascii_uppercase() {
                    let mid = &name[1..name.len() - 1];
                    if mid.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-') {
                        name.pop();
                    }
                }
                ok = valid_name(&name);
            }
            if ok {
                let (body, a) = extract(tail);
                dirs.push(Directive { name: name.iter().collect(), args: body, attrs: a, conts: Vec::new() });
            } else if let Some(d) = dirs.last_mut() {
                d.conts.push(code_s);
            }
        } else if let Some(d) = dirs.last_mut() {
            let (body, a) = extract(&code);
            d.conts.push(body);
            for (k, v) in a {
                match d.attrs.iter_mut().find(|e| e.0 == k) {
                    Some(e) => e.1 = v,
                    None => d.attrs.push((k, v)),
                }
            }
        }
    }
    if dirs.is_empty() {
        return "\n".to_string();
    }
    let mut out = String::new();
    for d in &dirs {
        out.push_str(&d.name);
        if !d.args.is_empty() {
            out.push(' ');
            out.push_str(&d.args);
        }
        for (k, v) in &d.attrs {
            out.push(' ');
            out.push_str(k);
            out.push(' ');
            out.push_str(v);
        }
        out.push('\n');
        for c in &d.conts {
            out.push_str("  ");
            out.push_str(c);
            out.push('\n');
        }
    }
    out
}

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
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for block in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
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
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
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

pub fn legacy_print_sha(text: &str) -> String {
    sha256_hex(print_all(text).as_bytes())
}
