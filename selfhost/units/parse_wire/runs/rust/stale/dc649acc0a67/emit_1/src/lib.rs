pub fn parse_wire(line: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str::<serde_json::Value>(line).map_err(|e| e.to_string())
}
