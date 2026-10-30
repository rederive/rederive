use std::cmp::Ordering;

fn parse(s: &str) -> Vec<&[u8]> {
    let mut out = Vec::new();
    for p in s.as_bytes().split(|&c| c == b'.') {
        let ok = !p.is_empty()
            && p.iter().all(|c| c.is_ascii_digit())
            && (p[0] != b'0' || p.len() == 1);
        if !ok {
            panic!("not a version: {:?}", s);
        }
        out.push(p);
    }
    out
}

fn cmp_seg(x: &[u8], y: &[u8]) -> Ordering {
    x.len().cmp(&y.len()).then_with(|| x.cmp(y))
}

pub fn cmp_ver(a: &str, b: &str) -> i64 {
    let pa = parse(a);
    let pb = parse(b);
    let zero: &[u8] = b"0";
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let x = pa.get(i).copied().unwrap_or(zero);
        let y = pb.get(i).copied().unwrap_or(zero);
        match cmp_seg(x, y) {
            Ordering::Less => return -1,
            Ordering::Greater => return 1,
            Ordering::Equal => {}
        }
    }
    0
}
