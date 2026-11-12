import { mountPanel, unmountAll } from '../src/runtime.js';
import { createLiveSDK, apiOrigin, accountId, userId, viewKey } from './live-sdk.js';

const scenario = new URLSearchParams(location.search).get('scenario') || 'error';
const identity = `${apiOrigin}:rkrs_activity_panel:${accountId}:${userId}`;
for (const storage of [localStorage, sessionStorage]) {
  for (const key of Object.keys(storage)) if (key.endsWith(identity)) storage.removeItem(key);
}
if (scenario === 'error-disabled') localStorage.setItem(viewKey, JSON.stringify({ enabled: false }));
let hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
const active = scenario === 'active' ? { id: 'fixture-work', kind: 'work', started_at: Math.floor(Date.now() / 1000) - 60, context: { task_id: 19, task_name: 'Проверить предложение', entity_type: 'leads', entity_id: 12, entity_name: 'Тестовая сделка' } } : null;
const renderStatus = () => {
  document.getElementById('status').textContent = `Scenario ${scenario}. Server current ${sdk.state().current?.id || 'idle'}. Detail reads ${sdk.requests.filter(r => r.kind === 'detail').length}. Start commands ${sdk.commands.filter(r => r.action === 'start_task').length}. Stop commands ${sdk.commands.filter(r => r.action === 'stop').length}. Held ${sdk.held.map(r => r.kind).join(', ') || 'none'}.`;
  document.getElementById('requests').textContent = sdk.requests.slice(-30).map(r => `${r.method} ${r.kind}${r.aborted ? ' aborted' : ''}${r.body ? ` ${JSON.stringify(r.body)}` : ''}`).join('\n');
};
const sdk = createLiveSDK({ failState: scenario.startsWith('error') ? 1 : 0, failToken: scenario === 'auth' ? 1 : 0, current: active, onChange: renderStatus });
const context = { widget: sdk.widget, accountId, userId };
const button = (id, action) => document.getElementById(id).addEventListener('click', action);
button('accept-enabled', () => { sdk.setEnabled(true); renderStatus(); });
button('accept-disabled', () => { sdk.setEnabled(false); renderStatus(); });
for (const kind of ['detail', 'state', 'start']) {
  button(`hold-${kind}`, () => { sdk.hold(kind); document.getElementById(`hold-${kind}`).disabled = true; });
  button(`release-${kind}`, () => { sdk.hold(kind, false); if (sdk.held.some(r => r.kind === kind)) sdk.release(kind); document.getElementById(`hold-${kind}`).disabled = false; });
}
button('reject-detail', () => { sdk.hold('detail', false); if (sdk.held.some(r => r.kind === 'detail')) sdk.release('detail', true); document.getElementById('hold-detail').disabled = false; });
button('native-complete', () => { Object.assign(sdk.task, { is_completed: true, result_text: 'Fixture native completion' }); renderStatus(); });
button('visibility', () => { hidden = !hidden; document.getElementById('visibility').textContent = `Fixture hidden = ${hidden}`; document.dispatchEvent(new Event('visibilitychange')); });
button('rerender', () => { unmountAll(sdk.widget); mountPanel(context); });
document.getElementById('scenario').textContent = `Текущий сценарий ${scenario}. Флаг Fixture hidden заменяет document.hidden для повторяемой проверки.`;
mountPanel(context);
renderStatus();
