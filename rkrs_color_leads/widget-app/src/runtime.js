import { createSDKOwnerLoader } from '../../../packages/widget-loader/sdk.mjs';
import { createInstanceIdentity } from '../../../packages/widget-runtime/index.mjs';
import { createColorClient } from './client.js';
import { matchingRule, validateRules } from './rules.js';
import { renderEditor } from './editor.js';
export { checkConditions, matchingRule } from './rules.js';

// PV-03 must inject an authenticated, guarded read gateway. No direct CRM fallback.
const missingGateway = () => ({
  metadata: async () => { throw new Error('Чтение полей через Core ещё не подключено'); },
  leads: async () => { throw new Error('Чтение сделок через Core ещё не подключено'); },
  destroy() {},
});
export function createColorAdapter({widget, apiUrl, document, userId, canInvoke, route: initialRoute,
  createReadGateway = missingGateway, createClient = createColorClient, debounceMs = 150}) {
  let alive = true, status = 'paused', route = initialRoute, generation = 0, timer, observer;
  let client, gateway, mounted = false, settingsHost, root, notice, editor;
  let rules, persistedRules, settingsDocument, revision, metadata, needsSettings = true, dirty = false, saving = false, uncertain = false, refreshPending = false, refreshQueued = false;
  const painted = new Map();
  const allowed = () => alive && status === 'fresh' && canInvoke();
  const editAllowed = () => allowed() && !saving && !uncertain && !needsSettings && !!metadata;
  const tell = message => { if (alive && notice) notice.textContent = message; };
  function resources() {
    if (!client) client = createClient(widget, apiUrl, () => route);
    if (!gateway) gateway = createReadGateway({widget, apiUrl, route: () => route, canInvoke: allowed});
  }
  function stop() {
    generation++; clearTimeout(timer); observer?.disconnect(); observer = undefined;
    client?.destroy(); gateway?.destroy(); client = gateway = undefined;
    saving = false; refreshPending = false;
  }
  function controls() { for (const item of editor?.querySelectorAll('button,input,select') || []) item.disabled = !editAllowed(); }
  function draw() {
    if (!editor || !metadata || !rules || !allowed()) return;
    renderEditor(editor, rules, metadata, {canEdit:editAllowed, changed:() => { dirty = true; }, save});
  }
  function restore() {
    for (const [element, properties] of painted) for (const [property, entry] of properties) {
      // Never remove a later mutation belonging to another widget or CRM.
      if (element.style.getPropertyValue(property) === entry.applied) {
        if (entry.original) element.style.setProperty(property, entry.original, entry.priority);
        else element.style.removeProperty(property);
      }
    }
    painted.clear();
  }
  function paint(element, property, value) {
    if (!allowed()) return;
    let properties = painted.get(element);
    if (!properties) { properties = new Map(); painted.set(element, properties); }
    if (!properties.has(property)) properties.set(property, {original:element.style.getPropertyValue(property), priority:element.style.getPropertyPriority(property)});
    element.style.setProperty(property, value);
    properties.get(property).applied = element.style.getPropertyValue(property);
  }
  function highlight(leads) {
    if (!allowed()) return;
    restore();
    for (const lead of leads) {
      if (!Number.isSafeInteger(Number(lead.id)) || Number(lead.id) <= 0) continue;
      const rule = matchingRule(lead, persistedRules || [], userId);
      if (!rule || ![rule.bgColor,rule.borderColor,rule.textColor].every(value => /^#[a-f\d]{6}$/i.test(value))) continue;
      for (const element of document.querySelectorAll(`.pipeline_leads__item[data-id="${Number(lead.id)}"],.list-row[data-id="${Number(lead.id)}"]`)) {
        paint(element,'background-color',rule.bgColor);
        if (element.matches('.pipeline_leads__item')) {
          paint(element,'border',`3px solid ${rule.borderColor}`);
          for (const field of element.querySelectorAll('.pipeline_leads__field')) { paint(field,'color',rule.textColor); paint(field,'font-weight','600'); }
        } else for (const cell of element.querySelectorAll('.list-row__cell-status')) paint(cell,'background-color',rule.bgColor);
      }
    }
  }
  async function refresh() {
    if (!allowed()) return;
    if (refreshPending) { refreshQueued = true; return; }
    refreshPending = true; const current = generation;
    try {
      resources();
      if (needsSettings) {
        const result = await client.settings();
        if (!allowed() || current !== generation) return;
        const settings = result.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
            (settings.main_settings !== undefined && !Array.isArray(settings.main_settings)) ||
            !Number.isSafeInteger(result.revision) || result.revision < 0) throw new Error('Некорректный ответ настроек');
        persistedRules = structuredClone(settings.main_settings || []);
        if (dirty && revision !== result.revision) {
          uncertain = true; // Keep the exact draft, never silently overwrite/rebase a concurrent edit.
        } else if (!dirty) {
          settingsDocument = structuredClone(settings);
          rules = structuredClone(persistedRules);
          revision = result.revision;
        }
        needsSettings = false;
        if (!dirty && metadata) draw();
        controls();
      }
      if (settingsHost && !metadata) {
        if (!allowed()) return;
        const result = await gateway.metadata();
        if (!allowed() || current !== generation) return;
        if (!Array.isArray(result?.fields) || !Array.isArray(result?.users)) throw new Error('Некорректный справочник');
        metadata = result;
        draw();
      }
      const ids = [...new Set(Array.from(document.querySelectorAll('.pipeline_leads__item[data-id],.list-row[data-id]'), element => Number(element.dataset.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
      const leads = [];
      for (let start = 0; start < ids.length; start += 50) {
        if (!allowed() || current !== generation) return;
        const result = await gateway.leads(ids.slice(start, start + 50));
        if (!allowed() || current !== generation) return;
        if (!Array.isArray(result.leads)) throw new Error('Некорректный ответ сделок');
        leads.push(...result.leads);
      }
      if (allowed() && current === generation) { highlight(leads); tell(uncertain ? 'Настройки изменились или результат записи неизвестен. Черновик сохранён; нужна сверка перед повтором.' : dirty ? 'Есть несохранённые изменения' : 'Настройки актуальны'); }
    } catch (error) { if (allowed() && current === generation) tell(error.message); }
    finally { if (current === generation) { refreshPending = false; if (refreshQueued) { refreshQueued = false; void refresh(); } } }
  }
  function watch() {
    if (!allowed() || observer || !mounted) return;
    observer = new document.defaultView.MutationObserver(records => {
      if (!allowed() || records.every(record => root?.contains(record.target))) return;
      clearTimeout(timer); timer = setTimeout(() => { if (allowed()) void refresh(); }, debounceMs);
    });
    observer.observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['class','data-id']});
  }
  async function save() {
    if (!editAllowed() || !rules) return false;
    try { validateRules(rules); } catch (error) { tell(error.message); return false; }
    const current = generation; saving = true; controls();
    try {
      resources(); if (!allowed()) return false;
      const result = await client.save({...structuredClone(settingsDocument),main_settings:structuredClone(rules)}, revision);
      if (!allowed() || current !== generation) return false;
      if (!Number.isSafeInteger(result.revision) || result.revision <= revision) { uncertain = true; throw new Error('Некорректное подтверждение сохранения. Проверьте состояние сервера.'); }
      revision = result.revision; persistedRules = structuredClone(rules); dirty = false; tell('Сохранено');
      void refresh();
      return true;
    } catch (error) {
      if (current === generation && alive) {
        uncertain = uncertain || error.unknown || error.status === 409;
        tell(error.unknown ? 'Результат сохранения неизвестен. Черновик сохранён; проверьте серверное состояние перед повтором.' : error.message);
      }
      return false;
    } finally { if (current === generation) { saving = false; controls(); } }
  }
  return {
    invoke(name, args = []) {
      if (!allowed()) return false;
      if (name === 'onSave') return !dirty && !saving && !uncertain;
      if (name === 'advancedSettings') {
        const host = args[0];
        if (!host?.append || host.ownerDocument !== document) return false;
        if (settingsHost !== host) {
          root?.remove(); settingsHost = host; root = document.createElement('section'); root.className = 'rkrs-color-settings';
          notice = document.createElement('p'); notice.setAttribute('role','status'); editor = document.createElement('div'); root.append(notice,editor); host.append(root);
          draw();
        }
      }
      if (['init','render','advancedSettings','bind_actions'].includes(name)) { mounted = true; watch(); void refresh(); }
      return true;
    },
    setRouteState(state) {
      if (!alive) return;
      route = state.route; const was = status; status = state.status;
      if (status !== 'fresh') {
        if (saving) uncertain = true;
        stop(); controls(); tell(status === 'stale' ? 'Нет связи. Только чтение; черновик сохранён.' : 'Переход между платформами. Только чтение.');
      } else { if (was !== 'fresh') needsSettings = true; controls(); if (was !== 'fresh' && mounted) { watch(); void refresh(); } }
    },
    destroy() {
      if (!alive) return;
      alive = false; stop(); restore(); root?.remove(); root = notice = editor = settingsHost = undefined;
      rules = persistedRules = settingsDocument = metadata = undefined;
    },
    // Inspectable state for fixtures without exposing credentials or tenant authorization.
    inspect: () => ({alive,status,dirty,saving,uncertain,revision,rules:rules ? structuredClone(rules) : undefined}),
    refresh, save,
  };
}

export function createColorLoader({widget, apiUrl, routePath, document = globalThis.document, amoCRM = globalThis.AMOCRM, createReadGateway, onStateChange, onUnavailable}) {
  const loader = createSDKOwnerLoader({widget,apiUrl,routePath,onStateChange,onUnavailable,
    modules:{'color-core-v1':{owner:'core',product_code:'rkrs_color_leads',function_code:'whole',cleanupVerified:true,
      load: context => createColorAdapter({...context,widget,apiUrl,document,userId:amoCRM.constant('user').id,createReadGateway})}}});
  const targets = new WeakMap(); let nextTarget = 0;
  const context = target => {
    if (target && !targets.has(target)) targets.set(target,++nextTarget);
    return {account_id:String(amoCRM.constant('account').id),product_code:'rkrs_color_leads',function_code:'whole',
      identity:createInstanceIdentity({accountId:amoCRM.constant('account').id,userId:amoCRM.constant('user').id,productCode:'rkrs_color_leads',mode:target ? `settings:${targets.get(target)}` : 'leads',entityId:amoCRM.data?.current_card?.id ?? null})};
  };
  return {dispatch:(name,args=[],target) => loader.dispatch(name,args,context(target)), call:(name,args=[],target) => loader.call(name,args,context(target)),destroy:() => loader.destroy(),status:() => loader.status()};
}
