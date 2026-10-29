/* Есть идея — static GitHub Pages client for Supabase */
const $ = s => document.querySelector(s);
const categories = ['Учёба','Инфраструктура','Досуг','Питание','Другое'];
const statuses = ['Новое','На рассмотрении','Принято','Отклонено','Реализовано'];
const statusClass = {'Новое':'status-new','На рассмотрении':'status-review','Принято':'status-accepted','Отклонено':'status-rejected','Реализовано':'status-done'};
const transitions = {'Новое':['На рассмотрении'],'На рассмотрении':['Принято','Отклонено'],'Принято':['Реализовано','Отклонено'],'Отклонено':[],'Реализовано':[]};
let db = null, currentUser = null;
function canModerate(){return ['moderator','admin'].includes(currentUser?.role)}
function isAdmin(){return currentUser?.role==='admin'}
function roleLabel(role){return {user:'Участник',moderator:'Модератор',admin:'Администратор'}[role]||'Участник'}
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = v => v ? new Date(v).toLocaleString('ru-RU') : '—';
// Validate visible content without altering passwords or emoji sequences.
function visibleText(value){return String(value??'').replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cf}\p{M}\u2800\u3164\uFFA0\u115F\u1160]/gu,'')}
function requireText(value,min=1,max=2000){const text=String(value??'').trim();if([...visibleText(text)].length<min)throw new Error(`Нужно минимум ${min} видимых символов. Пробелы и невидимые символы не считаются текстом.`);if([...text].length>max)throw new Error(`Максимум ${max} символов.`);return text}
function normalizeEmail(value){const email=String(value??'').trim().normalize('NFC');if(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\s]/u.test(email))throw new Error('Убери пробелы и невидимые символы из email.');const at=email.lastIndexOf('@');if(at<1)throw new Error('Укажи полный email: имя@домен.');const local=email.slice(0,at),domain=email.slice(at+1);let host;try{host=new URL('https://'+domain).hostname}catch{throw new Error('Проверь домен email.')}if(!host.includes('.')||/[/:?#@]/.test(domain))throw new Error('Проверь домен email.');return local+'@'+host.toLowerCase()}
let authRetryAt=0,emailRetryAt=0;
let recoveringPassword=readRecoveryMode(),recoveryDialogOpen=false;
function readRecoveryMode(){try{return window.sessionStorage?.getItem('est-ideya:recovery')==='true'}catch{return false}}
function setRecoveryMode(value){recoveringPassword=value;try{if(value)window.sessionStorage?.setItem('est-ideya:recovery','true');else window.sessionStorage?.removeItem('est-ideya:recovery')}catch{}}
function authRateError(error){return error?.status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code)}
function authCooldown(emailOperation=true){const retryAt=emailOperation?Math.max(emailRetryAt,authRetryAt):authRetryAt;if(Date.now()<retryAt)throw new Error(`Слишком много попыток. Повтори через ${Math.ceil((retryAt-Date.now())/60000)} мин. Повторные нажатия не ускоряют отправку.`)}
function trackAuthError(error){if(error?.code==='over_email_send_rate_limit')emailRetryAt=Date.now()+60*60000;else if(authRateError(error))authRetryAt=Date.now()+5*60000}
function toast(msg){const el=$('#toast');el.textContent=msg;el.className='toast';setTimeout(()=>el.className='',3000)}
let returnFocus=null,modalCleanup=null;
function modal(content){if(modalCleanup){modalCleanup();modalCleanup=null;}if(!$('#modalRoot').firstChild)returnFocus=document.activeElement;$('#modalRoot').innerHTML=`<div class="overlay" id="overlay"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${content}</div></div>`;
 const dialog=$('.modal');const heading=dialog.querySelector('h2');if(heading){heading.id='dialogTitle';dialog.setAttribute('aria-labelledby','dialogTitle')}
 dialog.querySelectorAll('.close').forEach(b=>{b.setAttribute('aria-label','Закрыть окно');b.onclick=userCloseModal});
 dialog.querySelectorAll('.field').forEach((field,n)=>{const input=field.querySelector('input,textarea,select'),label=field.querySelector('label');if(input){input.id=input.id||'field'+n;if(label)label.htmlFor=input.id;else if(!input.hasAttribute('aria-label'))input.setAttribute('aria-label',input.placeholder||'Причина');if(input.tagName==='TEXTAREA'&&input.maxLength<0)input.maxLength=2000}});
 dialog.querySelectorAll('input[type="password"]').forEach(input=>input.dataset.secret='true');
 dialog.querySelectorAll('[data-password-toggle]').forEach(button=>button.onclick=()=>{const input=dialog.querySelector(`[name="${button.dataset.passwordToggle}"]`);if(!input)return;const reveal=input.type==='password';input.type=reveal?'text':'password';button.textContent=reveal?'Скрыть':'Показать';button.setAttribute('aria-pressed',String(reveal));});
 dialog.querySelectorAll('form').forEach(form=>{const error=form.querySelector('[id$="Error"]');if(error){error.setAttribute('role','alert');error.id=error.id||'formError'}
 form.addEventListener('submit',e=>{if(form.dataset.busy==='true'){e.preventDefault();e.stopImmediatePropagation();return}for(const input of form.querySelectorAll('[required]')){const text=input.value,size=[...text.trim()].length,min=Number(input.getAttribute('minlength')||1),max=Number(input.getAttribute('maxlength')||1000000);let issue='';try{if(input.type==='password'||input.dataset.secret==='true'){if([...text].length<min)issue=`Минимум ${min} символов.`}else if(input.type==='email'){normalizeEmail(text)}else requireText(text,min,max)}catch(error){issue=error.message}input.setCustomValidity(issue);if(!input.reportValidity()){e.preventDefault();e.stopImmediatePropagation();return}}form.dataset.busy='true';form.setAttribute('aria-busy','true');form.querySelectorAll('button').forEach(b=>b.disabled=true)},true);
 form.addEventListener('input',e=>e.target.setCustomValidity?.(''));
 });
 $('#overlay').onclick=e=>{if(e.target.id==='overlay')userCloseModal()};
 dialog.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();userCloseModal()}if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),input,textarea,select,a[href]')].filter(x=>!x.hidden);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
 (dialog.querySelector('input,textarea,select')||dialog).focus();
}
function closeModal(){if(modalCleanup){modalCleanup();modalCleanup=null;}$('#modalRoot').innerHTML='';if(returnFocus?.isConnected)returnFocus.focus()}
function userCloseModal(){if($('.modal form[aria-busy="true"]')){toast('Запрос отправляется. Дождись результата.');return}closeModal()}
function releaseForms(){document.querySelectorAll('.modal form').forEach(form=>{form.dataset.busy='false';form.removeAttribute('aria-busy');form.querySelectorAll('button').forEach(b=>b.disabled=false)})}
function showError(el,msg){releaseForms();if(el)el.innerHTML=`<div class="error">${esc(msg)}</div>`}
function fail(e){trackAuthError(e);if(e?.code==='email_not_confirmed')return 'Подтверди email. Если ссылка устарела, отправь письмо повторно кнопкой ниже.';if(e?.code==='over_email_send_rate_limit')return 'Почтовый сервис исчерпал лимит отправки. Новые аккаунты временно не подтверждаются. Подожди до часа или сообщи владельцу сайта.';if(authRateError(e))return 'Слишком много попыток. Подожди 5 минут и попробуй снова.';if(e?.code==='email_address_invalid'||/Email address .* is invalid/i.test(e?.message||''))return 'Сервис отклонил email. Проверь адрес и домен: у домена должна работать почта. Если адрес верный, сообщи владельцу сайта.';if(e?.code==='email_address_not_authorized')return 'Почтовый сервис пока не отправляет письма на этот адрес. Сообщи владельцу сайта.';if(e?.code==='signup_disabled')return 'Регистрация временно отключена владельцем сайта.';if(e?.code==='user_already_exists')return 'Этот email уже зарегистрирован. Попробуй войти.';if(e?.code==='23514')return 'Заполни поля видимым текстом и проверь допустимую длину.';if(e?.code==='invalid_credentials'||e?.message==='Invalid login credentials')return 'Неверный email или пароль. Если аккаунт уже был создан, используй прежний пароль или нажми «Забыли пароль?». Повторная регистрация его не меняет.';if(e?.code==='same_password')return 'Выбери новый пароль, который отличается от прежнего.';if(e?.code==='weak_password')return 'Пароль слишком простой. Используй не менее 8 символов, буквы и цифры.';if(e?.code==='otp_expired')return 'Ссылка устарела или уже использована. Запроси новое письмо.';if(/Error sending.*email/i.test(e?.message||''))return 'Не удалось отправить письмо. Повтори позже или сообщи владельцу сайта.';return e?.message||'Что-то пошло не так. Попробуй ещё раз позже.'}
async function profileFor(id){const {data,error}=await db.from('profiles').select('*').eq('id',id).maybeSingle();if(error)throw error;return data}
async function refreshUser(){const {data:{session},error}=await db.auth.getSession();if(error)throw error;currentUser=null;if(session?.user){let p=await profileFor(session.user.id);currentUser={id:session.user.id,email:session.user.email,name:p?.name||session.user.user_metadata?.name||'Участник',role:p?.role||'user'};}accountUI()}
function accountUI(){const el=$('#account');el.innerHTML=currentUser?`<button class="ghost small-btn notification-button" id="notificationsBtn" aria-label="Уведомления">Уведомления <span id="notificationCount" hidden></span></button><button class="ghost small-btn" id="myIdeas">Профиль</button>${canModerate()?'<button class="ghost small-btn" id="modArea">Модерация</button>':''}${isAdmin()?'<button class="ghost small-btn" id="adminUsersBtn">Участники</button>':''}<button class="ghost small-btn" id="logout">Выйти</button>`:`<button class="ghost small-btn" id="loginBtn">Войти</button><button class="primary small-btn" id="registerBtn">Регистрация</button>`;
 $('#loginBtn')?.addEventListener('click',()=>authModal('login'));$('#registerBtn')?.addEventListener('click',()=>authModal('register'));
 $('#logout')?.addEventListener('click',async()=>{const {error}=await db.auth.signOut();if(error)return toast(fail(error));discussionDrafts.clear();setRecoveryMode(false);currentUser=null;accountUI();loadIdeas();toast('Вы вышли из аккаунта.')});
 $('#notificationsBtn')?.addEventListener('click',notificationsModal);syncNotificationPolling();
 $('#adminUsersBtn')?.addEventListener('click',()=>adminUsers());$('#myIdeas')?.addEventListener('click',myIdeas);$('#modArea')?.addEventListener('click',moderation);
}
function confirmationRedirectUrl(){return new URL('./',window.location.href).href}
async function resendConfirmation(email){authCooldown();email=normalizeEmail(email);const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:confirmationRedirectUrl()}});if(error)throw error;emailRetryAt=Date.now()+60000}
function authModal(mode,initialEmail=''){if(!db){toast('Подключение к базе пока не настроено.');return}const reg=mode==='register';modal(`<div class="modal-head"><div><div class="eyebrow">${reg?'ПРИСОЕДИНИТЬСЯ':'С ВОЗВРАЩЕНИЕМ'}</div><h2>${reg?'Создать аккаунт':'Войти в аккаунт'}</h2></div><button class="close">✕</button></div><p class="modal-sub">${reg?'Предлагай идеи и поддерживай инициативы сообщества.':'Войдите, чтобы голосовать, комментировать и предлагать идеи.'}</p><form id="authForm">${reg?'<div class="field"><label>Имя</label><input name="name" required maxlength="80" placeholder="Как к вам обращаться"></div>':''}<div class="field"><label>Email</label><input name="email" type="text" inputmode="email" autocomplete="username" required maxlength="254" value="${esc(initialEmail)}" placeholder="name@example.com"><small class="field-hint">Личная или корпоративная почта с работающим доменом.</small></div><div class="field"><label>Пароль</label><div class="password-control"><input name="password" type="password" autocomplete="${reg?'new-password':'current-password'}" required minlength="${reg?8:1}" placeholder="${reg?'Минимум 8 символов':'Пароль аккаунта'}"><button class="password-toggle" type="button" data-password-toggle="password" aria-label="Показать или скрыть пароль" aria-pressed="false">Показать</button></div></div>${!reg?'<button type="button" class="auth-help" id="forgotPassword">Забыли пароль?</button>':''}<div id="formError"></div><button type="button" class="ghost small-btn" id="resendConfirmation">Отправить подтверждение повторно</button><div class="form-actions"><button type="button" class="ghost" id="switchAuth">${reg?'Уже есть аккаунт':'Создать аккаунт'}</button><button class="primary">${reg?'Зарегистрироваться':'Войти'}</button></div></form>`);
 $('#forgotPassword')?.addEventListener('click',()=>recoveryRequestModal($('#authForm input[name="email"]').value));
 $('#resendConfirmation').onclick=async()=>{const email=$('#authForm input[name="email"]');if(!email.reportValidity())return;const button=$('#resendConfirmation');button.disabled=true;try{await resendConfirmation(email.value.trim());$('#formError').textContent='Новое письмо отправлено. Открой самое свежее письмо и подтверди email.'}catch(error){showError($('#formError'),fail(error))}finally{button.disabled=false}};
 $('#switchAuth').onclick=()=>authModal(reg?'login':'register',$('#authForm input[name="email"]').value);$('#authForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{authCooldown(reg);f.email=normalizeEmail(f.email);if(reg)f.name=requireText(f.name,1,80);if(reg){const {data,error}=await db.auth.signUp({email:f.email,password:f.password,options:{data:{name:f.name},emailRedirectTo:confirmationRedirectUrl()}});if(error)throw error;if(!data.session){registrationNotice(f.email);return;}}else{const {error}=await db.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw error;}await refreshUser();closeModal();loadIdeas();toast(reg?'Аккаунт создан!':'С возвращением!');}catch(err){showError($('#formError'),fail(err))}};
}
// Recovery uses the signed email link and the current user's SDK session only.
async function requestPasswordReset(email){
 if(!db)throw new Error('Подключение к базе не настроено.');
 authCooldown();const address=normalizeEmail(email);
 const {error}=await db.auth.resetPasswordForEmail(address,{redirectTo:confirmationRedirectUrl()});
 if(error)throw error;emailRetryAt=Date.now()+60000;
}
function registrationNotice(email){
 modal(`<div class="modal-head"><h2>Проверь почту</h2><button class="close">✕</button></div><p class="modal-sub">Если адрес ${esc(email)} ещё не зарегистрирован, на него придёт письмо подтверждения. Открой самое свежее письмо.</p><p class="auth-note">Если аккаунт уже существует, используй прежний пароль или восстанови доступ. Повторная регистрация не меняет пароль.</p><div class="form-actions"><button class="ghost" id="noticeLogin">Войти</button><button class="primary" id="noticeRecover">Восстановить пароль</button></div>`);
 $('#noticeLogin').onclick=()=>authModal('login',email);$('#noticeRecover').onclick=()=>recoveryRequestModal(email);
}
function recoveryRequestModal(email=''){
 if(!db)return toast('Подключение к базе не настроено.');
 modal(`<div class="modal-head"><div><div class="eyebrow">ВОССТАНОВЛЕНИЕ ДОСТУПА</div><h2>Забыли пароль?</h2></div><button class="close">✕</button></div><p class="modal-sub">Укажи почту своего аккаунта. По ссылке из письма можно будет задать новый пароль.</p><form id="recoveryForm"><div class="field"><label>Email аккаунта</label><input name="email" type="text" inputmode="email" autocomplete="username" required maxlength="254" value="${esc(email)}" placeholder="name@example.com"></div><div id="recoveryError"></div><div class="form-actions"><button type="button" class="ghost" id="recoveryBack">Назад ко входу</button><button class="primary">Отправить ссылку</button></div></form>`);
 $('#recoveryBack').onclick=()=>authModal('login',$('#recoveryForm input[name="email"]').value);
 $('#recoveryForm').onsubmit=async event=>{event.preventDefault();try{
  const address=normalizeEmail(new FormData(event.target).get('email'));await requestPasswordReset(address);
  modal(`<div class="modal-head"><h2>Проверь почту</h2><button class="close">✕</button></div><p class="modal-sub" role="status">Если аккаунт с этим адресом существует, письмо со ссылкой восстановления отправлено. Проверь «Спам» и открой самое свежее письмо.</p><p class="auth-note">Вернись на сайт по ссылке из письма: откроется форма нового пароля. Повторную отправку можно запросить через минуту.</p><div class="form-actions"><button class="primary" id="recoveryToLogin">Вернуться ко входу</button></div>`);
  $('#recoveryToLogin').onclick=()=>authModal('login',address);
 }catch(error){showError($('#recoveryError'),fail(error))}};
}
function validateNewPassword(password,repeat){
 if(typeof password!=='string'||[...password].length<8)throw new Error('Новый пароль должен содержать минимум 8 символов.');
 if(password!==repeat)throw new Error('Пароли не совпадают. Введи один и тот же пароль в обоих полях.');
 return password; // Preserve every character, including intentional spaces.
}
async function updateRecoveredPassword(password,repeat){
 if(!currentUser||!recoveringPassword)throw new Error('Сначала открой свежую ссылку восстановления из письма.');
 const value=validateNewPassword(password,repeat);
 const {error}=await db.auth.updateUser({password:value});if(error)throw error;
}
function resetPasswordModal(){
 if(!currentUser||!recoveringPassword)return;
 modal(`<div class="modal-head"><div><div class="eyebrow">ВОССТАНОВЛЕНИЕ ДОСТУПА</div><h2>Новый пароль</h2></div><button class="close">✕</button></div><p class="modal-sub">Ссылка подтверждена. Задай новый пароль для своего аккаунта. Старый пароль не нужен.</p><form id="resetPasswordForm"><div class="field"><label>Новый пароль</label><div class="password-control"><input name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="Минимум 8 символов"><button class="password-toggle" type="button" data-password-toggle="password" aria-label="Показать или скрыть новый пароль" aria-pressed="false">Показать</button></div></div><div class="field"><label>Повтори новый пароль</label><div class="password-control"><input name="repeat" type="password" autocomplete="new-password" required minlength="8" placeholder="Повтори пароль"><button class="password-toggle" type="button" data-password-toggle="repeat" aria-label="Показать или скрыть повтор пароля" aria-pressed="false">Показать</button></div></div><div id="resetError"></div><div class="form-actions"><button class="primary">Сохранить новый пароль</button></div></form>`);
 recoveryDialogOpen=true;modalCleanup=()=>{recoveryDialogOpen=false;setRecoveryMode(false)};
 $('#resetPasswordForm').onsubmit=async event=>{event.preventDefault();try{const values=Object.fromEntries(new FormData(event.target));await updateRecoveredPassword(values.password,values.repeat);setRecoveryMode(false);closeModal();await refreshUser();await loadIdeas();toast('Новый пароль сохранён. Ты вошёл в аккаунт.')}catch(error){showError($('#resetError'),fail(error))}};
}
function authLinkError(){return new URLSearchParams(new URL(window.location.href).hash.slice(1)).get('error')}
function authLinkErrorModal(){modal(`<div class="modal-head"><h2>Ссылка недействительна</h2><button class="close">✕</button></div><p class="modal-sub">Ссылка из письма устарела или уже использована. Запроси новое письмо и открой его только один раз.</p><div class="form-actions"><button class="ghost" id="linkLogin">Войти</button><button class="primary" id="linkRecover">Восстановить пароль</button></div>`);$('#linkLogin').onclick=()=>authModal('login');$('#linkRecover').onclick=()=>recoveryRequestModal()}

// Creating an idea always goes through the authenticated, idempotent server RPC.
// Never fall back to a direct table INSERT when RPC fails.
async function publishIdea(values,requestId){
 return db.rpc('submit_idea',{
  p_request_id:requestId,p_title:requireText(values.title,3,120),p_problem:requireText(values.problem,1,4000),
  p_solution:requireText(values.solution,1,4000),p_category:values.category
 });
}
function ideaForm(idea=null){if(!currentUser){authModal('login');return}const editing=!!idea,requestId=crypto.randomUUID();modal(`<div class="modal-head"><div><div class="eyebrow">${editing?'ОТРЕДАКТИРОВАТЬ':'ТВОЯ ИНИЦИАТИВА'}</div><h2>${editing?'Изменить идею':'Предложить идею'}</h2></div><button class="close">✕</button></div><p class="modal-sub">Расскажи, что можно улучшить, почему это важно и как ты предлагаешь это сделать.</p><form id="ideaForm"><div class="field"><label>Название идеи</label><input name="title" required minlength="3" maxlength="120" value="${esc(idea?.title||'')}" placeholder="Например, больше мест для учёбы"></div><div class="field"><label>Какую проблему решаем?</label><textarea name="problem" required maxlength="4000">${esc(idea?.problem||'')}</textarea></div><div class="field"><label>Предлагаемое решение</label><textarea name="solution" required maxlength="4000">${esc(idea?.solution||'')}</textarea></div><div class="field"><label>Категория</label><select name="category">${categories.map(c=>`<option ${idea?.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div id="formError"></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Отмена</button><button class="primary">${editing?'Сохранить изменения':'Опубликовать идею'}</button></div></form>`);
 $('#ideaForm').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));try{let q;if(editing)q=await db.from('ideas').update({title:requireText(v.title,3,120),problem:requireText(v.problem,1,4000),solution:requireText(v.solution,1,4000),category:v.category}).eq('id',idea.id).eq('user_id',currentUser.id).eq('status','Новое').select('id').maybeSingle();else q=await publishIdea(v,requestId);if(q.error)throw q.error;if(editing&&!q.data)throw new Error('Идею уже начали рассматривать или она скрыта. Обнови список.');closeModal();await loadIdeas();toast(editing?'Изменения сохранены':'Идея опубликована!')}catch(err){showError($('#formError'),fail(err))}};
}
let feedRequest = 0;
async function loadIdeas(){if(!db)return;const request=++feedRequest;try{let q=db.from('ideas').select('*, profiles:user_id(name)').is('deleted_at',null);if($('#search').value.trim()){const pattern='"%'+$('#search').value.trim().replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'%"';q=q.or(`title.ilike.${pattern},problem.ilike.${pattern},solution.ilike.${pattern}`);}if($('#category').value)q=q.eq('category',$('#category').value);if($('#status').value)q=q.eq('status',$('#status').value);q=$('#sort').value==='votes'?q.order('created_at',{ascending:false}):q.order('created_at',{ascending:false});q=q.order('id',{ascending:false});const {data:ideas,error}=await q;if(error)throw error;
 const ids=ideas.map(i=>i.id);let votes=[],comments=[],myVotes=[];if(ids.length){let r=await db.from('votes').select('idea_id,user_id').in('idea_id',ids);if(r.error)throw r.error;votes=r.data||[];r=await db.from('comments').select('idea_id').in('idea_id',ids).is('deleted_at',null);if(r.error)throw r.error;comments=r.data||[];myVotes=votes.filter(v=>v.user_id===currentUser?.id).map(v=>v.idea_id)}
 if(request!==feedRequest)return;
 if($('#sort').value==='votes') ideas.sort((a,b)=>votes.filter(v=>v.idea_id===b.id).length-votes.filter(v=>v.idea_id===a.id).length);
 if($('#category').options.length===1)$('#category').innerHTML='<option value="">Все категории</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join('');if($('#status').options.length===1)$('#status').innerHTML='<option value="">Все статусы</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join('');document.querySelectorAll('[data-category]').forEach(button=>{button.classList.toggle('active',button.dataset.category===$('#category').value);button.setAttribute('aria-pressed',String(button.dataset.category===$('#category').value))});$('#feedCount').textContent=`${ideas.length} ${plural(ideas.length,['идея','идеи','идей'])}`;
 $('#ideas').innerHTML=ideas.length?ideas.map(i=>{const vc=votes.filter(v=>v.idea_id===i.id).length,cc=comments.filter(c=>c.idea_id===i.id).length;return `<article class="idea-card" tabindex="0" data-card-id="${i.id}" aria-label="Открыть идею: ${esc(i.title)}"><div class="card-top"><span class="tag">${esc(i.category)}</span><span class="status ${statusClass[i.status]}">${esc(i.status)}</span></div><h3><button class="idea-title-link" data-detail="${i.id}">${esc(i.title)}</button></h3><p>${esc(i.problem.length>135?i.problem.slice(0,135)+'…':i.problem)}</p><div class="card-bottom"><span class="author">${esc(i.profiles?.name||'Участник')} · ${new Date(i.created_at).toLocaleDateString('ru-RU')}</span><div class="card-actions"><button class="vote ${myVotes.includes(i.id)?'active':''}" aria-label="${myVotes.includes(i.id)?'Снять поддержку':'Поддержать идею'}: ${vc}" aria-pressed="${myVotes.includes(i.id)}" data-vote="${i.id}">↑ ${vc}</button><button class="comment-link" data-chat="${i.id}">Обсудить · ${cc}</button></div></div></article>`}).join(''):'<div class="empty"><span class="empty-icon" aria-hidden="true">✳</span><h3>Здесь начинается что-то хорошее.</h3><p>Пока ничего не найдено. Попробуй изменить фильтры или предложи первую идею.</p><button class="primary" onclick="ideaForm()">Предложить идею ↗</button></div>';
 document.querySelectorAll('[data-card-id]').forEach(card=>{card.onclick=event=>{if(!event.target.closest('button,a,input,textarea,select,label'))detail(Number(card.dataset.cardId))};card.onkeydown=event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();detail(Number(card.dataset.cardId))}}});
 document.querySelectorAll('[data-vote]').forEach(b=>b.onclick=()=>vote(Number(b.dataset.vote)));document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(Number(b.dataset.detail)));document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>discussion(Number(b.dataset.chat)));
 }catch(e){if(request!==feedRequest)return;$('#ideas').innerHTML=`<div class="empty">${esc(fail(e))} Проверь настройки Supabase и выполнение SQL-скрипта.</div>`}}
function plural(n,f){return n%10===1&&n%100!==11?f[0]:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?f[1]:f[2]}
const voting=new Set();
async function vote(id){if(!currentUser)return authModal('login');if(voting.has(id))return;voting.add(id);const buttons=[...document.querySelectorAll(`[data-vote="${id}"]`)];buttons.forEach(b=>b.disabled=true);try{const {data,error}=await db.from('votes').select('idea_id').eq('idea_id',id).eq('user_id',currentUser.id).maybeSingle();if(error)throw error;const r=await db.rpc('set_idea_vote',{p_idea_id:id,p_enabled:!data});if(r.error)throw r.error;await loadIdeas();if($('#detailVote')?.dataset.vote===String(id))await detail(id)}catch(e){toast(fail(e))}finally{voting.delete(id);buttons.forEach(b=>b.disabled=false)}}
async function detail(id){try{const [{data:i,error:ie},{data:cs,error:ce},{data:hist,error:he}]=await Promise.all([db.from('ideas').select('*, profiles:user_id(name)').eq('id',id).is('deleted_at',null).single(),db.from('comments').select('*, profiles:user_id(name)').eq('idea_id',id).is('deleted_at',null).order('created_at'),db.from('status_history').select('*, profiles:moderator_id(name)').eq('idea_id',id).order('created_at')]);if(ie)throw ie;if(ce)throw ce;if(he)throw he;const voteResult=await db.from('votes').select('user_id',{count:'exact'}).eq('idea_id',id);if(voteResult.error)throw voteResult.error;const votesCount=voteResult.count,myVote=voteResult.data.some(v=>v.user_id===currentUser?.id);const canEdit=currentUser&&currentUser.id===i.user_id&&i.status==='Новое',mod=canModerate();
 modal(`<div class="modal-head"><div><span class="tag">${esc(i.category)}</span> <span class="status ${statusClass[i.status]}">${esc(i.status)}</span><h2 style="margin-top:15px">${esc(i.title)}</h2></div><button class="close">✕</button></div><div class="detail-label">ПРОБЛЕМА</div><p class="detail-text">${esc(i.problem)}</p><div class="detail-label">ПРЕДЛАГАЕМОЕ РЕШЕНИЕ</div><p class="detail-text">${esc(i.solution)}</p><p class="author">Автор: ${esc(i.profiles?.name||'Участник')} · ${dateText(i.created_at)} · Поддержка: ${votesCount||0}</p><button class="vote ${myVote?'active':''}" id="detailVote" data-vote="${id}" aria-pressed="${myVote}">${myVote?'Снять поддержку':'↑ Поддержать'} · ${votesCount||0}</button>${canEdit?'<button class="ghost small-btn" id="editIdea">Редактировать идею</button>':''}<div class="detail-label">ИСТОРИЯ СТАТУСОВ И РЕШЕНИЙ</div><div class="status-history">${hist.map(h=>`<div class="comment"><b>${esc(h.from_status||'Создана')} → ${esc(h.to_status)}</b><p>${esc(h.reason)}</p><span class="author">Модератор: ${esc(h.profiles?.name||'—')} · ${dateText(h.created_at)}</span></div>`).join('')||'<p class="author">Решений пока нет.</p>'}</div>${mod?`<div class="moderator-tools"><div class="detail-label">ИНСТРУМЕНТЫ МОДЕРАТОРА</div>${transitions[i.status].length?`<div class="field"><label>Новый статус</label><select id="newStatus">${transitions[i.status].map(s=>`<option>${s}</option>`).join('')}</select></div><div class="field"><label>Объяснение решения (обязательно)</label><textarea id="statusReason" maxlength="2000" required></textarea></div><button class="primary small-btn" id="setStatus">Обновить статус</button>`:'<p class="author">Для этого статуса дальнейшие переходы не предусмотрены.</p>'}<button class="ghost small-btn" id="deleteIdea">Скрыть идею</button></div>`:''}<div class="detail-discussion"><p>Обсуждение идеи · ${cs.length} ${plural(cs.length,['сообщение','сообщения','сообщений'])}</p><button class="primary small-btn" id="openDiscussion">Открыть чат ↗</button></div>`);
 $('#detailVote').onclick=()=>vote(id);$('#editIdea')?.addEventListener('click',()=>ideaForm(i));$('#setStatus')?.addEventListener('click',async()=>{const button=$('#setStatus');button.disabled=true;try{const {error}=await db.rpc('change_idea_status',{p_idea_id:id,p_new_status:$('#newStatus').value,p_reason:requireText($('#statusReason').value)});if(error)throw error;toast('Статус обновлён');closeModal();loadIdeas()}catch(e){toast(fail(e));button.disabled=false}});
 $('#deleteIdea')?.addEventListener('click',()=>reasonModal('Скрыть идею','Укажи причину. Запись останется доступна модератору.',async reason=>{const {error}=await db.rpc('moderator_delete_idea',{p_idea_id:id,p_reason:reason});if(error)throw error;closeModal();loadIdeas();toast('Идея скрыта')}));
 $('#openDiscussion').onclick=()=>discussion(id);
 }catch(e){toast(fail(e))}}
let notificationCache={userId:null,items:[],unread:0},notificationTimer=null,notificationGeneration=0,notificationLoad=0;
function notificationBadge(){const badge=$('#notificationCount'),button=$('#notificationsBtn');if(!badge||!button)return;badge.hidden=!notificationCache.unread;badge.textContent=notificationCache.unread>99?'99+':String(notificationCache.unread);button.setAttribute('aria-label',notificationCache.unread?`Уведомления: ${notificationCache.unread} непрочитанных`:'Уведомления')}
async function readNotifications(){
 if(!currentUser)return {items:[],unread:0};const uid=currentUser.id;
 const [rows,count]=await Promise.all([db.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50),db.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',uid).is('read_at',null)]);
 if(rows.error)throw rows.error;if(count.error)throw count.error;return {items:rows.data||[],unread:count.count??0};
}
async function refreshNotifications(){const uid=currentUser?.id,generation=notificationGeneration,request=++notificationLoad;if(!uid)return;const state=await readNotifications();if(currentUser?.id!==uid||notificationGeneration!==generation||request!==notificationLoad)return;notificationCache={userId:uid,...state};notificationBadge();return state}
function syncNotificationPolling(){
 const uid=currentUser?.id||null;if(uid===notificationCache.userId&&notificationTimer!==null){notificationBadge();return;}
 if(notificationTimer!==null)clearInterval(notificationTimer);notificationTimer=null;notificationGeneration++;notificationCache={userId:uid,items:[],unread:0};notificationBadge();
 if(uid){refreshNotifications().catch(()=>{});notificationTimer=setInterval(()=>{if(document.visibilityState!=='hidden')refreshNotifications().catch(()=>{})},20000)}
}
async function markNotificationsRead(id=null){
 if(!currentUser)throw new Error('Войди в аккаунт.');let query=db.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',currentUser.id).is('read_at',null);if(id!==null)query=query.eq('id',id);const {error}=await query;if(error)throw error;await refreshNotifications();
}
function notificationItem(item){return `<article class="notification-item ${item.read_at?'':'notification-unread'}"><span class="author">${dateText(item.created_at)}${item.read_at?'':' · новое'}</span><h3>${esc(item.idea_title)}</h3><p><strong>${esc(item.from_status||'Создана')} → ${esc(item.to_status)}</strong></p><p class="notification-reason">${esc(item.reason)}</p><button class="ghost small-btn" data-notification-open="${item.id}" data-notification-idea="${item.idea_id}">Открыть идею</button></article>`}
async function notificationsModal(){
 if(!currentUser)return authModal('login');const uid=currentUser.id;
 modal(`<div class="modal-head"><div><div class="eyebrow">ТВОИ ИДЕИ В ДВИЖЕНИИ</div><h2>Уведомления</h2></div><button class="close">✕</button></div><p class="modal-sub">Здесь появляются решения по твоим идеям. Показываем последние 50 уведомлений.</p><div id="notificationsError"></div><div class="notification-toolbar"><button class="ghost small-btn" id="notificationsRefresh">Обновить</button><button class="ghost small-btn" id="notificationsReadAll">Прочитать всё</button></div><div id="notificationsList">Загружаем уведомления…</div>`);
 const list=$('#notificationsList');
 async function load(){try{await refreshNotifications();if(!list.isConnected||currentUser?.id!==uid)return;list.innerHTML=notificationCache.items.length?notificationCache.items.map(notificationItem).join(''):'<p class="auth-note">Пока нет уведомлений. Когда модератор изменит статус твоей идеи, решение появится здесь.</p>';list.querySelectorAll('[data-notification-open]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await markNotificationsRead(Number(button.dataset.notificationOpen));if(currentUser?.id===uid)await detail(Number(button.dataset.notificationIdea))}catch(error){showError($('#notificationsError'),fail(error));button.disabled=false}})}catch(error){if(!list.isConnected||currentUser?.id!==uid)return;showError($('#notificationsError'),fail(error));list.textContent='Не удалось загрузить уведомления.'}}
 $('#notificationsRefresh').onclick=load;$('#notificationsReadAll').onclick=async()=>{try{await markNotificationsRead();await load()}catch(error){showError($('#notificationsError'),fail(error))}};await load();
}

// Discussion uses the existing comments and their RLS/moderation rules.
async function readDiscussion(id,limit=200){
 const parent=await db.from('ideas').select('id,title,status').eq('id',id).is('deleted_at',null).maybeSingle();
 if(parent.error)throw parent.error;
 if(!parent.data){const error=new Error('Идея скрыта или больше недоступна.');error.code='IDEA_UNAVAILABLE';throw error}
 const rows=[];let total=0;
 for(let offset=0;offset<limit;offset+=200){
  const result=await db.from('comments').select('*, profiles:user_id(name), reply:reply_to_id(id,body,deleted_at,profiles:user_id(name))',{count:'exact'}).eq('idea_id',id).is('deleted_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+Math.min(200,limit-offset)-1);
  if(result.error)throw result.error;
  total=result.count??result.data.length;
  rows.push(...result.data);
  if(result.data.length<200||rows.length>=total)break;
 }
 return {idea:parent.data,messages:[...new Map(rows.map(row=>[row.id,row])).values()].reverse(),total};
}
function replyQuote(message){if(!message.reply_to_id)return '';const parent=message.reply;return parent&&!parent.deleted_at?`<blockquote class="chat-quote"><strong>${esc(parent.profiles?.name||'Участник')}</strong><span>${esc(parent.body.slice(0,180))}${parent.body.length>180?'…':''}</span></blockquote>`:'<blockquote class="chat-quote chat-quote-hidden">Исходное сообщение скрыто или недоступно.</blockquote>'}
function discussionMessage(message){
 const own=message.user_id===currentUser?.id;
 return `<article class="chat-message ${own?'chat-own':''}" data-message="${message.id}"><div class="chat-message-meta"><strong>${esc(message.profiles?.name||'Участник')}${own?' · ты':''}</strong><time datetime="${esc(message.created_at)}">${dateText(message.created_at)}</time></div>${replyQuote(message)}<p>${esc(message.body)}</p>${currentUser?`<button class="chat-reply" data-chat-reply="${message.id}">Ответить</button>`:''}${canModerate()?`<button class="chat-delete" data-chat-delete="${message.id}" aria-label="Скрыть сообщение ${esc(message.profiles?.name||'участника')}">Скрыть</button>`:''}</article>`;
}
async function sendDiscussionMessage(id,body,requestId,replyToId=null){
 const text=requireText(body);
 if(!text)throw new Error('Напиши сообщение: пробелы не считаются текстом.');
 if([...text].length>2000)throw new Error('Сообщение должно быть не длиннее 2000 символов.');
 if(replyToId!==null&&(!Number.isSafeInteger(replyToId)||replyToId<=0))throw new Error('Неверное сообщение для ответа.');
 const args={p_request_id:requestId,p_idea_id:id,p_body:text};if(replyToId!==null)args.p_reply_to_id=replyToId;
 const result=await db.rpc(replyToId===null?'submit_comment':'submit_comment_reply',args);
 if(result.error)throw result.error;
 return result.data;
}
const discussionDrafts=new Map();
async function discussion(id){
 modal(`<div class="modal-head chat-head"><div><div class="eyebrow">РАЗГОВОР ОБ ИДЕЕ</div><h2>Обсуждение</h2><p class="chat-topic" id="chatTopic">Загружаем идею…</p></div><button class="close">✕</button></div><div class="chat-tools"><span id="chatCount" class="author" role="status">Загружаем сообщения…</span><button class="ghost small-btn" id="chatIdea">Об идее ↗</button></div><div class="chat-notice" id="chatError" role="status"></div><div class="chat-messages" id="chatMessages" role="log" aria-label="Сообщения обсуждения" aria-live="polite" aria-relevant="additions text"><p class="chat-empty">Загружаем обсуждение…</p></div><button class="ghost small-btn chat-older" id="chatOlder" hidden>Показать более ранние сообщения</button>${currentUser?`<form id="chatForm" class="chat-composer"><div id="chatReply" class="chat-reply-preview" hidden><div><strong id="chatReplyName"></strong><p id="chatReplyText"></p></div><button id="chatReplyCancel" type="button" aria-label="Отменить ответ">✕</button></div><div class="field"><label for="chatBody">Твоё сообщение</label><textarea id="chatBody" name="body" required maxlength="2000" rows="2" placeholder="Поделись мнением или задай вопрос…"></textarea></div><div id="chatSendError" role="alert"></div><div class="chat-send-row"><span class="author">Enter — отправить · Shift+Enter — новая строка</span><button class="primary small-btn" type="submit">Отправить ↑</button></div></form>`:`<div class="chat-guest"><p>Войди, чтобы присоединиться к обсуждению.</p><button class="primary small-btn" id="chatLogin">Войти</button></div>`}`);
 const root=$('.modal'),messages=$('#chatMessages'),form=$('#chatForm');root.classList.add('chat-modal');root.parentElement.classList.add('chat-overlay');
 const draftKey=`${currentUser?.id||'guest'}:${id}`,savedDraft=discussionDrafts.get(draftKey);
 let disposed=false,refreshing=false,limit=200,fingerprint='',requestId=savedDraft?.requestId||crypto.randomUUID(),requestBody=savedDraft?.requestBody??null,replyTarget=savedDraft?.replyTarget||null;
 function renderReply(){if(!form)return;$('#chatReply').hidden=!replyTarget;$('#chatReplyName').textContent=replyTarget?'Ответ: '+replyTarget.author:'';$('#chatReplyText').textContent=replyTarget?.body.slice(0,180)||'';}
 if(form){$('#chatReplyCancel').onclick=()=>{replyTarget=null;renderReply();$('#chatBody').focus()};renderReply();}
 if(form&&savedDraft)$('#chatBody').value=savedDraft.body;
 $('#chatIdea').onclick=()=>{if(form?.dataset.busy==='true')return toast('Дождись отправки сообщения.');detail(id)};
 $('#chatLogin')?.addEventListener('click',()=>authModal('login'));
 async function refresh(mode='poll'){
  if(disposed||refreshing)return;refreshing=true;
  try{
   const data=await readDiscussion(id,limit);
   if(disposed||!messages.isConnected)return;
   $('#chatTopic').textContent=data.idea.title;if(form)form.hidden=false;
   $('#chatCount').textContent=`${data.total} ${plural(data.total,['сообщение','сообщения','сообщений'])} · автообновление`;
   $('#chatError').textContent='';$('#chatOlder').hidden=data.messages.length>=data.total;
   const signature=JSON.stringify(data.messages);
   if(signature!==fingerprint){
    const oldHeight=messages.scrollHeight,oldTop=messages.scrollTop,nearBottom=oldHeight-messages.clientHeight-oldTop<90;
    messages.innerHTML=data.messages.length?data.messages.map(discussionMessage).join(''):'<div class="chat-empty"><strong>Начни обсуждение</strong><p>Здесь можно уточнить идею и предложить улучшения.</p></div>';
    messages.scrollTop=mode==='older'?oldTop+messages.scrollHeight-oldHeight:mode==='initial'||mode==='send'||nearBottom?messages.scrollHeight:oldTop;
    fingerprint=signature;
    messages.querySelectorAll('[data-chat-reply]').forEach(button=>button.onclick=()=>{if(form?.dataset.busy==='true')return toast('Дождись отправки.');const message=data.messages.find(item=>item.id===Number(button.dataset.chatReply));if(!message||!form)return;replyTarget={id:message.id,author:message.profiles?.name||'Участник',body:message.body};renderReply();$('#chatBody').focus()});
    messages.querySelectorAll('[data-chat-delete]').forEach(button=>button.onclick=()=>reasonModal('Скрыть сообщение','Сообщение останется в базе и будет доступно модератору.',async reason=>{
     const result=await db.rpc('moderator_delete_comment',{p_comment_id:Number(button.dataset.chatDelete),p_reason:reason});if(result.error)throw result.error;await discussion(id);await loadIdeas();toast('Сообщение скрыто');
    }));
   }
  }catch(error){
   if(!disposed&&messages.isConnected){$('#chatError').textContent=fail(error)+' Повторяем загрузку автоматически.';if(error.code==='IDEA_UNAVAILABLE'){messages.innerHTML='<p class="chat-empty">Обсуждение недоступно: идея скрыта.</p>';fingerprint='';if(form)form.hidden=true;$('#chatOlder').hidden=true}else if(mode==='initial')messages.innerHTML='<p class="chat-empty">Не удалось загрузить сообщения. Текст можно отправить после восстановления связи.</p>'}
  }finally{refreshing=false}
 }
 $('#chatOlder').onclick=()=>{limit+=200;refresh('older')};
 if(form){
  const input=$('#chatBody');
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&window.matchMedia('(pointer:fine)').matches){event.preventDefault();if(form.dataset.busy!=='true')form.requestSubmit()}});
  form.onsubmit=async event=>{
   event.preventDefault();const body=input.value.trim();
   const payload=JSON.stringify([body,replyTarget?.id||null]);if(requestBody!==null&&payload!==requestBody)requestId=crypto.randomUUID();requestBody=payload;
   input.readOnly=true;const submit=form.querySelector('button[type="submit"]');submit.textContent='Отправляем…';
   try{
    await sendDiscussionMessage(id,body,requestId,replyTarget?.id||null);
    if(disposed||!form.isConnected)return;
    input.value='';replyTarget=null;renderReply();requestId=crypto.randomUUID();requestBody=null;discussionDrafts.delete(draftKey);$('#chatSendError').textContent='';
    // A poll may already be in flight. Its result can be older than this send;
    // the next poll will also fetch the persisted message.
    await refresh('send');await loadIdeas();
   }catch(error){if(!disposed&&form.isConnected)showError($('#chatSendError'),fail(error))}
   finally{if(!disposed&&form.isConnected){input.readOnly=false;releaseForms();submit.textContent='Отправить ↑';input.focus()}}
  };
 }
 const timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},5000);
 modalCleanup=()=>{if(form){const body=form.querySelector('textarea').value;if(body||replyTarget)discussionDrafts.set(draftKey,{body,requestId,requestBody,replyTarget});else discussionDrafts.delete(draftKey)}disposed=true;clearInterval(timer)};
 await refresh('initial');
}

function reasonModal(title,sub,action){modal(`<div class="modal-head"><h2>${title}</h2><button class="close">✕</button></div><p class="modal-sub">${sub}</p><form id="reasonForm"><div class="field"><label>Причина действия</label><textarea name="reason" maxlength="2000" required placeholder="Причина…"></textarea></div><div id="formError"></div><div class="form-actions"><button type="button" class="ghost" onclick="closeModal()">Отмена</button><button class="primary">Подтвердить</button></div></form>`);$('#reasonForm').onsubmit=async e=>{e.preventDefault();try{const reason=requireText(new FormData(e.target).get('reason'));if(!reason)throw new Error('Укажи причину.');await action(reason)}catch(err){showError($('#formError'),fail(err))}}}
async function myIdeas(){if(!currentUser)return authModal('login');try{const {data:ideas,error}=await db.from('ideas').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});if(error)throw error;modal(`<div class="modal-head"><div><div class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</div><h2>Профиль</h2></div><button class="close">✕</button></div><div class="profile-identity"><div class="profile-avatar">${esc(currentUser.name.trim().charAt(0).toUpperCase())}</div><div><h3>${esc(currentUser.name)}</h3><p>${esc(currentUser.email)}</p><span class="profile-role">${roleLabel(currentUser.role)}</span></div></div><div class="detail-label">МОИ ИДЕИ</div>${ideas.map(i=>`<div class="comment"><b>${esc(i.title)}</b><p>${esc(i.category)} · ${esc(i.status)}${i.deleted_at?' · Скрыта модератором':''}</p>${!i.deleted_at&&i.status==='Новое'?`<button class="ghost small-btn" data-edit="${i.id}">Редактировать</button>`:''}</div>`).join('')||'<p class="author">Ты пока не предложил(а) идей.</p>'}<div class="form-actions"><button class="primary" id="myNew">＋ Новая идея</button></div>`);document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const i=ideas.find(x=>x.id===Number(b.dataset.edit));if(i)ideaForm(i)});$('#myNew').onclick=()=>ideaForm()}catch(e){toast(fail(e))}}
async function moderation(filter=''){if(typeof filter!=='string')filter='';if(!canModerate())return toast('Недостаточно прав.');try{const [{data:pending,error:e1},{data:deleted,error:e2},{data:deletedComments,error:e3}]=await Promise.all([db.from('ideas').select('*, profiles:user_id(name)').is('deleted_at',null).order('created_at').order('id'),db.from('ideas').select('*, profiles:user_id(name)').not('deleted_at','is',null).order('deleted_at',{ascending:false}),db.from('comments').select('*, profiles:user_id(name)').not('deleted_at','is',null).order('deleted_at',{ascending:false})]);if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;modal(`<div class="modal-head"><div><div class="eyebrow">РАБОЧАЯ ЗОНА</div><h2>Модерация</h2></div><button class="close">✕</button></div><p class="modal-sub">Новые заявки и скрытые записи.</p><div class="field"><label for="moderationStatus">Статус идеи</label><select id="moderationStatus"><option value="">Все статусы</option>${statuses.map(s=>`<option ${s===filter?'selected':''}>${s}</option>`).join('')}</select></div><h3>Идеи</h3>${pending.filter(i=>!filter||i.status===filter).map(i=>`<div class="comment"><b>${esc(i.title)}</b><p>${esc(i.profiles?.name||'Участник')} · ${esc(i.category)} · ${esc(i.status)}</p><button class="primary small-btn" data-open="${i.id}">Открыть и принять решение</button></div>`).join('')||'<p class="author">Заявок нет.</p>'}<h3>Скрытые идеи</h3>${deleted.map(i=>`<div class="comment"><b>${esc(i.title)}</b><p>${esc(i.profiles?.name||'Участник')} · ${esc(i.status)} · Причина: ${esc(i.deleted_reason||'—')}</p><button class="ghost small-btn" data-restore="${i.id}">Восстановить</button></div>`).join('')||'<p class="author">Скрытых идей нет.</p>'}<h3>Скрытые комментарии</h3>${deletedComments.map(c=>`<div class="comment"><b>${esc(c.profiles?.name||'Участник')}</b><p>${esc(c.body)}</p><p class="author">Причина: ${esc(c.deleted_reason||'—')}</p></div>`).join('')||'<p class="author">Скрытых комментариев нет.</p>'}`);$('#moderationStatus').onchange=e=>moderation(e.target.value);document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>detail(Number(b.dataset.open)));document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{try{const {error}=await db.rpc('moderator_restore_idea',{p_idea_id:Number(b.dataset.restore)});if(error)throw error;moderation();loadIdeas();toast('Идея восстановлена')}catch(e){toast(fail(e))}})}catch(e){toast(fail(e))}}

async function adminUsers(search=''){
 if(!isAdmin())return toast('Этот раздел доступен администратору.');
 modal(`<div class="modal-head"><div><div class="eyebrow">ТВОЯ КОМАНДА</div><h2>Участники и роли</h2></div><button class="close" aria-label="Закрыть">✕</button></div><p class="modal-sub">Найди участника по имени или email. Модераторы рассматривают идеи и следят за обсуждениями.</p><form id="userSearch" class="admin-search"><input name="query" aria-label="Найти участника по имени или email" placeholder="Имя или email участника" value="${esc(search)}"><button class="primary">Найти ↗</button></form><p class="admin-note">Роли можно выдавать после подтверждения почты. Только администратор управляет модераторами. Своя роль и роли других администраторов защищены.</p><div id="adminError" role="status"></div><div id="usersList">Загружаем участников…</div><div id="roleHistory" class="role-history"></div>`);
 $('#userSearch').onsubmit=e=>{e.preventDefault();loadAdminUsers(new FormData(e.target).get('query').trim()).finally(releaseForms)};
 await loadAdminUsers(search);releaseForms();
}
async function loadAdminUsers(search=''){
 const container=$('#usersList');if(!container)return;
 container.textContent='Загружаем участников…';
 try{
  const {data:users,error}=await db.rpc('admin_list_users',{p_search:search});if(error)throw error;
  if($('#usersList')!==container)return;
  container.innerHTML=users.length?users.map(user=>`<div class="user-row"><div class="user-info"><strong>${esc(user.name)}</strong><p>${esc(user.email)}</p><span class="profile-role">${roleLabel(user.role)}</span>${!user.confirmed?'<p>Почта пока не подтверждена</p>':''}</div>${user.role==='admin'?'<span class="author">Роль защищена</span>':`<button class="${user.role==='moderator'?'ghost':'primary'} small-btn" data-user-role="${esc(user.user_id)}" ${!user.confirmed?'disabled':''}>${user.role==='moderator'?'Снять роль':'Назначить модератором'}</button>`}</div>`).join('')+'<p class="author">Показано до 50 последних подходящих аккаунтов. Уточни поиск, если нужного участника нет.</p>':'<div class="empty">Участников с таким именем или email не найдено.</div>';
  document.querySelectorAll('[data-user-role]').forEach(button=>button.onclick=()=>confirmModeratorChange(users.find(user=>user.user_id===button.dataset.userRole),search));
  const history=await db.from('role_changes').select('*,actor:actor_id(name),target:target_id(name)').order('created_at',{ascending:false}).limit(8);
  if($('#usersList')!==container)return;
  if(history.error)throw history.error;
  $('#roleHistory').innerHTML='<div class="detail-label">ПОСЛЕДНИЕ ИЗМЕНЕНИЯ РОЛЕЙ</div>'+(history.data.length?history.data.map(item=>`<p><b>${esc(item.target?.name||'Участник')}</b> · ${roleLabel(item.previous_role)} → ${roleLabel(item.new_role)}<br>${esc(item.actor?.name||'Администратор')} · ${dateText(item.created_at)}</p>`).join(''):'<p>Здесь появится история назначений.</p>');
 }catch(error){if($('#usersList')===container){container.textContent='Не удалось загрузить участников.';showError($('#adminError'),fail(error))}}
}
function confirmModeratorChange(user,search){
 if(!user||!isAdmin())return;
 const enable=user.role!=='moderator';
 modal(`<div class="modal-head"><h2>${enable?'Назначить модератором?':'Снять роль модератора?'}</h2><button class="close" aria-label="Закрыть">✕</button></div><p class="confirm-user">${esc(user.name)}</p><p class="modal-sub">${esc(user.email)}</p><p class="admin-note">${enable?'Этот участник сможет менять статусы идей, скрывать идеи и комментарии. Выдавать роли другим аккаунтам он не сможет.':'Участник сохранит свой аккаунт, идеи и комментарии, но больше не сможет пользоваться инструментами модерации.'}</p><div id="roleError" role="alert"></div><div class="form-actions"><button class="ghost" id="cancelRole">Отмена</button><button class="primary" id="confirmRole">${enable?'Да, назначить':'Да, снять роль'}</button></div>`);
 $('#cancelRole').onclick=()=>adminUsers(search);
 $('#confirmRole').onclick=async()=>{const button=$('#confirmRole');button.disabled=true;try{const {error}=await db.rpc('admin_set_moderator',{p_user_id:user.user_id,p_enabled:enable});if(error)throw error;await adminUsers(search);toast(enable?'Модератор назначен':'Роль модератора снята')}catch(error){showError($('#roleError'),fail(error));button.disabled=false}};
}

$('#category').innerHTML='<option value="">Все категории</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join('');
document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{$('#category').value=button.dataset.category;loadIdeas()});
$('#newIdeaBtn').onclick=()=>ideaForm();['search','category','status','sort'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',()=>loadIdeas()));$('#resetFilters').onclick=()=>{$('#search').value='';$('#category').value='';$('#status').value='';$('#sort').value='new';loadIdeas()};
(async()=>{
 const url=window.SUPABASE_URL,key=window.SUPABASE_ANON_KEY;
 try{
  if(!window.supabase||!url||!key||url.includes('YOUR_PROJECT_ID')||key.includes('YOUR_SUPABASE')){
   $('#ideas').innerHTML='<div class="empty">Подключение к базе ещё не настроено. Добавьте Project URL и публичный ключ Supabase в config.js.</div>';
   $('#feedCount').textContent='Подключение не настроено';accountUI();return;
  }
  db=window.supabase.createClient(url,key);
  // Supabase auth callbacks run inside the auth lock. Defer API calls until it releases.
  db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setRecoveryMode(true);if(event==='SIGNED_OUT')setRecoveryMode(false);setTimeout(async()=>{
   try{await refreshUser();await loadIdeas();if(recoveringPassword&&currentUser&&!recoveryDialogOpen)resetPasswordModal()}catch(error){toast(fail(error))}
  },0)});
  await refreshUser();await loadIdeas();if(authLinkError()){setRecoveryMode(false);authLinkErrorModal()}else if(recoveringPassword&&currentUser&&!recoveryDialogOpen)resetPasswordModal();
 }catch(error){$('#ideas').innerHTML=`<div class="empty">${esc(fail(error))}</div>`;$('#feedCount').textContent='Не удалось загрузить';accountUI()}
})();

document.querySelectorAll('[data-jump-category]').forEach(link=>link.addEventListener('click',()=>{document.querySelector(`[data-category="${link.dataset.jumpCategory}"]`)?.click()}));

$('#mobileProfile')?.addEventListener('click',myIdeas);
