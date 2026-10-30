# Frozen oracle for escape_markers — worked input -> output; reproduce EXACTLY. 14 shown; 21 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  escape_markers({"__t":"bigint","v":"1"}) => {"__t":"obj","v":{"__t":"bigint","v":"1"}}
  escape_markers({"__throw":"boom"}) => {"__t":"obj","v":{"__throw":"boom"}}
  escape_markers({"__threw":"boom"}) => {"__t":"obj","v":{"__threw":"boom"}}
  escape_markers({"__t":5}) => {"__t":"obj","v":{"__t":5}}
  escape_markers({"__throw":null}) => {"__t":"obj","v":{"__throw":null}}
  escape_markers({"__threw":[1,2]}) => {"__t":"obj","v":{"__threw":[1,2]}}
  escape_markers({"a":1,"b":"x"}) => {"a":1,"b":"x"}
  escape_markers({"__T":"x","__t ":"z","__throws":"w","_t":"y","t":2,"threw":1}) => {"__T":"x","__t ":"z","__throws":"w","_t":"y","t":2,"threw":1}
  escape_markers({"a":{"b":{"__threw":"deep"}}}) => {"a":{"b":{"__t":"obj","v":{"__threw":"deep"}}}}
  escape_markers([1,{"__t":"num","v":"NaN"},[{"__throw":"x"}]]) => [1,{"__t":"obj","v":{"__t":"num","v":"NaN"}},[{"__t":"obj","v":{"__throw":"x"}}]]
  escape_markers({"__t":"obj","v":{"__throw":"inner"}}) => {"__t":"obj","v":{"__t":"obj","v":{"__t":"obj","v":{"__throw":"inner"}}}}
  escape_markers({"__t":"z","__threw":"x","__throw":"y","z":1}) => {"__t":"obj","v":{"__t":"z","__threw":"x","__throw":"y","z":1}}
  escape_markers([[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[1]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]) => [[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[1]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]
  escape_markers(null) => null
