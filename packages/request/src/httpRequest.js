// @rederive/request — representative HTTP effect unit, re-derived by quorum (trace oracle).
// EMIT (request/write/end) + REQUEST (response) verified with the http transport injected;
// quorum 3/3, 5/5 held-out. Trust your own build.
export function httpRequest(reqOpts, body, http) {
  return new Promise((resolve, reject) => {
    const req = http.request(reqOpts, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}
