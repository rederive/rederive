// @rederive/decodeURIComponent — verified-recompose of decode-uri-component@0.2.2. quorum 3/3, differential 400/400, round 1. SIR: sir/decodeURIComponent.sir
const token = '%[a-f0-9]{2}';
const singleMatcher = new RegExp('(' + token + ')|([^%]+?)', 'gi');
const multiMatcher = new RegExp('(' + token + ')+', 'gi');

function decodeComponents(components, split) {
  try {
    return [decodeURIComponent(components.join(''))];
  } catch (e) {
    // do nothing
  }
  if (components.length === 1) {
    return components;
  }
  split = split || 1;
  const left = components.slice(0, split);
  const right = components.slice(split);
  return [].concat(decodeComponents(left), decodeComponents(right));
}

function decode(input) {
  try {
    return decodeURIComponent(input);
  } catch (e) {
    let tokens = input.match(singleMatcher) || [];
    for (let i = 1; i < tokens.length; i++) {
      input = decodeComponents(tokens, i).join('');
      tokens = input.match(singleMatcher) || [];
    }
    return input;
  }
}

function customDecodeURIComponent(input) {
  const replaceMap = {
    '%FE%FF': '��',
    '%FF%FE': '��',
  };

  let match;
  // Reset lastIndex just in case (module-level regex safety)
  multiMatcher.lastIndex = 0;
  while ((match = multiMatcher.exec(input)) !== null) {
    const run = match[0];
    try {
      replaceMap[run] = decodeURIComponent(run);
    } catch (e) {
      const result = decode(run);
      if (result !== run) {
        replaceMap[run] = result;
      }
    }
  }

  replaceMap['%C2'] = '�';

  for (const key of Object.keys(replaceMap)) {
    input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
  }

  return input;
}

function decodeBetter(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(
      'Expected `encodedURI` to be of type `string`, got `' + (typeof encodedURI) + '`'
    );
  }

  encodedURI = encodedURI.replace(/\+/g, ' ');

  try {
    return decodeURIComponent(encodedURI);
  } catch (e) {
    return customDecodeURIComponent(encodedURI);
  }
}

export default decodeBetter;
