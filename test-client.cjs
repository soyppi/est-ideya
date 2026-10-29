const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(configured=true){
 const elements=new Map(),nodes=new Map();
 function el(s){if(!elements.has(s))elements.set(s,{value:'',innerHTML:'',textContent:'',options:[{}],isConnected:true,setAttribute(key,value){this[key]=value},removeAttribute(key){delete this[key]},querySelectorAll(){return []},addEventListener(){}});return elements.get(s)}
 const timers=[],queries=[],responses=[];let callback,authLock=false;
 const client={auth:{async getSession(){assert.equal(authLock,false,'auth API called under auth lock');return {data:{session:this.session||null}}},onAuthStateChange(fn){callback=fn}},from(table){const query={table,calls:[]};const chain=new Proxy(query,{get(target,key){if(key==='then')return (resolve,reject)=>{const response=responses.shift()||{data:[],error:null};return Promise.resolve(response).then(resolve,reject)};return (...args)=>{target.calls.push([key,args]);target[key]=args;return chain}}});queries.push(query);return chain}};
 const context=vm.createContext({document:{querySelector:el,querySelectorAll:s=>nodes.get(s)||[]},window:{location:{href:'https://soyppi.github.io/est-ideya/?test=1#test'},supabase:{createClient:()=>client},SUPABASE_URL:configured?'https://example.supabase.co':'https://YOUR_PROJECT_ID.supabase.co',SUPABASE_ANON_KEY:'public-key'},console,setTimeout(fn){timers.push(fn)},FormData,Date,URL,URLSearchParams,setInterval(){return 1},clearInterval(){}});
 vm.runInContext('var supabase = window.supabase;',context);
 vm.runInContext(source,context);
 return {el,nodes,timers,queries,responses,context,client,fireAuth(event){authLock=true;callback(event);authLock=false}};
}
(async()=>{

 const validation=harness(false);
 for(const value of ['\u200b','\u2800','\u3164','\u2060','\u034f','\ufe0f','\u0301',' \t\n']){
  validation.context.testValue=value;assert.throws(()=>vm.runInContext('requireText(testValue)',validation.context),/видимых/);
 }
 assert.equal(vm.runInContext("requireText('Работает 👩‍🎓')",validation.context),'Работает 👩‍🎓');
 assert.equal(vm.runInContext("normalizeEmail('  user@company.custom  ')",validation.context),'user@company.custom');
 assert.equal(vm.runInContext("normalizeEmail('user@пример.рф')",validation.context),'user@xn--e1afmkfd.xn--p1ai');
 assert.throws(()=>vm.runInContext("normalizeEmail('user@com\\u200bpany.ru')",validation.context),/невидимые/);
 assert.match(vm.runInContext("fail({code:'email_address_invalid'})",validation.context),/отклонил/);
 assert.match(vm.runInContext("fail({code:'over_email_send_rate_limit'})",validation.context),/лимит/);
 assert.throws(()=>vm.runInContext('authCooldown()',validation.context),/Слишком много/);
 assert.doesNotThrow(()=>vm.runInContext('authCooldown(false)',validation.context),'email quota must not block password login');
 console.log('PASS: invisible form content, custom and international domains, translated auth errors and rate cooldown');
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

 // Exercise the actual registration handler with a mock provider: no real emails.
 const signup=harness();await flush();let signups=[];
 signup.client.auth.signUp=async params=>{signups.push(params);return {data:{session:null},error:null}};
 signup.context.FormData=class{*[Symbol.iterator](){yield ['name','Тест'];yield ['email','person@пример.рф'];yield ['password','TEST-ONLY-DO-NOT-USE']}};
 vm.runInContext("modal=()=>{};authModal('register')",signup.context);
 await signup.el('#authForm').onsubmit({preventDefault(){},target:{}});
 assert.equal(signups.length,1);assert.equal(signups[0].email,'person@xn--e1afmkfd.xn--p1ai');assert.equal(signups[0].options.emailRedirectTo,'https://soyppi.github.io/est-ideya/');
 signup.client.auth.signUp=async()=>{signups.push({});return {error:{code:'over_email_send_rate_limit',status:429}}};
 vm.runInContext("authModal('register')",signup.context);await signup.el('#authForm').onsubmit({preventDefault(){},target:{}});
 assert.match(signup.el('#formError').innerHTML,/лимит/);
 await signup.el('#authForm').onsubmit({preventDefault(){},target:{}});assert.equal(signups.length,2,'cooldown must prevent another provider request');
 console.log('PASS: real signup handler normalizes custom domain, uses correct redirect, explains provider quota and suppresses repeated sends');

 // Password recovery stays inside the SDK and waits until the auth lock releases.
 const recovery=harness();await flush();let resets=[];
 recovery.client.auth.resetPasswordForEmail=async(email,options)=>{resets.push({email,options});return {error:null}};
 await vm.runInContext("requestPasswordReset(' person@пример.рф ')",recovery.context);
 assert.equal(resets[0].email,'person@xn--e1afmkfd.xn--p1ai');assert.equal(resets[0].options.redirectTo,'https://soyppi.github.io/est-ideya/');
 await assert.rejects(()=>vm.runInContext("requestPasswordReset('person@example.com')",recovery.context),/Слишком много/);assert.equal(resets.length,1);
 recovery.context.resetShown=0;vm.runInContext('resetPasswordModal=()=>{resetShown++}',recovery.context);
 recovery.client.auth.session={user:{id:'recovery-user',email:'person@example.invalid',user_metadata:{name:'Recovery user'}}};
 recovery.fireAuth('PASSWORD_RECOVERY');assert.equal(recovery.context.resetShown,0,'no auth API or modal work inside the SDK callback');
 await recovery.timers.shift()();assert.equal(recovery.context.resetShown,1);
 let updates=[];recovery.client.auth.updateUser=async params=>{updates.push(params);return {error:null}};
 await assert.rejects(()=>vm.runInContext("updateRecoveredPassword('short','short')",recovery.context),/минимум 8/);
 await assert.rejects(()=>vm.runInContext("updateRecoveredPassword('TEST-password-123','different')",recovery.context),/не совпадают/);assert.equal(updates.length,0);
 await vm.runInContext("updateRecoveredPassword('  TEST-password-123  ','  TEST-password-123  ')",recovery.context);
 assert.equal(updates[0].password,'  TEST-password-123  ','password must never be trimmed or normalized');
 vm.runInContext('setRecoveryMode(false)',recovery.context);await assert.rejects(()=>vm.runInContext("updateRecoveredPassword('TEST-password-123','TEST-password-123')",recovery.context),/свежую ссылку/);
 const recoveredForm=harness();await flush();let updatedForm=0;
 recoveredForm.client.auth.updateUser=async params=>{assert.equal(params.password,'TEST-only-new-password');updatedForm++;return {error:null}};
 recoveredForm.context.FormData=class{*[Symbol.iterator](){yield ['password','TEST-only-new-password'];yield ['repeat','TEST-only-new-password']}};
 vm.runInContext("modal=()=>{};currentUser={id:'test-user',role:'user'};setRecoveryMode(true);resetPasswordModal()",recoveredForm.context);
 await recoveredForm.el('#resetPasswordForm').onsubmit({preventDefault(){},target:{}});
 assert.equal(updatedForm,1);assert.equal(vm.runInContext('recoveringPassword',recoveredForm.context),false);assert.match(recoveredForm.el('#toast').textContent,/Новый пароль сохранён/);
 const recoveryForm=harness();await flush();let requestedForm=0;
 recoveryForm.client.auth.resetPasswordForEmail=async(email,options)=>{assert.equal(email,'person@company.custom');assert.equal(options.redirectTo,'https://soyppi.github.io/est-ideya/');requestedForm++;return {error:null}};
 recoveryForm.context.FormData=class{get(name){return name==='email'?'person@company.custom':null}*[Symbol.iterator](){yield ['email','person@company.custom']}};
 recoveryForm.context.lastMarkup='';vm.runInContext("modal=content=>{lastMarkup=content};recoveryRequestModal()",recoveryForm.context);
 const requestHandler=recoveryForm.el('#recoveryForm').onsubmit;await requestHandler({preventDefault(){},target:{}});
 assert.equal(requestedForm,1);assert.match(recoveryForm.context.lastMarkup,/Если аккаунт с этим адресом существует/);
 await requestHandler({preventDefault(){},target:{}});assert.equal(requestedForm,1,'repeat mail blocked');
 const authUi=harness();await flush();authUi.context.lastMarkup='';vm.runInContext("modal=content=>{lastMarkup=content};authModal('login','person@example.invalid')",authUi.context);
 assert.match(authUi.context.lastMarkup,/forgotPassword/);assert.match(authUi.context.lastMarkup,/current-password/);assert.match(authUi.context.lastMarkup,/data-password-toggle/);
 authUi.context.window.location.href='https://soyppi.github.io/est-ideya/#error=access_denied&error_code=otp_expired';assert(vm.runInContext('authLinkError()',authUi.context));
 assert.match(vm.runInContext("fail({code:'invalid_credentials'})",authUi.context),/Повторная регистрация/);
 console.log('PASS: password recovery request and actual forms; IDN redirect, rate limit, deferred recovery callback, session guard, exact password preservation, mismatch rejection, successful update, neutral email notice, password reveal and expired-link detection');

 const loginRaw=harness();await flush();let loginParams;
 loginRaw.client.auth.signInWithPassword=async params=>{loginParams=params;return {error:null}};
 loginRaw.context.FormData=class{*[Symbol.iterator](){yield ['email',' Person@company.custom '];yield ['password','  TEST-only-password  ']}};
 vm.runInContext("modal=()=>{};authModal('login')",loginRaw.context);await loginRaw.el('#authForm').onsubmit({preventDefault(){},target:{}});
 assert.equal(loginParams.password,'  TEST-only-password  ');assert.equal(loginParams.email,'Person@company.custom');
 console.log('PASS: actual login handler preserves every password character and normalizes only the email');

 const cards=harness();await flush();const card={dataset:{cardId:'88'}};cards.nodes.set('[data-card-id]',[card]);cards.context.opened=[];vm.runInContext('detail=id=>opened.push(id)',cards.context);
 cards.responses.push({data:[{id:88,title:'Card title',problem:'Card body',category:'Учёба',status:'Новое',created_at:'2026-10-29T10:00:00Z'}],error:null},{data:[],error:null},{data:[],error:null});
 await vm.runInContext('loadIdeas()',cards.context);card.onclick({target:{closest:()=>null}});assert.equal(cards.context.opened.length,1);
 card.onclick({target:{closest:()=>({tagName:'BUTTON'})}});assert.equal(cards.context.opened.length,1,'independent controls must not open the idea');
 card.onkeydown({target:card,key:'Enter',preventDefault(){}});assert.equal(cards.context.opened.length,2);card.onkeydown({target:{},key:'Enter',preventDefault(){throw Error('nested button')}});
 const replies=harness();await flush();let replyCall;
 replies.client.rpc=async(name,args)=>{replyCall={name,args};return {data:9,error:null}};
 await vm.runInContext("sendDiscussionMessage(7,'Ответ', 'uuid',21)",replies.context);assert.equal(replyCall.name,'submit_comment_reply');assert.equal(replyCall.args.p_reply_to_id,21);
 await assert.rejects(()=>vm.runInContext("sendDiscussionMessage(7,'Ответ','uuid',-1)",replies.context),/Неверное сообщение/);
 replies.context.quoteMessage={id:5,user_id:'other',body:'Reply',reply_to_id:21,reply:{id:21,body:'<script>source</script>',deleted_at:null,profiles:{name:'<Author>'}}};
 let quote=vm.runInContext('discussionMessage(quoteMessage)',replies.context);assert(quote.includes('&lt;script&gt;'));assert(quote.includes('&lt;Author&gt;'));assert(!quote.includes('data-chat-reply'),'guests cannot reply');
 replies.context.quoteMessage.reply.deleted_at='2026-10-29';quote=vm.runInContext('discussionMessage(quoteMessage)',replies.context);assert(!quote.includes('source'));assert(quote.includes('скрыто'));
 const notices=harness();await flush();vm.runInContext("currentUser={id:'owner',role:'user'}",notices.context);
 notices.responses.push({data:[{id:1,idea_id:88,idea_title:'<Title>',from_status:'Новое',to_status:'На рассмотрении',reason:'<script>reason</script>',read_at:null,created_at:'2026-10-29T10:00:00Z'}],error:null},{data:null,count:1,error:null});
 await vm.runInContext('refreshNotifications()',notices.context);assert.equal(notices.el('#notificationCount').textContent,'1');assert.equal(notices.el('#notificationCount').hidden,false);
 for(const q of notices.queries.slice(-2))assert(q.calls.some(([name,args])=>name==='eq'&&args[0]==='user_id'&&args[1]==='owner'));
 const notificationMarkup=vm.runInContext('notificationItem(notificationCache.items[0])',notices.context);assert(notificationMarkup.includes('&lt;Title&gt;'));assert(notificationMarkup.includes('&lt;script&gt;'));assert(notificationMarkup.includes('notification-unread'));
 await vm.runInContext('markNotificationsRead(1)',notices.context);const update=notices.queries.find(q=>q.update);assert(update.calls.some(([name,args])=>name==='eq'&&args[0]==='user_id'&&args[1]==='owner'));assert(update.calls.some(([name,args])=>name==='eq'&&args[0]==='id'&&args[1]===1));
 assert.equal(notices.el('#notificationCount').hidden,true);
 let resolveSlow;notices.responses.push(new Promise(resolve=>resolveSlow=resolve),{count:9,data:null,error:null});const slowNotice=vm.runInContext('refreshNotifications()',notices.context);await flush();
 notices.responses.push({data:[],error:null},{count:0,data:null,error:null});await vm.runInContext('refreshNotifications()',notices.context);resolveSlow({data:[],error:null});await slowNotice;assert.equal(notices.el('#notificationCount').hidden,true,'stale poll cannot revive read badge');
 console.log('PASS: actual whole-card mouse/keyboard handlers ignore controls; reply RPC and hidden/escaped quotes; private notification filters, read updates, escaped content and stale-poll protection');
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
 await assert.rejects(()=>vm.runInContext("sendDiscussionMessage(7,'   ','request')",chat.context),/видимых символов/);
 chat.responses.push({data:null,error:null});await assert.rejects(()=>vm.runInContext('readDiscussion(7)',chat.context),/Идея скрыта/);
 assert.match(source,/data-chat=/);assert.match(source,/discussion\(Number\(b.dataset.chat\)\)/);assert.match(source,/disposed=true;clearInterval\(timer\)/);
 console.log('PASS: discussion routing, message ordering, hidden parent, escaped bubbles, own message style, ordinary-user restrictions, RPC send validation and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1});
