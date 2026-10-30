pub fn f64_from_bits(bits: &str) -> f64 {
    let b = bits.as_bytes();
    if b.len() != 16 || !b.iter().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f')) {
        panic!("f64 bits must be 16 lowercase hex digits (got {:?})", bits);
    }
    let mut v: u64 = 0;
    for c in b {
        let d = if *c <= b'9' { *c - b'0' } else { *c - b'a' + 10 };
        v = (v << 4) | d as u64;
    }
    f64::from_bits(v)
}
