// @rederive/request — verified-recompose of getProxyFromURI (request@2.88.2 lib/helpers.js). ZERO-DEP.
// Re-derived by quorum from sir/ + oracles/ (stamped from the real original, then deleted);
// quorum 3/3, 7/7 held-out. Trust your own build.
/**
 * getProxyFromURI — resolve the proxy for a URI from the environment.
 * Re-emitted from spec (original-deleted re-emit; request@2.88.2 behavior).
 *
 * @param {object} uri  - object with protocol, hostname, port
 * @param {object} env  - injected environment snapshot (NOT process.env)
 * @returns {string|null}
 */
export function getProxyFromURI(uri, env) {
  const noProxy = env.NO_PROXY || env.no_proxy || '';

  if (noProxy === '*') {
    return null;
  }

  if (noProxy !== '') {
    const uriHostname = uri.hostname.toLowerCase();

    // Determine effective port for the URI
    let uriPort = uri.port || '';
    if (uriPort === '') {
      if (uri.protocol === 'https:') {
        uriPort = '443';
      } else if (uri.protocol === 'http:') {
        uriPort = '80';
      }
    }

    const zones = noProxy.split(',');
    for (const rawZone of zones) {
      const zone = rawZone.trim().toLowerCase();
      if (zone === '') continue;

      // Check if zone has a port spec
      const colonIdx = zone.lastIndexOf(':');
      let zoneHost;
      let zonePort = null;

      // Detect if colonIdx is part of a port (i.e., what follows is all digits)
      if (colonIdx !== -1) {
        const afterColon = zone.slice(colonIdx + 1);
        if (/^\d+$/.test(afterColon)) {
          zoneHost = zone.slice(0, colonIdx);
          zonePort = afterColon;
        } else {
          zoneHost = zone;
        }
      } else {
        zoneHost = zone;
      }

      // Canonicalize by prefixing '.' for suffix matching
      const canonicalUri = '.' + uriHostname;
      const canonicalZone = '.' + zoneHost;

      if (!canonicalUri.endsWith(canonicalZone)) {
        continue;
      }

      // If zone has a port, uri port must match
      if (zonePort !== null && zonePort !== uriPort) {
        continue;
      }

      return null;
    }
  }

  if (uri.protocol === 'http:') {
    return env.HTTP_PROXY || env.http_proxy || null;
  }

  if (uri.protocol === 'https:') {
    return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
  }

  return null;
}
