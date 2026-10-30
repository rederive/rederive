use serde_json::Value;

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

fn render(v: &Value, out: &mut String) {
    match v {
        Value::String(s) => out.push_str(&quote(s)),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render(e, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            match m.get("t") {
                Some(Value::String(t)) if t == "f64" => {
                    match m.get("bits") {
                        Some(Value::String(b))
                            if b.len() == 16
                                && b.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) =>
                        {
                            out.push_str("{\"bits\":");
                            out.push_str(&quote(b));
                            out.push_str(",\"t\":\"f64\"}");
                            return;
                        }
                        _ => panic!("not canonical: an f64 tag without 16-hex bits"),
                    }
                }
                Some(Value::String(t)) if t == "throw" => {
                    out.push_str("{\"t\":\"throw\"}");
                    return;
                }
                _ => {}
            }
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&quote(k));
                out.push(':');
                render(&m[*k], out);
            }
            out.push('}');
        }
        _ => panic!("not canonical"),
    }
}

fn icbrt(n: u128) -> u128 {
    let (mut lo, mut hi) = (0u128, 1u128 << 40);
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        if mid * mid * mid <= n {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo
}

fn isqrt(n: u128) -> u128 {
    let (mut lo, mut hi) = (0u128, 1u128 << 40);
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        if mid * mid <= n {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo
}

fn primes(n: usize) -> Vec<u128> {
    let mut v: Vec<u128> = Vec::new();
    let mut c = 2u128;
    while v.len() < n {
        if v.iter().all(|p| c % p != 0) {
            v.push(c);
        }
        c += 1;
    }
    v
}

fn sha256_hex(data: &[u8]) -> String {
    let ps = primes(64);
    let k: Vec<u32> = ps.iter().map(|p| icbrt(p << 96) as u32).collect();
    let mut h: [u32; 8] = [0; 8];
    for i in 0..8 {
        h[i] = isqrt(ps[i] << 64) as u32;
    }
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
        let mut s = h;
        for i in 0..64 {
            let s1 = s[4].rotate_right(6) ^ s[4].rotate_right(11) ^ s[4].rotate_right(25);
            let ch = (s[4] & s[5]) ^ (!s[4] & s[6]);
            let t1 = s[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(k[i]).wrapping_add(w[i]);
            let s0 = s[0].rotate_right(2) ^ s[0].rotate_right(13) ^ s[0].rotate_right(22);
            let maj = (s[0] & s[1]) ^ (s[0] & s[2]) ^ (s[1] & s[2]);
            let t2 = s0.wrapping_add(maj);
            s[7] = s[6];
            s[6] = s[5];
            s[5] = s[4];
            s[4] = s[3].wrapping_add(t1);
            s[3] = s[2];
            s[2] = s[1];
            s[1] = s[0];
            s[0] = t1.wrapping_add(t2);
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(s[i]);
        }
    }
    h.iter().map(|x| format!("{:08x}", x)).collect()
}

fn project(oracle: &Value, key: &str) -> Value {
    let m = oracle.as_object().expect("oracle not a map");
    let list = m.get(key).and_then(|v| v.as_array()).expect("list missing");
    let mut out = Vec::new();
    for c in list {
        let co = c.as_object().expect("case not a map");
        let a = co.get("args").expect("args missing").clone();
        let e = co.get("expected").expect("expected missing").clone();
        let mut mm = serde_json::Map::new();
        mm.insert("args".to_string(), a);
        mm.insert("expected".to_string(), e);
        out.push(Value::Object(mm));
    }
    Value::Array(out)
}

pub fn vector_set_sha(oracle: &serde_json::Value) -> String {
    let frozen = project(oracle, "frozen");
    let heldout = project(oracle, "heldout");
    let mut canon = String::from("{\"frozen\":");
    render(&frozen, &mut canon);
    canon.push_str(",\"heldout\":");
    render(&heldout, &mut canon);
    canon.push('}');
    sha256_hex(canon.as_bytes())
}
