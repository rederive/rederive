# Frozen oracle for carried_shape_type — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  carried_shape_type("text") => {"k":"text"}
  carried_shape_type("map text -> u8") => {"k":"map","key":{"k":"text"},"val":{"k":"u64"}}
  carried_shape_type("map text -> map u16 -> i32") => {"k":"map","key":{"k":"text"},"val":{"k":"map","key":{"k":"u64"},"val":{"k":"i64"}}}
  carried_shape_type("map[text, u32]") => {"k":"map","key":{"k":"text"},"val":{"k":"u64"}}
  carried_shape_type("i8") => {"k":"i64"}
  carried_shape_type("u16 | none") => {"alts":[{"k":"u64"},{"k":"none"}],"k":"union"}
  carried_shape_type("list[u8]; a list of bytes") => {"item":{"k":"u64"},"k":"list"}
  carried_shape_type("record[name: text, age: u8]") => {"fields":[["name",{"k":"text"}],["age",{"k":"u64"}]],"k":"record"}
  carried_shape_type("record[u8: text]") => {"fields":[["u8",{"k":"text"}]],"k":"record"}
  carried_shape_type("record[u8: u8, i16x: i16]") => {"fields":[["u8",{"k":"u64"}],["i16x",{"k":"i64"}]],"k":"record"}
  carried_shape_type("map map[text, u8] -> list[i32]") => {"k":"map","key":{"k":"map","key":{"k":"text"},"val":{"k":"u64"}},"val":{"item":{"k":"i64"},"k":"list"}}
  carried_shape_type("map map a -> b -> c") => throw("expected '[' at 8 in \"map[map a, b -> c]\"")
  carried_shape_type("map text, text] | map[u8 -> text") => {"alts":[{"k":"map","key":{"k":"text"},"val":{"k":"text"}},{"k":"map","key":{"k":"u64"},"val":{"k":"text"}}],"k":"union"}
  carried_shape_type("json | text") => throw("a union alternative is unreachable: an earlier json accepts every value it does at 11 in \"json | text\"")
  carried_shape_type("text | json") => {"alts":[{"k":"text"},{"k":"json"}],"k":"union"}
  carried_shape_type("list[json] | list[text]") => throw("a union alternative is unreachable: an earlier list accepts every value it does at 23 in \"list[json] | list[text]\"")
  carried_shape_type("record[i8: text, i64: text]") => {"fields":[["i8",{"k":"text"}],["i64",{"k":"text"}]],"k":"record"}
  carried_shape_type("tuple[i32, f64, bool]") => {"items":[{"k":"i64"},{"k":"f64"},{"k":"bool"}],"k":"tuple"}
  carried_shape_type("  map\ttext -> text | none\t ") => {"k":"map","key":{"k":"text"},"val":{"alts":[{"k":"text"},{"k":"none"}],"k":"union"}}
  carried_shape_type("list[u8\n]") => {"item":{"k":"u64"},"k":"list"}
  carried_shape_type("u8\n") => {"k":"u64"}
  carried_shape_type("list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]") => {"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"k":"text"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"}
  carried_shape_type("list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]]") => throw("types nest deeper than 16 at 84 in \"list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]]\"")
  carried_shape_type("") => throw("expected an identifier at 0 in \"\"")
