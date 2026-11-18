/* Physical-key layout and pointer capture are shared by 2D and 3D. */
const movementCodes={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright',Space:' ',KeyP:'p',Escape:'escape'};
addEventListener('keydown',e=>{
 const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
 const k=movementCodes[e.code]||e.key.toLowerCase();
 if(state==='playing'&&movementCodes[e.code])e.preventDefault();
 if(state==='playing'&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))keys.add(k);
 if((k==='escape'||k==='p')&&!e.repeat)pause();
 if(k===' '&&!e.repeat)dash();
 if(e.code==='KeyE'&&!e.repeat){e.preventDefault();castHeroSkill();}
 if(e.code==='KeyN'&&!e.repeat){graphics.radar=!graphics.radar;saveGraphics();toast(graphics.radar?'레이더 켜짐':'레이더 꺼짐');}
 if(e.code==='KeyB'&&!e.repeat){e.preventDefault();if(state==='playing')buildMenu();else if(state==='build')resumePlay();}
 if(e.code==='KeyV'&&!e.repeat)toggleView();
 if(e.code==='KeyM'&&!e.repeat)toggleSound();
 if(e.code==='F2'&&!e.repeat){e.preventDefault();graphics.stats=!graphics.stats;$('diagnostics').style.display=graphics.stats?'block':'none';}
 if(state==='perk'&&!e.repeat&&['Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();document.querySelectorAll('[data-perk]')[+e.code.slice(-1)-1]?.click();return;}
 if(state==='level'&&!e.repeat){if(['Digit1','Digit2','Digit3'].includes(e.code)){document.querySelectorAll('[data-skill]')[+e.code.slice(-1)-1]?.click();}if(e.code==='KeyR')$('reroll')?.click();}
});
addEventListener('keyup',e=>keys.delete(movementCodes[e.code]||e.key.toLowerCase()));
$('skillbutton').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();castHeroSkill();});
$('pause').onclick=pause;$('dashbutton').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();dash();});
$('buildbutton').onclick=()=>{if(state==='playing')buildMenu();else if(state==='build')resumePlay();};
$('soundbutton').onclick=toggleSound;
addEventListener('blur',()=>{clearInputs();if(state==='playing')pause();saveRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(state==='playing')pause();Sound.suspend();saveRun();}});
addEventListener('pagehide',()=>saveRun());
const joyEl=$('joystick'),stick=$('stick');
cvs.addEventListener('pointerdown',e=>{
 if(state!=='playing'||e.pointerType==='mouse'||joy.active)return;
 joy.active=true;joy.id=e.pointerId;joy.x=e.clientX;joy.y=e.clientY;
 joyEl.style.left=(e.clientX-55)+'px';joyEl.style.top=(e.clientY-55)+'px';joyEl.style.bottom='auto';
 try{cvs.setPointerCapture(e.pointerId);}catch(err){}
});
cvs.addEventListener('pointermove',e=>{
 if(!joy.active||e.pointerId!==joy.id)return;const dx=e.clientX-joy.x,dy=e.clientY-joy.y,len=Math.max(45,Math.hypot(dx,dy));
 joy.dx=dx/len;joy.dy=dy/len;stick.style.left=(35+joy.dx*34)+'px';stick.style.top=(35+joy.dy*34)+'px';
});
function endJoy(e){if(e.pointerId!==joy.id)return;clearInputs();}
cvs.addEventListener('pointerup',endJoy);cvs.addEventListener('pointercancel',endJoy);cvs.addEventListener('lostpointercapture',endJoy);
$('viewmode').onclick=toggleView;
$('qualitybutton').onclick=()=>{graphics.quality=graphics.quality==='normal'?'high':graphics.quality==='high'?'low':'normal';saveGraphics();refreshSettingsButtons();toast('화질: '+$('qualitybutton').textContent);};
refreshSettingsButtons();
