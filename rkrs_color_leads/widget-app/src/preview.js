import {createSDKFixture} from '../../../packages/widget-runtime/testing/fixture.mjs';
import {createColorLoader} from './runtime.js';
import './preview.css';
let offline=false,revision=1;
let settings={main_settings:[{id:1,name:'Важные сделки',enabled:true,bgColor:'#fff0bc',borderColor:'#e9b44c',textColor:'#30362f',allowedUsers:[],conditions:[{fieldId:504473000,operator:'contains',value:'VIP'}]}]};
const route={account_id:'777',product_code:'rkrs_color_leads',function_code:'whole',owner:'core',phase:'active',routing_epoch:1,installation_generation:1,revision:1,ttl_ms:2000,module_key:'color-core-v1'};
const fixture=createSDKFixture({handle:request=>{
 if(offline)return {status:503,message:'Нет связи'};
 if(request.options.url==='/fixture-api/route')return {data:{...route}};
 if(request.options.url==='/fixture-api/v1/widgets/color-leads/settings'){
  if(request.options.type==='PUT'){
   if(request.body.expected_revision!==revision)return {status:409,message:'Конфликт ревизии'};
   settings=structuredClone(request.body.settings);revision++;
  }
  return {data:{settings:structuredClone(settings),revision}};
 }
}});
const loader=createColorLoader({widget:fixture,apiUrl:'/fixture-api',routePath:'/route',amoCRM:fixture.amoCRM,
 createReadGateway:()=>({metadata:async()=>({fields:[{id:504473000,name:'Название',type:'text'},{id:5044780000,name:'Ответственный',type:'user',enums:[{id:42,value:'Анна'}]}],users:[{id:42,name:'Анна'}]}),leads:async ids=>({leads:ids.map(id=>({id,name:'VIP — тестовая сделка',responsible_user_id:42}))}),destroy(){}}),
 onStateChange:state=>{document.querySelector('#state').textContent=state.status;},onUnavailable:error=>{document.querySelector('#state').textContent=error?.message || 'Маршрут недоступен';}});
await loader.dispatch('advancedSettings',[document.querySelector('#settings')],document.querySelector('#settings'));
document.querySelector('#online').onclick=()=>{offline=false;route.phase='active';route.revision++;};
document.querySelector('#offline').onclick=()=>{offline=true;};
document.querySelector('#paused').onclick=()=>{offline=false;route.phase='freezing';route.revision++;};
document.querySelector('#generation').onclick=()=>{route.installation_generation++;route.revision++;};
window.addEventListener('pagehide',()=>{loader.destroy();fixture.destroy();},{once:true});
