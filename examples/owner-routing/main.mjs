import { createSDKOwnerLoader } from '../../packages/widget-loader/sdk.mjs';
import { createSDKFixture } from '../../packages/widget-runtime/testing/fixture.mjs';
const $ = id => document.getElementById(id);
let loader, epoch = 1;
const log = value => { $('events').textContent = `${value}\n${$('events').textContent}`.slice(0,3000); };
const fixture = createSDKFixture({handle: ({body}) => {
  const owner = $('owner').value;
  if (owner === 'offline') return {status:503};
  return {data:{account_id:$('account').value,product_code:body.product_code,function_code:body.function_code,
    owner:owner==='frozen'?'ssd':owner,phase:owner==='frozen'?'frozen':'active',
    routing_epoch:epoch,revision:epoch,installation_generation:1,ttl_ms:15000,
    module_key:owner==='core'?'core-v1':'legacy-v1'}};
}});
const context = () => ({account_id:$('account').value,product_code:'demo',function_code:'whole',identity:`${$('account').value}:42:list`});
const modules = Object.fromEntries(['ssd','core'].map(owner => [owner==='ssd'?'legacy-v1':'core-v1',{
  owner,product_code:'demo',function_code:'whole',cleanupVerified:true,
  async load({route,canInvoke}) {
    let mounted=false, status='fresh';
    const paint=()=>{if(mounted)$('panel').textContent=`${owner.toUpperCase()} · аккаунт ${route.account_id} · epoch ${route.routing_epoch} · ${status==='fresh'?'маршрут актуален':'только чтение: '+status}. Фикстура UI.`;};
    return {setRouteState(state){status=state.status;paint();},invoke(name){
      if(status!=='fresh'||!canInvoke())return false;
      if (mounted) { log(`${owner}: повторный ${name}, UI уже открыт`); return true; }
      mounted=true;
      paint();
      log(`${owner}: mount`);return true;
    },destroy(){mounted=false;$('panel').textContent='Виджет закрыт';log(`${owner}: destroy`);}};
  },
}]));
function getLoader(){
  return loader ||= createSDKOwnerLoader({widget:{$authorizedAjax:fixture.$authorizedAjax},
    apiUrl:'/fixture-api',routePath:'/route',modules,
    onStateChange:({status})=>{log(`Маршрут: ${status}`);if(status==='reload-required')$('panel').textContent='Владелец или установка изменились. Требуется перезагрузка. На стенде: закройте и откройте виджет.';},
    onUnavailable:()=>{$('panel').textContent='Маршрут недоступен. Откройте виджет снова.';log('Маршрут недоступен; автоматического перехода на SSD нет');}});
}
$('render').onclick=()=>Promise.all(Array.from({length:3},()=>getLoader().dispatch('render',[],context()))).catch(()=>{});
$('refresh').onclick=async()=>{try{await getLoader().refresh(context());await getLoader().dispatch('render',[],context());}catch{}};
$('destroy').onclick=()=>{loader?.destroy();loader=null;};
$('owner').onchange=()=>{epoch++;log(`Следующий ответ: ${$('owner').value}; нажмите «Обновить маршрут»`);};
$('account').onchange=()=>{loader?.destroy();loader=null;fixture.setIdentity({accountId:$('account').value});log('Смена аккаунта; предыдущий экземпляр закрыт');};
