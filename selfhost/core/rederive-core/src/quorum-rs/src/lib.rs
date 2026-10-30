pub fn quorum(fulls: &[bool], need: i64) -> (i64, bool, i64) {
    if need < 1 {
        panic!("quorum: need must be an integer >= 1 (got {})", need);
    }
    let count = fulls.iter().filter(|b| **b).count() as i64;
    let has = count >= need;
    let idx = if has {
        fulls.iter().position(|b| *b).map(|p| p as i64).unwrap_or(-1)
    } else {
        -1
    };
    (count, has, idx)
}
