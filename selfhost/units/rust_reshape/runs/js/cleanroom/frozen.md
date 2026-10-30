# Frozen oracle for rust_reshape — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  rust_reshape(null, null) => null
  rust_reshape(5, {"k":"i64"}) => 5
  rust_reshape([1,2], {"k":"json"}) => [1,2]
  rust_reshape([1,2], {"k":"nope"}) => [1,2]
  rust_reshape([1,2], "record") => [1,2]
  rust_reshape([1], {"fields":[["a",{"k":"i64"}]],"k":"Record"}) => [1]
  rust_reshape([1,"x"], {"alts":[{"k":"none"},{"fields":[["a",{"k":"i64"}],["b",{"k":"text"}]],"k":"record"}],"k":"union"}) => {"a":1,"b":"x"}
  rust_reshape([1,2], {"alts":[{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"},{"k":"none"}],"k":"union"}) => {"a":1,"b":2}
  rust_reshape([1,99], {"alts":[{"fields":[["x",{"k":"f64"}]],"k":"record"},{"item":{"k":"f64"},"k":"list"}],"k":"union"}) => [1,99]
  rust_reshape([1,2], {"alts":[{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"}],"k":"union"}) => [1,2]
  rust_reshape([1,2], {"alts":[{"k":"none"},{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"},{"k":"none"}],"k":"union"}) => [1,2]
  rust_reshape([1,2], {"alts":[{"k":"none"},{"k":"none"}],"k":"union"}) => [1,2]
  rust_reshape([1,2], {"alts":[{"k":"NONE"},{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"}],"k":"union"}) => [1,2]
  rust_reshape([1,2], {"alts":[{"k":"none"},5],"k":"union"}) => [1,2]
  rust_reshape([[1,2]], {"alts":[{"item":{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"},"k":"list"},{"k":"none"}],"k":"union"}) => [{"a":1,"b":2}]
  rust_reshape([[1,2]], {"alts":[{"item":{"fields":[["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"},"k":"list"},{"k":"text"},{"k":"none"}],"k":"union"}) => [[1,2]]
  rust_reshape([1,"x"], {"fields":[["a",{"k":"i64"}],["b",{"k":"text"}]],"k":"record"}) => {"a":1,"b":"x"}
  rust_reshape([1,"x",99], {"fields":[["a",{"k":"i64"}],["b",{"k":"text"}]],"k":"record"}) => [1,"x",99]
  rust_reshape([1], {"fields":[["a",{"k":"i64"}],["b",{"k":"text"}]],"k":"record"}) => [1]
  rust_reshape([], {"fields":[],"k":"record"}) => {}
  rust_reshape([7], {"fields":[],"k":"record"}) => [7]
  rust_reshape({"a":1,"b":"x"}, {"fields":[["a",{"k":"i64"}],["b",{"k":"text"}]],"k":"record"}) => {"a":1,"b":"x"}
  rust_reshape([[1,2],[3,[4,5]]], {"fields":[["p",{"fields":[["x",{"k":"i64"}],["y",{"k":"i64"}]],"k":"record"}],["q",{"items":[{"k":"i64"},{"fields":[["m",{"k":"i64"}],["n",{"k":"i64"}]],"k":"record"}],"k":"tuple"}]],"k":"record"}) => {"p":{"x":1,"y":2},"q":[3,{"m":4,"n":5}]}
  rust_reshape([1,2,3], {"fields":[["b",{"k":"i64"}],["a",{"k":"i64"}],["b",{"k":"i64"}]],"k":"record"}) => {"a":2,"b":3}
