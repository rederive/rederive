pub fn f64_from_bits(bits: &str) -> f64 {
    let b = bits.as_bytes();
    if b.len() != 16 {
        panic!("f64 bits must be 16 lowercase hex digits");
    }
    let mut v: u64 = 0;
    for &c in b {
        let d = match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            _ => panic!("f64 bits must be 16 lowercase hex digits"),
        };
        v = (v << 4) | d as u64;
    }
    f64::from_bits(v)
}
