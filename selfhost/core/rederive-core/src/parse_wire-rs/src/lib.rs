use serde_json::{Map, Number, Value};

struct P {
    c: Vec<char>,
    i: usize,
}

fn err<T>(m: &str, at: usize) -> Result<T, String> {
    Err(format!("wire line: {} at {}", m, at))
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

    fn lit(&mut self, s: &str) -> bool {
        let n = s.chars().count();
        if self.i + n <= self.c.len() && self.c[self.i..self.i + n].iter().copied().eq(s.chars()) {
            self.i += n;
            true
        } else {
            false
        }
    }

    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > 128 {
            return err("nests too deep", self.i);
        }
        self.ws();
        match self.peek() {
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
                        return err("not a JSON value", self.i);
                    }
                    let k = self.string()?;
                    self.ws();
                    if self.peek() != Some(':') {
                        return err("expected colon", self.i);
                    }
                    self.i += 1;
                    let v = self.value(depth + 1)?;
                    m.insert(k, v);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some('}') => {
                            self.i += 1;
                            return Ok(Value::Object(m));
                        }
                        _ => return err("expected , or }", self.i),
                    }
                }
            }
            Some('[') => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.peek() == Some(']') {
                    self.i += 1;
                    return Ok(Value::Array(a));
                }
                loop {
                    a.push(self.value(depth + 1)?);
                    self.ws();
                    match self.peek() {
                        Some(',') => self.i += 1,
                        Some(']') => {
                            self.i += 1;
                            return Ok(Value::Array(a));
                        }
                        _ => return err("expected , or ]", self.i),
                    }
                }
            }
            Some('"') => Ok(Value::String(self.string()?)),
            Some('t') if self.lit("true") => Ok(Value::Bool(true)),
            Some('f') if self.lit("false") => Ok(Value::Bool(false)),
            Some('n') if self.lit("null") => Ok(Value::Null),
            Some(ch) if ch == '-' || ch.is_ascii_digit() => self.number(),
            _ => err("not a JSON value", self.i),
        }
    }

    fn digits(&mut self) -> usize {
        let s = self.i;
        while self.i < self.c.len() && self.c[self.i].is_ascii_digit() {
            self.i += 1;
        }
        self.i - s
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.i;
        if self.peek() == Some('-') {
            self.i += 1;
        }
        match self.peek() {
            Some('0') => self.i += 1,
            Some(c) if c.is_ascii_digit() => {
                self.digits();
            }
            _ => return err("not a JSON value", self.i),
        }
        let mut float = false;
        if self.peek() == Some('.') {
            self.i += 1;
            float = true;
            if self.digits() == 0 {
                return err("bad fraction", self.i);
            }
        }
        if matches!(self.peek(), Some('e') | Some('E')) {
            self.i += 1;
            float = true;
            if matches!(self.peek(), Some('+') | Some('-')) {
                self.i += 1;
            }
            if self.digits() == 0 {
                return err("bad exponent", self.i);
            }
        }
        let text: String = self.c[start..self.i].iter().collect();
        if float {
            let x: f64 = match text.parse::<f64>() {
                Ok(x) => x,
                Err(_) => return err("bad number", self.i),
            };
            if !x.is_finite() {
                return err("has no double", self.i);
            }
            match Number::from_f64(x) {
                Some(n) => Ok(Value::Number(n)),
                None => err("has no double", self.i),
            }
        } else {
            match text.parse::<Number>() {
                Ok(n) => Ok(Value::Number(n)),
                Err(_) => err("bad integer", self.i),
            }
        }
    }

    fn hex4(&mut self) -> Result<u16, String> {
        if self.i + 4 > self.c.len() {
            return err("bad unicode escape", self.i);
        }
        let mut v: u32 = 0;
        for k in 0..4 {
            match self.c[self.i + k].to_digit(16) {
                Some(d) => v = v * 16 + d,
                None => return err("bad unicode escape", self.i),
            }
        }
        self.i += 4;
        Ok(v as u16)
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut u: Vec<u16> = Vec::new();
        loop {
            let ch = match self.peek() {
                Some(c) => c,
                None => return err("unterminated string", self.i),
            };
            self.i += 1;
            match ch {
                '"' => return Ok(String::from_utf16_lossy(&u)),
                '\\' => {
                    let e = match self.peek() {
                        Some(c) => c,
                        None => return err("bad escape", self.i),
                    };
                    self.i += 1;
                    let x = match e {
                        '"' => 0x22,
                        '/' => 0x2F,
                        '\\' => 0x5C,
                        'b' => 0x08,
                        'f' => 0x0C,
                        'n' => 0x0A,
                        'r' => 0x0D,
                        't' => 0x09,
                        'u' => self.hex4()?,
                        _ => return err("bad escape", self.i),
                    };
                    u.push(x);
                }
                c if (c as u32) < 0x20 => return err("control character in string", self.i),
                c => {
                    let mut b = [0u16; 2];
                    u.extend_from_slice(c.encode_utf16(&mut b));
                }
            }
        }
    }
}

pub fn parse_wire(line: &str) -> Result<Value, String> {
    let mut p = P { c: line.chars().collect(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i < p.c.len() {
        return err("unexpected text after the value", p.i);
    }
    Ok(v)
}
