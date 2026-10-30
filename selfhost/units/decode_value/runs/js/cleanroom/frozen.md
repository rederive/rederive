# Frozen oracle for decode_value — worked input -> output; reproduce EXACTLY. 20 shown; 36 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  decode_value({"t":"none"}) => null
  decode_value({"t":"bool","v":true}) => true
  decode_value({"cu":"utf8","t":"text","v":"héllo wörld ☃ 😀"}) => "héllo wörld ☃ 😀"
  decode_value({"t":"list","v":[{"bits":"3ff8000000000000","t":"f64","v":"1.5"},{"bits":"8000000000000000","t":"f64","v":"-0"},{"bits":"7ff8000000000000","t":"f64","v":"NaN"},{"bits":"7ff0000000000000","t":"f64","v":"Infinity"},{"bits":"fff0000000000000","t":"f64","v":"-Infinity"},{"bits":"0000000000000001","t":"f64","v":"5e-324"}]}) => [1.5,-0,NaN,Infinity,-Infinity,5e-324]
  decode_value({"t":"list","v":[{"t":"tuple","v":[{"t":"i64","v":"1"},{"cu":"utf8","t":"text","v":"x"},{"t":"none"}]},{"t":"list","v":[]}]}) => [[1,"x",null],[]]
  decode_value({"t":"map","v":[[{"cu":"utf8","t":"text","v":"a"},{"t":"i64","v":"1"}],[{"cu":"utf8","t":"text","v":"b"},{"t":"list","v":[{"bits":"4002000000000000","t":"f64","v":"2.25"},{"t":"bool","v":false}]}]]}) => {"a":1,"b":[2.25,false]}
  decode_value({"t":"record","v":[["name",{"cu":"utf8","t":"text","v":"n"}],["n",{"t":"i64","v":"7"}]]}) => {"n":7,"name":"n"}
  decode_value({"msg":"top","t":"throw"}) => {"__threw":"top"}
  decode_value({"t":"map","v":[[{"cu":"utf8","t":"text","v":"__threw"},{"cu":"utf8","t":"text","v":"top map"}]]}) => {"__threw":"top map"}
  decode_value({"t":"constructor"}) => throw("not a canonical tree: unknown tag \"constructor\"")
  decode_value({"cu":"utf16","t":"text","v":"plain"}) => throw("not a canonical tree: utf16 text that is well-formed (its one spelling is cu utf8)")
  decode_value({"t":"map","v":[[{"cu":"utf8","t":"text","v":"b"},{"t":"i64","v":"1"}],[{"cu":"utf8","t":"text","v":"a"},{"t":"i64","v":"2"}]]}) => throw("not a canonical tree: map entries out of canonical order at \"a\"")
  decode_value({"bits":"fff8000000000000","t":"f64","v":"NaN"}) => throw("not a canonical tree: f64 NaN bits must be the canonical 7ff8000000000000 (got fff8000000000000)")
  decode_value({"t":"bytes","v":"base64:AR=="}) => throw("not a canonical tree: bytes base64 has non-zero padding bits (a second spelling)")
  decode_value(null) => throw("not a canonical tree: a node is a map with a text t")
  decode_value({"t":"none","v":5}) => throw("not a canonical tree: a none node has only t (got v)")
  decode_value({"t":"i64","v":"-0"}) => throw("not a canonical tree: i64 v must be a decimal string")
  decode_value({"t":"i64","v":"9223372036854775808"}) => throw("not a canonical tree: i64 out of range: 9223372036854775808")
  decode_value({"t":"bool","v":"true"}) => throw("not a canonical tree: bool v")
  decode_value({"t":"list","v":[{"cu":"utf8","t":"text","v":"ok"},{"t":"nope"}]}) => throw("not a canonical tree: unknown tag \"nope\"")
