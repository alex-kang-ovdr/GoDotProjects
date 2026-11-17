(() => {
  const images = {};
  [['chicken','/Projects/TappyChicken/Assets/chicken.svg'],['pipe','/Projects/TappyChicken/Assets/pipe.svg'],['ground','/Projects/TappyChicken/Assets/ground.svg']].forEach(([key,url])=>{const img=new Image();img.src=url;images[key]=img;});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function draw(state,canvas){
    if(!canvas||!state)return;
    const ctx=canvas.getContext('2d'); if(!ctx)return;
    const w=Number(state.world?.width)||480,h=Number(state.world?.height)||640,ground=Number(state.world?.ground)||570,scale=Math.min(canvas.width/w,canvas.height/h),ox=(canvas.width-w*scale)/2,oy=(canvas.height-h*scale)/2;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    ctx.fillStyle='#8fdde6';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(239,250,217,.8)';ctx.beginPath();ctx.arc(92,110,31,0,Math.PI*2);ctx.arc(121,110,23,0,Math.PI*2);ctx.arc(102,94,23,0,Math.PI*2);ctx.fill();
    const pipeImg=images.pipe,pipeWidth=Number(state.settings?.pipeWidth)||78;
    for(const pipe of state.pipes||[]){drawPipe(ctx,pipeImg,pipe.x,0,pipeWidth,pipe.top,true);drawPipe(ctx,pipeImg,pipe.x,pipe.bottom,pipeWidth,ground-pipe.bottom,false);}
    const groundImg=images.ground;if(groundImg?.complete&&groundImg.naturalWidth)ctx.drawImage(groundImg,0,ground,w,h-ground);else{ctx.fillStyle='#6c9145';ctx.fillRect(0,ground,w,h-ground);ctx.fillStyle='#a9cb65';ctx.fillRect(0,ground,w,8);}
    const bird=state.bird||{x:135,y:290,r:17,angle:0},birdImg=images.chicken;
    ctx.save();ctx.translate(bird.x,bird.y);ctx.rotate(Number(bird.angle)||0);
    if(birdImg?.complete&&birdImg.naturalWidth)ctx.drawImage(birdImg,-bird.r,-bird.r,bird.r*2,bird.r*2);else{ctx.fillStyle='#f2cc58';ctx.beginPath();ctx.arc(0,0,bird.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(7,-5,4,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    ctx.textAlign='center';ctx.font='bold 38px system-ui';ctx.lineWidth=4;ctx.strokeStyle='#354133';ctx.fillStyle='#fff';ctx.strokeText(String(state.score??0),w/2,55);ctx.fillText(String(state.score??0),w/2,55);
    ctx.restore();
  }
  function drawPipe(ctx,img,x,y,w,h,top){if(h<=0)return;if(img?.complete&&img.naturalWidth){ctx.save();if(top){ctx.translate(x+w,y+h);ctx.scale(1,-1);ctx.drawImage(img,0,0,w,h);}else ctx.drawImage(img,x,y,w,h);ctx.restore();}else{ctx.fillStyle='#70a744';ctx.fillRect(x,y,w,h);ctx.fillStyle='#46813c';ctx.fillRect(x,y,w,8);}}
  let audio;
  function tone(freq,duration,wave='sine',volume=.035){try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=wave;oscillator.frequency.value=freq;gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);}catch{}}
  function progressKey(project){return 'gameplayforge.best.'+String(project?.id||project?.name||'project')}
  window.GamePlayForgePresenter={
    draw,
    prepareSettings(settings,project){let best=0;try{best=Number(localStorage.getItem(progressKey(project)))||0}catch{}return{...settings,best:Math.max(Number(settings.best)||0,best)}},
    input(action,soundOn){if(soundOn&&action==='flap'){tone(520,.075,'triangle');setTimeout(()=>tone(760,.045,'sine',.018),35);}},
    onState(previous,next,soundOn,project){
      if(!previous||!next)return;
      if(soundOn&&Number(next.score)>Number(previous.score))tone(970,.12,'sine',.045);
      if(next.state==='over'&&previous.state!=='over'){
        if(soundOn){tone(230,.22,'sawtooth',.025);setTimeout(()=>tone(160,.3,'triangle',.025),90);}
        const best=Math.max(Number(next.best)||0,Number(next.score)||0);
        try{localStorage.setItem(progressKey(project),String(best))}catch{}
      }
    }
  };
})();
