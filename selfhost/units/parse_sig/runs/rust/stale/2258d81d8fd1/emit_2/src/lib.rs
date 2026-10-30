use serde_json::{json, Map, Value};

type R<T> = Result<T, ()>;

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

const SCALARS: [&str; 7] = ["text", "bytes", "bool", "none", "i64", "u64", "f64"];

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\r' | b'\n') {
            self.i += 1;
        }
    }

    fn ident(&mut self) -> R<String> {
        let st = self.i;
        if self.i < self.b.len() && (self.b[self.i].is_ascii_alphabetic() || self.b[self.i] == b'_') {
            self.i += 1;
            while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_') {
                self.i += 1;
            }
            Ok(String::from_utf8_lossy(&self.b[st..self.i]).into_owned())
        } else {
            Err(())
        }
    }

    fn lit(&mut self, t: &[u8]) -> R<()> {
        if self.b[self.i..].starts_with(t) {
            self.i += t.len();
            Ok(())
        } else {
            Err(())
        }
    }

    fn ty(&mut self) -> R<Value> {
        let mut alts = vec![self.alt()?];
        loop {
            self.ws();
            if self.i < self.b.len() && self.b[self.i] == b'|' {
                self.i += 1;
                self.ws();
                alts.push(self.alt()?);
            } else {
                break;
            }
        }
        if alts.len() >= 2 {
            Ok(json!({"k": "union", "alts": alts}))
        } else {
            Ok(alts.pop().unwrap())
        }
    }

    fn alt(&mut self) -> R<Value> {
        let id = self.ident()?;
        match id.as_str() {
            "tuple" => {
                self.lit(b"[")?;
                self.ws();
                let mut items = vec![self.ty()?];
                loop {
                    self.ws();
                    if self.lit(b",").is_ok() {
                        self.ws();
                        items.push(self.ty()?);
                    } else {
                        break;
                    }
                }
                self.lit(b"]")?;
                Ok(json!({"k": "tuple", "items": items}))
            }
            "list" => {
                self.lit(b"[")?;
                self.ws();
                let t = self.ty()?;
                self.ws();
                self.lit(b"]")?;
                Ok(json!({"k": "list", "item": t}))
            }
            "map" => {
                self.lit(b"[")?;
                self.ws();
                let k = self.ty()?;
                self.ws();
                self.lit(b",")?;
                self.ws();
                let v = self.ty()?;
                self.ws();
                self.lit(b"]")?;
                Ok(json!({"k": "map", "key": k, "val": v}))
            }
            "record" => {
                self.lit(b"[")?;
                self.ws();
                let mut fields: Vec<Value> = Vec::new();
                let mut names: Vec<String> = Vec::new();
                loop {
                    let n = self.ident()?;
                    if names.contains(&n) {
                        return Err(());
                    }
                    self.ws();
                    self.lit(b":")?;
                    self.ws();
                    let t = self.ty()?;
                    names.push(n.clone());
                    fields.push(json!([n, t]));
                    self.ws();
                    if self.lit(b",").is_ok() {
                        self.ws();
                    } else {
                        break;
                    }
                }
                self.lit(b"]")?;
                Ok(json!({"k": "record", "fields": fields}))
            }
            s if s == "json" || SCALARS.contains(&s) => Ok(json!({"k": s})),
            _ => Err(()),
        }
    }

    fn sig(&mut self) -> R<Value> {
        self.ws();
        for p in [&b"pub fn"[..], &b"export default function"[..]] {
            if self.b[self.i..].starts_with(p) {
                let n = self.i + p.len();
                if n < self.b.len() && (self.b[n] == b' ' || self.b[n] == b'\t') {
                    self.i = n + 1;
                    break;
                }
            }
        }
        self.ws();
        let name = self.ident()?;
        self.ws();
        self.lit(b"(")?;
        self.ws();
        let mut args: Vec<Value> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        let mut seen_rest = false;
        if self.lit(b")").is_err() {
            loop {
                if seen_rest {
                    return Err(());
                }
                let rest = self.lit(b"...").is_ok();
                if rest {
                    self.ws();
                    seen_rest = true;
                }
                let n = self.ident()?;
                if names.contains(&n) {
                    return Err(());
                }
                self.ws();
                self.lit(b":")?;
                self.ws();
                let t = self.ty()?;
                names.push(n.clone());
                let mut m = Map::new();
                m.insert("name".into(), Value::String(n));
                m.insert("type".into(), t);
                if rest {
                    m.insert("rest".into(), Value::Bool(true));
                }
                args.push(Value::Object(m));
                self.ws();
                if self.lit(b",").is_ok() {
                    self.ws();
                } else {
                    self.lit(b")")?;
                    break;
                }
            }
        }
        self.ws();
        if self.lit(b"->").is_err() {
            self.lit(b":")?;
        }
        self.ws();
        let result = self.ty()?;
        self.ws();
        if self.i != self.b.len() {
            return Err(());
        }
        Ok(json!({"name": name, "args": args, "result": result}))
    }
}

pub fn parse_sig(s: &str) -> serde_json::Value {
    let mut p = P { b: s.as_bytes(), i: 0 };
    match p.sig() {
        Ok(v) => v,
        Err(()) => panic!("bad SIG at {}", p.i),
    }
}
