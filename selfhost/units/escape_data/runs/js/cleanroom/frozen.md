# Frozen oracle for escape_data — worked input -> output; reproduce EXACTLY. 4 shown; 33 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  escape_data("") => ""
  escape_data("%") => "%25"
  escape_data("\r\n") => "%0D%0A"
  escape_data("%0A") => "%250A"
