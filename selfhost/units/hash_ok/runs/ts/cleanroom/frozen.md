# Frozen oracle for hash_ok — worked input -> output; reproduce EXACTLY. 17 shown; 36 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  hash_ok("􏿿", "708b8add9f6b5b556a07b72973b10ff9a3ec30e002034ef24aa076fab4b40e50") => true
  hash_ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0") => true
  hash_ok("\ufeffbom", null) => true
  hash_ok("éééééééééééééééééééééééééééé", "a2e7c1f809d17958e21b7cd370a1d7d030e07f3af72588be133d4f73fadee71d") => true
  hash_ok("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n") => throw("hashOk: a pin is 64 lowercase hex digits (got \"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\\n\")")
  hash_ok("éééééééééééééééééééééééééééééééé", "2e5152e606afb24d5817608407516dfec44866c8ed63edbb537953895bd07aa9") => true
  hash_ok("café", null) => true
  hash_ok("􏿿", null) => true
  hash_ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34") => true
  hash_ok("éééééééééééééééééééééééééééééééé", null) => true
  hash_ok("\u00a0nbsp", "65706092cefca3fd3abca0e081af45b27a015c2e2988919f368fa71142ef9d51") => true
  hash_ok("ß", null) => true
  hash_ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a") => true
  hash_ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null) => true
  hash_ok("日本語", "77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5") => true
  hash_ok("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null) => true
  hash_ok("", null) => true
