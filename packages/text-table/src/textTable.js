// @rederive/textTable — verified-recompose of text-table@0.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/textTable.sir
// Clean-room reconstruction of text-table@0.2.0 (substack/text-table, MIT)
// Reconstructed from SIR contract only — no source consulted.

function dotindex(c) {
  var m = /\.[^.]*$/.exec(c);
  return m ? (m.index + 1) : c.length;
}

function table(rows_, opts) {
  // PHASE 0: defaults
  if (!opts) opts = {};
  var hsep = (opts.hsep === undefined) ? '  ' : opts.hsep;
  var align = opts.align || [];
  var stringLength = opts.stringLength || function(s) { return String(s).length; };

  // PHASE 1: dotsizes (per-column max dotindex over RAW cells)
  var dotsizes = [];
  rows_.forEach(function(row) {
    row.forEach(function(c, ix) {
      var n = dotindex(c);
      if (!dotsizes[ix] || n > dotsizes[ix]) dotsizes[ix] = n;
    });
  });

  // PHASE 2: coerce + decimal-pad
  var rows = rows_.map(function(row) {
    return row.map(function(c_, ix) {
      var c = String(c_);
      if (align[ix] === '.') {
        var index = dotindex(c);
        var size = dotsizes[ix] + (/\./.test(c) ? 1 : 2) - (stringLength(c) - index);
        return c + Array(size).join(' ');
      } else {
        return c;
      }
    });
  });

  // PHASE 3: sizes (per-column max stringLength over the phase-2 rows)
  var sizes = [];
  rows.forEach(function(row) {
    row.forEach(function(c, ix) {
      var n = stringLength(c);
      if (!sizes[ix] || n > sizes[ix]) sizes[ix] = n;
    });
  });

  // PHASE 4: render
  return rows.map(function(row) {
    return row.map(function(c, ix) {
      var n = (sizes[ix] - stringLength(c)) || 0;
      var s = Array(Math.max(n + 1, 1)).join(' ');
      if (align[ix] === 'r' || align[ix] === '.') {
        return s + c;
      } else if (align[ix] === 'c') {
        return Array(Math.ceil(n / 2 + 1)).join(' ')
          + c
          + Array(Math.floor(n / 2 + 1)).join(' ');
      } else {
        return c + s;
      }
    }).join(hsep).replace(/\s+$/, '');
  }).join('\n');
}

export default table;
