# Frozen oracle for f64_canonical_bits — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  f64_canonical_bits("fff8000000000000") => "7ff8000000000000"
  f64_canonical_bits("0000000000000000") => "0000000000000000"
  f64_canonical_bits("7ff0000000000001") => "7ff8000000000000"
  f64_canonical_bits("") => throw("f64 bits must be 16 lowercase hex digits (got \"\")")
  f64_canonical_bits("7fffffffffffffff") => "7ff8000000000000"
  f64_canonical_bits("8000000000000000") => "8000000000000000"
  f64_canonical_bits("ffffffffffffffff") => "7ff8000000000000"
  f64_canonical_bits("7FF8000000000000") => throw("f64 bits must be 16 lowercase hex digits (got \"7FF8000000000000\")")
  f64_canonical_bits("fff0000000000001") => "7ff8000000000000"
  f64_canonical_bits("7ff0000000000000") => "7ff0000000000000"
  f64_canonical_bits("7ff8000000000001") => "7ff8000000000000"
  f64_canonical_bits("7ff800000000000") => throw("f64 bits must be 16 lowercase hex digits (got \"7ff800000000000\")")
  f64_canonical_bits("7ff4000000000000") => "7ff8000000000000"
  f64_canonical_bits("fff0000000000000") => "fff0000000000000"
  f64_canonical_bits("fff8000000000001") => "7ff8000000000000"
  f64_canonical_bits("7ff80000000000000") => throw("f64 bits must be 16 lowercase hex digits (got \"7ff80000000000000\")")
  f64_canonical_bits("7ff0000080000000") => "7ff8000000000000"
  f64_canonical_bits("0000000000000001") => "0000000000000001"
  f64_canonical_bits("7ff0000100000000") => "7ff8000000000000"
  f64_canonical_bits("7ff8000000000000\n") => throw("f64 bits must be 16 lowercase hex digits (got \"7ff8000000000000\\n\")")
  f64_canonical_bits("7ff7ffffffffffff") => "7ff8000000000000"
  f64_canonical_bits("8000000000000001") => "8000000000000001"
  f64_canonical_bits("fffc000000000000") => "7ff8000000000000"
  f64_canonical_bits("+fffffffffffffff") => throw("f64 bits must be 16 lowercase hex digits (got \"+fffffffffffffff\")")
