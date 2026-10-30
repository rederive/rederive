//! The sim crate: pure glue over verified leaves (crates/<unit>/, one per named rule of the game). No
//! clock, no I/O, no randomness it did not receive as an argument -- this crate's typikon.yaml aspect
//! declares reach `none`. Add a verified unit's crate as a path dependency (see Cargo.toml) once
//! `tools/install` has landed it, and call it from here; never re-derive a unit's logic in this file --
//! that is a finding (`tools/install --check` would also catch a hand-patched crate, but glue that
//! silently reimplements a unit is the harder case: catch it in review instead).

pub fn placeholder() {}

#[cfg(test)]
mod tests {
    #[test]
    fn workspace_compiles() {
        // Replace with the sim's own property test once the first unit is installed and wired in
        // (see typikon.yaml's `sim` aspect: cite the acceptance property here and in the tribunal).
    }
}
