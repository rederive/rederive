const VERSIONS: [&str; 4] = ["0.2", "0.3", "0.4", "0.5"];

fn rank(name: &str) -> usize {
    match name {
        "vectors" => 0,
        "carried-data" | "envelope" | "trace-seam" => 1,
        "scheduler" | "lifecycle" | "par-interleaving" | "ring" => 2,
        "lang-variant" | "cross-lang-anchor" => 3,
        _ => panic!("unknown feature {:?}: refusing to stamp a version for it", name),
    }
}

pub fn spec_version_for(features: &[&str]) -> String {
    let mut best = 0usize;
    for f in features {
        let r = rank(f);
        if r > best {
            best = r;
        }
    }
    VERSIONS[best].to_string()
}
