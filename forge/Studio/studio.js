(() => {
  'use strict';
  const $=id=>document.getElementById(id),i18n=window.GamePlayForgeI18n,Y=window.GamePlayForgeY;
  const forgeBase=(location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1])||'';
  const forgePath=route=>typeof route==='string'&&route.startsWith('/')&&forgeBase&&!route.startsWith(forgeBase+'/')?forgeBase+route:route;
  let csrfToken=null;
  async function ensureCsrf(){if(csrfToken!==null)return csrfToken;const r=await fetch(forgePath('/api/session'),{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'HTTP '+r.status);csrfToken=typeof d.csrfToken==='string'?d.csrfToken:'';return csrfToken;}
  const sessionId=(()=>{try{let id=sessionStorage.getItem('gameplayforge.session');if(!id){id=crypto.randomUUID();sessionStorage.setItem('gameplayforge.session',id)}return id}catch{return crypto.randomUUID()}})();
  const localOrigin={name:'local'},remoteOrigin={name:'remote'};
  const state={revision:null,settingsRevision:null,project:null,schema:null,source:'',settings:{},originalSettings:'',settingsDirty:false,ws:null,users:[],locks:{},lockToken:null,lockTimer:0,lockRequested:false,doc:null,text:null,undo:null,pendingText:new Map(),presenterUrl:null,presenterReady:Promise.resolve(),runtime:false,runtimeName:null,runtimeSessionId:null,runtimeState:null,runGeneration:0,runtimeLoading:false,loopTimer:0,stepBusy:false,stepPromise:null,tab:'scene',focus:'scene',focusField:'',selectedAsset:null,cursorTimer:0,lastPointerEvent:null,sound:true,assetReturn:null,remotePending:null,settingsPending:null};
  const settingsOwner=()=>state.locks.settings?.owner||null;
  const ownsSettings=()=>settingsOwner()===sessionId&&!!state.lockToken;
  const valuesFrom=s=>s?.values&&typeof s.values==='object'?s.values:s||{};
  const displayName=()=>$('displayName').value.trim()||'Guest';
  try{$('displayName').value=localStorage.getItem('gameplayforge.name')||''}catch{}

  function t(key){return i18n.t(key)}
  function updateLabels(){ $('displayName').placeholder=t('namePlaceholder');$('soundButton').textContent=t(state.sound?'soundOn':'soundOff');updateDirty();renderSettingsLock(); }
  function encode64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
  function decode64(text){const binary=atob(text),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
  function uuid(){return crypto.randomUUID?.()||'req-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
  function snapshotFrom(data){const doc=data?.document&&typeof data.document==='object'?data.document:data;return{revision:doc?.revision,settingsRevision:doc?.settingsRevision,project:doc?.project||state.project||{},source:String(doc?.source??state.source??''),textState:doc?.textState,settings:doc?.settings??state.settings,schema:doc?.settingsSchema??doc?.project?.settingsSchema??state.schema};}
  function ensureDoc(textState,source=''){
    if(!Y){log('error','Yjs bundle unavailable');return}
    if(!state.doc){state.doc=new Y.Doc();state.text=state.doc.getText('script');}
    if(textState){try{Y.applyUpdate(state.doc,decode64(textState),remoteOrigin)}catch(error){log('error','Invalid shared source state: '+error.message)}}
    else if(!state.text.length&&source)state.doc.transact(()=>state.text.insert(0,source),remoteOrigin);
    if(!state.undo)state.undo=new Y.UndoManager(state.text,{trackedOrigins:new Set([localOrigin]),captureTimeout:500});
    if(!state.observersInstalled){
      state.observersInstalled=true;
      state.text.observe(()=>{const latest=state.text.toString();state.source=latest;if($('sourceEditor').value!==latest){const start=$('sourceEditor').selectionStart; $('sourceEditor').value=latest;try{$('sourceEditor').setSelectionRange(Math.min(start,latest.length),Math.min(start,latest.length))}catch{}}renderLineNumbers();updateDirty();});
      state.doc.on('update',(update,origin)=>{if(origin===localOrigin)sendTextUpdate(update);});
    }
    state.source=state.text.toString();$('sourceEditor').value=state.source;renderLineNumbers();updateDirty();
  }
  function setPresenter(url){
    const resolved=forgePath(url);
    if(!resolved||resolved===state.presenterUrl)return state.presenterReady;
    state.presenterUrl=resolved;state.presenterReady=new Promise(resolve=>{
      const old=document.querySelector('script[data-project-presenter]');old?.remove();
      const script=document.createElement('script');script.src=resolved;script.dataset.projectPresenter='true';
      script.onload=()=>resolve(true);script.onerror=()=>{log('error',t('presenterFailed'));resolve(false)};
      document.head.append(script);
    });
    return state.presenterReady;
  }
  function applySnapshot(raw,{force=false}={}){
    const snap=snapshotFrom(raw);
    if(state.settingsDirty&&!force){state.settingsPending=raw;$('conflictDialog').showModal();return false}
    state.revision=snap.revision;state.settingsRevision=snap.settingsRevision;state.project=snap.project;state.schema=snap.schema;
    state.settings={...valuesFrom(snap.settings)};state.originalSettings=JSON.stringify(state.settings);state.settingsDirty=false;
    ensureDoc(snap.textState,snap.source);setPresenter(snap.project?.presenter);renderSettings();renderAssets();renderScene();updateRevision();updateProjectName();updateDirty();return true;
  }
  function updateProjectName(){const name=state.project?.name||'Project';document.querySelector('.project-title').textContent=name;$('projectTreeName').textContent=name;document.title='PlayForge Studio · '+name;const scene=getScene();const sceneName=scene?.name||state.project?.mainSceneName||'Scene';$('sceneName').textContent=sceneName;$('sceneSize').textContent=scene?.viewport?((scene.viewport.width||0)+' × '+(scene.viewport.height||0)):'';const sourcePath=state.project?.sourcePath||state.project?.scripts?.[0]||'Script';$('sourceFileName').textContent=String(sourcePath).split(/[\\/]/).pop();$('scriptTitle').textContent=$('sourceFileName').textContent;}
  function updateRevision(){$('revisionLabel').textContent='r'+(state.revision??'—');}
  function updateDirty(){
    const sourcePending=state.pendingText.size>0;
    const dirty=state.settingsDirty||sourcePending;
    $('dirtyDot').hidden=!dirty;$('sourceStatus').textContent=sourcePending?t('syncingSource'):t('sourceSynced');
    $('saveState').textContent=state.settingsDirty?t('dirty'):sourcePending?t('syncingSource'):t('saved');
    $('saveSource').disabled=state.settingsDirty&&!ownsSettings();
  }
  function renderLineNumbers(){const value=$('sourceEditor').value,n=Math.max(1,value.split('\n').length);$('lineNumbers').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');}
  function renderSettings(){
    const host=$('settingsFields'),schema=state.schema;
    if(!schema||!Array.isArray(schema.fields)){host.replaceChildren();return}
    const nodes=[];
    for(const field of schema.fields){
      const row=document.createElement('label');row.className='setting-row';row.dataset.settingRow=field.key;
      const caption=document.createElement('span');caption.textContent=t(field.labelKey||field.key);row.append(caption);
      let control;
      if(field.type==='select'){
        control=document.createElement('select');control.className='difficulty-select';
        for(const item of field.options||[]){const option=document.createElement('option');option.value=item.value;option.textContent=t(item.labelKey||item.value);control.append(option)}
        control.value=state.settings[field.key]??field.options?.[0]?.value??'';
      }else{
        const wrap=document.createElement('span');wrap.className='number-field';control=document.createElement('input');control.type='number';control.min=field.min??'';control.max=field.max??'';control.step=field.step??'any';control.value=state.settings[field.key]??'';wrap.append(control);
        if(field.unit){const unit=document.createElement('small');unit.textContent=field.unit;wrap.append(unit)}
        row.append(wrap);
      }
      control.id=field.key;control.dataset.settingKey=field.key;control.disabled=!!field.readonly||!ownsSettings();control.setAttribute('aria-label',t(field.labelKey||field.key));
      if(field.type==='select')row.append(control);
      nodes.push(row);
    }
    host.replaceChildren(...nodes);
    host.querySelectorAll('[data-setting-key]').forEach(control=>{
      control.addEventListener('focus',acquireLock);
      control.addEventListener('pointerdown',acquireLock);
      control.addEventListener('input',()=>changeSetting(control));
      control.addEventListener('change',()=>changeSetting(control));
    });
  }
  function renderSettingsLock(){
    const owner=settingsOwner(),status=$('settingsLockState');
    status.removeAttribute('data-i18n');
    status.classList.toggle('owned',ownsSettings());status.classList.toggle('locked',!!owner&&!ownsSettings());
    status.textContent=ownsSettings()?t('lockOwned'):owner?t('lockBy').replace('{name}',state.users.find(user=>user.clientId===owner)?.name||'Guest'):t('settingsLocked');
    $('settingsFields').querySelectorAll('[data-setting-key]').forEach(control=>{
      const schema=state.schema?.fields?.find(field=>field.key===control.dataset.settingKey);
      control.disabled=!!schema?.readonly||!ownsSettings();
    });
    $('acquireSettingsLock').disabled=ownsSettings()||!!owner;
    $('releaseSettingsLock').disabled=!ownsSettings()||state.settingsDirty;
  }
  function renderAssets(){
    const assets=Array.isArray(state.project?.assets)?state.project.assets:[],grid=$('assetGrid');
    const buttons=assets.map((asset,index)=>{
      const path=asset.path||'',key=asset.id||path||String(index),button=document.createElement('button');button.className='asset-thumb';button.type='button';button.dataset.assetKey=key;button.dataset.assetIndex=String(index);
      const img=document.createElement('img');img.src=forgePath(path);img.alt=asset.alt||asset.name||path.split('/').pop()||'Asset';
      const label=document.createElement('span');label.textContent=asset.localizedName?.[i18n.locale]||asset.name||path.split('/').pop()||'Asset';button.append(img,label);return button;
    });
    grid.replaceChildren(...buttons);for(const button of grid.querySelectorAll('.asset-thumb'))button.classList.toggle('selected',button.dataset.assetKey===state.selectedAsset);
  }
  function getScene(){return state.project?.scene||state.project?.mainScene||state.project?.sceneData||null}
  function renderScene(){
    const frame=$('sceneFrame'),scene=getScene();frame.replaceChildren();if(!scene){frame.textContent=t('sceneUnavailable');return}
    const width=Number(scene.viewport?.width)||480,height=Number(scene.viewport?.height)||640;frame.style.aspectRatio=`${width}/${height}`;$('sceneSize').textContent=`${width} × ${height}`;$('sceneName').textContent=scene.name||'Scene';
    const actors=Array.isArray(scene.actors)?scene.actors:[];
    for(const actor of actors){
      const position=actor.position||[0,0,0],sprite=actor.sprite||actor.asset||actor.assetPath||actor.components?.find?.(item=>typeof item==='object'&&item.type==='Sprite')?.path;
      let asset=sprite?state.project?.assets?.find(item=>item.id===sprite||item.path===sprite||item.name===sprite):null;
      if(!asset){const key=String(actor.id||'').toLowerCase();asset=state.project?.assets?.find(item=>{const name=String(item.name||'').toLowerCase(),id=String(item.id||'').split('.').pop().toLowerCase(),file=String(item.path||'').split('/').pop().replace(/\.[^.]+$/,'').toLowerCase();return !!key&&(key===name||key===id||key===file)})}
      const element=document.createElement('div');element.className='scene-actor';element.style.left=(Math.max(0,Math.min(width,Number(position[0])||0))/width*100)+'%';element.style.top=(Math.max(0,Math.min(height,Number(position[1])||0))/height*100)+'%';
      if(asset?.path){const image=document.createElement('img');image.src=forgePath(asset.path);image.alt=asset.alt||asset.name||actor.id||'Scene asset';image.title=actor.id||asset.name||'';element.append(image)}
      else{element.textContent=actor.name||actor.id||'Actor';element.setAttribute('aria-label',element.textContent)}
      frame.append(element);
    }
    const label=document.createElement('span');label.className='scene-label';label.textContent=(scene.name||'Scene')+' · '+(scene.type||'2D');frame.append(label);
  }
  async function loadProject({force=false}={}){
    $('saveState').textContent=t('loading');
    try{await ensureCsrf();const response=await fetch(forgePath('/api/project'),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();applySnapshot(data,{force});connect();log('success',t('saved'))}
    catch(error){$('saveState').textContent=t('loadFailed');log('error',t('loadFailed')+' '+error.message)}
  }
  function sendTextUpdate(update,requestId=uuid()){
    state.pendingText.set(requestId,Date.now());updateDirty();
    const ws=state.ws;
    if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'text-update',update:encode64(update),requestId}));
  }
  function sendFullText(){
    if(!state.doc||state.ws?.readyState!==WebSocket.OPEN)return;
    const requestId=uuid();sendTextUpdate(Y.encodeStateAsUpdate(state.doc),requestId);
  }
  function editSource(value){
    if(!state.text||!state.doc){$('scriptNotice').textContent=t('sourceUnavailable');return}
    const old=state.text.toString();if(old===value)return;
    let start=0;while(start<old.length&&start<value.length&&old[start]===value[start])start++;
    let oldEnd=old.length,newEnd=value.length;while(oldEnd>start&&newEnd>start&&old[oldEnd-1]===value[newEnd-1]){oldEnd--;newEnd--;}
    state.doc.transact(()=>{if(oldEnd>start)state.text.delete(start,oldEnd-start);if(newEnd>start)state.text.insert(start,value.slice(start,newEnd));},localOrigin);
  }
  function connect(){
    if(state.ws&&(state.ws.readyState===WebSocket.OPEN||state.ws.readyState===WebSocket.CONNECTING))return;
    const scheme=location.protocol==='https:'?'wss:':'ws:';let socket;
    try{socket=new WebSocket(`${scheme}//${location.host}${forgePath('/collaboration')}`)}catch{log('warning',t('disconnected'));return}
    state.ws=socket;
    socket.addEventListener('open',()=>{socket.send(JSON.stringify({type:'join',clientId:sessionId,name:displayName()}));$('saveState').textContent=t('connected')});
    socket.addEventListener('message',event=>{try{handleMessage(JSON.parse(event.data))}catch(error){log('error',t('collaborationError')+' '+error.message)}});
    socket.addEventListener('close',()=>{$('saveState').textContent=t('disconnected');releaseLock(false);window.setTimeout(connect,1600)});
    socket.addEventListener('error',()=>{$('saveState').textContent=t('disconnected')});
  }
  function handleMessage(message){
    if(message.type==='welcome'){
      const doc=message.document||{};
      if(doc.textState)ensureDoc(doc.textState,doc.source);
      if(doc.settings!==undefined){const local=state.settingsDirty;if(!local)applySnapshot(doc);else{state.revision=doc.revision;state.settingsRevision=doc.settingsRevision;state.remotePending=doc;$('conflictDialog').showModal();}}
      state.users=message.users||[];state.locks=message.locks||(message.lock?{settings:message.lock}:{});state.pendingText.clear();renderPresence();renderSettingsLock();sendFullText();sendPresence();
    }else if(message.type==='presence'){state.users=message.users||[];renderPresence();}
    else if(message.type==='text-ack'){
      if(message.requestId)state.pendingText.delete(message.requestId);
      if(message.revision!=null)state.revision=message.revision;
      updateRevision();updateDirty();
    }else if(message.type==='text-update'){
      if(message.clientId===sessionId){if(message.requestId)state.pendingText.delete(message.requestId);}
      else if(message.update&&state.doc)Y.applyUpdate(state.doc,decode64(message.update),remoteOrigin);
      if(message.revision!=null)state.revision=message.revision;updateRevision();updateDirty();
    }else if(message.type==='document'){
      if(message.clientId===sessionId)return;
      const doc=message.document||message;
      if(doc.textState&&state.doc)ensureDoc(doc.textState,doc.source);
      if(state.settingsDirty){state.remotePending=doc;$('conflictDialog').showModal();log('warning',t('saveConflict'));}
      else applySnapshot(doc);
    }else if(message.type==='lock'){
      state.locks[message.resource]={owner:message.owner,token:message.token,expiresAt:message.expiresAt};
      if(message.owner===sessionId&&message.token){state.lockToken=message.token;state.lockRequested=false;startLockRenewal();}
      else if(message.resource==='settings'&&message.owner!==sessionId){state.lockToken=null;state.lockRequested=false;clearInterval(state.lockTimer);state.lockTimer=0;}
      renderSettingsLock();
    }else if(message.type==='error'){log('error',message.message||message.error||t('collaborationError'));}
  }
  function requestLock(action){
    if(state.ws?.readyState!==WebSocket.OPEN)return;
    state.ws.send(JSON.stringify({type:'lock',action,resource:'settings',...(action==='release'&&state.lockToken?{token:state.lockToken}:{})}));
  }
  function acquireLock(){
    if(ownsSettings()||state.lockRequested)return;
    if(settingsOwner()&&settingsOwner()!==sessionId){renderSettingsLock();return}
    state.lockRequested=true;requestLock('acquire');
  }
  function startLockRenewal(){clearInterval(state.lockTimer);state.lockTimer=window.setInterval(()=>{if(ownsSettings())requestLock('acquire')},15000);}
  function releaseLock(notify=true){
    if(notify&&ownsSettings())requestLock('release');
    state.lockToken=null;state.lockRequested=false;clearInterval(state.lockTimer);state.lockTimer=0;renderSettingsLock();
  }
  function renderPresence(){
    const users=state.users.filter(user=>user.clientId!==sessionId);$('userCount').textContent=String(users.length);$('presenceCount').textContent=String(users.length);
    const list=$('presenceList');list.replaceChildren();const focusKeys={scene:'sceneFocus',script:'scriptFocus',assets:'assetFocus',settings:'settingsFocus',pie:'unknownFocus'};
    document.querySelectorAll('.asset-thumb').forEach(button=>button.classList.remove('remote-selected'));
    for(const user of users){const row=document.createElement('div');row.className='presence-person';const avatar=document.createElement('span');avatar.className='presence-avatar';avatar.style.background=user.color||'#b7f46a';avatar.textContent=(user.name||'?').slice(0,1).toUpperCase();const name=document.createElement('span');name.textContent=user.name||'Guest';const focus=document.createElement('span');focus.className='presence-detail';const field=user.focusField?state.schema?.fields?.find(item=>item.key===user.focusField):null;const focusText=t(focusKeys[user.focus]||'unknownFocus');focus.textContent=field?focusText+' · '+t(field.labelKey||field.key):user.focusField==='sourceEditor'?focusText+' · '+$('scriptTitle').textContent:focusText;row.append(avatar,name,focus);list.append(row);if(user.selectedAsset){const asset=state.project?.assets?.find(item=>item.id===user.selectedAsset);const button=[...document.querySelectorAll('.asset-thumb')].find(node=>node.dataset.assetKey===user.selectedAsset||node.dataset.assetKey===asset?.path);if(button){button.classList.add('remote-selected');button.style.setProperty('--cursor-color',user.color||'#b7f46a');button.title=user.name||'Guest';}}}
    renderCursors();
  }
  function renderCursors(){
    const layers={scene:$('sceneCursors'),script:$('scriptCursors'),assets:$('assetsCursors'),settings:$('settingsCursors'),pie:$('pieCursors')};
    new Set(Object.values(layers)).forEach(layer=>layer.replaceChildren());
    for(const user of state.users){if(user.clientId===sessionId||!user.cursor)continue;const pane=user.cursor.pane||user.focus||'scene',layer=layers[pane];if(!layer)continue;const cursor=document.createElement('span');cursor.className='presence-cursor';cursor.style.setProperty('--cursor-color',user.color||'#b7f46a');cursor.style.left=(Math.max(0,Math.min(1,user.cursor.x||0))*100)+'%';cursor.style.top=(Math.max(0,Math.min(1,user.cursor.y||0))*100)+'%';cursor.textContent=user.name||'Guest';layer.append(cursor)}
  }
  function focusFor(target){if(target.closest('#sourceEditor'))return'script';if(target.closest('#assetGrid,#assetsPane'))return'assets';if(target.closest('#settingsPane,.inspector-section'))return'settings';if(target.closest('#gameCanvas'))return'pie';return state.tab==='pie'?'pie':state.tab==='script'?'script':'scene'}
  function sendPresence(event){
    const ws=state.ws;if(!ws||ws.readyState!==WebSocket.OPEN)return;
    state.focus=event?focusFor(event.target):state.focus;let pane=state.focus,x=.5,y=.5;
    if(event){const target=event.target.closest('#sourceEditor,#settingsPane,#assetsPane,#gameCanvas,.scene-stage')||event.target,rect=target.getBoundingClientRect();pane=focusFor(target);x=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));y=Math.max(0,Math.min(1,(event.clientY-rect.top)/Math.max(1,rect.height)))}
    const active=event?.target?.closest('[data-setting-key]');state.focusField=active?.dataset.settingKey||(event?.target?.closest('#sourceEditor')?'sourceEditor':'');
    const selected=event?.target?.closest('[data-asset-key]');if(selected)state.selectedAsset=selected.dataset.assetKey;
    ws.send(JSON.stringify({type:'presence',name:displayName(),focus:state.focus,focusField:state.focusField,selectedAsset:state.selectedAsset,cursor:{x,y,pane}}));
  }
  function schedulePresence(event){if(event)state.lastPointerEvent=event;if(state.cursorTimer)return;state.cursorTimer=window.setTimeout(()=>{state.cursorTimer=0;sendPresence(state.lastPointerEvent)},70)}
  function log(kind,message){const row=document.createElement('div');row.className='log-entry '+kind;const time=document.createElement('span');time.className='log-time';time.textContent=new Date().toLocaleTimeString(i18n.locale,{hour:'2-digit',minute:'2-digit',second:'2-digit'});const text=document.createElement('span');text.textContent=message;row.append(time,text);$('logList').append(row);while($('logList').children.length>140)$('logList').firstElementChild.remove();$('logList').scrollTop=$('logList').scrollHeight}
  function setTab(tab){const prior=state.tab;state.tab=tab;document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));$('sceneView').hidden=tab!=='scene';$('scriptView').hidden=tab!=='script';$('pieView').hidden=tab!=='pie';state.focus=tab==='script'?'script':tab==='pie'?'pie':'scene';state.focusField='';if(prior!==tab&&ownsSettings()&&!state.settingsDirty)releaseLock();sendPresence()}
  function assetLabel(asset){return asset.localizedName?.[i18n.locale]||asset.name||asset.path?.split('/').pop()||'Asset'}
  function openAsset(index){const asset=state.project?.assets?.[index];if(!asset){log('warning',t('assetMissing'));return}state.assetReturn=document.activeElement;state.selectedAsset=asset.id||asset.path;document.querySelectorAll('.asset-thumb').forEach(button=>button.classList.toggle('selected',button.dataset.assetKey===state.selectedAsset));$('assetTitle').textContent=assetLabel(asset);$('assetImage').src=asset.path;$('assetImage').alt=asset.alt||assetLabel(asset);$('assetType').textContent=asset.type||'—';$('assetPath').textContent=asset.path||'—';$('assetId').textContent=asset.id||'—';if(!$('assetModal').open)$('assetModal').showModal();state.focus='assets';sendPresence()}
  function closeAsset(){if($('assetModal').open)$('assetModal').close();state.assetReturn?.focus?.();state.assetReturn=null}
  function settingsChanged(){state.settingsDirty=JSON.stringify(state.settings)!==state.originalSettings;updateDirty()}
  function changeSetting(control){
    if(!ownsSettings()){control.value=state.settings[control.dataset.settingKey]??'';acquireLock();return}
    const key=control.dataset.settingKey,field=state.schema?.fields?.find(item=>item.key===key);state.settings[key]=field?.type==='number'?Number(control.value):control.value;
    if(key==='difficulty'){const preset=state.schema?.presets?.[control.value];if(preset)Object.assign(state.settings,preset);renderSettings()}
    settingsChanged();schedulePresence();
  }
  async function saveProject(){
    if(state.settingsDirty&&!ownsSettings()){log('warning',t('settingsLockRequired'));return false}
    if(state.doc&&state.ws?.readyState===WebSocket.OPEN)sendFullText();
    if(!state.settingsDirty){$('scriptNotice').textContent=state.pendingText.size?t('syncingSource'):t('sourceSynced');return await waitForTextSync(5000)}
    const payload={clientId:sessionId,lockToken:state.lockToken,settingsRevision:state.settingsRevision,baseRevision:state.revision,source:state.text?.toString()??state.source,settings:{...state.settings}};
    $('saveSource').disabled=true;
    try{
      const token=await ensureCsrf();
      const response=await fetch(forgePath('/api/project'),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json',...(token?{'X-CSRF-Token':token}:{})},body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));
      if(response.status===409){state.settingsPending=data.document||null;$('conflictDialog').showModal();log('warning',t('saveConflict'));return false}
      if(!response.ok||data.ok===false)throw new Error(data.error||'HTTP '+response.status);
      const doc=data.document||data;state.revision=doc.revision??state.revision;state.settingsRevision=doc.settingsRevision??state.settingsRevision;state.project=doc.project||state.project;
      state.settings={...valuesFrom(doc.settings??state.settings)};state.originalSettings=JSON.stringify(state.settings);state.settingsDirty=false;renderSettings();updateRevision();renderAssets();updateDirty();log('success',t('saved'));sendPresence();if(ownsSettings())releaseLock();return true;
    }catch(error){log('error',t('saveFailed')+' '+error.message);$('scriptNotice').textContent=t('saveFailed');return false}
    finally{updateDirty()}
  }
  function waitForTextSync(timeout){return new Promise(resolve=>{if(!state.pendingText.size)return resolve(true);const start=Date.now(),timer=window.setInterval(()=>{if(!state.pendingText.size){clearInterval(timer);resolve(true)}else if(Date.now()-start>=timeout){clearInterval(timer);resolve(false)}},50)})}
  async function pieRequest(body,{keepalive=false,session=state.runtimeSessionId}={}){const token=await ensureCsrf();const response=await fetch(forgePath('/api/pie'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json',...(token?{'X-CSRF-Token':token}:{})},body:JSON.stringify({sessionId:session||sessionId,...body}),keepalive}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.error||'HTTP '+response.status);return data}
  function renderRuntime(response){
    const next=response?.state||response?.runtime?.state||response?.runtime||null;if(!next||typeof next!=='object')return;
    window.GamePlayForgePresenter?.onState(state.runtimeState,next,state.sound,state.project);state.runtimeState=next;window.GamePlayForgePresenter?.draw(next,$('gameCanvas'));
    const label={ready:'ready',playing:'playing',paused:'paused',over:'over'}[next.state]||'runtimeReady';const telemetry=[];if(Number.isFinite(Number(next.elapsed)))telemetry.push(Number(next.elapsed).toFixed(1)+'s');if(Number.isFinite(Number(next.fps)))telemetry.push(Math.round(next.fps)+' FPS');$('runtimeStatus').textContent=t(label)+(telemetry.length?' · '+telemetry.join(' · '):'');
    $('pieOverlay').replaceChildren();if(['ready','paused','over'].includes(next.state)){const title=document.createElement('strong');title.textContent=t(next.state);const hint=document.createElement('span');hint.textContent=t(next.state==='ready'?'startHint':next.state==='over'?'restartHint':'runtimePaused');$('pieOverlay').append(title,hint)}
    $('pauseButton').textContent=t(next.state==='paused'?'resume':'pause');
  }
  async function startRuntime(){
    if(state.runtime||state.runtimeLoading)return;
    const generation=++state.runGeneration,runtimeSessionId=uuid();state.runtimeSessionId=runtimeSessionId;state.runtimeLoading=true;$('playButton').disabled=true;setTab('pie');
    try{
      if(state.settingsDirty&&!await saveProject())return;
      if(generation!==state.runGeneration)return;
      if(!await waitForTextSync(5000)){log('error',t('sourceSyncFailed'));return}
      if(generation!==state.runGeneration)return;
      await state.presenterReady;if(generation!==state.runGeneration)return;
      stopLoop();$('runtimeStatus').textContent=t('runtimeLoading');$('runtimeName').textContent='';
      const settings=window.GamePlayForgePresenter?.prepareSettings?.({...state.settings},state.project)||{...state.settings};
      const response=await pieRequest({op:'load',source:state.text?.toString()??state.source,settings},{session:runtimeSessionId});
      if(generation!==state.runGeneration){await pieRequest({op:'stop'},{session:runtimeSessionId}).catch(()=>{});return}
      state.runtime=true;state.runtimeName=response.runtimeName||response.runtime?.name||response.runtime?.runtimeName||(typeof response.runtime==='string'?response.runtime:'Native');
      $('runtimeName').textContent=String(state.runtimeName);renderRuntime(response);log('success',t('runtimeReady')+' · '+String(state.runtimeName));startLoop(generation,runtimeSessionId);$('gameCanvas').focus();
    }catch(error){
      if(generation===state.runGeneration){state.runtime=false;state.runtimeState=null;state.runtimeName=null;state.runtimeSessionId=null;$('runtimeStatus').textContent=t('runtimeFailed');$('runtimeName').textContent='';$('pieOverlay').replaceChildren();const ctx=$('gameCanvas').getContext('2d');ctx?.clearRect(0,0,$('gameCanvas').width,$('gameCanvas').height);log('error',t('runtimeFailed')+' '+error.message)}
    }finally{if(generation===state.runGeneration){state.runtimeLoading=false;$('playButton').disabled=false}}
  }
  function queueRuntimeCommand(command,generation,runtimeSessionId){
    const previous=state.stepPromise||Promise.resolve();
    const operation=previous.catch(()=>{}).then(async()=>{
      if(!state.runtime||generation!==state.runGeneration)return null;
      return pieRequest(command,{session:runtimeSessionId});
    });
    state.stepPromise=operation;state.stepBusy=true;
    return operation.finally(()=>{if(state.stepPromise===operation){state.stepPromise=null;state.stepBusy=false}});
  }
  function startLoop(generation,runtimeSessionId){
    stopLoop();
    state.loopTimer=window.setInterval(async()=>{
      if(!state.runtime||state.stepBusy||generation!==state.runGeneration)return;
      try{
        const response=await queueRuntimeCommand({op:'snapshot'},generation,runtimeSessionId);
        if(response&&generation===state.runGeneration&&state.runtime)renderRuntime(response);
      }catch(error){
        if(generation===state.runGeneration){log('error',t('runtimeError')+' '+error.message);stopRuntime()}
      }
    },1000/30);
  }
  function stopLoop(){if(state.loopTimer){clearInterval(state.loopTimer);state.loopTimer=0}}
  async function runtimeInput(action){
    if(!state.runtime){if(action==='flap')await startRuntime();else return}
    if(!state.runtime)return;
    const generation=state.runGeneration,runtimeSessionId=state.runtimeSessionId;
    window.GamePlayForgePresenter?.input(action,state.sound,state.project);
    try{const response=await queueRuntimeCommand({op:'input',action},generation,runtimeSessionId);if(response&&generation===state.runGeneration&&state.runtime)renderRuntime(response)}catch(error){if(generation===state.runGeneration)log('error',t('runtimeError')+' '+error.message)}
  }
  async function stopRuntime({beacon=false}={}){
    const shouldStop=state.runtime||state.runtimeLoading,runtimeSessionId=state.runtimeSessionId;state.runGeneration++;state.runtimeLoading=false;state.runtimeSessionId=null;$('playButton').disabled=false;
    if(!state.settingsDirty)releaseLock(!beacon);stopLoop();state.runtime=false;state.runtimeState=null;state.runtimeName=null;$('runtimeName').textContent='';$('pieOverlay').replaceChildren();const ctx=$('gameCanvas').getContext('2d');ctx?.clearRect(0,0,$('gameCanvas').width,$('gameCanvas').height);$('runtimeStatus').textContent=t('runtimeStopped');
    if(!shouldStop)return;
    try{await state.stepPromise}catch{}
    const stopBody=JSON.stringify({sessionId:runtimeSessionId||sessionId,op:'stop'});
    try{if(beacon&&!csrfToken&&navigator.sendBeacon)navigator.sendBeacon(forgePath('/api/pie'),new Blob([stopBody],{type:'application/json'}));else await pieRequest({op:'stop'},{keepalive:beacon,session:runtimeSessionId})}
    catch(error){if(!beacon)log('error',t('runtimeError')+' '+error.message)}
    log('warning',t('runtimeStopped'));
  }
  function handleKey(event){
    if(event.key==='Escape'&&$('assetModal').open){closeAsset();return}
    const mod=event.ctrlKey||event.metaKey,tag=document.activeElement?.tagName;
    if(mod&&event.key.toLowerCase()==='z'&&document.activeElement===$('sourceEditor')){event.preventDefault();event.shiftKey?state.undo?.redo():state.undo?.undo();return}
    if(mod&&event.key.toLowerCase()==='y'&&document.activeElement===$('sourceEditor')){event.preventDefault();state.undo?.redo();return}
    if(mod&&event.key==='Enter'){event.preventDefault();startRuntime();return}
    if(mod||event.altKey||['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    if(state.tab==='pie'&&event.code==='Space'){event.preventDefault();runtimeInput('flap')}
    if(state.tab==='pie'&&event.key.toLowerCase()==='p'){event.preventDefault();runtimeInput('togglePause')}
  }
  function focusHandler(event){
    const next=focusFor(event.target);state.focus=next;
    state.focusField=event.target.closest('[data-setting-key]')?.dataset.settingKey||(event.target.closest('#sourceEditor')?'sourceEditor':'');
    if(next==='settings')acquireLock();
    else if(settingsOwner()===sessionId&&!state.settingsDirty)releaseLock();
    schedulePresence();
  }
  function initEvents(){
    document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
    document.querySelectorAll('[data-file]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.file==='script'?'script':'scene')));
    document.querySelector('.inspector-section').addEventListener('pointerdown',acquireLock,true);
    $('acquireSettingsLock').addEventListener('click',acquireLock);
    $('releaseSettingsLock').addEventListener('click',()=>{if(!state.settingsDirty)releaseLock()});
    $('assetGrid').addEventListener('click',event=>{const button=event.target.closest('[data-asset-index]');if(button)openAsset(Number(button.dataset.assetIndex))});
    $('closeAsset').addEventListener('click',closeAsset);$('assetModal').addEventListener('close',()=>{state.assetReturn?.focus?.();state.assetReturn=null});$('assetModal').addEventListener('click',event=>{if(event.target===$('assetModal'))closeAsset()});
    $('sourceEditor').addEventListener('input',event=>{editSource(event.currentTarget.value);renderLineNumbers();schedulePresence()});
    $('sourceEditor').addEventListener('scroll',()=>$('lineNumbers').scrollTop=$('sourceEditor').scrollTop);
    $('sourceEditor').addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const input=event.currentTarget,start=input.selectionStart,end=input.selectionEnd;input.setRangeText('    ',start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}))}});
    $('saveSource').addEventListener('click',saveProject);$('undoButton').addEventListener('click',()=>state.undo?.undo());$('redoButton').addEventListener('click',()=>state.undo?.redo());
    $('playButton').addEventListener('click',startRuntime);$('pauseButton').addEventListener('click',()=>runtimeInput('togglePause'));$('restartButton').addEventListener('click',()=>runtimeInput('restart'));$('stopButton').addEventListener('click',()=>stopRuntime());
    $('soundButton').addEventListener('click',()=>{state.sound=!state.sound;$('soundButton').textContent=t(state.sound?'soundOn':'soundOff')});
    $('gameCanvas').addEventListener('click',()=>runtimeInput('flap'));
    $('clearLogs').addEventListener('click',()=>$('logList').replaceChildren());
    $('keepDraft').addEventListener('click',()=>{const pending=state.settingsPending||state.remotePending;if(pending){state.revision=pending.revision??state.revision;state.settingsRevision=pending.settingsRevision??state.settingsRevision}state.settingsPending=null;state.remotePending=null;$('conflictDialog').close();if(state.settingsDirty)saveProject()});
    $('reloadRemote').addEventListener('click',()=>{const pending=state.settingsPending||state.remotePending;$('conflictDialog').close();state.remotePending=null;state.settingsPending=null;if(pending)applySnapshot(pending,{force:true});else loadProject({force:true})});
    $('displayName').addEventListener('change',()=>{try{localStorage.setItem('gameplayforge.name',displayName())}catch{}sendPresence()});
    $('languageSelect').addEventListener('change',event=>i18n.setLocale(event.target.value));
    window.addEventListener('gameplayforge:locale',()=>{updateLabels();renderSettings();renderAssets();renderPresence();if($('assetModal').open){const index=Number(state.assetReturn?.dataset?.assetIndex);if(Number.isInteger(index))openAsset(index)}});
    document.addEventListener('focusin',focusHandler);document.addEventListener('pointermove',event=>schedulePresence(event),{passive:true});document.addEventListener('keydown',handleKey);
    window.addEventListener('pagehide',()=>{stopRuntime({beacon:true});if(ownsSettings())requestLock('release')});
    window.addEventListener('beforeunload',event=>{if(state.settingsDirty||state.pendingText.size){event.preventDefault();event.returnValue=''}});
  }
  function renderLineNumbers(){const value=$('sourceEditor').value,n=Math.max(1,value.split('\n').length);$('lineNumbers').textContent=Array.from({length:n},(_,i)=>i+1).join('\n')}
  const freezeTree=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(freezeTree);return Object.freeze(value)};
  window.GamePlayForgeStudio=Object.freeze({get state(){return freezeTree({revision:state.revision,settingsRevision:state.settingsRevision,project:structuredClone(state.project),source:state.text?.toString()??state.source,settings:{...state.settings},settingsDirty:state.settingsDirty,runtime:state.runtime,runtimeName:state.runtimeName,runtimeState:structuredClone(state.runtimeState),users:structuredClone(state.users),locks:structuredClone(state.locks)})},save:saveProject,load:loadProject,startPIE:startRuntime,stopPIE:stopRuntime,getRevision:()=>state.revision});
  window.GamePlayForgeCollaboration=Object.freeze({sessionId,sendPresence,sendFullText,acquireSettingsLock:acquireLock,releaseSettingsLock:releaseLock});
  initEvents();updateLabels();renderLineNumbers();renderSettings();renderAssets();connect();loadProject();
  window.setInterval(()=>{if(state.ws?.readyState===WebSocket.CLOSED)connect()},5000);
})();
