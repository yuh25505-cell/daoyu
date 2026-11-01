/* Char personal homepage + per-character worldbook attachments */
'use strict';
var charProfileName = '';
var charProfileTab = 'home';
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
 '<section class="cp-card cp-book-card"><div class="cp-label">CHARACTER LIBRARY</div><h2>World Book</h2><p>Character\'s world, memories and settings.</p><button class="cp-import" data-cp="import">＋ Import Character World Book</button><div class="cp-book-summary">'+books.length+' 本世界书 · '+books.filter(function(b){return b.enabled!==false;}).length+' 本已启用</div><div class="cp-book-list">'+books.map(function(b,i){return '<div class="cp-book-row"><div class="cp-book-info"><b>'+cpEsc(b.name)+'</b><small>'+cpEsc(b.fileName||'本地导入')+' · '+(b.enabled===false?'已禁用':'已启用')+'</small><small>注入：'+(b.followPersona?'Char 人设后':'自定义优先级')+' · '+(b.position||'worldbook_middle')+'</small></div><div class="cp-book-actions"><button data-cp="toggle-book" data-id="'+cpEsc(b.id)+'">'+(b.enabled===false?'启用':'停用')+'</button><button data-cp="up-book" data-id="'+cpEsc(b.id)+'" '+(i===0?'disabled':'')+'>↑</button><button data-cp="down-book" data-id="'+cpEsc(b.id)+'" '+(i===books.length-1?'disabled':'')+'>↓</button><button data-cp="config-book" data-id="'+cpEsc(b.id)+'">设置</button><button data-cp="delete-book" data-id="'+cpEsc(b.id)+'">删除</button></div></div>';}).join('')+'</div></section>'+
 '<section class="cp-card cp-moments" data-cp="moments"><div class="cp-label">SOCIAL SPACE</div><h2>Moments '+cpSvg('chev')+'</h2><p>Personal timeline &amp; memories.</p><div class="cp-empty">暂无朋友圈</div></section>';
}
function cpField(label,value,key){var privacy=key==='phone'||key==='wechatId';var raw=String(value||'—');var masked=privacy&&raw!=='—'?raw.replace(/.(?=.{4})/g,'•'):raw;return '<div><span>'+label+'</span><b '+(privacy?'data-cp-private="'+key+'" data-hidden="1"':'')+'>'+cpEsc(privacy?masked:raw)+'</b></div>'; }
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
 var id=b.dataset.id,books=cpBooks(p),idx=books.findIndex(function(x){return x.id===id;});
 if(idx<0)return;
 if(act==='toggle-book'){books[idx].enabled=books[idx].enabled===false;cpSave(p);cpRender();}
 if(act==='delete-book'){books.splice(idx,1);cpSave(p);cpRender();}
 if(act==='up-book'&&idx>0){var x=books.splice(idx,1)[0];books.splice(idx-1,0,x);cpSave(p);cpRender();}
 if(act==='down-book'&&idx<books.length-1){var y=books.splice(idx,1)[0];books.splice(idx+1,0,y);cpSave(p);cpRender();}
 if(act==='config-book'){var bk=books[idx],mode=prompt('输入注入模式：follow（紧跟 Char 人设）或 custom（自定义位置）',bk.followPersona?'follow':'custom');if(mode===null)return;bk.followPersona=mode.toLowerCase()==='follow';if(!bk.followPersona){var pos=prompt('输入注入位置：worldbook_top / worldbook_front / worldbook_middle / worldbook_low',bk.position||'worldbook_middle');if(pos)bk.position=pos;}cpSave(p);cpRender();}
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
