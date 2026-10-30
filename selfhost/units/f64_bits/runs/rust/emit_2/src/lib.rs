pub fn f64_bits(x: f64) -> String {
    if x.is_nan() {
        return "7ff8000000000000".to_string();
    }
    format!("{:016x}", x.to_bits())
}
