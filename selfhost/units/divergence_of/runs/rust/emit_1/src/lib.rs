type Miss<'a> = (Option<&'a str>, &'a str, Vec<&'a str>, &'a str);
type Art<'a> = (
    &'a str,
    Option<bool>,
    Option<&'a str>,
    Option<Vec<&'a str>>,
    Option<(bool, Option<bool>)>,
    Option<Vec<Miss<'a>>>,
);
type Entry = (String, Vec<String>, String, Vec<String>, i64, i64);

fn tally(graded: &[&Art], slice: &str) -> Vec<Entry> {
    let of = graded.len() as i64;
    let mut out: Vec<Entry> = Vec::new();
    for a in graded {
        if let Some(ms) = &a.5 {
            for m in ms {
                if m.0.unwrap_or("heldout") != slice {
                    continue;
                }
                let idx = match out.iter().position(|e| e.0 == m.1) {
                    Some(i) => i,
                    None => {
                        out.push((
                            m.1.to_string(),
                            m.2.iter().map(|s| s.to_string()).collect(),
                            m.3.to_string(),
                            Vec::new(),
                            0,
                            of,
                        ));
                        out.len() - 1
                    }
                };
                if !out[idx].3.iter().any(|n| n == a.0) {
                    out[idx].3.push(a.0.to_string());
                }
            }
        }
    }
    for e in out.iter_mut() {
        e.4 = of - e.3.len() as i64;
    }
    out
}

#[allow(clippy::type_complexity)]
pub fn divergence_of(
    round: i64,
    artifacts: &[(
        &str,
        Option<bool>,
        Option<&str>,
        Option<Vec<&str>>,
        Option<(bool, Option<bool>)>,
        Option<Vec<(Option<&str>, &str, Vec<&str>, &str)>>,
    )],
) -> Option<(i64, String, String, Vec<Entry>, Option<Vec<Entry>>)> {
    let attempted: Vec<&Art> = artifacts.iter().filter(|a| a.1 != Some(true)).collect();
    if attempted.is_empty() {
        return None;
    }
    let graded: Vec<&Art> = attempted.into_iter().filter(|a| a.2.is_none()).collect();
    if graded.is_empty() {
        return Some((round, "0/0".to_string(), "no-quorum".to_string(), Vec::new(), None));
    }
    for a in &graded {
        if a.3.is_none() {
            panic!("divergence: artifact {} has no rungs list", a.0);
        }
        if let Some(ms) = &a.5 {
            for m in ms {
                if let Some(s) = m.0 {
                    if s != "frozen" && s != "heldout" {
                        panic!("divergence: bad slice");
                    }
                }
            }
        }
    }
    let votes = graded
        .iter()
        .filter(|a| {
            let r = a.3.as_ref().unwrap().iter().any(|r| *r == "harness-verified");
            let t = match a.4 {
                None => true,
                Some((app, ok)) => !app || ok == Some(true),
            };
            let m = a.5.as_ref().map_or(true, |m| m.is_empty());
            r && t && m
        })
        .count();
    let quorum = format!("{}/{}", votes, graded.len());
    let verdict = if votes >= 2 { "quorum" } else { "no-quorum" }.to_string();
    let held = tally(&graded, "heldout");
    let fz = tally(&graded, "frozen");
    Some((round, quorum, verdict, held, if fz.is_empty() { None } else { Some(fz) }))
}
