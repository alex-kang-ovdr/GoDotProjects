'use strict';
const GAME_DATA={
 version:'4.0.0',classification:'PROTOTYPE_NOT_GTA_ORIGINAL_DATA',
 player:{hp:100,armor:50,run:4.2,sprint:6.5,aim:2.4,jump:6.0,gravity:20,radius:.35},
 weapons:[
  {id:'pistol',name:'SERVICE 9',ko:'권총',cap:12,reserve:120,damage:28,rpm:320,reload:1.6,spread:.007,range:85,pellets:1,auto:false,kick:.016},
  {id:'smg',name:'VECTOR S',ko:'기관단총',cap:30,reserve:240,damage:15,rpm:780,reload:2.0,spread:.020,range:75,pellets:1,auto:true,kick:.010},
  {id:'rifle',name:'PATROL AR',ko:'돌격소총',cap:30,reserve:210,damage:24,rpm:560,reload:2.2,spread:.009,range:140,pellets:1,auto:true,kick:.014},
  {id:'shotgun',name:'BREACH 12',ko:'산탄총',cap:6,reserve:60,damage:12,rpm:85,reload:2.6,spread:.065,range:45,pellets:8,auto:false,kick:.045},
  {id:'marksman',name:'SCOUT M',ko:'정밀소총',cap:8,reserve:64,damage:75,rpm:70,reload:2.4,spread:.002,range:220,pellets:1,auto:false,kick:.04}
 ],
 vehicles:{coupe:{maxSpeed:35,accel:12,brake:22,steer:1.9,hp:240},sedan:{maxSpeed:27,accel:8,brake:19,steer:1.7,hp:280},police:{maxSpeed:32,accel:11,brake:23,steer:1.9,hp:260},van:{maxSpeed:23,accel:7,brake:17,steer:1.5,hp:330}},
 garage:[-108,0,104],spawn:[-104,0,88],target:[104,0,-120],roads:[-144,-72,0,72,144],worldLimit:178,
 mission:{reward:750,name:'항만 차량 회수'},
};
window.GAME_DATA=GAME_DATA;
