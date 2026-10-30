# Frozen oracle for pin_lint — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  pin_lint("PINNED regex X = /a/ CITED R1") => {hits:[], pins:1}
  pin_lint("UNIT u\nPINNED charset C = 0-9\nPINNED charset D = a-f ANCHOR spec\nEARNED round-2 heldout v3") => {hits:[{line:2, what:"pin without a citation", text:"PINNED charset C = 0-9"}], pins:3}
  pin_lint("PINNED x = 1 # not cited") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x = 1 # not cited"}], pins:1}
  pin_lint("PINNED x = \"a CITED b\"") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x = \"a CITED b\""}], pins:1}
  pin_lint("PINNED x\n  CITED R1") => {hits:[], pins:1}
  pin_lint("PINNED x\n\n# c\n  EARNED r1\nNOTE n\n  CITED late") => {hits:[], pins:1}
  pin_lint("PINNED x CITED\nPINNED y CITED \u00a0 ANCHOR\nPINNED z CITED \u00a0\nPINNED q CITED \"\"\nPINNED r CITED '\u200b'\nPINNED s CITED \u0085\nPINNED t CITED “”") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x CITED"},{line:2, what:"pin without a citation", text:"PINNED y CITED \u00a0 ANCHOR"},{line:3, what:"pin without a citation", text:"PINNED z CITED \u00a0"},{line:4, what:"pin without a citation", text:"PINNED q CITED \"\""},{line:5, what:"pin without a citation", text:"PINNED r CITED '\u200b'"}], pins:7}
  pin_lint("EARNED\nEARNED CITED\nEARNED\n  round-1\nEARNED: r2\nEARNED\n  \"\" CITED\nEARNED \u00a0\nEARNED\n\n# c\nprose") => {hits:[{line:1, what:"pin without a citation", text:"EARNED"},{line:2, what:"pin without a citation", text:"EARNED CITED"},{line:6, what:"pin without a citation", text:"EARNED"},{line:8, what:"pin without a citation", text:"EARNED \u00a0"}], pins:7}
  pin_lint("A\rPINNED x\rB CITED y\r\nPINNED z") => {hits:[{line:2, what:"pin without a citation", text:"PINNED x"},{line:4, what:"pin without a citation", text:"PINNED z"}], pins:2}
  pin_lint("\ufeffPINNED a\n  \ufeffCITED b\n\ufeff \ufeffPINNED c\n\ufeff\t\ufeff\ufeff \ufeffCITED d\n\ufeff\ufeffPINNED e\nPINNED f\n\ufeff") => {hits:[{line:5, what:"pin without a citation", text:"PINNED e"},{line:6, what:"pin without a citation", text:"PINNED f"}], pins:3}
  pin_lint(" PINNED a\n\tEARNED b\n\u00a0PINNED c\n\u000bPINNED d\nPINNED\u00a0e\nPINNED: f\nPINNED:g") => {hits:[{line:6, what:"pin without a citation", text:"PINNED: f"}], pins:1}
  pin_lint("PINNEDS x\n  CITED y\nPINNED-X\nPINNED_x\nPINNED9\nR1 rule\npinned x\nEARNEDx") => {hits:[], pins:0}
  pin_lint("PINNED x citeD\nPINNED y Cited z\nPINNED w CITEDx\nPINNED v xCITED y\nPINNED u CITED:y\nPINNED t\tCITED\tq") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x citeD"},{line:2, what:"pin without a citation", text:"PINNED y Cited z"},{line:3, what:"pin without a citation", text:"PINNED w CITEDx"},{line:4, what:"pin without a citation", text:"PINNED v xCITED y"},{line:5, what:"pin without a citation", text:"PINNED u CITED:y"}], pins:6}
  pin_lint("PINNED x\nCITED R1\nPINNED y\nCITED: R2") => {hits:[{line:3, what:"pin without a citation", text:"PINNED y"}], pins:2}
  pin_lint("PINNED bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") => {hits:[{line:1, what:"pin without a citation", text:"PINNED bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}], pins:1}
  pin_lint("PINNED aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa😀z") => {hits:[{line:1, what:"pin without a citation", text:"PINNED aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa😀"}], pins:1}
  pin_lint("") => {hits:[], pins:0}
  pin_lint("PINNED") => {hits:[{line:1, what:"pin without a citation", text:"PINNED"}], pins:1}
  pin_lint("PINNED x #CITED y\nPINNED y#\tCITED z\nPINNED z # q CITED w\nPINNED w CITED v #") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x #CITED y"},{line:3, what:"pin without a citation", text:"PINNED z # q CITED w"}], pins:4}
  pin_lint("NOTE no pins here\nR1 x CITED y") => {hits:[], pins:0}
  pin_lint("PINNED x   \t\n") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x"}], pins:1}
  pin_lint("  CITED orphan\nPINNED x\n# CITED y\n  # ANCHOR z") => {hits:[{line:2, what:"pin without a citation", text:"PINNED x"}], pins:1}
  pin_lint("PINNED x=\"a CITED b\"\nPINNED y/\"a CITED b\"\nPINNED z 12\"a CITED b\"\nPINNED w /\"(?:a|b)*\"/ CITED R5\nPINNED v +\"a CITED b\"\nPINNED u ?\"a CITED b\"\nPINNED t ~\"a CITED b\"") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x=\"a CITED b\""},{line:7, what:"pin without a citation", text:"PINNED t ~\"a CITED b\""}], pins:7}
  pin_lint("PINNED x \"a\\\" CITED b\"\nPINNED y \"a\" \"b CITED c\"\nPINNED z \"a\"\"b CITED c\"\nPINNED w \"open CITED q") => {hits:[{line:1, what:"pin without a citation", text:"PINNED x \"a\\\" CITED b\""},{line:2, what:"pin without a citation", text:"PINNED y \"a\" \"b CITED c\""},{line:3, what:"pin without a citation", text:"PINNED z \"a\"\"b CITED c\""}], pins:4}
