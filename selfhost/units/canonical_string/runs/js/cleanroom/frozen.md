# Frozen oracle for canonical_string — worked input -> output; reproduce EXACTLY. 24 shown; 31 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  canonical_string("plain text") => "\"plain text\""
  canonical_string(true) => "true"
  canonical_string([]) => "[]"
  canonical_string({}) => "{}"
  canonical_string({"bits":"3ff0000000000000","t":"f64","v":"1"}) => "{\"bits\":\"3ff0000000000000\",\"t\":\"f64\"}"
  canonical_string({"bits":"7ff8000000000000","t":"f64","v":"NaN"}) => "{\"bits\":\"7ff8000000000000\",\"t\":\"f64\"}"
  canonical_string({"bits":"8000000000000000","extra":"dropped","t":"f64","v":"display hint ignored"}) => "{\"bits\":\"8000000000000000\",\"t\":\"f64\"}"
  canonical_string({"msg":"boom","t":"throw"}) => "{\"t\":\"throw\"}"
  canonical_string({"t":"list","v":[{"t":"i64","v":"42"},{"cu":"utf8","t":"text","v":"x"},{"t":"none"},{"t":"bool","v":true}]}) => "{\"t\":\"list\",\"v\":[{\"t\":\"i64\",\"v\":\"42\"},{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"x\"},{\"t\":\"none\"},{\"t\":\"bool\",\"v\":true}]}"
  canonical_string({"t":"map","v":[[{"cu":"utf8","t":"text","v":"a"},{"bits":"7ff0000000000000","t":"f64","v":"Infinity"}],[{"cu":"utf8","t":"text","v":"k"},{"bits":"8000000000000000","t":"f64","v":"-0"}]]}) => "{\"t\":\"map\",\"v\":[[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"a\"},{\"bits\":\"7ff0000000000000\",\"t\":\"f64\"}],[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"k\"},{\"bits\":\"8000000000000000\",\"t\":\"f64\"}]]}"
  canonical_string({"t":"record","v":[["result",{"cu":"utf8","t":"text","v":"r"}],["post",{"t":"map","v":[]}]]}) => "{\"t\":\"record\",\"v\":[[\"result\",{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"r\"}],[\"post\",{\"t\":\"map\",\"v\":[]}]]}"
  canonical_string({"frozen":[{"args":[{"cu":"utf8","t":"text","v":"a"},{"bits":"4000000000000000","t":"f64","v":"2"}],"expected":{"cu":"utf8","t":"text","v":"\"a\""}},{"args":[{"t":"none"}],"expected":{"msg":"x","t":"throw"}}],"heldout":[{"args":[{"bits":"bff8000000000000","t":"f64","v":"-1.5"}],"expected":{"t":"bool","v":false}}]}) => "{\"frozen\":[{\"args\":[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"a\"},{\"bits\":\"4000000000000000\",\"t\":\"f64\"}],\"expected\":{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"\\\"a\\\"\"}},{\"args\":[{\"t\":\"none\"}],\"expected\":{\"t\":\"throw\"}}],\"heldout\":[{\"args\":[{\"bits\":\"bff8000000000000\",\"t\":\"f64\"}],\"expected\":{\"t\":\"bool\",\"v\":false}}]}"
  canonical_string({"a":[true,false],"b":"x","c":{}}) => "{\"a\":[true,false],\"b\":\"x\",\"c\":{}}"
  canonical_string("q\"uote back\\slash") => "\"q\\\"uote back\\\\slash\""
  canonical_string("\b\f\n\r\t") => "\"\\b\\f\\n\\r\\t\""
  canonical_string({"":"c","10":"a","2":"b","B":"d","a":"e","é":"f"}) => "{\"\":\"c\",\"10\":\"a\",\"2\":\"b\",\"B\":\"d\",\"a\":\"e\",\"é\":\"f\"}"
  canonical_string({"z":"4","😀":"2","":"1","￿":"3"}) => "{\"z\":\"4\",\"😀\":\"2\",\"\":\"1\",\"￿\":\"3\"}"
  canonical_string([[],{},[[]],{"a":{}},""]) => "[[],{},[[]],{\"a\":{}},\"\"]"
  canonical_string("a\u2028b\u2029c/d\u007fe") => "\"a\u2028b\u2029c/d\u007fe\""
  canonical_string({"t":"f64"}) => throw("not canonical: an f64 tag without 16-hex bits")
  canonical_string([1,"x"]) => throw("not canonical: number")
  canonical_string({"bits":"not dropped","t":"f64","v":1}) => throw("not canonical: an f64 tag without 16-hex bits")
  canonical_string({"t":"tuple","v":[{"bits":"8000000000000000","t":"f64","v":"-0"},{"bits":"7ff8000000000000","t":"f64","v":"NaN"},{"bits":"fff0000000000000","t":"f64","v":"-Infinity"},{"bits":"406fe00000000000","t":"f64","v":"255"},{"bits":"3e7ad7f29abcaf48","t":"f64","v":"1e-7"},{"bits":"0000000000000001","t":"f64","v":"5e-324"},{"bits":"444b1ae4d6e2ef50","t":"f64","v":"1e+21"}]}) => "{\"t\":\"tuple\",\"v\":[{\"bits\":\"8000000000000000\",\"t\":\"f64\"},{\"bits\":\"7ff8000000000000\",\"t\":\"f64\"},{\"bits\":\"fff0000000000000\",\"t\":\"f64\"},{\"bits\":\"406fe00000000000\",\"t\":\"f64\"},{\"bits\":\"3e7ad7f29abcaf48\",\"t\":\"f64\"},{\"bits\":\"0000000000000001\",\"t\":\"f64\"},{\"bits\":\"444b1ae4d6e2ef50\",\"t\":\"f64\"}]}"
  canonical_string({"t":"map","v":[[{"cu":"utf8","t":"text","v":"list"},{"t":"list","v":[{"bits":"3ff0000000000000","t":"f64","v":"1"},{"t":"none"},{"cu":"utf8","t":"text","v":"two"},{"t":"bool","v":false}]}],[{"cu":"utf8","t":"text","v":"name"},{"cu":"utf8","t":"text","v":"x"}],[{"cu":"utf8","t":"text","v":"nested"},{"t":"map","v":[[{"cu":"utf8","t":"text","v":"k"},{"bits":"bfe0000000000000","t":"f64","v":"-0.5"}]]}]]}) => "{\"t\":\"map\",\"v\":[[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"list\"},{\"t\":\"list\",\"v\":[{\"bits\":\"3ff0000000000000\",\"t\":\"f64\"},{\"t\":\"none\"},{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"two\"},{\"t\":\"bool\",\"v\":false}]}],[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"name\"},{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"x\"}],[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"nested\"},{\"t\":\"map\",\"v\":[[{\"cu\":\"utf8\",\"t\":\"text\",\"v\":\"k\"},{\"bits\":\"bfe0000000000000\",\"t\":\"f64\"}]]}]]}"
