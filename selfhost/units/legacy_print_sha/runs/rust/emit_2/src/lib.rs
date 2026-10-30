type Attrs = Vec<(&'static str, String)>;

const KWS: [&str; 3] = ["CITED", "EARNED", "ANCHOR"];

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

fn ws(c: char) -> bool {
    matches!(
        c as u32,
        0x9..=0xD | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF
    )
}

fn lt(c: char) -> bool {
    matches!(c as u32, 0xA | 0xD | 0x2028 | 0x2029)
}

fn trim_end(s: &[char]) -> &[char] {
    let mut e = s.len();
    while e > 0 && ws(s[e - 1]) {
        e -= 1;
    }
    &s[..e]
}

fn trim_both(s: &[char]) -> &[char] {
    let t = trim_end(s);
    let mut b = 0;
    while b < t.len() && ws(t[b]) {
        b += 1;
    }
    &t[b..]
}

fn store(attrs: &mut Attrs, k: &'static str, v: String) {
    for e in attrs.iter_mut() {
        if e.0 == k {
            e.1 = v;
            return;
        }
    }
    attrs.push((k, v));
}

fn extract(src: &[char]) -> (String, Attrs) {
    let mut s: Vec<char> = src.to_vec();
    let mut a: Attrs = Vec::new();
    loop {
        let mut found: Option<(usize, &'static str, String)> = None;
        'outer: for p in 1..s.len() {
            if !ws(s[p - 1]) {
                continue;
            }
            for kw in KWS.iter() {
                let kc: Vec<char> = kw.chars().collect();
                if !s[p..].starts_with(&kc) {
                    continue;
                }
                let r = &s[p + kc.len()..];
                if r.len() < 2 {
                    continue;
                }
                let mut w = 0;
                while w < r.len() && ws(r[w]) {
                    w += 1;
                }
                if w == 0 {
                    continue;
                }
                let j = w.min(r.len() - 1);
                if r[j..].iter().any(|&c| lt(c)) {
                    continue;
                }
                let val: String = trim_both(r).iter().collect();
                found = Some((p, kw, val));
                break 'outer;
            }
        }
        match found {
            None => break,
            Some((p, kw, val)) => {
                let mut done = false;
                for e in a.iter_mut() {
                    if e.0 == kw {
                        if !e.1.is_empty() {
                            e.1 = format!("{} {}", e.1, val);
                        } else {
                            e.1 = val.clone();
                        }
                        done = true;
                        break;
                    }
                }
                if !done {
                    a.push((kw, val));
                }
                let mut q = p;
                while q > 0 && ws(s[q - 1]) {
                    q -= 1;
                }
                s.truncate(q);
            }
        }
    }
    (trim_both(&s).iter().collect(), a)
}

fn valid_name(n: &[char]) -> bool {
    !n.is_empty()
        && n[0].is_ascii_uppercase()
        && n[1..].iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || *c == '-')
}

struct Dir {
    name: String,
    args: String,
    attrs: Attrs,
    conts: Vec<String>,
}

pub fn legacy_print_sha(text: &str) -> String {
    let mut dirs: Vec<Dir> = Vec::new();
    for piece in text.split('\n') {
        let line = piece.strip_suffix('\r').unwrap_or(piece);
        let lc: Vec<char> = line.chars().collect();
        if lc.iter().all(|&c| ws(c)) {
            continue;
        }
        let mut ind = 0;
        while ind < lc.len() && (lc[ind] == ' ' || lc[ind] == '\t') {
            ind += 1;
        }
        let content = &lc[ind..];
        if content[0] == '#' {
            continue;
        }
        let n = content.len();
        let lts: Vec<usize> = (0..n).filter(|&i| lt(content[i])).collect();
        let mut code: &[char] = content;
        for k in 1..n {
            if content[k] == '#'
                && ws(content[k - 1])
                && (k + 1 == n || ws(content[k + 1]))
                && lts.iter().all(|&i| i == k - 1)
            {
                code = trim_end(&content[..k - 1]);
                break;
            }
        }
        if ind == 0 {
            let mut nl = 0;
            while nl < code.len() && !ws(code[nl]) {
                nl += 1;
            }
            let mut ts = nl;
            while ts < code.len() && ws(code[ts]) {
                ts += 1;
            }
            let tail = &code[ts..];
            if nl > 0 && !tail.iter().any(|&c| lt(c)) {
                let mut name: &[char] = &code[..nl];
                if name.len() >= 2 && name[name.len() - 1] == ':' && valid_name(&name[..name.len() - 1]) {
                    name = &name[..name.len() - 1];
                }
                if valid_name(name) {
                    let (body, a) = extract(tail);
                    dirs.push(Dir { name: name.iter().collect(), args: body, attrs: a, conts: Vec::new() });
                    continue;
                }
            }
            if let Some(d) = dirs.last_mut() {
                d.conts.push(code.iter().collect());
            }
        } else if let Some(d) = dirs.last_mut() {
            let (body, a) = extract(code);
            d.conts.push(body);
            for (k, v) in a {
                store(&mut d.attrs, k, v);
            }
        }
    }
    let mut p = String::new();
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
    if dirs.is_empty() {
        p.push('\n');
    }
    sha256_hex(p.as_bytes())
}
