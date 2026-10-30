# Frozen oracle for cmp_ver — worked input -> output; reproduce EXACTLY. 24 shown; 96 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  cmp_ver("0.5", "0.4") => 1
  cmp_ver("0.4", "0.5") => -1
  cmp_ver("0.4", "0.4") => 0
  cmp_ver("0.5", "0.5.0") => 0
  cmp_ver("1", "1.0.0.0") => 0
  cmp_ver("0.4", "0.4.0.0.0.1") => -1
  cmp_ver("0.10", "0.9") => 1
  cmp_ver("10", "9") => 1
  cmp_ver("2", "10") => -1
  cmp_ver("9007199254740993", "9007199254740992") => 1
  cmp_ver("1234567890123456789012345678901", "1234567890123456789012345678900") => 1
  cmp_ver("0.123456789012345678901234567890", "0.123456789012345678901234567890") => 0
  cmp_ver("10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999") => 1
  cmp_ver("", "0.4") => throw("not a version: \"\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("0.05", "0.5") => throw("not a version: \"0.05\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("0.5-rc1", "0.4") => throw("not a version: \"0.5-rc1\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("v1.0", "0.4") => throw("not a version: \"v1.0\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("-1", "0") => throw("not a version: \"-1\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver(" 0.5", "0.5") => throw("not a version: \" 0.5\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("0.5", "0.4\n") => throw("not a version: \"0.4\\n\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("0..5", "0") => throw("not a version: \"0..5\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("0.4.", "0.4") => throw("not a version: \"0.4.\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("٥", "5") => throw("not a version: \"٥\" (expected <digits>(.<digits>)*, no leading zeros)")
  cmp_ver("1e3", "1000") => throw("not a version: \"1e3\" (expected <digits>(.<digits>)*, no leading zeros)")
