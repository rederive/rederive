// @rederive/isFullwidthCodePoint — verified-recompose of is-fullwidth-code-point@3.0.0. quorum 3/3, differential 400/400, round 1. SIR: sir/isFullwidthCodePoint.sir
function isFullwidthCodePoint(codePoint) {
	if (Number.isNaN(codePoint)) {
		return false;
	}

	if (codePoint >= 0x1100 && (
		// R1: Hangul Jamo
		codePoint <= 0x115F ||
		// S1: LEFT-POINTING ANGLE BRACKET
		codePoint === 0x2329 ||
		// S2: RIGHT-POINTING ANGLE BRACKET
		codePoint === 0x232A ||
		// R2: CJK Radicals Supp .. Encl (excluding 0x303F)
		(0x2E80 <= codePoint && codePoint <= 0x3247 && codePoint !== 0x303F) ||
		// R3: Encl CJK .. Ext A
		(0x3250 <= codePoint && codePoint <= 0x4DBF) ||
		// R4: CJK Unified .. Yi Radicals
		(0x4E00 <= codePoint && codePoint <= 0xA4C6) ||
		// R5: Hangul Jamo Extended-A
		(0xA960 <= codePoint && codePoint <= 0xA97C) ||
		// R6: Hangul Syllables
		(0xAC00 <= codePoint && codePoint <= 0xD7A3) ||
		// R7: CJK Compat Ideographs
		(0xF900 <= codePoint && codePoint <= 0xFAFF) ||
		// R8: Vertical Forms
		(0xFE10 <= codePoint && codePoint <= 0xFE19) ||
		// R9: CJK Compat Forms .. Small
		(0xFE30 <= codePoint && codePoint <= 0xFE6B) ||
		// R10: Halfwidth/Fullwidth Forms (lower bound 0xFF01, NOT 0xFF00)
		(0xFF01 <= codePoint && codePoint <= 0xFF60) ||
		// R11: Fullwidth signs
		(0xFFE0 <= codePoint && codePoint <= 0xFFE6) ||
		// R12: Kana Supplement
		(0x1B000 <= codePoint && codePoint <= 0x1B001) ||
		// R13: Enclosed Ideographic Supp
		(0x1F200 <= codePoint && codePoint <= 0x1F251) ||
		// R14: CJK Ext B .. Tertiary Ideo
		(0x20000 <= codePoint && codePoint <= 0x3FFFD)
	)) {
		return true;
	}

	return false;
}

export default isFullwidthCodePoint;
