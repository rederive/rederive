# Frozen oracle for parse_type — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  parse_type("text") => {"k":"text"}
  parse_type("record[a: text, b: i64 | none]") => {"fields":[["a",{"k":"text"}],["b",{"alts":[{"k":"i64"},{"k":"none"}],"k":"union"}]],"k":"record"}
  parse_type("list [text]") => {"item":{"k":"text"},"k":"list"}
  parse_type("list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]") => {"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"item":{"k":"text"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"},"k":"list"}
  parse_type("  f64\t|\nnone  ") => {"alts":[{"k":"f64"},{"k":"none"}],"k":"union"}
  parse_type("none | none") => throw("a union names the same alternative twice at 11 in \"none | none\"")
  parse_type("json | text") => throw("a union alternative is unreachable: an earlier json accepts every value it does at 11 in \"json | text\"")
  parse_type("list[json] | list[text]") => throw("a union alternative is unreachable: an earlier list accepts every value it does at 23 in \"list[json] | list[text]\"")
  parse_type("Text") => throw("unknown abstract type 'Text' (closed set: text, bytes, bool, none, i64, u64, f64, json, tuple[…], list[…], map[…], record[…]) at 4 in \"Text\"")
  parse_type(" \t i64\r\n") => {"k":"i64"}
  parse_type("record[ x :map[text, i64] , y\t: tuple[bool, bytes] ]") => {"fields":[["x",{"k":"map","key":{"k":"text"},"val":{"k":"i64"}}],["y",{"items":[{"k":"bool"},{"k":"bytes"}],"k":"tuple"}]],"k":"record"}
  parse_type("map\n[ text ,i64 ]") => {"k":"map","key":{"k":"text"},"val":{"k":"i64"}}
  parse_type("list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]]") => throw("types nest deeper than 16 at 84 in \"list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[list[text]]]]]]]]]]]]]]]]]\"")
  parse_type("tuple[text | none, i64] | list[bool]") => {"alts":[{"items":[{"alts":[{"k":"text"},{"k":"none"}],"k":"union"},{"k":"i64"}],"k":"tuple"},{"item":{"k":"bool"},"k":"list"}],"k":"union"}
  parse_type("list[text | none] | list[none | text]") => throw("a union names the same alternative twice at 37 in \"list[text | none] | list[none | text]\"")
  parse_type("text | json") => {"alts":[{"k":"text"},{"k":"json"}],"k":"union"}
  parse_type("map[text, json] | map[text, text]") => throw("a union alternative is unreachable: an earlier map accepts every value it does at 33 in \"map[text, json] | map[text, text]\"")
  parse_type("\u00a0text") => throw("expected an identifier at 0 in \"\u00a0text\"")
  parse_type("record[text: text, list: i64, _1: none]") => {"fields":[["text",{"k":"text"}],["list",{"k":"i64"}],["_1",{"k":"none"}]],"k":"record"}
  parse_type("record[f15: map[text, tuple[bool, list[record[f11: map[text, tuple[bool, list[record[f7: map[text, tuple[bool, list[record[f3: map[text, tuple[bool, list[i64]]]]]]]]]]]]]]]]") => {"fields":[["f15",{"k":"map","key":{"k":"text"},"val":{"items":[{"k":"bool"},{"item":{"fields":[["f11",{"k":"map","key":{"k":"text"},"val":{"items":[{"k":"bool"},{"item":{"fields":[["f7",{"k":"map","key":{"k":"text"},"val":{"items":[{"k":"bool"},{"item":{"fields":[["f3",{"k":"map","key":{"k":"text"},"val":{"items":[{"k":"bool"},{"item":{"k":"i64"},"k":"list"}],"k":"tuple"}}]],"k":"record"},"k":"list"}],"k":"tuple"}}]],"k":"record"},"k":"list"}],"k":"tuple"}}]],"k":"record"},"k":"list"}],"k":"tuple"}}]],"k":"record"}
  parse_type("record[a: text, b: i64] | record[b: i64, a: text]") => throw("a union names the same alternative twice at 49 in \"record[a: text, b: i64] | record[b: i64, a: text]\"")
  parse_type("json | map[text | none, json]") => {"alts":[{"k":"json"},{"k":"map","key":{"alts":[{"k":"text"},{"k":"none"}],"k":"union"},"val":{"k":"json"}}],"k":"union"}
  parse_type("tuple[json, i64] | tuple[text, i64]") => throw("a union alternative is unreachable: an earlier tuple accepts every value it does at 35 in \"tuple[json, i64] | tuple[text, i64]\"")
  parse_type("text\f") => throw("unexpected text at 4 in \"text\\f\"")
