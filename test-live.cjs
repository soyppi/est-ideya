// Genuine competing HTTPS requests to a separately designated test Supabase.
// Never uses a service-role key. The three logins must be synthetic test users.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_KEY;
if(!url||!key||process.env.TEST_ALLOW_WRITE!=='yes')throw Error('Set TEST_SUPABASE_URL, TEST_SUPABASE_KEY, TEST_ALLOW_WRITE=yes and TEST_{AUTHOR,VOTER,MOD}_{EMAIL,PASSWORD}. Use a dedicated test project.');
async function request(route,token,body,method='POST'){
 const response=await fetch(url+route,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return {ok:response.ok,data};
}
async function login(role){const r=await request('/auth/v1/token?grant_type=password',null,{email:process.env[`TEST_${role}_EMAIL`],password:process.env[`TEST_${role}_PASSWORD`]});assert(r.ok,JSON.stringify(r.data));return r.data.access_token}
async function rpc(token,name,args){return request('/rest/v1/rpc/'+name,token,args)}
(async()=>{
 const [author,voter,mod]=await Promise.all(['AUTHOR','VOTER','MOD'].map(login));let id;
 try{
 const created=await rpc(author,'submit_idea',{p_request_id:randomUUID(),p_title:'Автотест '+Date.now(),p_problem:'Изолированная проверка двух сеансов',p_solution:'После теста идея будет скрыта',p_category:'Другое'});assert(created.ok,JSON.stringify(created.data));id=created.data;
 const competing=await Promise.all(Array.from({length:8},()=>rpc(voter,'set_idea_vote',{p_idea_id:id,p_enabled:true})));assert(competing.every(r=>r.ok));
 let votes=await request(`/rest/v1/votes?idea_id=eq.${id}&select=user_id`,author,undefined,'GET');assert.equal(votes.data.length,1,'8 competing requests must produce one vote');
 assert((await rpc(author,'set_idea_vote',{p_idea_id:id,p_enabled:true})).ok);
 assert((await rpc(voter,'set_idea_vote',{p_idea_id:id,p_enabled:false})).ok);
 votes=await request(`/rest/v1/votes?idea_id=eq.${id}&select=user_id`,author,undefined,'GET');assert.equal(votes.data.length,1,'unvote preserves another user');
 assert(!(await rpc(author,'change_idea_status',{p_idea_id:id,p_new_status:'На рассмотрении',p_reason:'Нельзя'})).ok);
 assert(!(await rpc(mod,'change_idea_status',{p_idea_id:id,p_new_status:'На рассмотрении',p_reason:' '})).ok);
 const changes=await Promise.all(Array.from({length:4},()=>rpc(mod,'change_idea_status',{p_idea_id:id,p_new_status:'На рассмотрении',p_reason:'Параллельная проверка'})));assert(changes.every(r=>r.ok));
 const history=await request(`/rest/v1/status_history?idea_id=eq.${id}`,author,undefined,'GET');assert.equal(history.data.length,1);
 assert((await rpc(mod,'moderator_delete_idea',{p_idea_id:id,p_reason:'Завершённый автоматический тест'})).ok);
 for(const table of ['ideas','votes','comments','status_history']){const q=table==='ideas'?'id':'idea_id';const r=await request(`/rest/v1/${table}?${q}=eq.${id}`,voter,undefined,'GET');assert(r.ok);assert.equal(r.data.length,0,'hidden '+table)}
 console.log('PASS: real concurrent requests, isolated sessions, own unvote, role/reason guards, atomic history, hidden direct requests.');
 }finally{if(id)await rpc(mod,'moderator_delete_idea',{p_idea_id:id,p_reason:'Очистка изолированного автотеста'})}
})().catch(error=>{console.error(error);process.exitCode=1});
