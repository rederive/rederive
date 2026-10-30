# Frozen oracle for carried_declared — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  carried_declared("") => null
  carried_declared("CARRIED t FROM x") => {name:"t", from:"x", sha:null, shape:null, assertions:[]}
  carried_declared("UNIT get_rgb\nKIND FUNCTIONAL\nSIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none\nDEPENDS-ON none\nCARRIED colorNames FROM color-name@2.0.0 index.json\n  SHAPE map text -> tuple[u64, u64, u64]; 148 entries\n  CANONICAL-SHA256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n  AUTHORITY { expr: \"count\", equals: 148 }\n  AUTHORITY { expr: \"rebeccapurple\", equals: [102, 51, 153] }\nBEHAVIOR\nR1 Empty text -> none.\nORACLE value -> oracles/get_rgb.json CANONICAL-SHA256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n") => {name:"colorNames", from:"color-name@2.0.0 index.json", sha:"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", shape:"map text -> tuple[u64, u64, u64]; 148 entries", assertions:[{expr:"count", equals:148},{expr:"rebeccapurple", equals:[102,51,153]}]}
  carried_declared("CARRIED t FROM x\n  SHAPE s\nORACLE value -> oracles/u.json\n  CANONICAL-SHA256 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n  AUTHORITY { expr: \"o\", equals: 1 }") => {name:"t", from:"x", sha:null, shape:"s", assertions:[]}
  carried_declared("CARRIED t FROM x\n  SHAPE a\nCARRIED v FROM y\n  SHAPE b") => throw("one CARRIED table per primary (lines 1, 3)")
  carried_declared("CARRIED-DATA old FROM z\n  SHAPE q\nCARRIED t FROM x\n  SHAPE s") => {name:"t", from:"x", sha:null, shape:"s", assertions:[]}
  carried_declared("UNIT u\nCARRIED: t FROM x\n  SHAPE s") => {name:"t", from:"x", sha:null, shape:"s", assertions:[]}
  carried_declared("UNIT u\n  CARRIED t FROM x\n  SHAPE s") => null
  carried_declared("\ufeffCARRIED t FROM x\n \ufeff \ufeff\tSHAPE s\n\ufeff\ufeff  CANONICAL-SHA256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") => {name:"t", from:"x", sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shape:"s", assertions:[]}
  carried_declared("UNIT u\nKIND FUNCTIONAL\nCARRIED t FROM x\n  SHAPE s\nCITED: t\n\u2060CARRIED t FROM x") => {name:"t", from:"x", sha:null, shape:"s", assertions:[]}
  carried_declared("SHAPE early\nCARRIED t FROM x") => throw("CARRIED: SHAPE at line 1 is not indented under CARRIED")
  carried_declared("UNIT u\nSHAPE: s\nCARRIED t FROM x") => throw("CARRIED: SHAPE at line 2 is not indented under CARRIED")
  carried_declared("NOTE n\nCANONICAL-SHA256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nCARRIED t FROM x") => throw("CARRIED: CANONICAL-SHA256 at line 2 is not indented under CARRIED")
  carried_declared("CARRIED t FROM x\n  SHAPE s\nNOTE n\nAUTHORITY { expr: \"col0\", equals: 1 }") => throw("CARRIED: AUTHORITY at line 4 is not indented under CARRIED")
  carried_declared("UNIT u\nSHAPE s\nAUTHORITY x") => null
  carried_declared("CARRIED t = mod.js (default export)") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
  carried_declared("CARRIED t\n  FROM x") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
  carried_declared("CARRIED a b FROM x") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
  carried_declared("CARRIED ét FROM x") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
  carried_declared("CARRIED FROM\tFROM\t\tpkg@1.0.0 a.json CITED upstream ANCHOR x") => {name:"FROM", from:"pkg@1.0.0 a.json", sha:null, shape:null, assertions:[]}
  carried_declared("CARRIED t FROM \"a # b CITED c\" # trailing") => {name:"t", from:"\"a # b CITED c\"", sha:null, shape:null, assertions:[]}
  carried_declared("CARRIED t FROM  ") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
  carried_declared("CARRIED t FROM \u3000src \u000b\u00a0") => {name:"t", from:"\u3000src \u000b\u00a0", sha:null, shape:null, assertions:[]}
  carried_declared("CARRIED t FROM a\u2028b") => throw("CARRIED must read `CARRIED <name> FROM <source>` (line 1)")
