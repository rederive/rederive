# Frozen oracle for carried_canonical — worked input -> output; reproduce EXACTLY. 22 shown; 35 more are HELD OUT.
  carried_canonical({}) => "{}"
  carried_canonical({"aliceblue":[240,248,255],"blue":[0,0,255],"green":[0,128,0],"red":[255,0,0]}) => "{\"aliceblue\":[240,248,255],\"blue\":[0,0,255],\"green\":[0,128,0],\"red\":[255,0,0]}"
  carried_canonical({"a":2,"b":1,"c":3}) => "{\"a\":2,\"b\":1,\"c\":3}"
  carried_canonical({"B":1,"Z":3,"_":4,"a":2,"~":5}) => "{\"B\":1,\"Z\":3,\"_\":4,\"a\":2,\"~\":5}"
  carried_canonical({"0":"zero","10":"ten","100":"h","2":"two","9":"nine","a":"a"}) => "{\"0\":\"zero\",\"10\":\"ten\",\"100\":\"h\",\"2\":\"two\",\"9\":\"nine\",\"a\":\"a\"}"
  carried_canonical({"-1":3,"01":1,"1":2,"1.5":4,"1e3":5,"4294967294":8,"4294967295":7,"a1":6}) => "{\"-1\":3,\"01\":1,\"1\":2,\"1.5\":4,\"1e3\":5,\"4294967294\":8,\"4294967295\":7,\"a1\":6}"
  carried_canonical({"é":"e-acute","가":"hangul","😀":"astral","":"private","！":"fullwidth"}) => "{\"é\":\"e-acute\",\"가\":\"hangul\",\"😀\":\"astral\",\"\":\"private\",\"！\":\"fullwidth\"}"
  carried_canonical({"":"empty key"," ":"space","\"":"quote","/":"solidus","\\":"backslash"}) => "{\"\":\"empty key\",\" \":\"space\",\"\\\"\":\"quote\",\"/\":\"solidus\",\"\\\\\":\"backslash\"}"
  carried_canonical({"\u0001":3,"\t":2,"\n":1,"\u001f":4,"A":7,"":5," ":6}) => "{\"\\u0001\":3,\"\\t\":2,\"\\n\":1,\"\\u001f\":4,\"A\":7,\"\":5,\" \":6}"
  carried_canonical({"c":"\b\f\r","d":"","l":"  ","q":"quote\"in\\","s":"nl\nand\ttab","u":"é😀/","z":"\u0000\u001f"}) => "{\"c\":\"\\b\\f\\r\",\"d\":\"\",\"l\":\"  \",\"q\":\"quote\\\"in\\\\\",\"s\":\"nl\\nand\\ttab\",\"u\":\"é😀/\",\"z\":\"\\u0000\\u001f\"}"
  carried_canonical({"n":[0,1,-1,0.5,0.1,0.3333333333333333,100,100000000000000000000,1e+21,123456789012345680000,0.000001,1e-7,1.23e-18,5e-324,1.7976931348623157e+308,-1e+21,9007199254740992,9007199254740992]}) => "{\"n\":[0,1,-1,0.5,0.1,0.3333333333333333,100,100000000000000000000,1e+21,123456789012345680000,0.000001,1e-7,1.23e-18,5e-324,1.7976931348623157e+308,-1e+21,9007199254740992,9007199254740992]}"
  carried_canonical({"big":1e+21,"edge20":100000000000000000000,"edge6":0.000001,"neg":-0.000001234,"small":1e-7}) => "{\"big\":1e+21,\"edge20\":100000000000000000000,\"edge6\":0.000001,\"neg\":-0.000001234,\"small\":1e-7}"
  carried_canonical({"e":[],"f":false,"m":{},"t":true,"z":null}) => "{\"e\":[],\"f\":false,\"m\":{},\"t\":true,\"z\":null}"
  carried_canonical({"list":[{"x":2,"y":1},[{"1":"a","a":"b"}]],"outer":{"10":3,"9":4,"b":2,"z":1,"😀":5,"！":6}}) => "{\"list\":[{\"x\":2,\"y\":1},[{\"1\":\"a\",\"a\":\"b\"}]],\"outer\":{\"10\":3,\"9\":4,\"b\":2,\"z\":1,\"😀\":5,\"！\":6}}"
  carried_canonical({"deep":{"a":1,"z":{"y":{"b":0,"c":[1,[2,[3,{"d":"d","e":"end"}]]]}}}}) => "{\"deep\":{\"a\":1,\"z\":{\"y\":{\"b\":0,\"c\":[1,[2,[3,{\"d\":\"d\",\"e\":\"end\"}]]]}}}}"
  carried_canonical({"__proto__":{"a":2,"b":1},"__t":"num","__throw":"x","z":1}) => "{\"__proto__\":{\"a\":2,\"b\":1},\"__t\":\"num\",\"__throw\":\"x\",\"z\":1}"
  carried_canonical({"constructor":1,"hasOwnProperty":true,"toString":"x"}) => "{\"constructor\":1,\"hasOwnProperty\":true,\"toString\":\"x\"}"
  carried_canonical({"a":1,"nan":NaN}) => throw("carried table: NaN has no JSON form")
  carried_canonical({"inf":Infinity}) => throw("carried table: Infinity has no JSON form")
  carried_canonical({"ninf":[1,-Infinity]}) => throw("carried table: -Infinity has no JSON form")
  carried_canonical({"m":{"negzero":-0}}) => throw("carried table: -0 has no JSON form")
  carried_canonical({"deep":[{"x":[0,-0]}]}) => throw("carried table: -0 has no JSON form")
