// Fixture (rederive selfhost #55, round 4): a json result that IS the map {"throw": "x"} — a value, never a throw — and an Err
// that is the throw. Before the {ok}/{throw} envelope the harness wrote the map bare and the driver read it as a throw.
pub fn throw_map(s: &str) -> Result<serde_json::Value, String> {
    match s {
        "map" => Ok(serde_json::json!({ "throw": "x" })),
        "marker" => Ok(serde_json::json!({ "__threw": "y" })),
        "boom" => Err("boom!".to_string()),
        _ => Ok(serde_json::json!([s])),
    }
}
