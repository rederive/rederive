pub fn strip(s: &str) -> String {
    let b = s.as_bytes();
    let n = b.len();
    let mut out: Vec<u8> = Vec::with_capacity(n);
    let mut i = 0;
    while i < n {
        if b[i] == 0x1B && i + 2 < n && b[i + 1] == b'[' && b[i + 2].is_ascii_digit() {
            let mut j = i + 2;
            while j < n && b[j].is_ascii_digit() {
                j += 1;
            }
            if j < n && b[j] == b'm' {
                i = j + 1;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_default()
}
