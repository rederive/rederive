// @rederive/request — verified-recompose of paramsHaveRequestBody (request@2.88.2 lib/helpers.js). ZERO-DEP.
// Re-derived by quorum from sir/ + oracles/ (stamped from the real original, then deleted);
// quorum 3/3, 7/7 held-out. Trust your own build.
export function paramsHaveRequestBody(params) {
  return params.body
    || params.requestBodyStream
    || (params.json && typeof params.json !== 'boolean')
    || params.multipart;
}
