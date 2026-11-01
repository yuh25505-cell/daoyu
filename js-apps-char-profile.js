/* Char personal homepage + per-character worldbook attachments */
'use strict';
var charProfileName = '';
var charProfileTab = 'home';
var cpBookDraft = null;
var cpNewDraft = null;
var cpAddMode = 'direct';
var cpAddVia = 'phone';
function cpEsc(v){ return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v || '').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function cpPersona(){ if(charProfileName) return typeof findPersona === 'function' ? findPersona(charProfileName) : null; return cpNewDraft || null; }
function cpAvatarOf(p){ return (charProfileName&&typeof getSessionCharAvatar==='function'&&getSessionCharAvatar(charProfileName))||p.avatar||''; }
function cpSave(p){ if (typeof savePersonas === 'function') savePersonas(); }
function cpBooks(p){ if (!Array.isArray(p.profileWorldbooks)) p.profileWorldbooks=[]; return p.profileWorldbooks; }
function cpSvg(name){ return name==='edit' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>' : name==='heart' ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'; }
function cpEnsure(){
 if(document.getElementById('charProfileView')) return;
 var el=document.createElement('section'); el.id='charProfileView'; el.className='char-profile-view'; el.setAttribute('aria-hidden','true');
 el.innerHTML='<div class="cp-shell"><header class="cp-top"><div class="cp-eyebrow">PERSONAL INFORMATION</div><button class="cp-edit-icon" data-cp="edit" aria-label="编辑资料">'+cpSvg('edit')+'</button><h1><button class="cp-back-title" data-cp="back">主页</button></h1><div class="cp-rel-row"><span>RELATIONSHIP SETTING</span><b>FRIEND</b></div><nav class="cp-tabs"><button data-cp-tab="home" class="active">Homepage</button><button data-cp-tab="relationship">relationship</button></nav></header><main class="cp-content" id="cpContent"></main></div><input id="cpBookFile" type="file" accept=".txt,.md,.markdown,.json,.jsonl,.worldbook,.yaml,.yml,.docx,.zip,.png" multiple hidden><input id="cpWbEntryFile" type="file" accept=".txt,.md,.markdown,.json,.jsonl,.worldbook,.yaml,.yml,.docx,.zip,.png" multiple hidden><input id="cpPersonaFile" type="file" accept=".txt,.md,.markdown,.json,.jsonl,.yaml,.yml,.docx" hidden>';
 document.body.appendChild(el);
 el.addEventListener('click',cpClick);
}
function cpOpen(name){
 var p=findPersona(name); if(!p)return;
 charProfileName=name; charProfileTab='home'; cpEnsure();
 var v=document.getElementById('charProfileView'); v.classList.add('is-open');v.setAttribute('aria-hidden','false'); cpRender();
}
function cpOpenNew(){
 cpNewDraft={name:'',desc:'',avatar:null,gender:'unspecified',addMode:'direct',socialId:'',phone:'',wechatId:'',language:'zh-CN',splitPromptEnabled:true,disableSplitPromptForNonChinese:false,autoExpandTranslation:false,createdAt:Date.now()};
 charProfileName='';charProfileTab='home';cpAddMode='direct';cpAddVia='phone';cpEnsure();
 var v=document.getElementById('charProfileView');v.classList.add('is-open');v.setAttribute('aria-hidden','false');cpRender();cpEdit();
}
function cpClose(){var v=document.getElementById('charProfileView');if(v){v.classList.remove('is-open');v.setAttribute('aria-hidden','true');v.querySelectorAll('.cp-edit-sheet,.cp-book-settings').forEach(function(x){x.remove();});}cpNewDraft=null;cpBookDraft=null;cpWbDraft=null;}
function cpRender(){
 var p=cpPersona(), box=document.getElementById('cpContent'); if(!p||!box)return;
 document.querySelectorAll('.cp-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.cpTab===charProfileTab);});
 if(charProfileTab==='relationship'){box.innerHTML='<div class="cp-rel-card"><span class="cp-label">RELATIONSHIP</span><h2>FRIEND</h2><p>你与 '+cpEsc(p.profileName||p.name)+' 已成为好友。</p></div>';return;}
 var likes=Number(p.profileLikes)||0, books=cpBooks(p);
 box.innerHTML='<section class="cp-person" data-cp="edit"><div class="cp-avatar">'+(cpAvatarOf(p)?'<img src="'+cpEsc(cpAvatarOf(p))+'">':cpEsc((p.name||'C').slice(0,1)))+'</div><div class="cp-person-main"><h2>'+cpEsc(p.profileName||p.name)+'</h2><div class="cp-social">@'+cpEsc(p.socialId||p.name)+'</div><div class="cp-likes">'+cpSvg('heart')+' '+likes.toLocaleString()+' Likes</div></div><button class="cp-arrow" data-cp="edit">'+cpSvg('chev')+'</button></section>'+
 '<section class="cp-fields">'+cpField('WECHAT ID',p.wechatId||'—','wechatId')+cpField('PHONE NUMBER',p.phone||'—','phone')+cpField('BIRTHDAY',p.birthday||'—')+cpField('LOCATION',p.location||'—')+'</section>'+
 '<button class="cp-profile-edit" data-cp="edit">PERSONAL PROFILE '+cpSvg('chev')+'</button>'+
 '<section class="cp-card cp-social-card"><div class="cp-label">SOCIAL INTERACTION</div><div class="cp-like-row"><div><strong>'+likes.toLocaleString()+'</strong><span>TOTAL LIKES</span></div><button class="cp-like-btn '+(p.profileLiked?'on':'')+'" data-cp="like">'+cpSvg('heart')+' '+(p.profileLiked?'Liked':'Like')+'</button></div><div class="cp-likers"><button class="cp-likers-open" data-cp="likers">People who liked this Char</button><div class="cp-liker-dots">'+(p.profileLikers||[]).slice(0,3).map(function(x){return '<i>'+cpEsc(x.slice(0,1))+'</i>';}).join('')+'</div></div></section>'+
 '<section class="cp-card cp-book-card"><div class="cp-label">CHARACTER LIBRARY</div><h2>World Book</h2><p>Character\'s world, memories and settings.</p><button class="cp-import" data-cp="import">＋ Import Character World Book</button><div class="cp-book-summary">'+books.length+' 本世界书 · '+books.filter(function(b){return b.enabled!==false;}).length+' 本已启用</div><div class="cp-book-list">'+books.map(function(b,i){return '<div class="cp-book-row"><div class="cp-book-info"><b>'+cpEsc(b.name)+'</b><small>'+cpEsc(b.fileName||'本地导入')+' · '+(b.enabled===false?'已禁用':'已启用')+'</small><small>注入：'+cpBookPlacementLabel(b)+'</small></div><div class="cp-book-actions"><button class="cp-book-settings-trigger" data-cp="edit-book-content" data-id="'+cpEsc(b.id)+'"><span class="cp-book-trigger-icon">✎</span><span>编辑内容</span><span class="cp-book-trigger-arrow">›</span></button><button class="cp-book-settings-trigger" data-cp="config-book" data-id="'+cpEsc(b.id)+'"><span class="cp-book-trigger-icon">☷</span><span>管理设置</span><span class="cp-book-trigger-arrow">›</span></button></div></div>';}).join('')+'</div></section>'+
 '<section class="cp-card cp-moments" data-cp="moments"><div class="cp-label">SOCIAL SPACE</div><h2>Moments '+cpSvg('chev')+'</h2><p>Personal timeline &amp; memories.</p><div class="cp-empty">暂无朋友圈</div></section>';
}
function cpField(label,value,key){var privacy=key==='phone'||key==='wechatId';var raw=String(value||'—');var masked=privacy&&raw!=='—'?raw.replace(/.(?=.{4})/g,'•'):raw;return '<div><span>'+label+'</span><b '+(privacy?'data-cp-private="'+key+'" data-hidden="1"':'')+'>'+cpEsc(privacy?masked:raw)+'</b></div>'; }

function cpBookPlacementLabel(book){
 if(book.followPersona) return '跟随 Char 人设';
 var labels={worldbook_top:'最高优先级',worldbook_front:'人设之前',worldbook_middle:'对话中段',worldbook_low:'人设之后'};
 return labels[book.position||'worldbook_middle']||'对话中段';
}
function cpOpenBookSettings(book){
 cpBookDraft={id:book.id,followPersona:!!book.followPersona,position:book.position||'worldbook_middle',enabled:book.enabled!==false};
 var old=document.querySelector('.cp-book-settings');if(old)old.remove();
 var modal=document.createElement('div');modal.className='cp-book-settings';
 var choices=[
  {mode:'follow',title:'跟随 Char 人设',desc:'紧接在 Char 的人设内容后注入',icon:'↳'},
  {mode:'custom',title:'自定义注入位置',desc:'选择世界书在角色提示词中的位置',icon:'☷'}
 ];
 var positions=[
  {value:'worldbook_top',title:'最高优先级',desc:'优先注入，适合最重要的规则'},
  {value:'worldbook_front',title:'人设之前',desc:'放在角色人设内容之前'},
  {value:'worldbook_middle',title:'对话中段',desc:'放在提示词内容的中间位置'},
  {value:'worldbook_low',title:'人设之后',desc:'放在角色人设内容之后'}
 ];
 modal.innerHTML='<div class="cp-book-settings-backdrop" data-cp="close-book-settings"></div><section class="cp-book-settings-panel" role="dialog" aria-modal="true" aria-label="世界书注入设置"><div class="cp-modal-grip"></div><div class="cp-modal-head"><div><span class="cp-label">WORLD BOOK SETTINGS</span><h2>注入位置</h2><p>选择这本世界书加入角色设定的方式</p></div><button class="cp-modal-close" data-cp="close-book-settings" aria-label="关闭">×</button></div><div class="cp-mode-options">'+choices.map(function(c){return '<button class="cp-mode-option '+((c.mode==='follow'&&book.followPersona)||(c.mode==='custom'&&!book.followPersona)?'selected':'')+'" data-cp="set-book-mode" data-mode="'+c.mode+'"><span class="cp-option-icon">'+c.icon+'</span><span class="cp-option-copy"><b>'+c.title+'</b><small>'+c.desc+'</small></span><i class="cp-option-check"></i></button>';}).join('')+'</div><div class="cp-position-wrap" '+(book.followPersona?'hidden':'')+'><div class="cp-position-title">选择具体位置</div><div class="cp-position-options">'+positions.map(function(c){return '<button class="cp-position-option '+((book.position||'worldbook_middle')===c.value?'selected':'')+'" data-cp="set-book-position" data-position="'+c.value+'"><span><b>'+c.title+'</b><small>'+c.desc+'</small></span><i class="cp-option-check"></i></button>';}).join('')+'</div></div><div class="cp-book-manage"><div class="cp-manage-heading"><b>世界书管理</b><small>启用状态、排序与删除</small></div><div class="cp-enable-row"><span><b>启用这本世界书</b><small>关闭后将不会注入角色对话</small></span><button class="cp-enable-switch '+(book.enabled===false?'':'on')+'" data-cp="toggle-book-draft" type="button" role="switch" aria-checked="'+(book.enabled!==false)+'"><i></i></button></div><div class="cp-order-row"><span><b>调整排列顺序</b><small>优先级由上至下排列</small></span><div class="cp-order-buttons"><button data-cp="move-book-up" data-id="'+cpEsc(book.id)+'" '+(cpBooks(cpPersona()).findIndex(function(x){return x.id===book.id})===0?'disabled':'')+' aria-label="上移">↑</button><button data-cp="move-book-down" data-id="'+cpEsc(book.id)+'" '+(cpBooks(cpPersona()).findIndex(function(x){return x.id===book.id})===cpBooks(cpPersona()).length-1?'disabled':'')+' aria-label="下移">↓</button></div></div><button class="cp-delete-book" data-cp="delete-book-from-settings" data-id="'+cpEsc(book.id)+'"><span>删除这本世界书</span><small>删除后需要重新导入才能恢复</small></button></div><div class="cp-settings-note">设置仅作用于当前 Char，不会影响其他角色。</div><div class="cp-settings-actions"><button data-cp="close-book-settings">取消</button><button class="primary" data-cp="save-book-settings">保存设置</button></div></section>';
 document.getElementById('charProfileView').appendChild(modal);
}
function cpAddModeHtml(){
 var modes=[['send','发送好友申请'],['receive','TA发送好友申请'],['direct','直接添加']],vias=[['phone','手机号'],['wechat','微信号']];
 return '<div class="cp-edit-row"><span>添加方式</span></div><div class="cp-seg" data-seg="mode">'+modes.map(function(m){return '<button type="button" class="'+(cpAddMode===m[0]?'selected':'')+'" data-cp="set-add-mode" data-mode="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div><div class="cp-receive-box" '+(cpAddMode==='receive'?'':'hidden')+'><div class="cp-edit-row"><span>来源</span></div><div class="cp-seg" data-seg="via">'+vias.map(function(m){return '<button type="button" class="'+(cpAddVia===m[0]?'selected':'')+'" data-cp="set-add-via" data-via="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div><div class="cp-edit-row"><span>验证信息</span></div><textarea class="cp-edit-text cp-verify-text" data-cp-verify="1" maxlength="80" placeholder="不填就由主API生成"></textarea></div>';
}
function cpEdit(){
 var p=cpPersona();if(!p)return;
 var isNew=!charProfileName&&!!cpNewDraft;
 var vals=[['Char Name',isNew?'name':'profileName'],['Social ID','socialId'],['WeChat ID','wechatId'],['Phone Number','phone'],['Birthday','birthday'],['Location','location']];
 var old=document.querySelector('#charProfileView .cp-edit-sheet');if(old)old.remove();
 var form=document.createElement('div');form.className='cp-edit-sheet';
 form.innerHTML='<div class="cp-edit-panel"><div class="cp-label">PERSONAL INFORMATION</div><h2>'+(isNew?'Add Char':'Edit Profile')+'</h2>'+vals.map(function(x){return '<label>'+x[0]+'<input data-cp-field="'+x[1]+'"'+(x[1]==='name'?' maxlength="12"':'')+' value="'+cpEsc((x[1]==='profileName'?(p.profileName||p.name):p[x[1]])||'')+'"></label>';}).join('')+(isNew?cpAddModeHtml():'')+'<div class="cp-edit-row"><span>Char 人设内容</span><button class="cp-edit-import" type="button" data-cp="import-persona">导入文件</button></div><textarea class="cp-edit-text" data-cp-field="desc" placeholder="写下 TA 的人设">'+cpEsc(p.desc||'')+'</textarea><div class="cp-edit-actions"><button data-cp="cancel-edit">取消</button><button data-cp="save-edit">保存</button></div></div>';
 document.getElementById('charProfileView').appendChild(form);
}
function cpSaveEdit(sheet,p){
 if(!sheet)return;
 var isNew=!charProfileName&&!!cpNewDraft,vals={};
 sheet.querySelectorAll('[data-cp-field]').forEach(function(i){vals[i.dataset.cpField]=i.value.trim();});
 if(isNew){
  var nm=vals.name||'';
  if(!nm){if(typeof toast==='function')toast('先给 TA 起个名字');return;}
  if(typeof findPersona==='function'&&findPersona(nm)){if(typeof toast==='function')toast('已经有叫这个名字的角色了');return;}
  var ph=vals.phone||'',wx=vals.wechatId||'';
  if(typeof cleanPhoneText==='function')ph=cleanPhoneText(ph);
  if(typeof cleanWechatText==='function')wx=cleanWechatText(wx);
  if(typeof checkAccountFields==='function'&&!checkAccountFields(ph,wx))return;
  vals.phone=ph;vals.wechatId=wx;
  if(cpAddMode==='send'&&!ph&&!wx){islandAlert('选了「发送好友申请」，要先填 TA 的手机号或微信号，之后才能搜到 TA。',{title:'还不能创建'});return;}
  if(cpAddMode==='receive'){
   if(cpAddVia==='phone'&&!ph){islandAlert('来源选了「手机号」，请先填 TA 的手机号。',{title:'还不能创建'});return;}
   if(cpAddVia==='wechat'&&!wx){islandAlert('来源选了「微信号」，请先填 TA 的微信号。',{title:'还不能创建'});return;}
  }
 }
 Object.keys(vals).forEach(function(k){p[k]=vals[k];});
 if(isNew){
  var mode=cpAddMode,via=cpAddVia,vbox=sheet.querySelector('[data-cp-verify]'),typed=vbox?vbox.value.trim():'';
  p.addMode=mode;p.createdAt=p.createdAt||Date.now();
  var finish=function(text){
   personaVia=via;personaAddMode=mode;
   finishCreatePersona(p,mode,text);
   charProfileName=p.name;cpNewDraft=null;
   sheet.remove();cpRender();
  };
  if(mode!=='receive'||typed){finish(mode==='receive'?typed:'');return;}
  if(!isApiReady()){islandAlert('验证信息没填，主API又还没配置，没法自动生成。请手动填一句，或先到「设置」配置主API。',{title:'还不能创建'});return;}
  var saveBtn=sheet.querySelector('[data-cp="save-edit"]'),label=saveBtn?saveBtn.textContent:'保存';
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='正在生成验证信息…';}
  friendGenerateVerifyText(p,via).then(function(text){finish(text);}).catch(function(err){
   islandAlert('验证信息没有生成成功：'+(err&&err.message?err.message:'未知原因')+'\n\n可以再点一次，或者自己手动填写。',{title:'生成失败'});
   if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=label;}
  });
  return;
 }
 p.updatedAt=Date.now();
 cpSave(p);sheet.remove();cpRender();
}
function cpClick(e){
 var p=cpPersona();
 var privateField=e.target.closest('[data-cp-private]');
 if(privateField&&p){var key=privateField.dataset.cpPrivate,raw=String(p[key]||'—'),hidden=privateField.dataset.hidden==='1';privateField.textContent=hidden?raw:raw.replace(/.(?=.{4})/g,'•');privateField.dataset.hidden=hidden?'0':'1';return;}
 var b=e.target.closest('[data-cp],[data-cp-tab]');if(!b)return;
 if(b.dataset.cpTab){charProfileTab=b.dataset.cpTab;cpRender();return;}
 var act=b.dataset.cp,p=cpPersona();if(!p)return;
 if(act==='moments'){if(typeof toast==='function')toast('朋友圈功能暂未开放');return;}
 if(act==='back'){cpClose();var tab=document.querySelector('.chat-tab[data-tab="contacts"],[data-tab="contacts"].chat-tab');if(tab)tab.click();return;}
 if(act==='edit'){cpEdit();return;}
 if(act==='cancel-edit'){var s=b.closest('.cp-edit-sheet');if(s)s.remove();if(!charProfileName&&cpNewDraft)cpClose();return;}
 if(act==='set-add-mode'||act==='set-add-via'){
  var isMode=act==='set-add-mode';
  if(isMode)cpAddMode=b.dataset.mode;else cpAddVia=b.dataset.via;
  b.parentNode.querySelectorAll('button').forEach(function(x){x.classList.toggle('selected',x===b);});
  var rb=b.closest('.cp-edit-panel').querySelector('.cp-receive-box');if(rb)rb.hidden=cpAddMode!=='receive';
  return;
 }
 if(act==='import-persona'){var pf=document.getElementById('cpPersonaFile');if(pf)pf.click();return;}
 if(act==='wb-import'){var wf=document.getElementById('cpWbEntryFile');if(wf)wf.click();return;}
 if(act==='save-edit'){cpSaveEdit(b.closest('.cp-edit-sheet'),p);return;}
 if(act==='likers'){var liked=(p.profileLikers||[]);if(typeof islandAlert==='function')islandAlert(liked.length?liked.join('\n'):'暂无用户点赞',{title:'People who liked this Char'});else alert(liked.length?liked.join('\n'):'暂无用户点赞');return;}
 if(act==='like'){p.profileLiked=!p.profileLiked;p.profileLikes=Math.max(0,(Number(p.profileLikes)||0)+(p.profileLiked?1:-1));if(!Array.isArray(p.profileLikers))p.profileLikers=[];var up=getActiveUserPersona(),who=String(up&&(up.socialId||up.name)||'我');if(p.profileLiked){if(p.profileLikers.indexOf(who)<0)p.profileLikers.push(who);}else{p.profileLikers=p.profileLikers.filter(function(x){return x!==who;});}cpSave(p);cpRender();return;}
 if(act==='import'){document.getElementById('cpBookFile').click();return;}
 var books=cpBooks(p);
 if(act==='close-book-settings'){var modal=b.closest('.cp-book-settings');if(modal)modal.remove();cpBookDraft=null;return;}
 if(act==='set-book-mode'&&cpBookDraft){cpBookDraft.followPersona=b.dataset.mode==='follow';var panel=b.closest('.cp-book-settings-panel');panel.querySelectorAll('.cp-mode-option').forEach(function(x){x.classList.toggle('selected',x.dataset.mode===b.dataset.mode);});panel.querySelector('.cp-position-wrap').hidden=cpBookDraft.followPersona;return;}
 if(act==='set-book-position'&&cpBookDraft){cpBookDraft.position=b.dataset.position;var panel=b.closest('.cp-book-settings-panel');panel.querySelectorAll('.cp-position-option').forEach(function(x){x.classList.toggle('selected',x.dataset.position===b.dataset.position);});return;}
 if(act==='toggle-book-draft'&&cpBookDraft){cpBookDraft.enabled=!cpBookDraft.enabled;b.classList.toggle('on',cpBookDraft.enabled);b.setAttribute('aria-checked',String(cpBookDraft.enabled));return;}
 if((act==='move-book-up'||act==='move-book-down')&&cpBookDraft){var moveIdx=books.findIndex(function(x){return x.id===cpBookDraft.id;});var nextIdx=act==='move-book-up'?moveIdx-1:moveIdx+1;if(moveIdx>=0&&nextIdx>=0&&nextIdx<books.length){var draftTarget=books[moveIdx];draftTarget.followPersona=cpBookDraft.followPersona;draftTarget.position=cpBookDraft.position;draftTarget.enabled=cpBookDraft.enabled;var moved=books.splice(moveIdx,1)[0];books.splice(nextIdx,0,moved);cpSave(p);var keepId=cpBookDraft.id;var modal=b.closest('.cp-book-settings');if(modal)modal.remove();cpBookDraft=null;cpRender();var refreshed=cpBooks(p).find(function(x){return x.id===keepId;});if(refreshed)cpOpenBookSettings(refreshed);}return;}
 if(act==='delete-book-from-settings'){var deleteId=b.dataset.id;var deleteModal=b.closest('.cp-book-settings');var deleteIdx=books.findIndex(function(x){return x.id===deleteId;});if(deleteIdx>=0){books.splice(deleteIdx,1);cpSave(p);}if(deleteModal)deleteModal.remove();cpBookDraft=null;cpRender();return;}
 if(act==='save-book-settings'&&cpBookDraft){var target=books.find(function(x){return x.id===cpBookDraft.id;});if(target){target.followPersona=cpBookDraft.followPersona;target.position=cpBookDraft.position;target.enabled=cpBookDraft.enabled;cpSave(p);}var modal=b.closest('.cp-book-settings');if(modal)modal.remove();cpBookDraft=null;cpRender();return;}
 if(act==='wb-close'){cpWbClose();return;}
 if(act==='wb-add'){cpWbAdd();return;}
 if(act==='wb-del'){cpWbDel(Number(b.dataset.idx));return;}
 if(act==='wb-toggle'){cpWbToggle(Number(b.dataset.idx),b);return;}
 if(act==='wb-save'){cpWbSave();return;}
 var id=b.dataset.id,idx=books.findIndex(function(x){return x.id===id;});
 if(idx<0)return;
 if(act==='config-book'){cpOpenBookSettings(books[idx]);return;}
 if(act==='edit-book-content'){cpWbOpen(books[idx]);return;}
}
/* ---------- 世界书文件读取：自动识别编码，支持 txt / md / json / jsonl / docx / zip / png 角色卡 ---------- */
function cpDecodeBytes(buf){
 var u8=buf instanceof Uint8Array?buf:new Uint8Array(buf);
 if(u8.length>=3&&u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF)return new TextDecoder('utf-8').decode(u8.subarray(3));
 if(u8.length>=2&&u8[0]===0xFF&&u8[1]===0xFE)return new TextDecoder('utf-16le').decode(u8.subarray(2));
 if(u8.length>=2&&u8[0]===0xFE&&u8[1]===0xFF)return new TextDecoder('utf-16be').decode(u8.subarray(2));
 try{return new TextDecoder('utf-8',{fatal:true}).decode(u8);}catch(_){}
 var zeros=0,n=Math.min(u8.length,400);
 for(var i=1;i<n;i+=2)if(u8[i]===0)zeros++;
 if(n>=8&&zeros>n/4){try{return new TextDecoder('utf-16le').decode(u8);}catch(_){}}
 try{return new TextDecoder('gb18030').decode(u8);}catch(_){}
 return new TextDecoder('utf-8').decode(u8);
}
function cpLatin1(u8,s,e){var out='';for(var i=s;i<e;i++)out+=String.fromCharCode(u8[i]);return out;}
function cpPngCardText(u8){
 var sig=[137,80,78,71,13,10,26,10],i;
 for(i=0;i<8;i++)if(u8[i]!==sig[i])return '';
 var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),pos=8,found={};
 while(pos+8<=u8.length){
  var len=dv.getUint32(pos),type=cpLatin1(u8,pos+4,pos+8),start=pos+8,end=start+len;
  if(end>u8.length)break;
  if(type==='tEXt'){
   var z=start;while(z<end&&u8[z]!==0)z++;
   found[cpLatin1(u8,start,z).toLowerCase()]=cpLatin1(u8,z+1,end);
  }else if(type==='iTXt'){
   var k=start;while(k<end&&u8[k]!==0)k++;
   var flag=u8[k+1];
   if(flag===0){
    var q=k+3;while(q<end&&u8[q]!==0)q++;
    q++;while(q<end&&u8[q]!==0)q++;
    found[cpLatin1(u8,start,k).toLowerCase()]=cpLatin1(u8,q+1,end);
   }
  }
  if(type==='IEND')break;
  pos=end+4;
 }
 var raw=found.ccv3||found.chara;
 if(!raw)return '';
 var bin=atob(String(raw).replace(/\s+/g,'')),bytes=new Uint8Array(bin.length);
 for(i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return cpDecodeBytes(bytes);
}
function cpUnwrapCard(parsed){
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
  var d=parsed.data&&typeof parsed.data==='object'?parsed.data:null;
  var cb=(d&&d.character_book)||parsed.character_book;
  if(cb&&typeof cb==='object'&&cb.entries){
   var nm=cb.name||(d&&d.name?d.name+'的世界书':'')||parsed.name||'';
   return Object.assign({},cb,{name:nm});
  }
 }
 return parsed;
}
function cpNewEntryId(){return typeof genId==='function'?genId('wbe_'):'wbe_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);}
function cpBuildBook(text,fileName){
 var base=String(fileName||'导入世界书').replace(/\.[^.]+$/,'')||'导入世界书';
 var ext=String(fileName||'').toLowerCase().split('.').pop();
 var trimmed=String(text||'').replace(/^\uFEFF/,'').trim();
 if(!trimmed)return null;
 var parsed=null;
 if(ext==='jsonl'){
  var list=[];
  trimmed.split(/\r?\n/).forEach(function(line){line=line.trim();if(!line)return;try{list.push(JSON.parse(line));}catch(_){}});
  if(list.length)parsed=list;
 }else if(ext==='json'||/^[\[{]/.test(trimmed)){
  try{parsed=JSON.parse(trimmed);}catch(_){}
 }
 var entries=[],name=base;
 if(parsed!==null&&typeof parseWorldbookEntryImportData==='function'){
  parsed=cpUnwrapCard(parsed);
  entries=parseWorldbookEntryImportData(parsed,base);
  if(typeof getImportedWorldbookName==='function')name=getImportedWorldbookName(parsed,base);
 }else{
  entries=[{id:cpNewEntryId(),name:base,content:trimmed,enabled:true}];
 }
 entries=entries.filter(function(en){return en&&String(en.content||'').trim();}).map(function(en){if(!en.id)en.id=cpNewEntryId();return en;});
 return {name:name,entries:entries};
}
async function cpImportFile(file){
 var ext=String(file.name||'').toLowerCase().split('.').pop();
 var base=String(file.name||'').replace(/\.[^.]+$/,'');
 if(ext==='docx'){
  if(typeof extractDocxText!=='function')throw new Error('DOCX');
  return cpBuildBook(await extractDocxText(file),base+'.txt');
 }
 var u8=new Uint8Array(await file.arrayBuffer());
 if(ext==='png'){
  var cardText=cpPngCardText(u8);
  return cardText?cpBuildBook(cardText,base+'.json'):null;
 }
 if(ext==='zip'){
  if(!window.JSZip)throw new Error('ZIP');
  var zip=await window.JSZip.loadAsync(u8),all=[],names=Object.keys(zip.files||{}).sort();
  for(var i=0;i<names.length;i++){
   var item=zip.files[names[i]];
   if(!item||item.dir)continue;
   var clean=names[i].replace(/\\/g,'/'),leaf=clean.split('/').pop(),e2=leaf.toLowerCase().split('.').pop();
   if(['json','jsonl','txt','md','markdown','docx'].indexOf(e2)<0)continue;
   if(/^(package|manifest|metadata|meta|readme)([-_].*)?\.(json|txt|md|markdown)$/i.test(leaf))continue;
   try{
    var bytes=await item.async('uint8array'),sub;
    if(e2==='docx'){
     if(typeof extractDocxText!=='function')continue;
     sub=cpBuildBook(await extractDocxText(new Blob([bytes])),leaf.replace(/\.docx$/i,'.txt'));
    }else sub=cpBuildBook(cpDecodeBytes(bytes),leaf);
    if(sub)all=all.concat(sub.entries);
   }catch(_){}
  }
  return all.length?{name:base,entries:all}:null;
 }
 return cpBuildBook(cpDecodeBytes(u8),file.name);
}
document.addEventListener('change',async function(e){
 if(e.target.id!=='cpBookFile')return;
 var files=Array.from(e.target.files||[]),p=cpPersona();
 e.target.value='';
 if(!p)return;
 var added=0,failed=0;
 for(var i=0;i<files.length;i++){
  var file=files[i];
  try{
   if(file.size>32*1024*1024){failed++;continue;}
   var res=await cpImportFile(file);
   if(!res||!res.entries.length){failed++;continue;}
   cpBooks(p).push({id:'cpwb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),name:String(res.name||file.name).slice(0,40),fileName:file.name,enabled:true,followPersona:true,position:'worldbook_middle',priority:0,entries:res.entries,createdAt:Date.now()});
   added++;
  }catch(_){failed++;}
 }
 if(added){cpSave(p);cpRender();}
 if(typeof toast==='function')toast(added?('已导入 '+added+' 本世界书'+(failed?'，'+failed+' 个文件没读到内容':'')):'没有读到可导入的内容');
});

/* ---------- 角色自带世界书：内容编辑 ---------- */
var cpWbDraft=null;
function cpWbEntryHtml(en,i){
 return '<div class="cp-wb-entry" data-wb-idx="'+i+'"><div class="cp-wb-entry-top"><span class="cp-wb-entry-no">'+String(i+1).padStart(2,'0')+'</span><button class="cp-enable-switch '+(en.enabled===false?'':'on')+'" data-cp="wb-toggle" data-idx="'+i+'" type="button" role="switch" aria-checked="'+(en.enabled!==false)+'"><i></i></button><button class="cp-wb-del" data-cp="wb-del" data-idx="'+i+'" type="button">删除</button></div><input class="cp-wb-input" data-wb="name" value="'+cpEsc(en.name||'')+'" placeholder="条目名称"><textarea class="cp-wb-text" data-wb="content" placeholder="条目内容">'+cpEsc(en.content||'')+'</textarea></div>';
}
function cpWbRenderList(){
 var box=document.querySelector('.cp-wb-list');if(!box||!cpWbDraft)return;
 box.innerHTML=cpWbDraft.entries.length?cpWbDraft.entries.map(cpWbEntryHtml).join(''):'<div class="cp-wb-empty">还没有条目，点下面的按钮添加</div>';
}
function cpWbSync(){
 if(!cpWbDraft)return;
 var nameInput=document.querySelector('.cp-wb-editor [data-wb="bookName"]');
 if(nameInput)cpWbDraft.name=nameInput.value;
 document.querySelectorAll('.cp-wb-entry').forEach(function(row){
  var en=cpWbDraft.entries[Number(row.dataset.wbIdx)];if(!en)return;
  en.name=row.querySelector('[data-wb="name"]').value;
  en.content=row.querySelector('[data-wb="content"]').value;
 });
}
function cpWbOpen(book){
 if(!book)return;
 var old=document.querySelector('.cp-wb-editor');if(old)old.remove();
 cpWbDraft={id:book.id,name:book.name||'',entries:(Array.isArray(book.entries)?book.entries:[]).map(function(en){
  return Object.assign({},en,{id:en&&en.id?en.id:cpNewEntryId(),name:String(en&&en.name||''),content:String(en&&en.content||''),enabled:!(en&&en.enabled===false)});
 })};
 var modal=document.createElement('div');modal.className='cp-book-settings cp-wb-editor';
 modal.innerHTML='<div class="cp-book-settings-backdrop" data-cp="wb-close"></div><section class="cp-book-settings-panel cp-wb-panel" role="dialog" aria-modal="true" aria-label="编辑世界书"><div class="cp-modal-grip"></div><div class="cp-modal-head"><div><h2>编辑世界书</h2></div><button class="cp-modal-close" data-cp="wb-close" aria-label="关闭">×</button></div><div class="cp-wb-body"><input class="cp-wb-input cp-wb-bookname" data-wb="bookName" value="'+cpEsc(cpWbDraft.name)+'" placeholder="世界书名称"><div class="cp-wb-list"></div><div class="cp-wb-add-row"><button class="cp-wb-add" data-cp="wb-add" type="button">＋ 添加条目</button><button class="cp-wb-add" data-cp="wb-import" type="button">导入文件</button></div></div><div class="cp-settings-actions"><button data-cp="wb-close" type="button">取消</button><button class="primary" data-cp="wb-save" type="button">保存</button></div></section>';
 document.getElementById('charProfileView').appendChild(modal);
 cpWbRenderList();
}
function cpWbClose(){var m=document.querySelector('.cp-wb-editor');if(m)m.remove();cpWbDraft=null;}
function cpWbAdd(){
 if(!cpWbDraft)return;cpWbSync();
 cpWbDraft.entries.push({id:cpNewEntryId(),name:'',content:'',enabled:true});
 cpWbRenderList();
 var rows=document.querySelectorAll('.cp-wb-entry'),last=rows[rows.length-1];
 if(last){last.scrollIntoView({block:'nearest'});var inp=last.querySelector('[data-wb="name"]');if(inp)inp.focus();}
}
function cpWbDel(i){
 if(!cpWbDraft||!(i>=0))return;cpWbSync();
 cpWbDraft.entries.splice(i,1);cpWbRenderList();
}
function cpWbToggle(i,btn){
 if(!cpWbDraft||!cpWbDraft.entries[i])return;
 var en=cpWbDraft.entries[i];en.enabled=en.enabled===false;
 btn.classList.toggle('on',en.enabled!==false);btn.setAttribute('aria-checked',String(en.enabled!==false));
}
function cpWbSave(){
 var p=cpPersona();if(!p||!cpWbDraft)return;
 cpWbSync();
 var book=cpBooks(p).find(function(x){return x.id===cpWbDraft.id;});
 if(!book){cpWbClose();return;}
 var keep=cpWbDraft.entries.filter(function(en){return String(en.name||'').trim()||String(en.content||'').trim();}).map(function(en){
  en.name=String(en.name||'').trim();en.content=String(en.content||'').trim();return en;
 });
 book.name=String(cpWbDraft.name||'').trim().slice(0,40)||book.name||'未命名世界书';
 book.entries=keep;
 cpSave(p);cpWbClose();cpRender();
 if(typeof toast==='function')toast('已保存');
}

/* ---------- 世界书编辑弹窗：导入文件变成条目 ---------- */
document.addEventListener('change',async function(e){
 if(e.target.id!=='cpWbEntryFile')return;
 var files=Array.from(e.target.files||[]);
 e.target.value='';
 if(!files.length||!cpWbDraft)return;
 var got=[],failed=0;
 for(var i=0;i<files.length;i++){
  var file=files[i];
  try{
   if(file.size>32*1024*1024){failed++;continue;}
   var res=await cpImportFile(file);
   if(!res||!res.entries.length){failed++;continue;}
   got=got.concat(res.entries);
  }catch(_){failed++;}
 }
 if(!cpWbDraft)return;
 if(got.length){
  cpWbSync();
  got.forEach(function(en){cpWbDraft.entries.push(Object.assign({},en,{id:en&&en.id?en.id:cpNewEntryId(),name:String(en&&en.name||''),content:String(en&&en.content||''),enabled:!(en&&en.enabled===false)}));});
  cpWbRenderList();
  var list=document.querySelector('.cp-wb-list');if(list)list.scrollTop=list.scrollHeight;
  var rows=document.querySelectorAll('.cp-wb-entry'),last=rows[rows.length-1];if(last)last.scrollIntoView({block:'nearest'});
 }
 if(typeof toast==='function')toast(got.length?('已导入 '+got.length+' 个条目'+(failed?'，'+failed+' 个文件没读到内容':'')):'没有读到可导入的内容');
});

/* ---------- Char 人设内容：导入文件 ---------- */
document.addEventListener('change',async function(e){
 if(e.target.id!=='cpPersonaFile')return;
 var file=e.target.files&&e.target.files[0];
 e.target.value='';
 if(!file)return;
 if(file.size>512*1024){if(typeof toast==='function')toast('文件过大，请小于 512KB');return;}
 var box=document.querySelector('#charProfileView .cp-edit-sheet [data-cp-field="desc"]');
 if(!box)return;
 try{
  var ext=String(file.name||'').toLowerCase().split('.').pop(),text='';
  if(ext==='docx'){
   if(typeof extractDocxText!=='function')throw new Error('DOCX');
   text=await extractDocxText(file);
  }else text=cpDecodeBytes(new Uint8Array(await file.arrayBuffer()));
  text=String(text||'').replace(/^\uFEFF/,'').trim();
  if(!text){if(typeof toast==='function')toast('文件内容为空');return;}
  box.value=text;
  var nameBox=document.querySelector('#charProfileView .cp-edit-sheet [data-cp-field="name"]');
  if(nameBox&&!nameBox.value.trim()){
   var first=text.split('\n')[0].replace(/^#+\s*/,'').trim();
   if(first&&first.length<=12)nameBox.value=first;
  }
  if(typeof toast==='function')toast('已导入 '+file.name);
 }catch(_){if(typeof toast==='function')toast('文件读取失败');}
});
