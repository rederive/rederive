// Latest feature "since" version over the names; panics on an unknown name.
pub fn spec_version_for(features: &[&str]) -> String {
    let mut rank = 0usize;
    for name in features {
        let r = match *name {
            "vectors" => 0,
            "carried-data" | "envelope" | "trace-seam" => 1,
            "scheduler" | "lifecycle" | "par-interleaving" | "ring" => 2,
            "lang-variant" | "cross-lang-anchor" => 3,
            other => panic!("unknown feature {:?}", other),
        };
        if r > rank {
            rank = r;
        }
    }
    ["0.2", "0.3", "0.4", "0.5"][rank].to_string()
}
