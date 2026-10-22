import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSDKOwnerLoader} from '../sdk.mjs';
import {createSDKFixture} from '../../widget-runtime/testing/fixture.mjs';
test('SDK route request omits browser tenant authority and destroy cancels pending read', async () => {
  const fixture = createSDKFixture({manual:true});
  const loader = createSDKOwnerLoader({widget:{$authorizedAjax:fixture.$authorizedAjax},
    apiUrl:'/fixture-api',routePath:'/route',modules:{},onUnavailable:()=>{}});
  const pending = loader.dispatch('render',[],{account_id:'42',product_code:'color_leads',function_code:'whole',identity:'42:7:list'});
  assert.deepEqual(fixture.requests[0].body,{product_code:'color_leads',function_code:'whole'});
  assert.equal(fixture.requests[0].options.url,'/fixture-api/route');
  loader.destroy();await assert.rejects(pending);
  assert.equal(fixture.requests[0].aborted,true);
});
