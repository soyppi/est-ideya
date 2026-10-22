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
 // Regression: a real form must use the protected RPC even when direct INSERT
 // permissions are deliberately absent in the deployed database.
 const publication=harness();await flush();let rpcCalls=[];
 publication.client.rpc=async(name,args)=>{rpcCalls.push({name,args});return {data:123,error:null}};
 const published=await vm.runInContext("publishIdea({title:'Test idea',problem:'Problem',solution:'Solution',category:'Учёба'},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')",publication.context);
 assert.equal(published.data,123);assert.equal(rpcCalls[0].name,'submit_idea');
 assert.equal(rpcCalls[0].args.p_category,'Учёба');assert.equal(rpcCalls[0].args.p_request_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 assert(!publication.queries.some(q=>q.insert),'publication must not INSERT directly');
 assert.match(source,/else q=await publishIdea\(v,requestId\)/,'form must call the tested publication helper');
 publication.context.crypto={randomUUID:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 publication.context.FormData=class{*[Symbol.iterator](){yield ['title','Form title'];yield ['problem','Form problem'];yield ['solution','Form solution'];yield ['category','Учёба']}};
 vm.runInContext("modal=()=>{};currentUser={id:'ordinary-user',role:'user'};ideaForm()",publication.context);
 await publication.el('#ideaForm').onsubmit({preventDefault(){},target:{}});
 assert.equal(rpcCalls.length,2,'the actual ordinary-user form must issue one RPC');
 assert.equal(rpcCalls[1].args.p_title,'Form title');assert.equal(rpcCalls[1].args.p_request_id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.match(publication.el('#toast').textContent,/Идея опубликована/);
 publication.client.rpc=async()=>({data:null,error:{message:'permission denied'}});
 const denied=await vm.runInContext("publishIdea({title:'Test',problem:'Problem',solution:'Solution',category:'Учёба'},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')",publication.context);
 assert.equal(denied.error.message,'permission denied');assert(!publication.queries.some(q=>q.insert),'RPC failure must not fall back to direct INSERT');
 console.log('PASS: actual form delegates to publication RPC; request UUID passed; no direct INSERT fallback on failure');
 const chat=harness();await flush();
 chat.responses.push({data:{id:7,title:'Discussion idea',status:'Принято'},error:null});
 chat.responses.push({data:[{id:2,user_id:'another',body:'Second',created_at:'2026-10-23T11:00:00Z',profiles:{name:'Another'}},{id:1,user_id:'me',body:'<script>bad</script>\nFirst',created_at:'2026-10-23T10:00:00Z',profiles:{name:'Me'}}],count:2,error:null});
 const discussionData=await vm.runInContext('readDiscussion(7)',chat.context);
 assert.equal(discussionData.messages[0].id,1);assert.equal(discussionData.total,2);
 assert.equal(chat.queries.at(-1).is[0],'deleted_at');assert.deepEqual(chat.queries.at(-1).range,[0,199]);
 chat.context.message=discussionData.messages[0];vm.runInContext("currentUser={id:'me',role:'user'}",chat.context);
 const bubble=vm.runInContext('discussionMessage(message)',chat.context);assert(bubble.includes('chat-own'));assert(bubble.includes('&lt;script&gt;'));assert(!bubble.includes('data-chat-delete'));
 let sent;chat.client.rpc=async(name,args)=>{sent={name,args};return {data:8,error:null}};
 await vm.runInContext("sendDiscussionMessage(7,'  Hello  ','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')",chat.context);
 assert.equal(sent.name,'submit_comment');assert.equal(sent.args.p_body,'Hello');assert.equal(sent.args.p_idea_id,7);
 await assert.rejects(()=>vm.runInContext("sendDiscussionMessage(7,'   ','request')",chat.context),/Напиши сообщение/);
 chat.responses.push({data:null,error:null});await assert.rejects(()=>vm.runInContext('readDiscussion(7)',chat.context),/Идея скрыта/);
 assert.match(source,/data-chat=/);assert.match(source,/discussion\(Number\(b.dataset.chat\)\)/);assert.match(source,/disposed=true;clearInterval\(timer\)/);
 console.log('PASS: discussion routing, message ordering, hidden parent, escaped bubbles, own message style, ordinary-user restrictions, RPC send validation and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
