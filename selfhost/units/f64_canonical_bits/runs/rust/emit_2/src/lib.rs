const QNAN: &str = "7ff8000000000000";

pub fn f64_canonical_bits(raw: &str) -> String {
    let b = raw.as_bytes();
    if b.len() != 16 || !b.iter().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f')) {
        panic!("f64 bits must be 16 lowercase hex digits");
    }
    let bits = u64::from_str_radix(raw, 16).unwrap();
    let x = f64::from_bits(bits);
    if x.is_nan() {
        return QNAN.to_string();
    }
    format!("{:016x}", x.to_bits())
}
