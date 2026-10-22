import { createAuthorizedClient } from '../../../packages/widget-runtime/index.mjs';
export const basePath = '/v1/widgets/color-leads';
export function createColorClient(widget, apiUrl, route) {
  const client = createAuthorizedClient(widget, apiUrl);
  function request(path, options = {}) {
    const current = route();
    return client.request(basePath + path, {...options, headers: {
      'X-Routing-Epoch': String(current.routing_epoch),
      'X-Installation-Generation': String(current.installation_generation),
    }}).then(result => result.data);
  }
  return {
    settings: () => request('/settings'),
    save: (settings, revision) => request('/settings', {method:'PUT', body:{settings, expected_revision:revision}}),
    destroy: () => client.destroy(),
  };
}
