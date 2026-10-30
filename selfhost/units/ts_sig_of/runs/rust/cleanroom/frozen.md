# Frozen oracle for ts_sig_of — worked input -> output; reproduce EXACTLY. 24 shown; 48 more are HELD OUT.
# Every whitespace character other than a plain space, and every control or invisible character, is written as a \uXXXX escape.
  ts_sig_of("export default function bytes(value: unknown, options?: unknown): string | number | null") => {exportName:null, fnType:"(value: unknown, options?: unknown) => string | number | null"}
  ts_sig_of("export function pick<T>(xs: readonly T[], f: (x: T) => boolean): T | null") => {exportName:"pick", fnType:"<T>(xs: readonly T[], f: (x: T) => boolean) => T | null"}
  ts_sig_of("export const x = 1") => throw("SIG is not an exported function declaration: export const x = 1")
  ts_sig_of("export default function f(a: string)") => throw("SIG declares no return type: export default function f(a: string)")
  ts_sig_of("export   default\tfunction\t\tf(a: string):\tstring") => {exportName:null, fnType:"(a: string) => string"}
  ts_sig_of(" \t export function f(a: string): string \t ") => {exportName:"f", fnType:"(a: string) => string"}
  ts_sig_of("export function f<T extends (x: number) => void>(a: T): T") => {exportName:"f", fnType:"<T extends (x: number) => void>(a: T) => T"}
  ts_sig_of("export function f<T extends '>'>(a: T, b: \"(\"): T") => {exportName:"f", fnType:"<T extends '>'>(a: T, b: \"(\") => T"}
  ts_sig_of("export function f(a: \"x;y=z//`\", b: 'it\\'s ) any'): \"never\"") => {exportName:"f", fnType:"(a: \"x;y=z//`\", b: 'it\\'s ) any') => \"never\""}
  ts_sig_of("export function f(): string = impl as never; //") => throw("SIG is more than one declaration (a ; = comment or line break outside a literal type): export function f(): string = impl as never; //")
  ts_sig_of("export function f(a: string): string; export const g = 1") => throw("SIG is more than one declaration (a ; = comment or line break outside a literal type): export function f(a: string): string; export const g = 1")
  ts_sig_of("export function f(): any") => throw("SIG uses any or never, which every artifact satisfies: export function f(): any")
  ts_sig_of("export function f(...a: never[]): unknown") => throw("SIG uses any or never, which every artifact satisfies: export function f(...a: never[]): unknown")
  ts_sig_of("export function f(a: x.any, b: $never, c: company): s") => {exportName:"f", fnType:"(a: x.any, b: $never, c: company) => s"}
  ts_sig_of("export function f(a: typeof x): s") => throw("SIG uses typeof / import / infer — a contract type names no value: export function f(a: typeof x): s")
  ts_sig_of("export function f\u00a0(a): s") => throw("SIG has no parameter list: export function f\u00a0(a): s")
  ts_sig_of("export function f(a)\n: string") => throw("SIG is more than one declaration (a ; = comment or line break outside a literal type): export function f(a)\n: string")
  ts_sig_of("export function f(): ") => throw("SIG declares no return type: export function f(): ")
  ts_sig_of("export function f(a: \"unterminated): s") => {exportName:"f", fnType:"(a: \"unterminated) => s"}
  ts_sig_of("export function f(): { a: number; b: boolean }") => {exportName:"f", fnType:"() => { a: number; b: boolean }"}
  ts_sig_of("export function f(o: { a: string; b?: number }): void") => {exportName:"f", fnType:"(o: { a: string; b?: number }) => void"}
  ts_sig_of("export function f(): { a: number }; s") => throw("SIG is more than one declaration (a ; = comment or line break outside a literal type): export function f(): { a: number }; s")
  ts_sig_of("export function f(): { a: number }}; s") => throw("SIG is more than one declaration (a ; = comment or line break outside a literal type): export function f(): { a: number }}; s")
  ts_sig_of("export function f(): s } { a; b }") => {exportName:"f", fnType:"() => s } { a; b }"}
