use serde_json::Value;

fn quote(s: &str, out: &mut String) {
    out.push_str(&serde_json::to_string(s).unwrap());
}

fn canon(v: &Value, out: &mut String) {
    match v {
        Value::String(s) => quote(s, out),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                canon(e, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            if let Some(Value::String(t)) = m.get("t") {
                if t == "f64" {
                    let bits = match m.get("bits") {
                        Some(Value::String(b)) => b,
                        _ => panic!("not canonical: f64 without bits"),
                    };
                    if bits.len() != 16 || !bits.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
                        panic!("not canonical: an f64 tag without 16-hex bits");
                    }
                    out.push_str("{\"bits\":");
                    quote(bits, out);
                    out.push_str(",\"t\":\"f64\"}");
                    return;
                }
                if t == "throw" {
                    out.push_str("{\"t\":\"throw\"}");
                    return;
                }
            }
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                quote(k, out);
                out.push(':');
                canon(&m[*k], out);
            }
            out.push('}');
        }
        _ => panic!("not canonical"),
    }
}

fn primes(n: usize) -> Vec<u128> {
    let mut v = Vec::new();
    let mut c = 2u128;
    while v.len() < n {
        if (2..c).take_while(|d| d * d <= c).all(|d| c % d != 0) {
            v.push(c);
        }
        c += 1;
    }
    v
}

fn iroot(n: u128, k: u32) -> u128 {
    let (mut lo, mut hi) = (0u128, 1u128 << 40);
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        if mid.pow(k) <= n {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo
}

fn sha256_hex(data: &[u8]) -> String {
    let ps = primes(64);
    let k: Vec<u32> = ps.iter().map(|&p| iroot(p << 96, 3) as u32).collect();
    let mut h: Vec<u32> = ps[..8].iter().map(|&p| iroot(p << 64, 2) as u32).collect();
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[4 * i], chunk[4 * i + 1], chunk[4 * i + 2], chunk[4 * i + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut s = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
        for i in 0..64 {
            let [a, b, c, d, e, f, g, hh] = s;
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(k[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            s = [t1.wrapping_add(t2), a, b, c, d.wrapping_add(t1), e, f, g];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(s[i]);
        }
    }
    h.iter().map(|x| format!("{:08x}", x)).collect()
}

fn project(oracle: &serde_json::Map<String, Value>, key: &str) -> Value {
    let list = match oracle.get(key) {
        Some(Value::Array(a)) => a,
        _ => panic!("oracle list missing"),
    };
    let mut res = Vec::new();
    for c in list {
        let m = c.as_object().expect("case not a map");
        let a = m.get("args").expect("missing args").clone();
        let e = m.get("expected").expect("missing expected").clone();
        let mut o = serde_json::Map::new();
        o.insert("args".to_string(), a);
        o.insert("expected".to_string(), e);
        res.push(Value::Object(o));
    }
    Value::Array(res)
}

pub fn vector_set_sha(oracle: &serde_json::Value) -> String {
    let o = oracle.as_object().expect("oracle not a map");
    let frozen = project(o, "frozen");
    let heldout = project(o, "heldout");
    let mut p = serde_json::Map::new();
    p.insert("frozen".to_string(), frozen);
    p.insert("heldout".to_string(), heldout);
    let mut out = String::new();
    canon(&Value::Object(p), &mut out);
    sha256_hex(out.as_bytes())
}
