use serde_json::{Map, Number, Value};

struct P {
    c: Vec<char>,
    i: usize,
}

fn err<T>(m: &str) -> Result<T, String> {
    Err(format!("wire line: {}", m))
}

impl P {
    fn ws(&mut self) {
        while self.i < self.c.len() && matches!(self.c[self.i], ' ' | '\t' | '\n' | '\r') {
            self.i += 1;
        }
    }

    fn peek(&self) -> Option<char> {
        self.c.get(self.i).copied()
    }

    fn lit(&mut self, s: &str, v: Value) -> Result<Value, String> {
        for ch in s.chars() {
            if self.peek() != Some(ch) {
                return err("bad literal");
            }
            self.i += 1;
        }
        Ok(v)
    }

    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > 128 {
            return err("nests too deep");
        }
        match self.peek() {
            Some('t') => self.lit("true", Value::Bool(true)),
            Some('f') => self.lit("false", Value::Bool(false)),
            Some('n') => self.lit("null", Value::Null),
            Some('"') => Ok(Value::String(self.string()?)),
            Some('[') => {
                self.i += 1;
                let mut out = Vec::new();
                self.ws();
                if self.peek() == Some(']') {
                    self.i += 1;
                    return Ok(Value::Array(out));
                }
                loop {
                    self.ws();
                    out.push(self.value(depth + 1)?);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some(']') => {
                            self.i += 1;
                            return Ok(Value::Array(out));
                        }
                        _ => return err("bad list"),
                    }
                }
            }
            Some('{') => {
                self.i += 1;
                let mut m = Map::new();
                self.ws();
                if self.peek() == Some('}') {
                    self.i += 1;
                    return Ok(Value::Object(m));
                }
                loop {
                    self.ws();
                    if self.peek() != Some('"') {
                        return err("bad key");
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.peek() != Some(':') {
                        return err("missing colon");
                    }
                    self.i += 1;
                    self.ws();
                    let v = self.value(depth + 1)?;
                    m.insert(k, v);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some('}') => {
                            self.i += 1;
                            return Ok(Value::Object(m));
                        }
                        _ => return err("bad object"),
                    }
                }
            }
            Some(ch) if ch == '-' || ch.is_ascii_digit() => self.number(),
            _ => err("not a JSON value"),
        }
    }

    fn digits(&mut self) -> usize {
        let s = self.i;
        while self.peek().map_or(false, |c| c.is_ascii_digit()) {
            self.i += 1;
        }
        self.i - s
    }

    fn number(&mut self) -> Result<Value, String> {
        let s = self.i;
        if self.peek() == Some('-') {
            self.i += 1;
        }
        match self.peek() {
            Some('0') => self.i += 1,
            Some(c) if c.is_ascii_digit() => {
                self.digits();
            }
            _ => return err("bad number"),
        }
        let mut float = false;
        if self.peek() == Some('.') {
            self.i += 1;
            if self.digits() == 0 {
                return err("bad fraction");
            }
            float = true;
        }
        if matches!(self.peek(), Some('e') | Some('E')) {
            self.i += 1;
            if matches!(self.peek(), Some('+') | Some('-')) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return err("bad exponent");
            }
            float = true;
        }
        let text: String = self.c[s..self.i].iter().collect();
        if float {
            let x: f64 = text.parse().map_err(|_| "wire line: bad number".to_string())?;
            if !x.is_finite() {
                return err("no double");
            }
            match Number::from_f64(x) {
                Some(n) => Ok(Value::Number(n)),
                None => err("no double"),
            }
        } else {
            match text.parse::<Number>() {
                Ok(n) => Ok(Value::Number(n)),
                Err(_) => err("bad integer"),
            }
        }
    }

    fn hex4(&mut self) -> Result<u16, String> {
        let mut v: u32 = 0;
        for _ in 0..4 {
            match self.peek().and_then(|c| c.to_digit(16)) {
                Some(d) => {
                    v = v * 16 + d;
                    self.i += 1;
                }
                None => return err("bad unicode escape"),
            }
        }
        Ok(v as u16)
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut u: Vec<u16> = Vec::new();
        loop {
            let ch = match self.peek() {
                Some(c) => c,
                None => return err("unterminated string"),
            };
            self.i += 1;
            match ch {
                '"' => return Ok(String::from_utf16_lossy(&u)),
                '\\' => {
                    let e = match self.peek() {
                        Some(c) => c,
                        None => return err("bad escape"),
                    };
                    self.i += 1;
                    let unit = match e {
                        '"' => 0x22,
                        '/' => 0x2f,
                        'b' => 0x08,
                        'f' => 0x0c,
                        'n' => 0x0a,
                        'r' => 0x0d,
                        't' => 0x09,
                        '\\' => 0x5c,
                        'u' => self.hex4()?,
                        _ => return err("unknown escape"),
                    };
                    u.push(unit);
                }
                c if (c as u32) < 0x20 => return err("control character in string"),
                c => {
                    let mut b = [0u16; 2];
                    u.extend_from_slice(c.encode_utf16(&mut b));
                }
            }
        }
    }
}

pub fn parse_wire(line: &str) -> Result<serde_json::Value, String> {
    let mut p = P { c: line.chars().collect(), i: 0 };
    p.ws();
    let v = p.value(0)?;
    p.ws();
    if p.i != p.c.len() {
        return err("unexpected text after the value");
    }
    Ok(v)
}
