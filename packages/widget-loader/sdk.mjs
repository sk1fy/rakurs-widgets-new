import { createAuthorizedClient } from '../widget-runtime/index.mjs';
import { createOwnerLoader } from './index.mjs';

/**
 * routePath is deliberately required: PV-03 must register and authenticate the
 * endpoint. This package does not advertise a currently deployed route API.
 */
export function createSDKOwnerLoader({ widget, apiUrl, routePath, modules, onUnavailable, ...options }) {
  if (!routePath) throw new Error('Provide the agreed route API path');
  const client = createAuthorizedClient(widget, apiUrl);
  const loader = createOwnerLoader({ ...options, modules, onUnavailable,
    resolveRoute: async ({ product_code, function_code }) => {
      // The account comes from the verified SDK principal on Core, never from
      // a browser-supplied tenant ID. Echoed scope is still checked by loader.
      const result = await client.request(routePath, {
        method: 'POST', write: false, body: { product_code, function_code },
      });
      return result.data;
    },
  });
  return { ...loader, destroy() { try { return loader.destroy(); } finally { client.destroy(); } } };
}
