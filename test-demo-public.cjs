// Read-only check of the prepared demonstration in the configured Supabase.
// No passwords, user tokens or writes are used. Run after demo_reset.sql.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scope={window:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/config.js','utf8'),scope);
const sdk=vm.runInThisContext(fs.readFileSync(__dirname+'/supabase.vendor.js','utf8')+';supabase;');
(async()=>{
 const db=sdk.createClient(scope.window.SUPABASE_URL,scope.window.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const results=await Promise.all([
  db.from('ideas').select('id,status,category').gte('id',-91007).lte('id',-91001),
  db.from('ideas').select('id').eq('id',-91007),
  db.from('comments').select('id').eq('id',-92999),
  db.from('status_history').select('id').eq('idea_id',-91007),
  db.from('votes').select('idea_id').eq('idea_id',-91007)
 ]);
 for(const r of results)if(r.error)throw r.error;
 const ideas=results[0].data;
 assert.equal(ideas.length,6,'Apply demo_reset.sql before this check');
 assert.equal(new Set(ideas.map(x=>x.status)).size,5);
 assert.equal(new Set(ideas.map(x=>x.category)).size,5);
 for(const r of results.slice(1))assert.equal(r.data.length,0,'Hidden demo data must not be public');
 console.log('PASS: live guest sees 6 demo ideas, 5 statuses and 5 categories; hidden idea/comment/history/votes stay private. Read-only, no user session.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
