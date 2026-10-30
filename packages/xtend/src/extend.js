// @rederive/extend — verified-recompose of xtend@4.0.2. quorum 3/3, differential 400/400, round 1. SIR: sir/extend.sir
var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var target = {};
    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key];
            }
        }
    }
    return target;
}

export default extend;
