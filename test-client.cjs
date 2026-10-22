const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(configured=true){
 const elements=new Map();
 function el(s){if(!elements.has(s))elements.set(s,{value:'',innerHTML:'',textContent:'',options:[{}],addEventListener(){}});return elements.get(s)}
 const timers=[],queries=[],responses=[];let callback,authLock=false;
 const client={auth:{async getSession(){assert.equal(authLock,false,'auth API called under auth lock');return {data:{session:null}}},onAuthStateChange(fn){callback=fn}},from(table){const query={table};const chain=new Proxy(query,{get(target,key){if(key==='then')return (resolve,reject)=>{const response=responses.shift()||{data:[],error:null};return Promise.resolve(response).then(resolve,reject)};return (...args)=>{target[key]=args;return chain}}});queries.push(query);return chain}};
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[]},window:{location:{href:'https://soyppi.github.io/est-ideya/?test=1#test'},supabase:{createClient:()=>client},SUPABASE_URL:configured?'https://example.supabase.co':'https://YOUR_PROJECT_ID.supabase.co',SUPABASE_ANON_KEY:'public-key'},console,setTimeout(fn){timers.push(fn)},FormData,Date,URL});
 vm.runInContext('var supabase = window.supabase;',context);
 vm.runInContext(source,context);
 return {el,timers,queries,responses,context,client,fireAuth(){authLock=true;callback();authLock=false}};
}
(async()=>{
 const missing=harness(false);await flush();assert.match(missing.el('#ideas').innerHTML,/не настроено/);vm.runInContext("authModal('login');loadIdeas()",missing.context);assert.match(missing.el('#toast').textContent,/не настроено/);assert.equal(missing.queries.length,0);
 const redirect=harness(false);assert.equal(vm.runInContext('confirmationRedirectUrl()',redirect.context),'https://soyppi.github.io/est-ideya/');
 const normal=harness();await flush();assert.match(normal.el('#ideas').innerHTML,/Пока ничего не найдено/);let resendParams;normal.client.auth.resend=async params=>{resendParams=params;return {error:null}};await vm.runInContext("resendConfirmation('test@example.invalid')",normal.context);assert.equal(resendParams.options.emailRedirectTo,'https://soyppi.github.io/est-ideya/');assert.equal(resendParams.type,'signup');assert.equal(resendParams.email,'test@example.invalid');normal.fireAuth();assert.equal(normal.timers.length,1);await normal.timers.shift()();
 normal.el('#search').value='x,problem.eq.y)"\\';await vm.runInContext('loadIdeas()',normal.context);const filter=normal.queries.at(-1).or[0];assert.ok(filter.startsWith('title.ilike."%'));assert.ok(filter.includes('\\"'));assert.ok(filter.includes('\\\\'));
 normal.el('#search').value='';let resolveOld;normal.responses.push(new Promise(r=>resolveOld=r));const old=vm.runInContext('loadIdeas()',normal.context);await vm.runInContext('loadIdeas()',normal.context);const latest=normal.el('#ideas').innerHTML;resolveOld({error:{message:'STALE ERROR'}});await old;assert.equal(normal.el('#ideas').innerHTML,latest);
 console.log('PASS: unconfigured controls; empty feed; deferred auth refresh; search escaping; stale-response protection');
})().catch(error=>{console.error(error);process.exitCode=1});
