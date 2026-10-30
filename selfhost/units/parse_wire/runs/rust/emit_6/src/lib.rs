use serde_json::{Map, Number, Value};

struct P<'a> {
    s: &'a str,
    b: &'a [u8],
    i: usize,
}

type R<T> = Result<T, String>;

fn err<T>(m: &str, at: usize) -> R<T> {
    Err(format!("wire line: {} at {}", m, at))
}

impl<'a> P<'a> {
    fn ws(&mut self) {
        while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\n' | b'\r') {
            self.i += 1;
        }
    }

    fn lit(&mut self, word: &str, v: Value) -> R<Value> {
        if self.s[self.i..].starts_with(word) {
            self.i += word.len();
            Ok(v)
        } else {
            err("not a JSON value", self.i)
        }
    }

    fn value(&mut self, depth: usize) -> R<Value> {
        if depth > 128 {
            return err("nests too deep", depth);
        }
        self.ws();
        if self.i >= self.b.len() {
            return err("not a JSON value", self.i);
        }
        match self.b[self.i] {
            b't' => self.lit("true", Value::Bool(true)),
            b'f' => self.lit("false", Value::Bool(false)),
            b'n' => self.lit("null", Value::Null),
            b'"' => Ok(Value::String(self.string()?)),
            b'[' => {
                self.i += 1;
                let mut out = Vec::new();
                self.ws();
                if self.i < self.b.len() && self.b[self.i] == b']' {
                    self.i += 1;
                    if depth + 1 > 128 && false {
                        return err("nests too deep", depth);
                    }
                    return Ok(Value::Array(out));
                }
                loop {
                    out.push(self.value(depth + 1)?);
                    self.ws();
                    if self.i >= self.b.len() {
                        return err("unterminated array", self.i);
                    }
                    match self.b[self.i] {
                        b',' => self.i += 1,
                        b']' => {
                            self.i += 1;
                            return Ok(Value::Array(out));
                        }
                        _ => return err("expected , or ]", self.i),
                    }
                }
            }
            b'{' => {
                self.i += 1;
                let mut m = Map::new();
                self.ws();
                if self.i < self.b.len() && self.b[self.i] == b'}' {
                    self.i += 1;
                    return Ok(Value::Object(m));
                }
                loop {
                    self.ws();
                    if self.i >= self.b.len() || self.b[self.i] != b'"' {
                        return err("expected key", self.i);
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.i >= self.b.len() || self.b[self.i] != b':' {
                        return err("expected :", self.i);
                    }
                    self.i += 1;
                    let v = self.value(depth + 1)?;
                    m.insert(k, v);
                    self.ws();
                    if self.i >= self.b.len() {
                        return err("unterminated object", self.i);
                    }
                    match self.b[self.i] {
                        b',' => self.i += 1,
                        b'}' => {
                            self.i += 1;
                            return Ok(Value::Object(m));
                        }
                        _ => return err("expected , or }", self.i),
                    }
                }
            }
            b'-' | b'0'..=b'9' => self.number(),
            _ => err("not a JSON value", self.i),
        }
    }

    fn digits(&mut self) -> usize {
        let st = self.i;
        while self.i < self.b.len() && self.b[self.i].is_ascii_digit() {
            self.i += 1;
        }
        self.i - st
    }

    fn number(&mut self) -> R<Value> {
        let st = self.i;
        if self.b[self.i] == b'-' {
            self.i += 1;
        }
        if self.i >= self.b.len() {
            return err("bad number", self.i);
        }
        if self.b[self.i] == b'0' {
            self.i += 1;
        } else if self.digits() == 0 {
            return err("bad number", self.i);
        }
        let mut float = false;
        if self.i < self.b.len() && self.b[self.i] == b'.' {
            float = true;
            self.i += 1;
            if self.digits() == 0 {
                return err("bad fraction", self.i);
            }
        }
        if self.i < self.b.len() && (self.b[self.i] == b'e' || self.b[self.i] == b'E') {
            float = true;
            self.i += 1;
            if self.i < self.b.len() && (self.b[self.i] == b'+' || self.b[self.i] == b'-') {
                self.i += 1;
            }
            if self.digits() == 0 {
                return err("bad exponent", self.i);
            }
        }
        let text = &self.s[st..self.i];
        if float {
            let x: f64 = text.parse().map_err(|_| format!("wire line: bad number at {}", self.i))?;
            if !x.is_finite() {
                return err(&format!("{} has no double", text), self.i);
            }
            match Number::from_f64(x) {
                Some(n) => Ok(Value::Number(n)),
                None => err("no double", self.i),
            }
        } else {
            match text.parse::<Number>() {
                Ok(n) => Ok(Value::Number(n)),
                Err(_) => err("bad integer", self.i),
            }
        }
    }

    fn hex4(&mut self) -> R<u16> {
        if self.i + 4 > self.b.len() {
            return err("bad unicode escape", self.i);
        }
        let mut v: u16 = 0;
        for k in 0..4 {
            let d = match (self.b[self.i + k] as char).to_digit(16) {
                Some(d) => d as u16,
                None => return err("bad unicode escape", self.i),
            };
            v = v * 16 + d;
        }
        self.i += 4;
        Ok(v)
    }

    fn string(&mut self) -> R<String> {
        self.i += 1;
        let mut u: Vec<u16> = Vec::new();
        loop {
            if self.i >= self.b.len() {
                return err("unterminated string", self.i);
            }
            let c = self.b[self.i];
            match c {
                b'"' => {
                    self.i += 1;
                    return Ok(String::from_utf16_lossy(&u));
                }
                b'\\' => {
                    self.i += 1;
                    if self.i >= self.b.len() {
                        return err("bad escape", self.i);
                    }
                    let e = self.b[self.i];
                    self.i += 1;
                    let ch = match e {
                        b'"' => 0x22,
                        b'/' => 0x2f,
                        b'b' => 0x08,
                        b'f' => 0x0c,
                        b'n' => 0x0a,
                        b'r' => 0x0d,
                        b't' => 0x09,
                        b'\\' => 0x5c,
                        b'u' => self.hex4()?,
                        _ => return err("bad escape", self.i),
                    };
                    u.push(ch);
                }
                0..=0x1f => return err("control character in string", self.i),
                _ => {
                    let ch = match self.s[self.i..].chars().next() {
                        Some(ch) => ch,
                        None => return err("unterminated string", self.i),
                    };
                    let mut buf = [0u16; 2];
                    u.extend_from_slice(ch.encode_utf16(&mut buf));
                    self.i += ch.len_utf8();
                }
            }
        }
    }
}

pub fn parse_wire(line: &str) -> Result<serde_json::Value, String> {
    let mut p = P { s: line, b: line.as_bytes(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i < p.b.len() {
        return err("unexpected text after the value", p.i);
    }
    Ok(v)
}
