(function (root) {
  'use strict';

  const W = 44, H = 22;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const point = (x, y) => ({x:450 + (x-y)*W, y:110 + (x+y)*H});
  const key = (x,y) => x+','+y;
  const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const inBoard = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<8 && p.y>=0 && p.y<8;
  const diamond = (cx,cy,w=W,h=H) => `${cx},${cy-h} ${cx+w},${cy} ${cx},${cy+h} ${cx-w},${cy}`;
  const poly = (points,fill,extra='') => `<polygon points="${points}" fill="${fill}" ${extra}/>`;
  const line = (d,stroke,width=1,extra='') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
  const terrainNames={ground:'평지',forest:'숲',sand:'모래',water:'물',mountain:'산',building:'도시',chasm:'구덩이',ice:'얼음'};
  const colors={player:{light:'#e8edd2',main:'#b5c89c',dark:'#657f6b',accent:'#d8f98a'},enemy:{light:'#f2a185',main:'#c76654',dark:'#703e3a',accent:'#ffc59c'},neutral:{light:'#f6d897',main:'#c6a56c',dark:'#6a6b58',accent:'#ffe5a6'}};

  function cube(x,y,w,d,height,top,front,right,extra='') {
    return `<g transform="translate(${x} ${y})" ${extra}>`+
      poly(`${-w},${-height} 0,${d-height} 0,${d} ${-w},0`,front)+
      poly(`0,${d-height} ${w},${-height} ${w},0 0,${d}`,right)+
      poly(`0,${-d-height} ${w},${-height} 0,${d-height} ${-w},${-height}`,top)+
      line(`M${-w},${-height} 0,${d-height} ${w},${-height}`, '#ffffff', .7, 'opacity=".14"')+'</g>';
  }

  function playerSprite(kind,palette) {
    const p=palette||colors.player;
    const shadow='<ellipse cx="0" cy="8" rx="28" ry="12" fill="#07151d" opacity=".38"/>';
    if(kind==='pull') return shadow+
      cube(-13,8,11,6,10,'#afc8ab','#4c685b','#78977d')+cube(13,8,11,6,10,'#afc8ab','#4c685b','#78977d')+
      cube(0,-11,19,10,24,p.light,p.main,p.dark)+cube(-23,-14,8,5,19,'#bdd8c6','#6a9b88','#407263')+
      cube(19,-22,8,6,17,'#c6ddc4','#79a58c','#527e6d')+
      '<path d="M18,-29L30,-23 36,-15 29,-8" fill="none" stroke="#c4e8d1" stroke-width="6" stroke-linejoin="bevel"/><path d="M18,-18L25,-15 28,-10 22,-7" fill="none" stroke="#78b9a7" stroke-width="5"/>'+
      '<path d="M-13,-26L0,-19 11,-25" fill="none" stroke="#a8f1d0" stroke-width="3"/><circle cx="-25" cy="-27" r="5" fill="#294f4a" stroke="#b8f5cf" stroke-width="2"/>'+
      cube(-2,-39,10,6,12,'#e5edcd','#acc9a4','#658b73')+
      '<path d="M-9,-41l7,4 8,-4v4l-8,4 -7,-4z" fill="#30584c"/><path d="M-6,-40l4,2 5,-2" fill="none" stroke="#d9fba7" stroke-width="2"/><path d="M-6,-54v-7" stroke="#96bba1" stroke-width="2"/>';
    if(kind==='laser') return shadow+
      cube(-13,8,11,6,10,'#a2b6a1','#4c6457','#708e70')+cube(13,8,11,6,10,'#a2b6a1','#4c6457','#708e70')+
      cube(0,-9,20,10,19,p.light,p.main,p.dark)+cube(-17,-21,8,6,23,'#e0e7c1','#a7ba8b','#667d64')+
      '<path d="M-23,-42l12,6v7l-12,-6z" fill="#b2e9ba"/><path d="M-23,-38l12,6 M-23,-34l12,6" stroke="#405b4b" stroke-width="1.4"/>'+
      cube(6,-28,13,8,18,'#e4e7bd','#a5ba85','#6f8c61')+
      poly('9,-38 35,-25 35,-15 9,-28','#dce8bf')+poly('9,-28 35,-15 31,-11 7,-23','#698b64')+
      poly('35,-25 41,-22 41,-12 35,-15','#254c43')+poly('36,-22 39,-21 39,-15 36,-17','#e8ff9e')+
      '<path d="M12,-34l18,9 M14,-30l15,7" stroke="#e4ffac" stroke-width="1.6"/><path d="M1,-56l7,-4 7,4v11l-7,4 -7,-4z" fill="#a9d08b" stroke="#e2eeae"/><path d="M4,-54l4,-2 4,2v6l-4,2 -4,-2z" fill="#eaffad"/>';
    if(kind==='cannon') return shadow+
      cube(-13,6,13,7,11,'#566b60','#263f3d','#3c554a')+cube(13,6,13,7,11,'#5c7163','#2a433e','#405b4e')+
      line('M-25,4 -8,12 M-25,0 -8,8 M8,12 25,4 M8,8 25,0','#95ac85',1.5,'opacity=".55"')+
      cube(0,-4,25,12,11,p.main,p.dark,'#809778')+cube(-3,-16,16,8,16,p.light,p.main,p.dark)+
      poly('3,-38 32,-24 32,-15 3,-28',p.light)+poly('3,-28 32,-15 29,-12 1,-25',p.dark)+
      poly('32,-24 36,-22 36,-14 32,-15','#294744')+line('M5,-35 26,-25',p.accent,2)+
      '<rect x="-14" y="-31" width="7" height="4" rx="1" fill="#273c3b"/><path d="M-11,-43v-9" stroke="#93b2a6" stroke-width="2"/><circle cx="-11" cy="-53" r="2" fill="'+p.accent+'"/>';
    if(kind==='artillery'||kind==='smoke') {
      const accent=kind==='smoke'?'#a3e3be':p.accent;
      return shadow+cube(-13,7,12,6,9,'#657967','#2c443c','#48614d')+cube(13,7,12,6,9,'#657967','#2c443c','#48614d')+
        cube(0,-3,20,10,13,p.main,p.dark,'#839977')+
        cube(-13,-19,10,6,24,p.light,p.main,p.dark)+cube(11,-18,10,6,26,p.light,p.main,p.dark)+
        poly('-23,-43 -13,-49 -3,-43 -13,-37','#3b554e')+poly('1,-44 11,-50 21,-44 11,-38','#3b554e')+
        line('M-19,-43 -13,-46 -7,-43 M5,-44 11,-47 17,-44',accent,3)+
        '<path d="M-4,-21l8,4v-8l-8,-4z" fill="'+accent+'"/><path d="M0,-35v-20" stroke="#87aa9d" stroke-width="2"/><circle cx="0" cy="-56" r="2.5" fill="'+accent+'"/>';
    }
    if(kind==='cryo') return shadow+
      '<ellipse cx="0" cy="5" rx="21" ry="8" fill="none" stroke="#8de4e9" stroke-width="2" opacity=".35"/>'+
      cube(-17,-3,10,5,10,'#abcfd0','#557e87','#7aa6a5')+cube(16,-3,10,5,10,'#abcfd0','#557e87','#7aa6a5')+
      cube(0,-14,17,9,20,'#d7e9dc','#96b9ad','#5d8a8a')+
      poly('0,-59 11,-43 0,-30 -11,-43','#a7edf1','stroke="#d9ffff" stroke-width="1"')+
      poly('0,-59 0,-30 -11,-43','#70bfcf')+line('M-7,-43 0,-48 7,-43','#fff',2)+
      poly('9,-31 30,-21 30,-14 9,-23','#d8e7d3')+poly('30,-21 34,-19 34,-12 30,-14','#8de4e9')+
      '<circle cx="-24" cy="-15" r="3" fill="#b8faff"/><circle cx="23" cy="-15" r="3" fill="#b8faff"/>';
    return shadow+
      cube(-12,9,10,5,12,'#b6c69d','#516a58','#81946c')+cube(12,9,10,5,12,'#b6c69d','#516a58','#81946c')+
      cube(-10,-5,6,4,17,'#8da57b','#435c4e','#728764')+cube(10,-5,6,4,17,'#8da57b','#435c4e','#728764')+
      cube(0,-19,18,10,22,p.light,p.main,p.dark)+
      cube(-24,-16,9,6,19,p.light,p.main,p.dark)+cube(24,-17,10,7,20,p.light,p.main,p.dark)+
      cube(0,-43,10,6,11,p.light,p.main,p.dark)+
      poly('-8,-45 0,-41 8,-45 8,-40 0,-36 -8,-40','#243e39')+
      line('M-6,-43 0,-40 6,-43',p.accent,2.3)+
      '<path d="M-6,-27l6,3 6,-3v-5l-6,3 -6,-3z" fill="'+p.accent+'"/>';
  }

  function enemySprite(kind) {
    const shadow='<ellipse cx="0" cy="7" rx="27" ry="11" fill="#080f18" opacity=".42"/>';
    const legs=line('M-10,-8 -25,-14 -31,-2 M-12,-1 -27,2 -29,12 M10,-8 25,-14 31,-2 M12,-1 27,2 29,12','#7c4b45',4,'stroke-linecap="square"')+
      line('M-25,-14 -31,-2 M-27,2 -29,12 M25,-14 31,-2 M27,2 29,12','#d08b6c',1.4);
    if(kind==='spider') return shadow+
      line('M-10,-22 -27,-35 -36,-23 M-13,-16 -32,-20 -39,-5 M-13,-9 -30,-5 -34,10 M-8,-3 -18,8 -18,15 M10,-22 27,-35 36,-23 M13,-16 32,-20 39,-5 M13,-9 30,-5 34,10 M8,-3 18,8 18,15','#754c5b',4,'stroke-linejoin="bevel"')+
      line('M-27,-35 -36,-23 M-32,-20 -39,-5 M-30,-5 -34,10 M27,-35 36,-23 M32,-20 39,-5 M30,-5 34,10','#d5a0a6',1.4)+
      '<path d="M-18,-25Q-22,-44 0,-49Q22,-44 18,-25L11,-13H-11Z" fill="#a96970" stroke="#dea5a0"/>'+
      poly('0,-49 14,-40 0,-29 -14,-40','#d39a91')+line('M0,-45v12 M-9,-39l18,0','#edd6be',1.3)+
      '<path d="M-13,-17L0,-26 13,-17 10,-3 0,4 -10,-3Z" fill="#ba776b" stroke="#e3ad92"/><path d="M-8,-1l-4,8 M8,-1l4,8" stroke="#e4bc98" stroke-width="3"/><circle cx="-5" cy="-13" r="2.4" fill="#fff0c2"/><circle cx="5" cy="-13" r="2.4" fill="#fff0c2"/><circle cx="-9" cy="-17" r="1.5" fill="#fff0c2"/><circle cx="9" cy="-17" r="1.5" fill="#fff0c2"/>';
    if(kind==='volatile') return shadow+legs+
      '<path d="M-24,-20L-16,-41 0,-49 16,-41 24,-20 18,-5 0,3 -18,-5Z" fill="#884d43" stroke="#e49b6c" stroke-width="1.2"/>'+
      poly('0,-45 16,-36 19,-19 0,-7 -19,-19 -16,-36','#efad62')+poly('0,-45 16,-36 19,-19 0,-7','#c67747')+
      '<path d="M-13,-33l13,8 13,-8 M-16,-20l16,9 16,-9 M0,-44v34" fill="none" stroke="#71483b" stroke-width="3"/><path d="M0,-35l7,11 -7,9 -7,-9z" fill="#ffe3a1"/><circle cx="0" cy="-25" r="3" fill="#fff6ce"/>'+
      '<path d="M-9,-5l9,-5 9,5 -9,9z" fill="#af5f48"/><circle cx="-4" cy="-3" r="2" fill="#ffe9af"/><circle cx="4" cy="-3" r="2" fill="#ffe9af"/><path d="M-25,-25l-5,-4 M25,-25l5,-4" stroke="#d49b68" stroke-width="3"/>';
    if(kind==='leader') return shadow+legs+
      '<path d="M-28,-19L-23,-40 -12,-48 0,-43 12,-48 23,-40 28,-19 15,-4H-15Z" fill="#773d47" stroke="#d39279" stroke-width="1.2"/>'+
      poly('-23,-40 -12,-48 0,-43 12,-48 23,-40 0,-25','#bd7665')+poly('0,-25 23,-40 28,-19 15,-4 0,-10','#974d4e')+
      '<path d="M-14,-46l-6,-12 13,8 7,-15 7,15 13,-8 -6,12 -14,7Z" fill="#c7a168" stroke="#f1ca8e"/>'+
      '<path d="M-17,-30l17,9 17,-9 M-21,-20l21,11 21,-11" stroke="#e1b488" stroke-width="2.2" fill="none"/><path d="M-13,-10l13,-6 13,6 -4,11H-9Z" fill="#b86b55"/>'+
      '<path d="M-8,-6l5,2 M3,-4l5,-2" stroke="#ffe1a5" stroke-width="2.8"/><path d="M-29,-15l-8,4 4,9 M29,-15l8,4 -4,9" fill="none" stroke="#d1a67a" stroke-width="4"/>';
    if(kind==='psion') return shadow+
      '<g class="bc-float">'+line('M-9,-12 -15,-4 -12,3 M0,-11 2,-1 -3,7 M10,-12 17,-5 13,3','#b59bdd',3,'stroke-linecap="round"')+
      '<path d="M-21,-23Q-18,-46 0,-47Q18,-46 21,-23L11,-14H-11Z" fill="#8c6ba9" stroke="#c4a2cc" stroke-width="1.2"/>'+
      '<path d="M-21,-23Q0,-11 21,-23Q8,-32 -21,-23Z" fill="#d4b2d8"/><path d="M-8,-34l8,-7 8,7 -8,10z" fill="#f3d4d7"/><circle cx="0" cy="-33" r="3.5" fill="#5d457c"/>'+
      line('M-25,-22q-9,-8 0,-16 M25,-22q9,-8 0,-16','#cfacd6',1,'opacity=".5"')+'</g>';
    if(kind==='firefly') return shadow+legs+
      '<path d="M-2,-19Q-30,-45 -35,-19Q-29,-6 -9,-10Z" fill="#905951" stroke="#c57c66"/><path d="M2,-19Q30,-45 35,-19Q29,-6 9,-10Z" fill="#a65d50" stroke="#dd8c6c"/>'+
      '<path d="M0,-38L14,-27L12,-8 0,1 -12,-8 -14,-27Z" fill="#c96952" stroke="#e9a07c"/>'+
      poly('0,-38 14,-27 0,-18 -14,-27','#e5a075')+poly('0,-18 12,-8 0,1 -12,-8','#a34841')+
      '<path d="M-7,-29l7,4 7,-4" fill="none" stroke="#ffe4ae" stroke-width="3"/><path d="M-6,-39l-5,-9 M6,-39l5,-9" stroke="#dfa284" stroke-width="2"/>';
    if(kind==='scarab') return shadow+legs+
      '<path d="M-24,-13L-20,-34 0,-45 20,-34 24,-13 11,-3H-11Z" fill="#9c544a" stroke="#cf8f6d"/>'+
      poly('-20,-34 0,-45 20,-34 0,-23','#dc9270')+poly('0,-23 20,-34 24,-13 11,-3 0,-7','#b46350')+
      line('M-13,-33 0,-39 13,-33 M-16,-22 0,-14 16,-22','#f0ba8e',2)+
      '<path d="M-8,-4l8,5 8,-5v-7l-8,-4 -8,4z" fill="#c9785b"/><circle cx="-4" cy="-7" r="2" fill="#ffe7ad"/><circle cx="4" cy="-7" r="2" fill="#ffe7ad"/>';
    return shadow+legs+
      '<path d="M-6,-23L-14,-30 -10,-43 0,-51 9,-45 9,-36 3,-32" fill="none" stroke="#d28b6e" stroke-width="7" stroke-linejoin="bevel"/>'+
      poly('-5,-50 2,-60 8,-47','#f2b88a')+
      '<path d="M-17,-15L-12,-30 0,-36 12,-30 17,-15 9,-3H-9Z" fill="#b8614e" stroke="#da9a75"/>'+
      poly('-12,-30 0,-36 12,-30 0,-22','#e79b76')+
      '<path d="M-15,-14L-30,-17 -37,-10 -31,-5 -24,-9 -16,-5 M15,-14L30,-17 37,-10 31,-5 24,-9 16,-5" fill="#e29a73" stroke="#8e5449"/>'+
      '<path d="M-6,-15l6,3 6,-3v5l-6,4 -6,-4z" fill="#5b3336"/><circle cx="-4" cy="-13" r="2" fill="#ffe6a1"/><circle cx="4" cy="-13" r="2" fill="#ffe6a1"/>';
  }

  function bombSprite(){
    return '<ellipse cx="0" cy="8" rx="26" ry="11" fill="#07151d" opacity=".4"/>'+cube(0,3,24,12,9,'#728e91','#365463','#476874')+
      cube(0,-8,15,9,31,'#d2dbc7','#9ba99c','#657f7c')+
      '<path d="M-15,-25l15,8 15,-8v7l-15,8 -15,-8z" fill="#d7ae68"/><path d="M-15,-22l15,8 15,-8" fill="none" stroke="#3b5354" stroke-width="2"/>'+
      cube(0,-40,11,6,7,'#9abac0','#607f85','#668d96')+
      '<circle cx="0" cy="-49" r="4" fill="#d9fc98"/><circle class="bc-pulse" cx="0" cy="-49" r="8" fill="none" stroke="#d9fc98" opacity=".6"/>';
  }

  function sprite(kind,team){return `<g class="bc-sprite bc-sprite-${esc(kind)}">`+(kind==='bomb'?bombSprite():team==='enemy'?enemySprite(kind):playerSprite(kind,colors[team]||colors.player))+'</g>';}

  function podSprite(){
    return '<g class="bc-pod"><ellipse cy="8" rx="20" ry="8" fill="#0b222a" opacity=".4"/>'+cube(0,3,17,9,7,'#7a9c96','#3d6467','#4e7d76')+
      '<path d="M-12,-9L-8,-26 0,-31 8,-26 12,-9 0,-2Z" fill="#d8e4c5" stroke="#e4eacb"/>'+poly('0,-31 8,-26 12,-9 0,-2','#9fbea4')+
      '<path d="M-4,-24l4,-2 4,2v12l-4,2 -4,-2z" fill="#375c53"/><path d="M-2,-21l2,-1 2,1v6l-2,1 -2,-1z" fill="#dbfb97"/><path d="M-19,3l-5,3 M19,3l5,3" stroke="#cbeaab" stroke-width="2"/><circle class="bc-pulse" cy="-34" r="3" fill="#dafa9e"/></g>';
  }

  function buildingShield(){return '<g class="bc-building-shield" pointer-events="none"><path d="M-36,5V-29Q-32,-64 0,-69Q32,-64 36,-29V5L0,23Z" fill="#9fe4e5" fill-opacity=".08" stroke="#aaeaf0" stroke-width="1.2" stroke-dasharray="5 3"/><path d="M-36,-14L0,5 36,-14 M0,-69V23" fill="none" stroke="#bceef0" stroke-width=".7" stroke-opacity=".3"/><path d="M-6,-64l6,-3 6,3v6l-6,5 -6,-5z" fill="#21434d" stroke="#c2f4f4"/><path d="M-3,-60l2,2 4,-4" stroke="#cff8ed" fill="none" stroke-width="1.1"/></g>';}

  function tower(x,y,height,objective) {
    const top=objective?'#eedda8':'#e2dfc6',f=objective?'#b4a475':'#b4b59e',r=objective?'#8b895e':'#7d9388';
    let out=cube(x,y,18,9,height,top,f,r);
    for(let yy=height-10;yy>4;yy-=10){
      out+=`<path d="M${x-13},${y-yy-1}l5,2.5v4l-5,-2.5z M${x-6},${y-yy+2.5}l4,2v4l-4,-2z" fill="#fff0ab" opacity=".8"/>`;
      out+=`<path d="M${x+5},${y-yy+2.5}l5,-2.5v4l-5,2.5z" fill="#e3e6b5" opacity=".6"/>`;
    }
    out+=cube(x,y-height-1,10,5,4,'#a6b5a3','#7c8d80','#647b73');
    return out;
  }

  function tileObject(tile,x,y){
    const n=(x*11+y*7)%5;
    if(tile.type==='building'&&tile.hp>0) return (tile.hp>1?tower(-13,-3,31+(n%2)*8,tile.objective):'')+tower(tile.hp>1?12:0,8,42+(n%3)*5,tile.objective)+(tile.objective?'<path d="M19,-50v-17h14l-3,5 3,5H19" fill="#f7d992" stroke="#dac384"/>':'');
    if(tile.type==='mountain') return tile.hp>1?poly('-33,5 -24,-19 -8,-42 5,-31 18,-40 34,-4 9,16','#718979')+poly('-8,-42 5,-31 9,16 -24,-19','#8c9b81')+poly('5,-31 18,-40 34,-4 9,16','#516a60')+poly('-13,-31 -8,-42 5,-31 -2,-23','#adb6a0'):poly('-29,6 -21,-13 -7,-20 4,-9 18,-16 31,3 7,14','#6d8273')+line('M-7,-20 -2,-4 7,14 M18,-16 10,0 31,3','#99a68b',1.3);
    if(tile.type==='forest'){
      const tree=(xx,yy,s)=>`<g transform="translate(${xx} ${yy}) scale(${s})"><path d="M-2,0v-12h4V0" fill="#806f52"/>${poly('-12,-9 0,-36 12,-9','#445f4b')}${poly('0,-36 12,-9 0,-14','#2d4b42')}${poly('-9,-19 0,-40 9,-19','#658367')}</g>`;
      return tree(-16,0,.8)+tree(9,3,1)+tree(-1,13,.6);
    }
    if(tile.type==='chasm') return poly('0,-15 32,0 0,16 -32,0','#0a1b26')+line('M-31,0 -19,2 -10,10 0,14 20,3 30,0','#25434a',3);
    return '';
  }

  function tileSurface(t,x,y){
    const n=(x*17+y*29)%5;
    const grass=['#62775f','#657b62','#697e66','#5e745d','#6a7c63'];
    let fill=grass[n];
    if(t.type==='water')fill=['#244953','#234651','#274d55'][n%3];
    if(t.type==='sand')fill=['#a09776','#a89d7a','#9a9374'][n%3];
    if(t.type==='mountain')fill='#536b5c';
    if(t.type==='building')fill='#708273';
    if(t.type==='ice')fill='#8db9bc';
    if(t.type==='chasm')fill='#354f4e';
    let out=poly(diamond(0,0),fill,'stroke="#152e31" stroke-width="1.5" stroke-linejoin="round"');
    out+=line('M-41,0 0,20 41,0','#a5b395',.65,'opacity=".24"');
    if(t.type==='water')out+=line(`M-23,-3l12,5 9,-4 M4,7l9,4 12,-6 M2,-10l9,4 8,-3`,'#6a9f9f',1.2,'opacity=".42"');
    else if(t.type==='ice')out+=line('M-23,-2 -7,5 2,-2 19,5 M2,-2 -1,-13 M-7,5 -3,15','#d3e7db',1.2,'opacity=".8"');
    else if(t.type==='sand')out+=line('M-22,-3 -8,4 9,-3 M-9,10 2,6 20,10','#d2be8c',1,'opacity=".38"');
    else out+=`<path d="M${-22+n*3},${-3+n}l5,2.5 M${9+n},${3-n}l4,-2 M-3,-11l3,1.5" stroke="#bfd0a4" stroke-width="1" opacity=".18"/>`;
    if(t.acid)out+='<path d="M-25,1l12,-9 11,4 11,-2 17,8 -19,9 -11,-3 -11,2z" fill="#b0d972" opacity=".68"/><circle cx="-9" cy="0" r="2" fill="#e0f9a3"/>';
    return out;
  }

  function fire(x=0,y=0){return `<g transform="translate(${x} ${y})" pointer-events="none"><ellipse cx="0" cy="4" rx="19" ry="7" fill="#ef9448" opacity=".16"/><path d="M-12,1Q-18,-10 -7,-21Q-8,-11 -3,-13Q4,-20 2,-32Q22,-14 13,-3Q9,9 -3,8Q-10,7 -12,1Z" fill="#e87e46"/><path d="M-5,2Q-9,-6 -1,-14Q0,-6 5,-11Q12,1 3,5Z" fill="#ffcc70"/><path d="M-7,-23l-2,-5 M10,-26l2,-4" stroke="#f5b85a" stroke-width="2" opacity=".8"/></g>`;}
  function smoke(){return '<g pointer-events="none" opacity=".7"><ellipse cx="-8" cy="-4" rx="22" ry="12" fill="#71888a"/><circle cx="-13" cy="-17" r="14" fill="#9aa9a0"/><circle cx="9" cy="-22" r="17" fill="#a8b5a8"/><circle cx="-3" cy="-39" r="13" fill="#b6c0ad"/><path d="M-14,-40q-7,-9 2,-16" fill="none" stroke="#b9c7b3" stroke-width="3" opacity=".35"/></g>';}
  function badge(x,y,text,color,bg='#132b32'){
    const width=Math.max(24,String(text).length*9+12);
    return `<g transform="translate(${x} ${y})" pointer-events="none"><rect x="${-width/2}" y="-9" width="${width}" height="18" rx="5" fill="${bg}" stroke="${color}" stroke-width=".8"/><text text-anchor="middle" y="3.8" fill="${color}" font-family="system-ui,sans-serif" font-size="10" font-weight="800">${esc(text)}</text></g>`;
  }

  function unitLayer(u,selected,index,active) {
    const p=point(u.x,u.y), enemy=u.team==='enemy', color=enemy?'#ffb598':u.team==='neutral'?'#f2d491':'#d5f78e';
    let s=`<g class="bc-unit tile-hit ${selected?'bc-selected':''} ${u.acted?'bc-acted':''} ${active?'bc-active-unit':''} ${u.alpha?'bc-alpha':''}" data-x="${u.x}" data-y="${u.y}" data-unit-id="${esc(u.id)}" role="button" aria-label="${esc(u.name||u.kind)} 체력 ${u.hp}/${u.maxHp}${u.alpha?' 알파 강화형':''}${active?' 현재 행동 중':''}" transform="translate(${p.x} ${p.y})">`;
    s+=`<title>${esc(u.name||u.kind)} · HP ${u.hp}/${u.maxHp}${u.alpha?' · 알파 강화형':''}${u.pilot?' · 파일럿 등급 '+esc(u.pilot.rank??0):''}${u.acted?' · 행동 완료':''}${active?' · 현재 행동 중':''}</title>`;
    if(active)s+='<ellipse class="bc-active-ring" cx="0" cy="8" rx="38" ry="19" fill="#f2c181" fill-opacity=".15" stroke="#ffda9e" stroke-width="2.5"/><path d="M-42,5l8,-5 M42,5l-8,-5 M-7,31l7,4 7,-4" stroke="#ffdfaa" stroke-width="2" fill="none"/>';
    if(selected)s+='<ellipse class="bc-selection-pulse" cx="0" cy="8" rx="35" ry="16" fill="#d8fa8e" fill-opacity=".13" stroke="#d8fa8e" stroke-width="2"/><path d="M-38,7l7,-4 M38,7l-7,-4" stroke="#f0ffbd" stroke-width="2"/>';
    s+=`<g opacity="${u.acted ? 0.72 : 1}">${sprite(u.kind,u.team)}</g>`;
    if(u.alpha)s+='<g class="bc-alpha-armor" pointer-events="none"><path d="M-24,-24l-5,-12 11,-7 4,12z M24,-24l5,-12 -11,-7 -4,12z" fill="#cab987" stroke="#ffdda0" stroke-width="1"/><path d="M-22,-36l4,3 M22,-36l-4,3" stroke="#765047" stroke-width="2"/><path d="M-31,-55l8,-5 8,5 -8,8z" fill="#573d36" stroke="#f4d598"/><path d="M-27,-54l4,-4 4,4 M-27,-51l4,-4 4,4" stroke="#ffe2a3" stroke-width="1.1" fill="none"/></g>';
    if(u.frozen)s+='<path d="M-28,-18L-19,-49 0,-64 21,-48 28,-15 0,2Z" fill="#b5f0f0" fill-opacity=".4" stroke="#c4ffff" stroke-width="1.2"/><path d="M0,-64v66 M-19,-49L0,-25 21,-48 M-28,-18L0,-25 28,-15" stroke="#deffff" stroke-opacity=".5" fill="none"/>';
    if(u.shield)s+='<ellipse cx="0" cy="-24" rx="35" ry="38" fill="#acdfe1" fill-opacity=".07" stroke="#b1f5f5" stroke-width="1.5" stroke-dasharray="5 3"/>';
    if(u.fire)s+=`<g transform="translate(17 -4) scale(.68)">${fire()}</g>`;
    if(u.acid)s+='<path d="M-24,-3q12,9 23,3t22,0" stroke="#c2ea70" stroke-width="3" fill="none"/>';
    const count=Math.min(10,Math.max(1,u.maxHp)), pw=5,gap=2,total=count*(pw+gap)-gap;
    s+=`<g pointer-events="none" transform="translate(0 22)"><rect x="${-total/2-5}" y="-4" width="${total+10}" height="13" rx="5" fill="#0b2029" fill-opacity=".92"/>`;
    for(let i=0;i<count;i++)s+=`<rect x="${-total/2+i*(pw+gap)}" y="0" width="${pw}" height="4" rx="1" fill="${i<u.hp?color:'#39505a'}"/>`;
    s+='</g>';
    if(enemy)s+=badge(23,-51,String(u.order||index+1),'#ffc1a5','#633d36');
    else if(u.team==='player')s+=badge(-24,-49,String(index+1),selected?'#e2ffae':'#d6e1bf','#314940');
    if(u.pilot&&u.team==='player'){
      const rank=esc(String(u.pilot.rank??0).slice(0,3));
      s+=`<g class="bc-pilot-rank" pointer-events="none" transform="translate(24 -54)"><rect x="-11" y="-7" width="22" height="14" rx="4" fill="#203d40" stroke="#b9d6bc" stroke-width=".6"/><path d="M-7,1l3,-3 3,3" fill="none" stroke="#d3e9bd" stroke-width="1.2"/><text x="4" y="3" text-anchor="middle" font-family="ui-monospace,monospace" font-size="8" font-weight="700" fill="#d9eac9">${rank}</text></g>`;
    }
    if(u.acted&&u.team==='player')s+='<circle cx="24" cy="-36" r="7" fill="#23453d"/><path d="M20,-36l3,3 5,-6" stroke="#c5e8ac" fill="none" stroke-width="1.6"/>';
    s+='</g>';
    return s;
  }

  function pathOverlay(state,opts){
    let out='<g class="bc-threat-overlay" pointer-events="none">';
    if(opts.showThreats!==false) for(const th of opts.threats||[]){
      if(!inBoard(th.from))continue;
      const f=point(th.from.x,th.from.y), hover=opts.activeUnitId===th.unitId||(opts.hover&&opts.hover.x===th.from.x&&opts.hover.y===th.from.y);
      if(th.kind==='aura'){
        out+=`<g class="bc-aura-threat" transform="translate(${f.x+29} ${f.y-16})"><title>${esc(th.label||'방어 오라')}</title><circle r="8" fill="#49364d" stroke="#d5b7da" stroke-width="1"/><path d="M-4,-3l4,-2 4,2v5l-4,3 -4,-3z" fill="none" stroke="#ecd3e8" stroke-width="1.1"/></g>`;
        continue;
      }
      if(th.canceled){
        const reason=String(th.reason||'공격 취소');
        out+=`<g class="bc-canceled-threat" transform="translate(${f.x+29} ${f.y-16})"><title>${esc(reason)}</title><circle r="8" fill="#193a36" stroke="#a3c9af" stroke-width="1"/><path d="M-3,-3l6,6 M3,-3l-6,6" stroke="#c3e6cb" stroke-width="1.8" stroke-linecap="round"/></g>`;
        if(hover)out+=badge(f.x,f.y-78,reason.length>15?reason.slice(0,14)+'…':reason,'#c3e4c8','#28463e');
        continue;
      }
      for(const target of th.targets||[]){
        if(target.x<0||target.y<0||target.x>7||target.y>7)continue;
        const t=point(target.x,target.y),dx=t.x-f.x,dy=t.y-f.y,len=Math.hypot(dx,dy)||1;
        const sx=f.x+dx/len*24,sy=f.y-5+dy/len*24,tx=t.x-dx/len*10,ty=t.y-3-dy/len*10;
        out+=poly(diamond(t.x,t.y,W-4,H-3),'#e57555',`fill-opacity="${hover ? 0.18 : 0.07}" stroke="#f6a282" stroke-width="${hover ? 1.6 : 0.8}" stroke-opacity="${hover ? 0.85 : 0.42}"`);
        const artillery=th.kind==='artillery'||th.kind==='scarab'||th.kind==='ranged';
        const d=artillery?`M${sx},${sy}Q${(sx+tx)/2},${Math.min(sy,ty)-45} ${tx},${ty}`:`M${sx},${sy}L${tx},${ty}`;
        out+=line(d,'#f5a082',hover?2.5:1.6,`opacity="${hover ? 0.95 : 0.58}" stroke-dasharray="${artillery?'4 5':'none'}" marker-end="url(#bc-arrow)"`);
        if(target===(th.targets||[])[0]&&finite(th.damage)>0){
          const bx=sx+(tx-sx)*0.57,by=sy+(ty-sy)*0.57-(artillery?23:10);
          out+=`<g transform="translate(${bx} ${by})" opacity="${hover ? 1 : 0.85}"><rect x="-11" y="-8" width="22" height="16" rx="6" fill="#593a35" stroke="#e79c7d" stroke-width=".6"/><text y="3" fill="#ffd1b4" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="800">−${finite(th.damage)}</text></g>`;
        }
      }
    }
    return out+'</g>';
  }

  function hazardFloor(hazard){
    return `<g class="bc-hazard-floor" pointer-events="none">${poly(diamond(0,0,W-3,H-2),'url(#bc-hazard-hatch)','opacity=".7"')}${poly(diamond(0,0,W-3,H-2),'#e6b75b','fill-opacity=".06" stroke="#e8bc69" stroke-width="1.3" stroke-dasharray="4 3"')}</g>`;
  }

  function hazardOverlay(state,opts){
    const hazards=(Array.isArray(state.hazards)?state.hazards:[]).filter(inBoard);
    if(!hazards.length)return '';
    const names={airstrike:'공습',tide:'침수',storm:'폭풍'},hot=hazards.find(h=>opts.hover&&h.x===opts.hover.x&&h.y===opts.hover.y);
    const turn=Math.max(1,finite(state.turn));
    let out='<g class="bc-hazard-overlay" pointer-events="none">';
    for(const h of hazards){
      const p=point(h.x,h.y),focused=hot===h;
      out+=`<g class="bc-hazard bc-hazard-${esc(h.kind)}" transform="translate(${p.x+28} ${p.y+1})"><title>${esc(h.label||names[h.kind]||'환경 위험')} · ${turn}턴 종료 시 발동${h.damage?' · 피해 '+finite(h.damage):''}</title><circle r="8.5" fill="#4b3c26" stroke="#f0ca7e" stroke-width="${focused?1.7:1}"/>`;
      if(h.kind==='tide')out+='<path d="M-5,-2q2,-3 4,0t5,0 M-5,3q2,-3 4,0t5,0" fill="none" stroke="#f9d391" stroke-width="1.3"/>';
      else if(h.kind==='storm')out+='<path d="M1,-6l-5,7h4l-1,5 5,-8H0z" fill="#f9d391"/>';
      else out+='<path d="M0,-6v7 M-3,-2l3,4 3,-4 M-5,5h10" fill="none" stroke="#f9d391" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>';
      out+='</g>';
    }
    const danger=hot?(String.fromCharCode(65+hot.x)+(hot.y+1)+' '+(hot.label||names[hot.kind]||'환경 위험')):[...new Set(hazards.map(h=>names[h.kind]||h.label||'환경 위험'))].join(' · ');
    const text=`${danger} · ${turn}턴 종료 시 발동`,width=Math.min(530,Math.max(240,text.length*8+30));
    out+=`<g class="bc-hazard-timing" transform="translate(450 59)"><rect x="${-width/2}" y="-12" width="${width}" height="24" rx="6" fill="#302e23" fill-opacity=".9" stroke="#c7a45d" stroke-opacity=".4"/><text y="3.5" text-anchor="middle" fill="#efca84" font-family="system-ui,sans-serif" font-size="10" font-weight="650">${esc(text)}</text></g></g>`;
    return out;
  }

  function tacticalLinks(opts){
    let out='<g class="bc-tactical-links" pointer-events="none">';
    for(const link of opts.webLinks||[]){
      if(!inBoard(link.from)||!inBoard(link.to))continue;
      const f=point(link.from.x,link.from.y),t=point(link.to.x,link.to.y),mx=(f.x+t.x)/2,my=(f.y+t.y)/2-24;
      out+=`<g class="bc-web-link"><title>그물 속박 · 거미를 밀어내거나 제거하세요</title>${line(`M${f.x},${f.y-18}Q${mx},${my-8} ${t.x},${t.y-15}`,'#e4c4d2',1.6,'stroke-dasharray="3 3" opacity=".85"')}${line(`M${f.x-4},${f.y-12}Q${mx},${my+6} ${t.x+5},${t.y-8}`,'#d4b5d0',.8,'opacity=".55"')}<g transform="translate(${t.x} ${t.y-17})"><path d="M-21,-12l42,24 M-21,12l42,-24 M0,-25V25 M-23,0h46 M-12,-8L0,-16 12,-8v16L0,16 -12,8Z M-20,-13L0,-25 20,-13v26L0,25 -20,13Z" fill="none" stroke="#e4ced9" stroke-width=".9" stroke-opacity=".68"/></g></g>`;
    }
    const path=(opts.movePath||[]).filter(inBoard);
    if(path.length>1){
      const points=path.map(p=>point(p.x,p.y)),d=points.map((p,i)=>(i?'L':'M')+p.x+','+(p.y+8)).join('');
      out+=`<g class="bc-move-path">${line(d,'#112f35',5,'stroke-linejoin="round" stroke-linecap="round"')}${line(d,'#b5efdc',2.2,'stroke-dasharray="5 4" stroke-linejoin="round" marker-end="url(#bc-move-arrow)"')}`;
      points.slice(1,-1).forEach(p=>{out+=`<circle cx="${p.x}" cy="${p.y+8}" r="3" fill="#d2f4d9" stroke="#22463f" stroke-width="1"/>`;});
      out+='</g>';
    }
    return out+'</g>';
  }

  function activeOverlay(events){
    const cells=new Map();
    for(const event of events||[])if(inBoard(event))cells.set(key(event.x,event.y),event);
    let out='<g class="bc-active-event-overlay" pointer-events="none">';
    for(const event of cells.values()){
      const p=point(event.x,event.y),color=/heal|repair|pod|rank/i.test(event.type||'')?'#cceaa9':/shield|freeze|thaw/i.test(event.type||'')?'#b8e5ed':'#f3c395';
      out+=poly(diamond(p.x,p.y,W-2,H-1),color,'fill-opacity=".1" stroke="'+color+'" stroke-width="1.8" stroke-opacity=".85"');
    }
    return out+'</g>';
  }

  function previewOverlay(state,preview){
    if(!preview)return '';
    let out='<g class="bc-preview-layer" pointer-events="none">';
    const later=new Map((preview.units||[]).map(u=>[u.id,u]));
    for(const u of state.units||[]){
      if(u.hp<=0||u.x<0||u.y<0)continue;
      const n=later.get(u.id),p=point(u.x,u.y),d=finite(u.hp)-finite(n&&n.hp);
      if(!n||n.hp<=0){out+=`<path d="M${p.x-13},${p.y-15}l26,26 M${p.x+13},${p.y-15}l-26,26" stroke="#ffbb98" stroke-width="3"/>`+badge(p.x,p.y-71,'제거','#ffc29e','#643b35');continue;}
      if(n.x!==u.x||n.y!==u.y){
        const q=point(n.x,n.y);out+=line(`M${p.x},${p.y+9}L${q.x},${q.y+9}`,'#b4f0e3',2,'stroke-dasharray="4 3" marker-end="url(#bc-move-arrow)"');
        out+=`<g transform="translate(${q.x} ${q.y})" opacity=".44">${sprite(u.kind,u.team)}</g>`+poly(diamond(q.x,q.y,W-4,H-3),'none','stroke="#c8f8e2" stroke-width="2"');
      }
      if(d!==0)out+=badge(p.x,p.y-71,(d>0?'−':'+')+Math.abs(d),d>0?'#ffc29e':'#d9ff9f',d>0?'#643b35':'#355b42');
      else if(n.frozen&&!u.frozen)out+=badge(p.x,p.y-71,'빙결','#bceff5','#30566a');
      else if(n.fire&&!u.fire)out+=badge(p.x,p.y-71,'화염','#ffd19c','#784a33');
    }
    for(let i=0;i<64;i++){
      const a=state.tiles[i],b=preview.tiles&&preview.tiles[i];if(!a||!b)continue;
      if(a.type==='building'&&finite(a.hp)>finite(b.hp)){const p=point(i%8,Math.floor(i/8));out+=poly(diamond(p.x,p.y,W-2,H-1),'#ef8c65','fill-opacity=".22" stroke="#ffc498" stroke-width="2"')+badge(p.x,p.y-67,'전력 −'+(a.hp-(b.hp||0)),'#ffd5aa','#6c3e36');}
    }
    return out+'</g>';
  }

  function actionOverlay(opts){
    const marks=new Map();
    const scale=Math.max(1,Math.min(1.4,finite(opts.markerScale)||1));
    for(const [list,kind,label,color] of [
      [opts.moves,'move','이동','#b5f1df'],
      [opts.targets,'attack','공격','#ffc1a2'],
      [opts.deploymentTiles,'deploy','배치','#def6a6']
    ]) for(const tile of list||[]){
      if(!Number.isInteger(tile.x)||!Number.isInteger(tile.y)||tile.x<0||tile.x>7||tile.y<0||tile.y>7)continue;
      marks.set(key(tile.x,tile.y),{...tile,kind,label,color});
    }
    let out='<g class="bc-action-overlay">';
    for(const m of marks.values()){
      const p=point(m.x,m.y),hot=opts.hover&&opts.hover.x===m.x&&opts.hover.y===m.y;
      const label=String.fromCharCode(65+m.x)+(m.y+1)+' '+m.label;
      out+=`<g class="bc-action-target tile-hit bc-action-${m.kind}" data-x="${m.x}" data-y="${m.y}" role="button" tabindex="-1" aria-label="${label}" transform="translate(${p.x} ${p.y+8}) scale(${scale})"><title>${label}</title><circle class="bc-action-hit" data-x="${m.x}" data-y="${m.y}" r="15" fill="transparent" pointer-events="all"/><g pointer-events="none"><circle cy="1" r="10" fill="#071b24" opacity=".3"/><circle class="bc-action-disc" r="9" fill="${hot?'#294e50':'#15353d'}" fill-opacity=".94" stroke="${m.color}" stroke-width="${hot?1.8:1.2}"/>`;
      if(m.kind==='attack')out+=`<circle r="3" fill="none" stroke="${m.color}" stroke-width="1.1"/><path d="M0,-7v2 M0,5v2 M-7,0h2 M5,0h2" stroke="${m.color}" stroke-width="1.3"/>`;
      else if(m.kind==='deploy')out+=`<path d="M0,-5v8 M-3,0l3,3 3,-3 M-4,5h8" fill="none" stroke="${m.color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
      else out+=`<path d="M-3.5,1.5 0,-3 3.5,1.5 M0,-3v7" fill="none" stroke="${m.color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
      out+='</g></g>';
    }
    return out+'</g>';
  }

  function board(state,options){
    const o=options||{},tiles=state.tiles||[],units=(state.units||[]).filter(u=>u.hp>0&&u.x>=0&&u.y>=0&&u.x<8&&u.y<8);
    const moves=new Set((o.moves||[]).map(p=>key(p.x,p.y))),targets=new Set((o.targets||[]).map(p=>key(p.x,p.y))),deploy=new Set((o.deploymentTiles||[]).map(p=>key(p.x,p.y)));
    const spawns=new Map((state.spawn||[]).map(p=>[key(p.x,p.y),p]));
    const hazards=new Map((Array.isArray(state.hazards)?state.hazards:[]).filter(inBoard).map(p=>[key(p.x,p.y),p]));
    const order=Array.from({length:64},(_,i)=>({x:i%8,y:Math.floor(i/8)})).sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.x-b.x);
    const playerIndex=new Map((state.units||[]).filter(u=>u.team==='player').map((u,i)=>[u.id,i]));
    let out='<svg class="breach-board" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" preserveAspectRatio="xMidYMid meet" role="img" aria-label="8 곱하기 8 전술 전장" style="display:block;width:100%;height:auto;overflow:visible;user-select:none;touch-action:manipulation">';
    out+='<defs><radialGradient id="bc-aura"><stop stop-color="#739b81" stop-opacity=".13"/><stop offset="1" stop-color="#244550" stop-opacity="0"/></radialGradient><linearGradient id="bc-foundation" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#263f43"/><stop offset="1" stop-color="#102a34"/></linearGradient><marker id="bc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1,1L9,5L1,9" fill="none" stroke="#ffc1a3" stroke-width="1.7"/></marker><marker id="bc-move-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1,1L9,5L1,9" fill="none" stroke="#bbf5e7" stroke-width="1.8"/></marker><filter id="bc-ground-shadow" x="-30%" y="-40%" width="160%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs>';
    out+='<defs><pattern id="bc-hazard-hatch" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(26)"><path d="M0,0v11" stroke="#efbc60" stroke-width="3" stroke-opacity=".3"/></pattern></defs>';
    out+='<style>.breach-board .tile-hit,.breach-board .bc-action-hit{cursor:pointer}.breach-board .bc-float{animation:bc-float 3.6s ease-in-out infinite}.breach-board .bc-selection-pulse{animation:bc-ring 2.2s ease-in-out infinite}.breach-board .bc-pulse{animation:bc-ring 1.8s ease-in-out infinite}.breach-board .bc-active-ring{animation:bc-ring .8s ease-in-out infinite}.breach-board .bc-unit{transition:filter .16s}.breach-board .bc-unit:hover{filter:brightness(1.13)}.breach-board .bc-action-target:hover .bc-action-disc{fill:#335957;stroke-width:1.8}@keyframes bc-float{50%{transform:translateY(-3px)}}@keyframes bc-ring{50%{opacity:.5}}@media(prefers-reduced-motion:reduce){.breach-board .bc-float,.breach-board .bc-selection-pulse,.breach-board .bc-pulse,.breach-board .bc-active-ring{animation:none}}</style>';
    out+='<ellipse cx="450" cy="310" rx="415" ry="225" fill="url(#bc-aura)"/><ellipse cx="450" cy="428" rx="307" ry="60" fill="#020e16" opacity=".5" filter="url(#bc-ground-shadow)"/>';
    out+=poly('98,264 450,440 450,469 98,293','#1b343b')+poly('450,440 802,264 802,293 450,469','url(#bc-foundation)')+line('M98,288 450,464 802,288','#6b9384',1,'opacity=".22"');
    for(const {x,y}of order){
      const p=point(x,y),t=tiles[y*8+x]||{type:'ground'},k=key(x,y),unit=units.find(u=>u.x===x&&u.y===y),hot=o.hover&&o.hover.x===x&&o.hover.y===y;
      const details=(t.item==='pod'?' · 회수 포드':'')+(t.objective?' · 보호 시설':'')+(t.shield?' · 보호막':'')+(hazards.has(k)?' · '+esc(hazards.get(k).label||'환경 위험'):'');
      out+=`<g class="bc-tile tile-hit" data-x="${x}" data-y="${y}" role="button" tabindex="-1" aria-label="${String.fromCharCode(65+x)}${y+1} ${esc(terrainNames[t.type]||t.type)}${unit?' '+esc(unit.name):''}${details}" transform="translate(${p.x} ${p.y})"><title>${String.fromCharCode(65+x)}${y+1} · ${esc(terrainNames[t.type]||t.type)}${unit?' · '+esc(unit.name):''}${t.smoke?' · 연기':''}${t.fire?' · 화염':''}${details}</title>`;
      out+=tileSurface(t,x,y);
      if(hazards.has(k))out+=hazardFloor(hazards.get(k));
      if(t.objective&&finite(t.hp)>0)out+=poly(diamond(0,0,W-4,H-3),'none','class="bc-objective-base" stroke="#ecd396" stroke-width="1.3" stroke-opacity=".7"');
      if(t.item==='pod')out+=poly(diamond(0,0,W-6,H-4),'none','stroke="#cbecb5" stroke-width="1" stroke-dasharray="3 4" stroke-opacity=".7"');
      if(deploy.has(k))out+=poly(diamond(0,0,W-3,H-2),'#a2e8c4','fill-opacity=".09" stroke="#b2eec5" stroke-width="1" stroke-opacity=".4" stroke-dasharray="3 3"');
      if(moves.has(k))out+=poly(diamond(0,0,W-3,H-2),'#a2e8d8','fill-opacity=".12"')+'<circle cx="0" cy="0" r="3.3" fill="#b5f1dc" opacity=".8"/>';
      if(targets.has(k))out+=poly(diamond(0,0,W-5,H-3),'#ea9274','fill-opacity=".14" stroke="#ffc1a2" stroke-width="1.3" stroke-opacity=".7"');
      if(spawns.has(k))out+='<g pointer-events="none"><path d="M-30,-3l-10,3 10,5 M30,-3l10,3 -10,5 M-9,-13l9,-5 9,5 M-9,14l9,5 9,-5" fill="none" stroke="#f4a17e" stroke-width="2"/><path d="M-7,2l7,-7 7,7 M-7,8l7,-7 7,7" fill="none" stroke="#ffc198" stroke-width="2"/></g>';
      if(hot)out+=poly(diamond(0,0,W-1,H-1),'#e6f1c7','fill-opacity=".12" stroke="#ebf7ce" stroke-width="1.5"');
      out+='</g>';
    }
    // Objects are depth-sorted separately so the forward face of a tall object reads cleanly.
    for(const {x,y}of order){
      const p=point(x,y),t=tiles[y*8+x]||{type:'ground'};
      out+=`<g class="tile-hit" data-x="${x}" data-y="${y}" transform="translate(${p.x} ${p.y})">${tileObject(t,x,y)}${t.item==='pod'?podSprite():''}${t.type==='building'&&t.hp>0&&t.shield?buildingShield():''}</g>`;
      for(const u of units.filter(u=>u.x===x&&u.y===y))out+=unitLayer(u,u.id===o.selectedId,playerIndex.has(u.id)?playerIndex.get(u.id):Math.max(0,(u.order||1)-1),u.id===o.activeUnitId);
      if(t.fire&&!units.some(u=>u.x===x&&u.y===y&&u.fire))out+=`<g transform="translate(${p.x} ${p.y})">${fire()}</g>`;
      if(t.smoke)out+=`<g transform="translate(${p.x} ${p.y})">${smoke()}</g>`;
    }
    out+=pathOverlay(state,o)+tacticalLinks(o)+previewOverlay(state,o.previewState)+hazardOverlay(state,o)+activeOverlay(o.activeEvents);
    if(o.hover){const p=point(o.hover.x,o.hover.y);out+=`<g pointer-events="none">${poly(diamond(p.x,p.y,W-1,H-1),'none','stroke="#eff8dc" stroke-width="1.35" stroke-opacity=".8"')}</g>`;}
    // Compact command markers remain above tall scenery without covering whole tiles.
    out+=actionOverlay(o);
    out+='<g class="bc-coordinates" pointer-events="none" fill="#8ba99f" font-family="ui-monospace,monospace" font-size="11" font-weight="600" text-anchor="middle">';
    for(let i=0;i<8;i++){const a=point(i,7),b=point(7,i);out+=`<text x="${a.x-28}" y="${a.y+31}">${String.fromCharCode(65+i)}</text><text x="${b.x+28}" y="${b.y+31}">${i+1}</text>`;}
    out+='</g><g pointer-events="none" opacity=".5" stroke="#658779" stroke-width="1" fill="none"><path d="M72,120v-32h52 M776,88h52v32 M72,422v32h52 M776,454h52v-32"/><path d="M448,54h4 M450,52v4 M448,510h4 M450,508v4"/></g>';
    out+='<text x="450" y="512" fill="#769588" font-family="ui-monospace,monospace" font-size="9" letter-spacing="3" text-anchor="middle" opacity=".7">'+(state.phase==='deploy'?'DEPLOYMENT ZONE · 배치 준비':'TACTICAL FIELD · 구역 '+String(finite(state.missionIndex)+1).padStart(2,'0'))+'</text></svg>';
    return out;
  }

  function effects(events,options){
    const opts=options||{},duration=Math.max(180,Math.min(1800,finite(opts.duration)||650));
    const stagger=opts.stagger===0?0:Math.max(0,Math.min(150,finite(opts.stagger)||32));
    const reduced=!!opts.reducedMotion,labels=new Map(),labelRows=new Map();
    const source=(events||[]).filter(e=>e&&inBoard(e)).slice(0,64);
    let out=`<svg class="bc-effects${reduced?' bc-effects-reduced':''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true" pointer-events="none" style="display:block;width:100%;height:100%;overflow:visible;pointer-events:none;--bcfx-duration:${duration}ms">`;
    out+='<defs><marker id="bcfx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1,1L9,5L1,9" fill="none" stroke="#d0f1d6" stroke-width="1.8"/></marker></defs>';
    out+='<style>.bc-effects .bc-fx-impact{animation:bcfx-impact var(--bcfx-duration) ease-out both;transform-origin:0 0}.bc-effects .bc-fx-label{animation:bcfx-label var(--bcfx-duration) ease-out both}.bc-effects .bc-fx-trace{stroke-dasharray:1;stroke-dashoffset:0;animation:bcfx-trace var(--bcfx-duration) ease-out both}.bc-effects .bc-fx-flash{animation:bcfx-flash var(--bcfx-duration) ease-out both}.bc-effects .bc-fx-mover{animation:bcfx-move var(--bcfx-duration) ease-out both}.bc-effects .bc-fx-burst{animation:bcfx-burst var(--bcfx-duration) ease-out both;transform-origin:0 0}@keyframes bcfx-impact{0%{opacity:0;transform:scale(.35)}18%{opacity:1}100%{opacity:0;transform:scale(2.25)}}@keyframes bcfx-label{0%{opacity:0;transform:translateY(7px)}16%,62%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}@keyframes bcfx-trace{0%{opacity:0;stroke-dashoffset:1}18%{opacity:1}50%{opacity:1;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:0}}@keyframes bcfx-flash{0%{opacity:0}20%{opacity:.9}100%{opacity:0}}@keyframes bcfx-move{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}82%{opacity:.9;transform:translate(var(--bcfx-x),var(--bcfx-y))}100%{opacity:0;transform:translate(var(--bcfx-x),var(--bcfx-y))}}@keyframes bcfx-burst{0%{opacity:1;transform:scale(.5)}100%{opacity:0;transform:scale(1.9)}}.bc-effects-reduced [class*="bc-fx-"]{animation:none!important;opacity:.9!important;transform:none!important;stroke-dashoffset:0!important}@media(prefers-reduced-motion:reduce){.bc-effects [class*="bc-fx-"]{animation:none!important;opacity:.9!important;transform:none!important;stroke-dashoffset:0!important}.bc-effects .bc-fx-mover{display:none}}</style>';
    const impact=(p,color,delay,large=false)=>`<g transform="translate(${p.x} ${p.y-12})"><g class="bc-fx-impact" style="animation-delay:${delay}ms"><ellipse rx="${large?28:17}" ry="${large?16:9}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="${large?2.5:1.7}"/><ellipse rx="${large?14:7}" ry="${large?8:4}" fill="none" stroke="${color}" stroke-opacity=".65"/></g></g>`;
    const addLabel=(e,text,color,kind,delay)=>{
      if(!text)return;
      const id=key(e.x,e.y)+'|'+kind;
      if(labels.has(id)&&['damage','heal','grid'].includes(kind)){
        const l=labels.get(id);l.amount+=finite(e.amount);l.text=(kind==='grid'?'전력 −':kind==='heal'?'+':'−')+l.amount;return;
      }
      labels.set(id,{x:e.x,y:e.y,text,color,kind,amount:finite(e.amount),delay});
    };
    source.forEach((e,i)=>{
      const type=String(e.type||'').toLowerCase(),p=point(e.x,e.y),delay=Math.min(i,5)*stagger;
      const from=inBoard(e.from)?e.from:inBoard({x:e.fromX,y:e.fromY})?{x:e.fromX,y:e.fromY}:null;
      const isAttack=type==='attack'||type==='enemyattack',isMove=['push','pull','move','enemymove','deploy'].includes(type);
      const color=e.team==='enemy'?'#ffc1a0':e.team==='player'?'#d9f3ad':'#f0d39b';
      out+=`<g class="bc-effect-event bc-effect-${esc(type)}" data-event-type="${esc(type)}"><title>${esc(e.text||type)}</title>`;
      if(isAttack&&from){
        const f=point(from.x,from.y),u=opts.state?.units?.find(u=>u.id===e.unitId),kind=e.weapon||u?.kind||'',arc=['artillery','smoke','scarab'].includes(kind);
        const d=arc?`M${f.x},${f.y-25}Q${(f.x+p.x)/2},${Math.min(f.y,p.y)-110} ${p.x},${p.y-16}`:`M${f.x},${f.y-25}L${p.x},${p.y-16}`;
        out+=line(d,color,kind==='laser'?8:5,`class="bc-fx-trace" pathLength="1" stroke-opacity=".35" stroke-linecap="round" style="animation-delay:${delay}ms"`)+line(d,'#fff6d8',kind==='laser'?2.4:1.5,`class="bc-fx-trace" pathLength="1" stroke-linecap="round" style="animation-delay:${delay}ms"`)+impact(p,color,delay+60);
      }
      if(isMove&&from){
        const f=point(from.x,from.y),path=(Array.isArray(e.path)?e.path:[]).filter(inBoard),route=path.length>1?path.map(t=>point(t.x,t.y)):[f,p];
        const d=route.map((q,n)=>(n?'L':'M')+q.x+','+(q.y+6)).join('');
        out+=line(d,'#c0ead8',2.4,`class="bc-fx-trace" pathLength="1" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#bcfx-arrow)" style="animation-delay:${delay}ms"`);
        if(type==='push'||type==='pull'){
          out+=`<g transform="translate(${f.x} ${f.y+6})"><g class="bc-fx-mover" style="--bcfx-x:${p.x-f.x}px;--bcfx-y:${p.y-f.y}px;animation-delay:${delay}ms"><path d="M0,-6L9,0 0,6 -9,0Z" fill="#daf6d6" fill-opacity=".8" stroke="#f2ffe0"/></g></g>`;
          addLabel(e,type==='pull'?'당기기':'밀치기','#c4efd9',type,delay);
        }
      }
      if(['damage','hit','grid','terrain','collision'].includes(type)){
        out+=impact(p,type==='grid'?'#ffd096':'#ffc3a0',delay);
        if(type==='grid')addLabel(e,'전력 −'+finite(e.amount),'#ffce92','grid',delay);
        else if(finite(e.amount)>0)addLabel(e,'−'+finite(e.amount),'#ffd0af','damage',delay);
        else if(type==='collision')addLabel(e,'충돌','#ffcfb3','collision',delay);
        else if(type==='terrain')addLabel(e,/얼음|물/.test(e.text||'')?'지형 변화':'붕괴','#ebd7b6','terrain',delay);
      } else if(['repair','heal'].includes(type)){
        out+=impact(p,'#c9eea4',delay)+`<g transform="translate(${p.x} ${p.y-24})"><g class="bc-fx-flash" style="animation-delay:${delay}ms"><path d="M0,-11V11 M-11,0H11" stroke="#d9f6b5" stroke-width="3" stroke-linecap="round"/></g></g>`;
        addLabel(e,finite(e.amount)>0?'+'+finite(e.amount):'상태 해제','#d8f8b0','heal',delay);
      } else if(['death','kill','drown'].includes(type)){
        out+=`<g transform="translate(${p.x} ${p.y-16})"><g class="bc-fx-burst" style="animation-delay:${delay}ms"><path d="M-8,-4l-13,-12 M8,-4l13,-12 M-10,6l-17,7 M10,6l17,7 M0,-10V-27 M0,12v13" stroke="#f4cda5" stroke-width="2.2"/><path d="M-5,-5l10,10 M5,-5L-5,5" stroke="#ffe1bd" stroke-width="3"/></g></g>`;
        addLabel(e,e.team==='player'?'전투 불능':'제거',e.team==='player'?'#ffb9ac':'#f8d5b6','death',delay);
      } else if(type==='explosion'){
        out+=impact(p,'#ffd183',delay,true)+`<g transform="translate(${p.x} ${p.y-14})"><g class="bc-fx-burst" style="animation-delay:${delay}ms"><path d="M0,-31l5,18 16,-12 -9,18 24,3 -23,8 15,16 -22,-7 -6,25 -6,-25 -22,7 15,-16 -23,-8 24,-3 -9,-18 16,12Z" fill="#ffc989" fill-opacity=".2" stroke="#ffe0a5" stroke-width="1.4"/></g></g>`;
        addLabel(e,'폭발','#ffdb9d','explosion',delay);
      } else if(type==='environment'){
        const kind=e.kind||'airstrike';
        if(kind==='tide')out+=`<g transform="translate(${p.x} ${p.y})"><g class="bc-fx-flash" style="animation-delay:${delay}ms">${poly(diamond(0,0,W-2,H-1),'#93d7db','fill-opacity=".4" stroke="#c4eeec"')}${line('M-28,-3q9,-8 18,0t18,0 M-16,7q9,-8 18,0t18,0','#d6f7ed',2)}</g></g>`;
        else out+=`<g class="bc-fx-flash" style="animation-delay:${delay}ms">${line(kind==='storm'?`M${p.x+5},${p.y-92}l-17,34h18l-15,34`:`M${p.x+22},${p.y-100}L${p.x},${p.y-12}`,'#ffe0a0',kind==='storm'?3:5,'stroke-linecap="round"')}${impact(p,'#ffdb9c',delay,true)}</g>`;
        addLabel(e,({airstrike:'공습',storm:'폭풍',tide:'침수'})[kind]||'환경 위험','#f8d497','environment',delay);
      } else if(['pod','podlost','pilotrank'].includes(type)){
        const lost=type==='podlost';out+=impact(p,lost?'#eeb79d':'#d4f1ae',delay,true);
        addLabel(e,lost?'포드 파괴':type==='pilotrank'?'파일럿 승급':'포드 회수',lost?'#efbd9f':'#dafaaf',type,delay);
      } else if(['shield','armor','freeze','thaw','smoke','fire','acid','block','spawn','web','webbreak','cancel'].includes(type)){
        const labelsByType={shield:'보호막',armor:'장갑 방어',freeze:'빙결',thaw:'해동',smoke:'연막',fire:'화염',acid:'산성',block:'출현 차단',spawn:'출현',web:'속박',webbreak:'속박 해제',cancel:'공격 취소'};
        const tint=['shield','freeze','thaw'].includes(type)?'#bcecf1':['web','webbreak'].includes(type)?'#e7c7dc':['armor','block','cancel'].includes(type)?'#d2e7b7':type==='acid'?'#def59a':'#f7c49d';
        out+=impact(p,tint,delay,type==='spawn');addLabel(e,labelsByType[type],tint,type,delay);
      }
      out+='</g>';
    });
    for(const l of labels.values()){
      const p=point(l.x,l.y),id=key(l.x,l.y),row=labelRows.get(id)||0;if(row>3)continue;labelRows.set(id,row+1);
      const short=/^[+−]\d+$/.test(l.text),width=Math.max(short?30:40,l.text.length*(short?11:10)+15);
      out+=`<g transform="translate(${p.x} ${p.y-56-row*20})"><g class="bc-fx-label" style="animation-delay:${l.delay}ms"><rect x="${-width/2}" y="-12" width="${width}" height="23" rx="6" fill="#10282f" fill-opacity=".94" stroke="${l.color}" stroke-width=".6"/><text text-anchor="middle" y="4" fill="${l.color}" font-family="system-ui,sans-serif" font-size="${short?15:10}" font-weight="800">${esc(l.text)}</text></g></g>`;
    }
    return out+'</svg>';
  }

  function unitIcon(kind,team='player',size=48){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-43 -70 86 92" width="${finite(size)}" height="${finite(size)}" aria-hidden="true" style="overflow:visible;flex-shrink:0">${sprite(kind,team)}</svg>`;}
  const glyphs={
    move:'<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    attack:'<path d="m4 20 4-4m1-5 8-8 4 4-8 8m-7-3 6 6m-9-1 4 4"/>',
    repair:'<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z"/>',
    undo:'<path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12"/>',
    reset:'<path d="M4 9a8 8 0 1 1-1 7M4 3v6h6"/>',
    grid:'<path d="M4 21V9l5-3v15M9 12l6-3v12M15 5l5-2v18M2 21h20M6 11v2M6 16v2M12 14v2M17 8v2M17 13v2"/>',
    shield:'<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 11l3 3 5-6"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
    core:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M8 5l9 5v5"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4M12 17h.01"/>',
    volume:'<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    muted:'<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6M22 9l-6 6"/>',
    settings:'<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z"/><circle cx="12" cy="12" r="3"/>',
    arrow:'<path d="M4 12h16M14 6l6 6-6 6"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    play:'<path d="m7 4 14 8-14 8z"/>',
    download:'<path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/>',
    target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    skull:'<path d="M7 20v-4a7 7 0 1 1 10 0v4zM10 17v3M14 17v3"/><circle cx="8.5" cy="10.5" r="1"/><circle cx="15.5" cy="10.5" r="1"/>',
    chevron:'<path d="m8 5 7 7-7 7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    save:'<path d="M4 3h13l4 4v14H3V3zM7 3v6h9V3M7 21v-8h10v8"/>',
    flag:'<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    gear:'<path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 2 2v4l-3 1-3 2-1 2h-4l-1-2-3-2-3-1v-4l2-2-2-2V6l3-1z"/><circle cx="12" cy="12" r="3"/>',
    pilot:'<path d="M5 13V9a7 7 0 0 1 14 0v4l-3 4H8zM5 10h14M7 10v4h10v-4M8 20h8l4 3M8 20l-4 3M9 17v3M15 17v3"/>',
    route:'<circle cx="5" cy="18" r="3"/><circle cx="18" cy="5" r="3"/><path d="M8 18h8a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h7"/>',
    pod:'<path d="m8 3 4-2 4 2 3 13-7 5-7-5zM9 6l3-1 3 1v8l-3 2-3-2zM5 18l-3 3M19 18l3 3M8 23h8"/>',
    web:'<path d="M12 1v22M1 12h22M4 4l16 16M20 4 4 20M5 8l7-3 7 3v8l-7 3-7-3zM9 10l3-2 3 2v4l-3 2-3-2z"/>',
    fast:'<path d="m4 5 8 7-8 7zM13 5l8 7-8 7z"/>',
    zoom:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7M10 6v8M6 10h8"/>',
    export:'<path d="M12 16V2M7 7l5-5 5 5M5 12H3v9h18v-9h-2"/>',
    import:'<path d="M12 2v14M7 11l5 5 5-5M5 12H3v9h18v-9h-2"/>'
  };
  function icon(name,size=20){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${finite(size)}" height="${finite(size)}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;flex-shrink:0">${glyphs[name]||glyphs.target}</svg>`;}
  const api={board,unitIcon,icon,point,effects};
  root.BreachArt=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
