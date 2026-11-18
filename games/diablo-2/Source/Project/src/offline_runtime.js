// Offline Edition 28.1. The game/save schema stays at v28.
// All IO is local: optional browser storage, JSON file download and local import.
const OFFLINE_BUILD='28.1', BACKUP_KEY=KEY+'.backup', DAMAGED_KEY=KEY+'.damaged';
const offlineState={ready:false,launch:false,busy:false,initialized:false,epoch:0,storage:'unknown',message:'실행 준비 중',primary:null,backup:null,writeBlocked:false,allowDamagedReplacement:false,pauseBeforeLauncher:false,lastSavedAt:null,fatal:false};

function offlineMessage(message,kind){
 offlineState.message=message;if(kind)offlineState.storage=kind;renderOfflineStatus();
}
function renderOfflineStatus(){
 if(!offlineState.initialized)return;
 const status=$('#offlineStatus');status.textContent=offlineState.message;
 status.dataset.state=offlineState.storage;
 $('#storageStatus').textContent=offlineState.message;
 $('#offlineMode').textContent='오프라인 실행 · '+(renderMode==='3d'?'3D':'2D')+' · v'+OFFLINE_BUILD;
 $('#offlineResume').hidden=!offlineState.ready;
 $('#offlinePreserve').hidden=!offlineState.writeBlocked||!offlineState.ready;
}
function offlineRecord(raw){
 if(raw===null)return {raw:null,valid:false,empty:true};
 try{
  const state=decodeSave(raw),wrapper=JSON.parse(raw);
  return {raw,valid:true,empty:false,hero:state.hero,level:state.p.level,area:state.world.areaId,savedAt:typeof wrapper.savedAt==='string'?wrapper.savedAt:null};
 }catch(error){return {raw,valid:false,empty:false,error:String(error.message||error)};}
}
function inspectOfflineSlots(){
 try{
  offlineState.primary=offlineRecord(localStorage.getItem(KEY));
  offlineState.backup=offlineRecord(localStorage.getItem(BACKUP_KEY));
  offlineState.writeBlocked=!offlineState.primary.empty&&!offlineState.primary.valid;
  if(offlineState.storage==='unavailable')offlineState.storage='unknown';
 }catch(error){
  offlineState.primary={raw:null,valid:false,empty:true,unavailable:true};
  offlineState.backup={raw:null,valid:false,empty:true,unavailable:true};
  offlineState.storage='unavailable';offlineState.writeBlocked=false;
 }
 return {primary:offlineState.primary,backup:offlineState.backup};
}
function offlineRecordLabel(record){
 if(!record?.valid)return record?.unavailable?'브라우저 저장소를 사용할 수 없습니다.':record?.empty?'이 파일에서 읽을 수 있는 저장이 없습니다.':'기존 저장을 읽지 못했습니다. 원문을 보호하고 있습니다.';
 let date='';if(record.savedAt){const d=new Date(record.savedAt);if(Number.isFinite(d.getTime()))date=' · '+d.toLocaleString();}
 return `${heroLabels[record.hero]} · Lv.${record.level} · ${AREA[record.area].label}${date}`;
}
function renderOfflineLauncher(){
 const {primary,backup}=offlineState;
 $('#offlineSavedSummary').textContent=offlineRecordLabel(primary);
 $('#offlineContinue').disabled=!primary?.valid;
 $('#offlineRecover').hidden=!backup?.valid;
 $('#offlineRecover').textContent=backup?.valid?'이전 저장 복구 · '+heroLabels[backup.hero]+' Lv.'+backup.level:'이전 저장 복구';
 $('#offlineStoredExport').hidden=primary?.raw===null||primary?.raw===undefined;
 $('#offlineStorageHint').textContent=primary?.unavailable?'현재 탐험은 메모리에서 실행됩니다. JSON 백업으로 진행을 보관하세요.':offlineState.writeBlocked?'손상되거나 지원하지 않는 저장은 자동으로 덮어쓰지 않습니다. 원문 백업 또는 이전 저장 복구를 이용하세요.':'새 탐험의 첫 저장 시 이전 정상 저장을 복구 슬롯에 보관합니다. 파일 이동 전에는 JSON 백업을 내려받으세요.';
 renderOfflineStatus();
}
function pauseOfflineSession(persist=false){
 clearGameplayInput();paused=true;
 if(persist&&offlineState.ready&&!offlineState.launch&&!offlineState.busy)save(true);
 if(S)refresh();
}
function openOfflineLauncher(){
 offlineState.pauseBeforeLauncher=paused;
 offlineState.launch=true;pauseOfflineSession();inspectOfflineSlots();renderOfflineLauncher();
 $('#offlineLaunchError').textContent='';
 if(!$('#offlineLauncher').open)$('#offlineLauncher').showModal();
}
function finishOfflineChoice(){
 offlineState.ready=true;offlineState.launch=false;offlineState.busy=false;offlineState.epoch++;
 for(const id of ['#offlineLauncher','#offlineTransfer'])if($(id)?.open)$(id).close();
 renderOfflineStatus();
}
const createBeforeOffline=create;
create=function(hero,seed){const result=createBeforeOffline(hero,seed);finishOfflineChoice();return result;};
const restoreBeforeOffline=restoreSave;
restoreSave=function(text){const result=restoreBeforeOffline(text);finishOfflineChoice();return result;};
const activeBeforeOffline=active;
active=function(){return offlineState.ready&&!offlineState.launch&&!offlineState.busy&&!offlineState.fatal&&activeBeforeOffline();};
const pauseBeforeOffline=setPause;
setPause=function(){if(!offlineState.ready||offlineState.launch||offlineState.busy||offlineState.fatal)return;clearGameplayInput();pauseBeforeOffline();};
const refreshBeforeOffline=refresh;
refresh=function(){refreshBeforeOffline();renderOfflineStatus();};

function beginOfflineNew(hero='paladin',seed){
 if(!CLASS[hero]){offlineMessage('선택한 직업을 확인하세요.');return false;}
 create(hero,seed);paused=false;clearGameplayInput();
 offlineMessage(offlineState.writeBlocked?'새 탐험 시작 · 기존 손상 저장 보호 중 · JSON 백업을 사용하세요.':offlineState.storage==='unavailable'?'새 탐험 시작 · 브라우저 저장 불가 · JSON 백업으로 보관하세요.':'새 탐험 시작 · 45초마다 자동 저장 · JSON 백업으로 파일 이동');
 refresh();hud.focus();return true;
}
function continueOffline(which='primary'){
 if(!['primary','backup'].includes(which))return false;
 inspectOfflineSlots();const record=offlineState[which];
 if(!record?.valid){offlineMessage('불러올 수 있는 저장이 없습니다. JSON 가져오기를 이용하세요.');renderOfflineLauncher();return false;}
 const damaged=offlineState.writeBlocked;
 try{
  restoreSave(record.raw);paused=false;clearGameplayInput();
  offlineMessage(which==='backup'?'이전 저장을 복구했습니다.':'저장된 탐험을 이어갑니다.');
  if(which==='backup'&&damaged){offlineState.allowDamagedReplacement=true;save(true);}
  refresh();hud.focus();return true;
 }catch(error){offlineMessage('불러오기 실패 · '+error.message);return false;}
}
function resumeOfflineCurrent(){
 if(!offlineState.ready)return false;
 offlineState.launch=false;$('#offlineLauncher').close();
 paused=offlineState.pauseBeforeLauncher;clearGameplayInput();refresh();hud.focus();return true;
}

// Each individual setItem is atomic in Web Storage. Write the previous valid
// primary first; a failed backup write never permits overwriting the primary.
save=function(silent=false){
 if(!offlineState.ready||offlineState.launch||offlineState.busy||offlineState.fatal){
  if(!silent)offlineMessage('시작 화면에서 탐험을 선택한 뒤 저장하세요.');return false;
 }
 try{
  const text=encodeSave(),candidate=offlineRecord(text);
  if(!candidate.valid)throw Error('현재 상태 검증 실패 · JSON 백업으로 보관하세요.');
  const prior=offlineRecord(localStorage.getItem(KEY));
  if(!prior.empty&&!prior.valid){
   offlineState.writeBlocked=true;
   if(!offlineState.allowDamagedReplacement){offlineMessage('기존 손상 저장 보호 중 · JSON 백업 또는 원문 보관 후 저장을 선택하세요.','protected');return false;}
   localStorage.setItem(DAMAGED_KEY,prior.raw);
  }else if(prior.valid&&prior.raw!==text){
   localStorage.setItem(BACKUP_KEY,prior.raw);
   offlineState.backup=prior;
  }
  localStorage.setItem(KEY,text);
  offlineState.primary=candidate;offlineState.lastSavedAt=candidate.savedAt;
  offlineState.writeBlocked=false;offlineState.allowDamagedReplacement=false;
  const time=new Date(candidate.savedAt).toLocaleTimeString();
  offlineMessage('브라우저 저장 완료 · '+time+' · 파일 이동 전 JSON 백업','saved');
  if(!silent)log('현재 지역·성장·퀘스트를 저장했습니다.');return true;
 }catch(error){
  offlineMessage('브라우저 저장 실패 · 기존 저장 유지 · JSON 백업으로 진행을 보관하세요.','unavailable');
  if(!silent)log('저장 공간 또는 접근 제한 · JSON 백업을 이용하세요.');return false;
 }
};
load=function(){
 const result=continueOffline('primary');if(result){paused=true;offlineMessage('저장 복원 완료 · P 또는 계속 버튼으로 재개');refresh();}return result;
};
function preserveDamagedOffline(){
 if(!offlineState.ready)return false;
 offlineState.allowDamagedReplacement=true;
 const result=save();offlineState.allowDamagedReplacement=false;return result;
}

function offlineBackupName(){
 const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
 return `dark_descent_${S.hero}_Lv${S.p.level}_${timestamp}.json`;
}
function openOfflineTransfer(mode='import',text='',message=''){
 pauseOfflineSession();
 if($('#modal').open){pauseBeforeDialog=true;$('#modal').close();}
 $('#offlineTransferTitle').textContent=mode==='export'?'JSON 백업 보관':'JSON 가져오기';
 $('#offlineJson').value=text;$('#offlineJson').readOnly=mode==='export';
 $('#offlineTextImport').hidden=mode==='export';
 $('#offlineJsonDownload').hidden=mode!=='export';
 $('#offlineSelectAll').hidden=mode!=='export';
 $('#offlineTransferFile').hidden=mode==='export';
 $('#offlineTransferMessage').textContent=message||(mode==='export'?'다운로드하거나 전체 선택 후 복사해 .json 파일로 보관하세요.':'저장 파일을 선택하거나 JSON 전체를 붙여넣으세요. 검증에 성공한 경우에만 현재 탐험을 바꿉니다.');
 if(!$('#offlineTransfer').open)$('#offlineTransfer').showModal();
}
downloadText=function(name,text,type='application/json'){
 let url=null,a=null;
 try{
  url=URL.createObjectURL(new Blob([text],{type}));a=document.createElement('a');
  a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  return true;
 }catch(error){
  if(url)try{URL.revokeObjectURL(url);}catch(_){}
  openOfflineTransfer('export',text,'자동 다운로드를 시작하지 못했습니다. 전체 선택 후 복사하여 .json 파일로 보관하세요.');return false;
 }finally{if(a?.remove)a.remove();}
};
function exportOfflineBackup(){
 if(!offlineState.ready){
  if(offlineState.primary?.raw!==null&&offlineState.primary?.raw!==undefined)return exportStoredOffline('primary');
  offlineMessage('새 탐험을 시작하거나 기존 저장을 불러온 뒤 백업하세요.');return false;
 }
 pauseOfflineSession();const text=encodeSave();
 // Always leave selectable JSON visible: a browser may silently block a download.
 openOfflineTransfer('export',text);
 const result=downloadText(offlineBackupName(),text);
 if(result)$('#offlineTransferMessage').textContent='JSON 다운로드를 요청했습니다. 저장된 파일을 확인하세요. 다운로드가 보이지 않으면 전체 선택 후 복사할 수 있습니다.';
 return result;
}
function exportStoredOffline(which='primary'){
 let raw;
 try{raw=which==='damaged'?localStorage.getItem(DAMAGED_KEY):localStorage.getItem(which==='backup'?BACKUP_KEY:KEY);}catch(error){offlineMessage('브라우저 저장 원문을 읽지 못했습니다.');return false;}
 if(raw===null){offlineMessage('보관된 원문이 없습니다.');return false;}
 openOfflineTransfer('export',raw,'기존 저장 원문입니다. 검증할 수 없는 파일도 변경 없이 보관할 수 있습니다.');
 return downloadText('dark_descent_'+which+'_original.json',raw);
}
function applyOfflineImport(text){
 // restoreSave decodes and validates a candidate before replacing S.
 restoreSave(text);paused=true;clearGameplayInput();
 offlineMessage('JSON 복원 완료 · P로 재개 · 저장 버튼으로 브라우저에 보관');refresh();return true;
}
function offlineImportFailure(error){
 const message='가져오기 거부 · '+String(error.message||error);
 $('#offlineTransferMessage').textContent=message;$('#offlineLaunchError').textContent=message;
 offlineMessage(message);return false;
}
function importOfflineText(text){
 offlineState.epoch++;offlineState.busy=false;pauseOfflineSession();
 try{return applyOfflineImport(text);}catch(error){return offlineImportFailure(error);}
}
async function importOfflineFile(file){
 if(!file)return false;
 const epoch=++offlineState.epoch;offlineState.busy=true;pauseOfflineSession();
 try{
  if(!Number.isFinite(file.size)||file.size>20e6)throw Error('20MB 이하 JSON 파일이 필요합니다.');
  if(typeof file.text!=='function')throw Error('파일 읽기를 지원하지 않습니다. JSON 텍스트를 붙여넣으세요.');
  const text=await file.text();
  if(epoch!==offlineState.epoch)return false;
  offlineState.busy=false;return applyOfflineImport(text);
 }catch(error){
  if(epoch!==offlineState.epoch)return false;
  offlineState.busy=false;return offlineImportFailure(error);
 }
}
function showOfflineFatal(error){
 offlineState.fatal=true;paused=true;clearGameplayInput();
 const box=$('#fatal');box.textContent='실행을 멈췄습니다. '+String(error?.message||error||'알 수 없는 오류')+' · JSON 백업으로 현재 기록을 보관한 뒤 파일을 다시 열어 주세요.';
 box.style.display='block';offlineMessage('실행 오류 · JSON 백업으로 기록을 보관하세요.');
}
const frameBeforeOffline=frame;
frame=function(t){if(offlineState.fatal)return;try{frameBeforeOffline(t);}catch(error){showOfflineFatal(error);}};

function initOfflineRuntime(){
 offlineState.initialized=true;offlineState.ready=false;offlineState.launch=false;paused=true;
 clearGameplayInput();
 $('#offlineClass').innerHTML=Object.entries(heroLabels).map(([id,label])=>`<option value="${id}" ${id==='paladin'?'selected':''}>${esc(label)}</option>`).join('');
 $('#offlineClass').value='paladin';
 $('#offlineNew').onclick=()=>beginOfflineNew($('#offlineClass').value,$('#offlineSeed').value.trim()||undefined);
 $('#offlineContinue').onclick=()=>continueOffline('primary');
 $('#offlineRecover').onclick=()=>continueOffline('backup');
 $('#offlineResume').onclick=resumeOfflineCurrent;
 $('#offlineLauncher').addEventListener('cancel',e=>{e.preventDefault();if(offlineState.ready)resumeOfflineCurrent();});
 $('#offlineLaunchImport').onclick=()=>$('#importFile').click();
 $('#offlineLaunchPaste').onclick=()=>openOfflineTransfer('import');
 $('#offlineStoredExport').onclick=()=>exportStoredOffline('primary');
 $('#offlinePreserve').onclick=preserveDamagedOffline;
 $('#offlineBackup').onclick=exportOfflineBackup;
 $('#offlineImport').onclick=()=>openOfflineTransfer('import');
 $('#offlineMenu').onclick=openOfflineLauncher;
 $('#new').onclick=openOfflineLauncher;
 $('#save').onclick=()=>save();$('#load').onclick=load;
 $('#export').onclick=exportOfflineBackup;$('#import').onclick=()=>openOfflineTransfer('import');
 $('#importFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importOfflineFile(file);};
 $('#offlineTransferClose').onclick=()=>{$('#offlineTransfer').close();paused=true;refresh();};
 $('#offlineTransfer').addEventListener('cancel',()=>{paused=true;clearGameplayInput();});
 $('#offlineTransferFile').onclick=()=>$('#importFile').click();
 $('#offlineTextImport').onclick=()=>importOfflineText($('#offlineJson').value);
 $('#offlineJsonDownload').onclick=()=>downloadText('dark_descent_backup.json',$('#offlineJson').value);
 $('#offlineSelectAll').onclick=()=>{$('#offlineJson').focus();$('#offlineJson').select();$('#offlineTransferMessage').textContent='전체 선택했습니다. Ctrl+C 또는 ⌘C로 복사하여 .json 파일에 저장하세요.';};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseOfflineSession(true);});
 window.addEventListener('pagehide',()=>pauseOfflineSession(true));
 window.addEventListener('error',e=>showOfflineFatal(e.error||e.message));
 $('#offlineBootNote').hidden=true;
 offlineMessage('시작 화면에서 이어하기 또는 새 탐험을 선택하세요.');
 openOfflineLauncher();
}
