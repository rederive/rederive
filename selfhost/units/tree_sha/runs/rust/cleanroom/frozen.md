# Frozen oracle for tree_sha — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  tree_sha({}) => "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  tree_sha({"a":""}) => "84a0bc84a8906a8501a34e9aedb06be93452d06bc32b71d61f0b334cd5559d9b"
  tree_sha({"a":"x"}) => "b71899f0e13a58405ecef8ed7b7e0930a32f40e799828f8716ea8ace8e8ca782"
  tree_sha({"Cargo.toml":"[package]\nname = \"x\"\n","src/lib.rs":"pub fn f() {}\n"}) => "d50fe2e0a63af5596e6c58238a1c26dce42adf170344bb5fc3fe15021dcf62d9"
  tree_sha({"target":"a FILE named target at the root -> kept"}) => "96ddbd12a173095f3775dd2728f0ac87a8dc0450f0fd3005c763c4e934e47236"
  tree_sha({"":"x"}) => throw("tree_sha: not a relative path \"\"")
  tree_sha({"a//b":"1"}) => throw("tree_sha: not a relative path \"a//b\"")
  tree_sha({"../x":"1"}) => throw("tree_sha: not a relative path \"../x\"")
  tree_sha({"src/lib.rs":"fn a(){}","target/debug/x":"bin"}) => "225f40db7ef80319f0ef47d76e4d462b3bfe39febc2ac6e674e8a1c268756536"
  tree_sha({"target/a":"1"}) => "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  tree_sha({"Cargo.toml":"","target/a":"1","target/b/c":"2"}) => "12ab4c2f6d3088f94435d1279e70a057d916e0931f23421162ff82e5b61f824a"
  tree_sha({"src/lib.rs":"fn a(){}","src/target/x.rs":"nested target dir -> kept"}) => "6f33ea5b47e5510718b7ec50fd0acaab35bd580bc82e803d90c00a425517255f"
  tree_sha({"src/lib.rs":"fn a(){}","src/target":"file at depth -> kept"}) => "8b09aa2f96623b84b1439b8d8039c1600473c2dd0cef06ad48bfa45b887f9b29"
  tree_sha({"a/b/c/f":"kept","a/b/c/target/d/e":"deep -> kept"}) => "1861254b424c6e131d2f4fea1e2dd7958127f4f2f458fce45ad3c4c4a7fbbef2"
  tree_sha({"Target/x":"case differs -> kept","my-target":"kept","target.rs":"kept","targets/y":"kept","xtarget/z":"kept"}) => "f7e3e679ee99e62307705239f22a4cdd9c8f20fe28c815be5e05c5a0408985b8"
  tree_sha({"a-b":"3","a.b":"2","a/b":"1"}) => "0787691705e6146b5c88563964df016ca3a12aeaeed7d89859aaabc1f2a71f98"
  tree_sha({"a.b":"2","a/b":"1"}) => "b5df990012fdbe877839115423a25c2f536def785391a2ef71ab0097c52bde79"
  tree_sha({"a!":"3","a/z":"1","a0":"2"}) => "15005945cf15b7ea871f3cccf676c89876fe867b3338e62697df7e0e4816c6ff"
  tree_sha({"a/c":"2","aa":"3","ab":"1"}) => "5b4cf7323da0716b5aeb23fbb5ff458c7086feddfbaaf13a9c99d789f631d785"
  tree_sha({"x/y/z/w/v/u/t/s/r/q/p":"deep nesting","x/y/z/w/v/u/t/s/r/q2":"sibling"}) => "b41e71f2cbd33d0792664f3c6c7ac74af4c98e2c134155e84442d14596ec130c"
  tree_sha({"😀":"supplementary","":"private use","Ａx":"fullwidth"}) => "dc2d4f2fd272f929f4d7893a576499b48e4149cda17aa797d6c2b298613367e4"
  tree_sha({"d/😀.rs":"a","d/�.rs":"b"}) => "962a1cb5be4e1fd3fed7c6f89c75a0baed201ff8e64e5446e7214c7b18407ff8"
  tree_sha({"e":"e","f":"f","é":"e-acute","日本":"cjk"}) => "2bd9d90f11f2111f2e8acec7b8e823b113e5f695d83847d1db33c2d85edd6f9e"
  tree_sha({"a":"é😀日","b":"line1\r\nline2\n"}) => "7a30de5cb866a814d91d56abef036962fd06f12386dafb27131c1912bb58330c"
