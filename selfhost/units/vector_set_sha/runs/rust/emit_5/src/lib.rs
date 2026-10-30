use serde_json::Value;

const CAP: usize = 416;

fn chk(d: usize) {
    if d > CAP {
        panic!("nesting cap");
    }
}

fn quote(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}

fn render(v: &Value, d: usize, out: &mut String) {
    chk(d);
    match v {
        Value::String(s) => out.push_str(&quote(s)),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(_) | Value::Null => panic!("not canonical"),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                render(e, d + 1, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            if let Some(Value::String(t)) = m.get("t") {
                if t == "f64" {
                    let bits = match m.get("bits") {
                        Some(Value::String(b)) => b,
                        _ => panic!("bad f64"),
                    };
                    if bits.len() != 16 || !bits.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) {
                        panic!("bad bits");
                    }
                    chk(d + 1);
                    out.push_str("{\"bits\":");
                    out.push_str(&quote(bits));
                    out.push_str(",\"t\":\"f64\"}");
                    return;
                }
                if t == "throw" {
                    chk(d + 1);
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
                out.push_str(&quote(k));
                out.push(':');
                render(&m[*k], d + 1, out);
            }
            out.push('}');
        }
    }
}

fn cases(o: &serde_json::Map<String, Value>, key: &str, out: &mut String) {
    let list = match o.get(key).and_then(|v| v.as_array()) {
        Some(l) => l,
        None => panic!("not a list"),
    };
    chk(1);
    out.push('[');
    for (i, c) in list.iter().enumerate() {
        let c = c.as_object().expect("case not a map");
        let a = c.get("args").expect("no args");
        let e = c.get("expected").expect("no expected");
        if i > 0 {
            out.push(',');
        }
        chk(2);
        out.push_str("{\"args\":");
        render(a, 3, out);
        out.push_str(",\"expected\":");
        render(e, 3, out);
        out.push('}');
    }
    out.push(']');
}

fn sha256(data: &[u8]) -> String {
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
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
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
    let mut s = String::new();
    for x in h.iter() {
        for b in x.to_be_bytes() {
            s.push_str(&format!("{:02x}", b));
        }
    }
    s
}

pub fn vector_set_sha(oracle: &serde_json::Value) -> String {
    let o = oracle.as_object().expect("oracle not a map");
    for k in ["frozen", "heldout"] {
        if o.get(k).and_then(|v| v.as_array()).is_none() {
            panic!("missing list");
        }
    }
    let mut out = String::from("{\"frozen\":");
    cases(o, "frozen", &mut out);
    out.push_str(",\"heldout\":");
    cases(o, "heldout", &mut out);
    out.push('}');
    sha256(out.as_bytes())
}
