# Frozen oracle for languages_of — worked input -> output; reproduce EXACTLY. 24 shown; 46 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  languages_of({"sirFiles":["x.sir","x.ts.sir","x.rust.sir","x.ts.sir"]}) => ["rust","ts"]
  languages_of({"sirFiles":["u.python.sir","README.md"],"variants":{"lang:rust":{"lang":"rust","sir":"sir/x.rust.sir"},"lang:ts":{},"package":{"lang":"php"}}}) => ["php","python","rust","ts"]
  languages_of({"sirFiles":["x.sir","x.carried.json","x.inputs.mjs","README.md","ts.sir",".sir","x.ts.sir.bak","x.ts.sir/","x.ts.sirx","x.ts.sir~","x.ts.ſir","x.ts.ſir\u200b","x.ts.sır","x.ts.sİr\u0085","x.ts.sir.\u200b","README.md\u200b","x.ts.sir\\","x.ts.sir\u200b~",""]}) => []
  languages_of({"sirFiles":["/abs/dir.v2/u.ts.sir","a\\b\\c.csharp.sir"," x.js.sir\t","x.rust.SIR",".python.sir","x.php.sIr","kind-of.csharp.sir","_9.js.sir","A-b_C.ts.sir"]}) => ["csharp","js","php","python","rust","ts"]
  languages_of({"sirFiles":["a.b.ts.sir"]}) => throw("a.b.ts.sir: \"a.b.ts.sir\" has 2 dotted segments before .sir — a unit name has no dots, so a SIR file is <unit>.sir or <unit>.<lang>.sir")
  languages_of({}) => []
  languages_of({"sirFiles":["\u200bx.sir"]}) => throw("\u200bx.sir: \"\u200bx.sir\" — a unit name is letters, digits, _ and -")
  languages_of({"variants":{"lang:php":{"lang":"php","sir":"u.php.sir"},"lang:ts":{"lang":"ts","n":3,"sir":"a\\x.ts.SIR "},"package":{"sir":"x.rust.sir"}}}) => ["php","rust","ts"]
  languages_of({"variants":{"Lang:ts":{}}}) => throw("variant Lang:ts: a variant key is 'package' or 'lang:<id>'")
  languages_of({"sirFiles":["x.ts.sir\u0085"]}) => throw("x.ts.sir\u0085: \"x.ts.sir\u0085\" is a .sir name followed by invisible or non-ASCII characters")
  languages_of({"sirFiles":["x.ts.sir"],"variants":{"lang:ts":{"sir":"sir/x.ts.sir"}}}) => ["ts"]
  languages_of({"variants":{"lang:rust":{"lang":"ts"}}}) => throw("variant lang:rust: its key, lang field and sir path name different languages (rust, ts)")
  languages_of({"variants":{"package":{"lang":"ts","sir":"u.sir"}}}) => throw("variant package: its sir path \"u.sir\" names no language")
  languages_of({"sirFiles":["x y.ts.sir"]}) => throw("x y.ts.sir: \"x y.ts.sir\" — a unit name is letters, digits, _ and -")
  languages_of({"variants":{"lang:ts":{"sir":"x.sir"}}}) => throw("variant lang:ts: its sir path \"x.sir\" names no language")
  languages_of({"variants":{"lang:ts":{},"package":{"lang":"ts"}}}) => throw("variants lang:ts and package both claim language 'ts'")
  languages_of({"extra":5,"sirFiles":[],"variants":null}) => []
  languages_of({"variants":{"package":{"sir":"README.md"}}}) => throw("variant package: sir must be a path to a .sir file (got \"README.md\")")
  languages_of({"variants":{"lang:ts":"ts"}}) => throw("variant lang:ts: a variant is a map")
  languages_of({"variants":{" lang:ts":{}}}) => throw("variant  lang:ts: a variant key is 'package' or 'lang:<id>'")
  languages_of({"sirFiles":["C:\\units.v2\\x.rust.sir","x.go.sir/u.php.sir"," \t dir/x.ts.sir \t ","x.python.Sir","x.ts.sir\t \t",".sir","..ts.sir/"]}) => ["php","python","rust","ts"]
  languages_of(null) => throw("languagesOf takes a map { sirFiles, variants }")
  languages_of({"sirFiles":"x.ts.sir"}) => throw("sirFiles must be a list of paths (got string)")
  languages_of({"variants":["lang:ts"]}) => throw("variants must be a map")
