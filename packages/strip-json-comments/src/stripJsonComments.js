// @rederive/stripJsonComments — verified-recompose of strip-json-comments@3.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/stripJsonComments.sir
const SINGLE = 1;
const MULTI = 2;

function isEscaped(jsonString, quotePosition) {
	let index = quotePosition - 1;
	let backslashCount = 0;
	while (jsonString[index] === '\\') {
		index -= 1;
		backslashCount += 1;
	}
	return Boolean(backslashCount % 2);
}

function stripWithoutWhitespace() {
	return '';
}

function stripWithWhitespace(string, start, end) {
	return string.slice(start, end).replace(/\S/g, ' ');
}

export default function stripJsonComments(jsonString, options = {}) {
	if (typeof jsonString !== 'string') {
		throw new TypeError(`Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``);
	}

	const strip = (options.whitespace === false) ? stripWithoutWhitespace : stripWithWhitespace;

	let insideString = false;
	let insideComment = false;
	let offset = 0;
	let result = '';

	for (let i = 0; i < jsonString.length; i++) {
		const currentCharacter = jsonString[i];
		const nextCharacter = jsonString[i + 1];

		// node-4a: STRING-BOUNDARY TOGGLE
		if (!insideComment && currentCharacter === '"') {
			const escaped = isEscaped(jsonString, i);
			if (!escaped) {
				insideString = !insideString;
			}
		}

		// node-4b: SKIP-WHILE-INSIDE-STRING
		if (insideString) {
			continue;
		}

		// node-4c: OPEN //
		if (!insideComment && currentCharacter + nextCharacter === '//') {
			result += jsonString.slice(offset, i);
			offset = i;
			insideComment = SINGLE;
			i++;
		}
		// node-4d: CLOSE single-line on CRLF
		else if (insideComment === SINGLE && currentCharacter + nextCharacter === '\r\n') {
			i++;
			insideComment = false;
			result += strip(jsonString, offset, i);
			offset = i;
			continue;
		}
		// node-4e: CLOSE single-line on lone LF
		else if (insideComment === SINGLE && currentCharacter === '\n') {
			insideComment = false;
			result += strip(jsonString, offset, i);
			offset = i;
		}
		// node-4f: OPEN /*
		else if (!insideComment && currentCharacter + nextCharacter === '/*') {
			result += jsonString.slice(offset, i);
			offset = i;
			insideComment = MULTI;
			i++;
			continue;
		}
		// node-4g: CLOSE block on */
		else if (insideComment === MULTI && currentCharacter + nextCharacter === '*/') {
			i++;
			insideComment = false;
			result += strip(jsonString, offset, i + 1);
			offset = i + 1;
			continue;
		}
	}

	// node-5: FINAL TAIL
	return result + (insideComment ? strip(jsonString.slice(offset)) : jsonString.slice(offset));
}
