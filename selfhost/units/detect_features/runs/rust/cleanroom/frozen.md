# Frozen oracle for detect_features — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  detect_features({}) => ["vectors"]
  detect_features({"sirText":"UNIT a\nKIND EFFECT\nPAR {\n  x\n}\nEFFECT a*\"microtask\" b?\"q\"\n"}) => ["vectors","par-interleaving","scheduler"]
  detect_features({"sirText":"UNIT a\nENVELOPE text only\nRING token\nCARRIED-DATA \"sbox.json\"\n\ufeff\t\ufeff# setTimer\n"}) => ["vectors","carried-data","envelope","ring"]
  detect_features({"sirText":"UNIT a\nLIFECYCLE timer armed\nDESCRIPTION uses schedule(fn) on virtual time\nCARRIED-DATA none\n  EARNED sbox.json"}) => ["vectors","carried-data","lifecycle","scheduler"]
  detect_features({"sirText":"UNIT a\nEFFECT time.timer\nDESCRIPTION arm setTimer(5)"}) => ["vectors","lifecycle","scheduler"]
  detect_features({"sirText":"UNIT a\nANCHOR ref(python:botocore.auth.SigV4Auth)\n"}) => ["vectors","cross-lang-anchor"]
  detect_features({"sirText":"UNIT a\nANCHOR ref(lodash:x) ref(js:y)\nCARRIED-DATA ANCHOR sbox.json"}) => ["vectors","carried-data","cross-lang-anchor"]
  detect_features({"carriedData":[{"name":"t"}],"mode":"trace"}) => ["vectors","carried-data","trace-seam"]
  detect_features({"carriedData":[],"envelope":" \t ","mode":"vectors","sirFiles":["u.ts.ſir","u.rust.SiR"]}) => ["vectors","lang-variant"]
  detect_features({"envelope":"\u3000","mode":"par"}) => ["vectors","envelope","par-interleaving"]
  detect_features({"mode":"ring","sirFiles":["sir/a.sir","sir/a.ts.sir","sir/a.inputs.mjs"]}) => ["vectors","ring","lang-variant"]
  detect_features({"variants":{"lang:rust":{},"package":{"lang":"js"}}}) => ["vectors","lang-variant"]
  detect_features({"sirFiles":["a.go.sir"]}) => throw("a.go.sir: 'go' is not in the closed language registry (js, ts, rust, php, csharp, python)")
  detect_features({"sirText":"UNIT a\n  PAR indented\nPARALLEL x\nPAR-X y\nDESCRIPTION RING and LIFECYCLE in prose\n  ENVELOPE in prose\n PAR\n# PAR in a comment\nNOTE x # setTimer in a trailing comment"}) => ["vectors","lifecycle"]
  detect_features({"sirText":"NOTE we never call \"setTimer\"\nNOTE x CITED virtual time\nNOTE y EARNED schedule(z)\nNOTE w ANCHOR timers.x\nANCHOR setTimer\nANCHOR see \"ref(js:x)\""}) => ["vectors"]
  detect_features({"sirText":"NOTE a;\"setTimer\" b|\"schedule(\" c-\"timers.x\" \"x\"\"virtual time\""}) => ["vectors"]
  detect_features(null) => throw("Cannot read properties of null (reading 'sirText')")
  detect_features({"sirText":"UNIT a\nFIDELITY spec ANCHOR ref(ts:x)\nNOTE x CITED ANCHOR ref(js:y)"}) => ["vectors","cross-lang-anchor"]
  detect_features({"sirText":"CARRIED-DATA \u00a0none\nEFFECT 12\" wide # microtask \"q"}) => ["vectors","carried-data"]
  detect_features({"sirText":"EFFECT \"a\\ \" # \" microtask\nFIDELITY spec ANCHOR \"a CITED b\" ref(ts:x)"}) => ["vectors","cross-lang-anchor"]
  detect_features({"sirText":"setTimer(1) schedule(x)\n  PAR\nUNIT a"}) => ["vectors","lifecycle","scheduler"]
  detect_features({"sirFiles":["x y.ts.sir"]}) => throw("x y.ts.sir: \"x y.ts.sir\" — a unit name is letters, digits, _ and -")
  detect_features({"carriedData":["x"],"envelope":"e","mode":"trace","sirFiles":["u.php.sir"],"sirText":"PAR\nRING\nLIFECYCLE\nDESCRIPTION schedule(\nANCHOR x\n  ref(rust:y)","variants":{"lang:ts":{}}}) => ["vectors","carried-data","envelope","trace-seam","par-interleaving","ring","lifecycle","scheduler","lang-variant","cross-lang-anchor"]
  detect_features({"variants":{" lang:ts":{"sir":"u.ts.sir"}}}) => throw("variant  lang:ts: a variant key is 'package' or 'lang:<id>'")
