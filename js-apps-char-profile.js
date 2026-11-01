/* Char personal homepage + per-character worldbook attachments */
'use strict';
var charProfileName = '';
var charProfileTab = 'home';
var cpBookDraft = null;
function cpEsc(v){ return typeof escapeHTML === 'function' ? escapeHTML(String(v == null ? '' : v)) : String(v || '').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function cpPersona(){ return charProfileName && typeof findPersona === 'function' ? findPersona(charProfileName) : null; }
function cpSave(p){ if (typeof savePersonas === 'function') savePersonas(); }
function cpBooks(p){ if (!Array.isArray(p.profileWorldbooks)) p.profileWorldbooks=[]; return p.profileWorldbooks; }
function cpSvg(name){ return name==='edit' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>' : name==='heart' ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'; }
function cpEnsure(){
 if(document.getElementById('charProfileView')) return;
 var el=document.createElement('section'); el.id='charProfileView'; el.className='char-profile-view'; el.setAttribute('aria-hidden','true');
 el.innerHTML='<div class="cp-shell"><header class="cp-top"><div class="cp-eyebrow">PERSONAL INFORMATION</div><button class="cp-edit-icon" data-cp="edit" aria-label="编辑资料">'+cpSvg('edit')+'</button><h1><button class="cp-back-title" data-cp="back">主页</button></h1><div class="cp-rel-row"><span>RELATIONSHIP SETTING</span><b>FRIEND</b></div><nav class="cp-tabs"><button data-cp-tab="home" class="active">Homepage</button><button data-cp-tab="relationship">relationship</button></nav></header><main class="cp-content" id="cpContent"></main></div><input id="cpBookFile" type="file" accept=".txt,.md,.json,.worldbook,.yaml,.yml" multiple hidden>';
 document.body.appendChild(el);
 el.addEventListener('click',cpClick);
}
function cpOpen(name){
 var p=findPersona(name); if(!p)return;
 charProfileName=name; charProfileTab='home'; cpEnsure();
 var v=document.getElementById('charProfileView'); v.classList.add('is-open');v.setAttribute('aria-hidden','false'); cpRender();
}
function cpClose(){var v=document.getElementById('charProfileView');if(v){v.classList.remove('is-open');v.setAttribute('aria-hidden','true');}}
function cpRender(){
 var p=cpPersona(), box=document.getElementById('cpContent'); if(!p||!box)return;
 document.querySelectorAll('.cp-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.cpTab===charProfileTab);});
 if(charProfileTab==='relationship'){box.innerHTML='<div class="cp-rel-card"><span class="cp-label">RELATIONSHIP</span><h2>FRIEND</h2><p>你与 '+cpEsc(p.profileName||p.name)+' 已成为好友。</p></div>';return;}
 var likes=Number(p.profileLikes)||0, books=cpBooks(p);
 box.innerHTML='<section class="cp-person" data-cp="edit"><div class="cp-avatar">'+(((typeof getSessionCharAvatar==='function'&&getSessionCharAvatar(charProfileName))||p.avatar)?'<img src="'+cpEsc((typeof getSessionCharAvatar==='function'&&getSessionCharAvatar(charProfileName))||p.avatar)+'">':cpEsc((p.name||'C').slice(0,1)))+'</div><div class="cp-person-main"><h2>'+cpEsc(p.profileName||p.name)+'</h2><div class="cp-social">@'+cpEsc(p.socialId||p.name)+'</div><div class="cp-likes">'+cpSvg('heart')+' '+likes.toLocaleString()+' Likes</div></div><button class="cp-arrow" data-cp="edit">'+cpSvg('chev')+'</button></section>'+
 '<section class="cp-fields">'+cpField('WECHAT ID',p.wechatId||'—','wechatId')+cpField('PHONE NUMBER',p.phone||'—','phone')+cpField('BIRTHDAY',p.birthday||'—')+cpField('LOCATION',p.location||'—')+'</section>'+
 '<button class="cp-profile-edit" data-cp="edit">PERSONAL PROFILE '+cpSvg('chev')+'</button>'+
 '<section class="cp-card cp-social-card"><div class="cp-label">SOCIAL INTERACTION</div><div class="cp-like-row"><div><strong>'+likes.toLocaleString()+'</strong><span>TOTAL LIKES</span></div><button class="cp-like-btn '+(p.profileLiked?'on':'')+'" data-cp="like">'+cpSvg('heart')+' '+(p.profileLiked?'Liked':'Like')+'</button></div><div class="cp-likers"><button class="cp-likers-open" data-cp="likers">People who liked this Char</button><div class="cp-liker-dots">'+(p.profileLikers||[]).slice(0,3).map(function(x){return '<i>'+cpEsc(x.slice(0,1))+'</i>';}).join('')+'</div></div></section>'+
 '<section class="cp-card cp-book-card"><div class="cp-label">CHARACTER LIBRARY</div><h2>World Book</h2><p>Character\'s world, memories and settings.</p><button class="cp-import" data-cp="import">＋ Import Character World Book</button><div class="cp-book-summary">'+books.length+' 本世界书 · '+books.filter(function(b){return b.enabled!==false;}).length+' 本已启用</div><div class="cp-book-list">'+books.map(function(b,i){return '<div class="cp-book-row"><div class="cp-book-info"><b>'+cpEsc(b.name)+'</b><small>'+cpEsc(b.fileName||'本地导入')+' · '+(b.enabled===false?'已禁用':'已启用')+'</small><small>注入：'+cpBookPlacementLabel(b)+'</small></div><div class="cp-book-actions"><button class="cp-book-settings-trigger" data-cp="config-book" data-id="'+cpEsc(b.id)+'"><span class="cp-book-trigger-icon">☷</span><span>管理设置</span><span class="cp-book-trigger-arrow">›</span></button></div></div>';}).join('')+'</div></section>'+
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
function cpEdit(){
 var p=cpPersona();if(!p)return;
 var vals=[['Char Name','profileName'],['Social ID','socialId'],['WeChat ID','wechatId'],['Phone Number','phone'],['Birthday','birthday'],['Location','location']];
 var form=document.createElement('div');form.className='cp-edit-sheet';
 form.innerHTML='<div class="cp-edit-panel"><div class="cp-label">PERSONAL INFORMATION</div><h2>Edit Profile</h2>'+vals.map(function(x){return '<label>'+x[0]+'<input data-cp-field="'+x[1]+'" value="'+cpEsc((x[1]==='profileName'?(p.profileName||p.name):p[x[1]])||'')+'"></label>';}).join('')+'<div class="cp-edit-actions"><button data-cp="cancel-edit">取消</button><button data-cp="save-edit">保存</button></div></div>';
 document.getElementById('charProfileView').appendChild(form);
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
 if(act==='cancel-edit'){var s=b.closest('.cp-edit-sheet');if(s)s.remove();return;}
 if(act==='save-edit'){var sheet=b.closest('.cp-edit-sheet');sheet.querySelectorAll('[data-cp-field]').forEach(function(i){p[i.dataset.cpField]=i.value.trim();});cpSave(p);sheet.remove();cpRender();return;}
 if(act==='likers'){var liked=(p.profileLikers||[]);if(typeof islandAlert==='function')islandAlert(liked.length?liked.join('\\n'):'暂无用户点赞',{title:'People who liked this Char'});else alert(liked.length?liked.join('\\n'):'暂无用户点赞');return;}
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
 var id=b.dataset.id,idx=books.findIndex(function(x){return x.id===id;});
 if(idx<0)return;
 if(act==='config-book'){cpOpenBookSettings(books[idx]);return;}
}
document.addEventListener('change',function(e){
 if(e.target.id!=='cpBookFile')return;var files=Array.from(e.target.files||[]),p=cpPersona();if(!p)return;
 files.forEach(function(file){var reader=new FileReader();reader.onload=function(){var raw=String(reader.result||''),parsed=null;try{parsed=JSON.parse(raw);}catch(_){}var entries=[];
 if(parsed && typeof parseWorldbookEntryImportData==='function') entries=parseWorldbookEntryImportData(parsed,file.name.replace(/\.[^.]+$/,''));
 else if(parsed&&Array.isArray(parsed.entries))entries=parsed.entries;
 else if(parsed&&Array.isArray(parsed.data))entries=parsed.data;
 else entries=[{name:file.name.replace(/\.[^.]+$/,''),content:raw,enabled:true}];
 cpBooks(p).push({id:'cpwb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),name:(parsed&&typeof getImportedWorldbookName==='function'?getImportedWorldbookName(parsed,file.name.replace(/\.[^.]+$/,'')):parsed&&(parsed.name||parsed.title))||file.name.replace(/\.[^.]+$/,''),fileName:file.name,enabled:true,followPersona:true,position:'worldbook_middle',priority:0,entries:entries,createdAt:Date.now()});cpSave(p);cpRender();};reader.readAsText(file);});
 e.target.value='';
});
