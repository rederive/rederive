use serde_json::Value;

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

fn esc(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\t' => out.push_str("\\t"),
            '\n' => out.push_str("\\n"),
            '\u{c}' => out.push_str("\\f"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn num_text(x: f64) -> Result<String, String> {
    if !x.is_finite() {
        return Err("carried: no canonical form".to_string());
    }
    if x == 0.0 {
        return Ok("0".to_string());
    }
    let neg = x < 0.0;
    let e = format!("{:e}", x.abs());
    let (mant, exp) = e.split_once('e').ok_or("bad number")?;
    let exp: i64 = exp.parse().map_err(|_| "bad number".to_string())?;
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i64;
    let n = exp + 1;
    let mut s = String::new();
    if neg {
        s.push('-');
    }
    if k <= n && n <= 21 {
        s.push_str(&digits);
        s.push_str(&"0".repeat((n - k) as usize));
    } else if 0 < n && n <= 21 {
        s.push_str(&digits[..n as usize]);
        s.push('.');
        s.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        s.push_str("0.");
        s.push_str(&"0".repeat((-n) as usize));
        s.push_str(&digits);
    } else {
        s.push_str(&digits[..1]);
        if k > 1 {
            s.push('.');
            s.push_str(&digits[1..]);
        }
        s.push('e');
        s.push(if n - 1 < 0 { '-' } else { '+' });
        s.push_str(&(n - 1).abs().to_string());
    }
    Ok(s)
}

fn canon(v: &Value, out: &mut String) -> Result<(), String> {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            let x = n.as_f64().ok_or("bad number")?;
            if x == 0.0 && x.is_sign_negative() {
                return Err("carried: no canonical form".to_string());
            }
            out.push_str(&num_text(x)?);
        }
        Value::String(s) => esc(s, out),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                canon(e, out)?;
            }
            out.push(']');
        }
        Value::Object(m) => {
            let mut es: Vec<(&String, &Value)> = m.iter().collect();
            es.sort_by(|a, b| a.0.encode_utf16().cmp(b.0.encode_utf16()));
            out.push('{');
            for (i, (k, e)) in es.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                esc(k, out);
                out.push(':');
                canon(e, out)?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn canon_s(v: &Value) -> Result<String, String> {
    let mut s = String::new();
    canon(v, &mut s)?;
    Ok(s)
}

#[allow(clippy::type_complexity)]
pub fn check_carried(
    decl: &serde_json::Value,
    table: &serde_json::Value,
) -> Result<(String, Option<bool>, Vec<(String, Option<serde_json::Value>, Option<serde_json::Value>, bool)>, bool, String, i64), String> {
    let d = decl.as_object().ok_or("carried: decl must be a map")?;
    let assertions = d
        .get("assertions")
        .and_then(|a| a.as_array())
        .ok_or("carried: assertions must be a list")?;
    let pin: Option<&str> = match d.get("sha") {
        None | Some(Value::Null) => None,
        Some(Value::String(s))
            if s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) =>
        {
            Some(s.as_str())
        }
        Some(_) => return Err("carried: sha must be 64 lowercase hex".to_string()),
    };
    let t = table.as_object().ok_or("carried: table must be a map")?;
    let tc = canon_s(table)?;
    let mut items: Vec<(&str, &Value)> = Vec::new();
    for a in assertions {
        let m = a.as_object().ok_or("carried: bad assertion")?;
        let expr = match m.get("expr") {
            Some(Value::String(s)) if !s.is_empty() => s.as_str(),
            _ => return Err("carried: bad assertion".to_string()),
        };
        let eq = m.get("equals").ok_or("carried: bad assertion")?;
        canon_s(eq)?;
        items.push((expr, eq));
    }
    let sha = sha256_hex(tc.as_bytes());
    let hash_ok = pin.map(|p| p == sha);
    let entries = t.len() as i64;
    let mut results = Vec::new();
    let mut all_ok = true;
    for (expr, eq) in items {
        let got: Option<Value> = if expr == "count" {
            Some(Value::from(entries))
        } else {
            t.get(expr).cloned()
        };
        let ok = match &got {
            Some(g) => canon_s(g)? == canon_s(eq)?,
            None => false,
        };
        all_ok &= ok;
        results.push((expr.to_string(), Some(eq.clone()), got, ok));
    }
    let attested = hash_ok == Some(true) && !results.is_empty() && all_ok;
    let status = match hash_ok {
        None => "unpinned",
        Some(false) => "hash-mismatch",
        Some(true) if results.is_empty() => "unattested",
        _ if attested => "attested",
        _ => "authority-FAIL",
    };
    Ok((sha, hash_ok, results, attested, status.to_string(), entries))
}
