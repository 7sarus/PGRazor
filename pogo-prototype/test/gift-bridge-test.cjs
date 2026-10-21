const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('pogo-prototype/embedded-agent.js','utf8');
const begin=src.indexOf('// Gift readiness must reach Control');assert.ok(begin>=0);
const block=src.slice(begin,src.indexOf("if(event.kind==='spawn-ready')",begin));
let ready=false,status='';const control={setGiftsReady:(r,s)=>{ready=r;status=s;},setGiftStatus:s=>status=s};
vm.runInNewContext(block,{control,event:{kind:'gift-ready',available:true}});assert.equal(ready,true);
vm.runInNewContext(block,{control,event:{kind:'gift-ready',available:false,reason:'test'}});assert.equal(ready,false);
assert.ok(src.includes('quickSummary.setGiftOptions(control.giftOptions(),control.giftsAllowed())'));
console.log('PASS gift-ready event reaches Control and heartbeat uses its readiness gate');
