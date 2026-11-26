#!/usr/bin/env node
/**
 * Generates forge/Templates/ftl/data/standalone_data.json — a 100% clean-room,
 * self-contained data pack so the FTL Godot 4.7.2 project runs completely
 * standalone (10 playable cruisers, 13 enemy/boss ships, 28 weapons, 9 drones,
 * 19 augments, 10 layouts, 11 sectors, 10 rich multi-choice events) with ZERO
 * dependency on ftl.dat.vanilla.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });

function mkLayout(name, rooms, airlockRoomIds, mounts, rect, hullStyle) {
  const doors = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.x + a.w === b.x || b.x + b.w === a.x) {
        const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
        if (y1 > y0) {
          doors.push({ x: a.x + a.w === b.x ? b.x : a.x, y: y0, room_a: a.id, room_b: b.id, vertical: true });
        }
      }
      if (a.y + a.h === b.y || b.y + b.h === a.y) {
        const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
        if (x1 > x0) {
          doors.push({ x: x0, y: a.y + a.h === b.y ? b.y : a.y, room_a: a.id, room_b: b.id, vertical: false });
        }
      }
    }
  }
  for (const rid of airlockRoomIds) {
    const r = rooms.find(x => x.id === rid);
    if (r) doors.push({ x: r.x, y: r.y, room_a: r.id, room_b: -1, vertical: true });
  }
  return {
    name, hull_style: hullStyle, x_offset: 0, y_offset: 0, vertical: 0, horizontal: 0,
    ellipse: { rx: Math.round(rect[2] * 0.56), ry: Math.round(rect[3] * 0.58), ox: 0, oy: 0 },
    rooms, doors, img_rect: rect, floor_offset: [0, 0], cloak_offset: [0, 0],
    weapon_mounts: mounts.map(([x, y, slide]) => ({ x, y, rotate: true, mirror: slide === 'up', slide })),
  };
}

const layouts = {
  kestral: mkLayout('kestral', [
    {id:0,x:14,y:2,w:1,h:2},{id:1,x:12,y:2,w:2,h:2},{id:2,x:10,y:2,w:2,h:1},{id:3,x:10,y:3,w:2,h:1},
    {id:4,x:8,y:1,w:2,h:2},{id:5,x:8,y:3,w:2,h:2},{id:6,x:6,y:0,w:2,h:1},{id:7,x:6,y:1,w:2,h:2},
    {id:8,x:6,y:3,w:2,h:2},{id:9,x:6,y:5,w:2,h:1},{id:10,x:4,y:2,w:2,h:2},{id:11,x:3,y:1,w:2,h:1},
    {id:12,x:3,y:4,w:2,h:1},{id:13,x:1,y:1,w:2,h:1},{id:14,x:1,y:2,w:2,h:2},{id:15,x:1,y:4,w:2,h:1},
    {id:16,x:0,y:2,w:1,h:2}
  ], [16, 6, 9], [[540,155,'up'],[540,262,'down'],[390,122,'up'],[390,294,'down']], [-59,-103,652,418], 'kestrel'),
  engi_torus: mkLayout('engi_torus', [
    {id:0,x:8,y:2,w:1,h:2},{id:1,x:6,y:1,w:2,h:2},{id:2,x:6,y:3,w:2,h:2},{id:3,x:4,y:0,w:2,h:2},
    {id:4,x:4,y:4,w:2,h:2},{id:5,x:2,y:0,w:2,h:2},{id:6,x:2,y:4,w:2,h:2},{id:7,x:0,y:1,w:2,h:2},
    {id:8,x:0,y:3,w:2,h:2},{id:9,x:2,y:2,w:2,h:2},{id:10,x:4,y:2,w:2,h:2}
  ], [7, 8], [[340,70,'up'],[340,210,'down'],[240,40,'up']], [-45,-50,430,310], 'engi'),
  fed_osprey: mkLayout('fed_osprey', [
    {id:0,x:12,y:2,w:1,h:2},{id:1,x:10,y:2,w:2,h:2},{id:2,x:8,y:2,w:2,h:2},{id:3,x:6,y:1,w:2,h:2},
    {id:4,x:6,y:3,w:2,h:2},{id:5,x:4,y:1,w:2,h:2},{id:6,x:4,y:3,w:2,h:2},{id:7,x:2,y:0,w:2,h:2},
    {id:8,x:2,y:2,w:2,h:2},{id:9,x:2,y:4,w:2,h:2},{id:10,x:0,y:1,w:2,h:2},{id:11,x:0,y:3,w:2,h:2}
  ], [10, 11], [[430,85,'up'],[430,195,'down'],[310,60,'up'],[310,220,'down']], [-50,-60,550,330], 'fed'),
  zoltan_adj: mkLayout('zoltan_adj', [
    {id:0,x:10,y:2,w:1,h:2},{id:1,x:8,y:1,w:2,h:2},{id:2,x:8,y:3,w:2,h:2},{id:3,x:6,y:1,w:2,h:2},
    {id:4,x:6,y:3,w:2,h:2},{id:5,x:4,y:0,w:2,h:2},{id:6,x:4,y:2,w:2,h:2},{id:7,x:4,y:4,w:2,h:2},
    {id:8,x:2,y:1,w:2,h:2},{id:9,x:2,y:3,w:2,h:2},{id:10,x:0,y:2,w:2,h:2}
  ], [10, 5, 7], [[385,80,'up'],[385,195,'down'],[270,50,'up'],[270,225,'down']], [-45,-55,490,320], 'zoltan'),
  mantis_gila: mkLayout('mantis_gila', [
    {id:0,x:10,y:2,w:1,h:2},{id:1,x:8,y:1,w:2,h:2},{id:2,x:8,y:3,w:2,h:2},{id:3,x:6,y:0,w:2,h:2},
    {id:4,x:6,y:2,w:2,h:2},{id:5,x:6,y:4,w:2,h:2},{id:6,x:4,y:1,w:2,h:2},{id:7,x:4,y:3,w:2,h:2},
    {id:8,x:2,y:1,w:2,h:2},{id:9,x:2,y:3,w:2,h:2},{id:10,x:0,y:2,w:2,h:2}
  ], [10, 3, 5], [[395,70,'up'],[395,205,'down'],[290,45,'up']], [-45,-55,495,320], 'mantis'),
  stealth_nes: mkLayout('stealth_nes', [
    {id:0,x:10,y:2,w:1,h:2},{id:1,x:8,y:2,w:2,h:2},{id:2,x:6,y:1,w:2,h:2},{id:3,x:6,y:3,w:2,h:2},
    {id:4,x:4,y:1,w:2,h:2},{id:5,x:4,y:3,w:2,h:2},{id:6,x:2,y:0,w:2,h:2},{id:7,x:2,y:2,w:2,h:2},
    {id:8,x:2,y:4,w:2,h:2},{id:9,x:0,y:2,w:2,h:2}
  ], [9, 6, 8], [[380,85,'up'],[380,190,'down'],[265,55,'up']], [-45,-55,485,310], 'stealth'),
  lanius_kruos: mkLayout('lanius_kruos', [
    {id:0,x:10,y:2,w:1,h:2},{id:1,x:8,y:1,w:2,h:2},{id:2,x:8,y:3,w:2,h:2},{id:3,x:6,y:1,w:2,h:2},
    {id:4,x:6,y:3,w:2,h:2},{id:5,x:4,y:0,w:2,h:2},{id:6,x:4,y:2,w:2,h:2},{id:7,x:4,y:4,w:2,h:2},
    {id:8,x:2,y:1,w:2,h:2},{id:9,x:2,y:3,w:2,h:2},{id:10,x:0,y:2,w:2,h:2}
  ], [10], [[390,75,'up'],[390,200,'down'],[280,50,'up'],[280,225,'down']], [-45,-55,490,320], 'lanius'),
  rebel_fighter: mkLayout('rebel_fighter', [
    {id:0,x:6,y:1,w:2,h:2},{id:1,x:4,y:0,w:2,h:2},{id:2,x:4,y:2,w:2,h:2},{id:3,x:2,y:0,w:2,h:2},
    {id:4,x:2,y:2,w:2,h:2},{id:5,x:0,y:1,w:2,h:2}
  ], [5], [[250,45,'up'],[250,155,'down'],[180,25,'up']], [-35,-45,350,240], 'rebel'),
  auto_scout: mkLayout('auto_scout', [
    {id:0,x:4,y:1,w:2,h:2},{id:1,x:2,y:0,w:2,h:2},{id:2,x:2,y:2,w:2,h:2},{id:3,x:0,y:1,w:2,h:2}
  ], [], [[190,45,'up'],[190,145,'down']], [-30,-40,275,220], 'auto'),
  boss_flagship: mkLayout('boss_flagship', [
    {id:0,x:10,y:2,w:2,h:2},{id:1,x:8,y:1,w:2,h:2},{id:2,x:8,y:3,w:2,h:2},{id:3,x:6,y:0,w:2,h:2},
    {id:4,x:6,y:2,w:2,h:2},{id:5,x:6,y:4,w:2,h:2},{id:6,x:4,y:1,w:2,h:2},{id:7,x:4,y:3,w:2,h:2},
    {id:8,x:2,y:0,w:2,h:2},{id:9,x:2,y:2,w:2,h:2},{id:10,x:2,y:4,w:2,h:2},{id:11,x:0,y:2,w:2,h:2}
  ], [11], [[400,65,'up'],[400,210,'down'],[300,35,'up'],[300,240,'down']], [-45,-55,510,330], 'boss'),
};

const mkW = (id, type, title, short, desc, dmg, shots, cd, pwr, cost, rarity, extra = {}) => ({
  id, type, title, short, desc, damage: dmg, sysDamage: 0, persDamage: 0, ion: 0, shots, sp: 0,
  fireChance: 0, breachChance: 0, stunChance: 0, missiles: 0, cooldown: cd, power: pwr, cost, rarity,
  speed: 60, length: type === 'BEAM' ? 85 : 0, radius: 0, boostType: '', boostAmount: 0, boostCount: 0, chargeLevels: 1,
  image: 'laser_light1', weaponArt: 'laser_burst_1', color: [1.0, 0.28, 0.22],
  launchSounds: [type === 'BEAM' ? 'beam2' : (type === 'MISSILES' ? 'smallMissile1' : 'lightLaser1')],
  hitShieldSounds: ['hitShield1'], hitShipSounds: ['hitHull2'], missSounds: ['miss'], ...extra,
});

const weapons = {
  LASER_BURST_1: mkW('LASER_BURST_1','LASER','Dual Lasers','Dual Lasers','Efficient 2-shot laser.',1,2,10,1,45,0,{fireChance:1}),
  LASER_BURST_2: mkW('LASER_BURST_2','LASER','Burst Laser Mark II','Burst Laser II','Fires 3 lasers dealing 1 damage each.',1,3,12,2,80,2,{fireChance:1}),
  LASER_BURST_3: mkW('LASER_BURST_3','LASER','Burst Laser Mark III','Burst Laser III','Fires a 5-laser volley.',1,5,19,4,95,4),
  LASER_HEAVY_1: mkW('LASER_HEAVY_1','LASER','Heavy Laser Mark I','Heavy Laser I','High-impact 2-damage laser with fire & breach chance.',2,1,9,1,50,1,{fireChance:3,breachChance:3,color:[1.0,0.5,0.18]}),
  LASER_HEAVY_2: mkW('LASER_HEAVY_2','LASER','Heavy Laser Mark II','Heavy Laser II','Fires 2 heavy 2-damage bolts.',2,2,13,3,65,3,{fireChance:3,breachChance:3,color:[1.0,0.5,0.18]}),
  LASER_CHAINGUN: mkW('LASER_CHAINGUN','LASER','Chain Laser','Chain Laser','Cooldown drops by 3s after each shot (up to 3x).',1,2,16,2,65,2,{boostType:'cooldown',boostAmount:3,boostCount:3,color:[1.0,0.35,0.55]}),
  LASER_CHAINGUN_2: mkW('LASER_CHAINGUN_2','LASER','Chain Vulcan','Chain Vulcan','Spools up to fire every 1.1 seconds!',1,1,11.1,4,95,4,{boostType:'cooldown',boostAmount:2,boostCount:5,color:[1.0,0.3,0.6]}),
  LASER_CHARGEGUN: mkW('LASER_CHARGEGUN','LASER','Charge Laser Mark I','Charge Laser','Charges up to 2 shots.',1,1,6,2,55,2,{chargeLevels:2,color:[1.0,0.75,0.25]}),
  LASER_CHARGEGUN_2: mkW('LASER_CHARGEGUN_2','LASER','Charge Laser Mark II','Charge Laser II','Charges up to 4 shots.',1,1,5,3,70,3,{chargeLevels:4,color:[1.0,0.75,0.25]}),
  SHOTGUN: mkW('SHOTGUN','BURST','Flak Gun Mark I','Flak I','Fires 3 debris shards across a 42px scatter zone.',1,3,10,2,65,1,{radius:42,speed:42,color:[1.0,0.68,0.28],launchSounds:['flak']}),
  SHOTGUN_2: mkW('SHOTGUN_2','BURST','Flak Gun Mark II','Flak II','Fires 7 debris shards across a 65px scatter zone.',1,7,21,3,80,3,{radius:65,speed:40,color:[1.0,0.68,0.28],launchSounds:['flak']}),
  MISSILES_1: mkW('MISSILES_1','MISSILES','Leto Missile','Leto','Fast 1-damage shield-piercing missile.',1,1,9,1,25,1,{sp:5,missiles:1,fireChance:1,breachChance:1,speed:38,color:[1.0,0.72,0.2]}),
  MISSILES_2_PLAYER: mkW('MISSILES_2_PLAYER','MISSILES','Artemis Missile','Artemis','Pierces all shields for 2 damage.',2,1,11,1,38,0,{sp:5,missiles:1,fireChance:1,breachChance:1,speed:35,color:[1.0,0.72,0.2]}),
  MISSILES_3: mkW('MISSILES_3','MISSILES','Hermes Missile','Hermes','Heavy 3-damage missile.',3,1,14,3,45,2,{sp:5,missiles:1,fireChance:3,breachChance:2,speed:34,color:[1.0,0.65,0.18]}),
  MISSILES_BREACH: mkW('MISSILES_BREACH','MISSILES','Breach Missile','Breach Missile','Massive 4-damage missile with high breach chance.',4,1,22,3,65,3,{sp:5,missiles:1,fireChance:3,breachChance:8,speed:32,color:[1.0,0.45,0.15]}),
  BEAM_1: mkW('BEAM_1','BEAM','Mini Beam','Mini Beam','Fast 1-power beam slicing 1 damage per room.',1,1,12,1,35,0,{length:55,fireChance:1,color:[1.0,0.22,0.18]}),
  BEAM_LONG: mkW('BEAM_LONG','BEAM','Pike Beam','Pike Beam','Long 145px beam slicing many rooms.',1,1,16,2,55,1,{length:145,color:[1.0,0.32,0.18]}),
  BEAM_2: mkW('BEAM_2','BEAM','Halberd Beam','Halberd Beam','Powerful 2-damage beam that cuts through 1 shield.',2,1,17,3,65,2,{length:90,fireChance:1,color:[1.0,0.2,0.15]}),
  BEAM_3: mkW('BEAM_3','BEAM','Glaive Beam','Glaive Beam','Devastating 3-damage beam!',3,1,25,4,95,4,{length:85,color:[1.0,0.15,0.25]}),
  BEAM_FIRE: mkW('BEAM_FIRE','BEAM','Fire Beam','Fire Beam','Ignites rooms across the enemy hull.',0,1,20,2,50,2,{length:120,fireChance:9,color:[1.0,0.58,0.1]}),
  BEAM_BIO: mkW('BEAM_BIO','BEAM','Anti-Bio Beam','Anti-Bio Beam','Harmless to hull, lethal to enemy crew.',0,1,16,2,50,2,{persDamage:4,length:110,color:[0.72,0.28,1.0]}),
  ION_1: mkW('ION_1','LASER','Ion Blast','Ion Blast','Deals 1 ion damage every 8 seconds.',0,1,8,1,30,1,{ion:1,stunChance:1,speed:36,color:[0.35,0.88,1.0],launchSounds:['ionShoot1'],hitShieldSounds:['ionHit1'],hitShipSounds:['ionHit1']}),
  ION_4: mkW('ION_4','LASER','Ion Blast Mark II','Ion Blast II','Rapid-fire 1-ion cannon (4s cooldown).',0,1,4,3,70,3,{ion:1,stunChance:1,speed:38,color:[0.35,0.88,1.0],launchSounds:['ionShoot1'],hitShieldSounds:['ionHit1'],hitShipSounds:['ionHit1']}),
  BOMB_1: mkW('BOMB_1','BOMB','Small Bomb','Small Bomb','Teleports past shields for 2 system & crew damage.',0,1,13,1,45,1,{sysDamage:2,persDamage:2,missiles:1,fireChance:1,color:[1.0,0.5,0.2]}),
  BOMB_FIRE: mkW('BOMB_FIRE','BOMB','Fire Bomb','Fire Bomb','Teleports an incendiary bomb into any room.',0,1,15,2,50,2,{persDamage:2,missiles:1,fireChance:10,color:[1.0,0.6,0.12]}),
  BOMB_ION: mkW('BOMB_ION','BOMB','Ion Bomb','Ion Bomb','Deals massive 4 ion damage past shields.',0,1,22,1,55,2,{ion:4,missiles:1,stunChance:3,color:[0.4,0.85,1.0]}),
  CRYSTAL_BURST_1: mkW('CRYSTAL_BURST_1','LASER','Crystal Burst Mark I','Crystal Burst','Fires 2 shards that pierce 1 shield layer.',1,2,15,2,60,3,{sp:1,breachChance:2,color:[0.45,0.92,1.0]}),
  CRYSTAL_HEAVY_1: mkW('CRYSTAL_HEAVY_1','LASER','Heavy Crystal Mark I','Heavy Crystal','Pierces 1 shield for 2 damage.',2,1,13,1,55,3,{sp:1,breachChance:3,color:[0.45,0.92,1.0]}),
  LASER_HULL_1: mkW('LASER_HULL_1','LASER','Hull Smasher Laser I','Hull Laser I','Deals 2x hull damage to empty (systemless) rooms!',1,2,14,2,55,2,{breachChance:2,hullBonus:true,color:[1.0,0.42,0.18]}),
  BEAM_HULL: mkW('BEAM_HULL','BEAM','Hull Beam','Hull Beam','Deals 2x damage to empty rooms along a 120px sweep!',1,1,14,2,70,2,{length:120,hullBonus:true,color:[1.0,0.62,0.12]}),
  MISSILES_HULL: mkW('MISSILES_HULL','MISSILES','Hull Missile','Hull Missile','Pierces shields and deals 2x damage to empty rooms!',2,1,17,2,65,2,{sp:5,missiles:1,breachChance:3,hullBonus:true,speed:35,color:[1.0,0.55,0.15]}),
  BOMB_BREACH_2: mkW('BOMB_BREACH_2','BOMB','Breach Bomb Mark II','Breach II','Teleports a devastating hull-breaching bomb (3 sys dmg).',0,1,17,2,60,2,{sysDamage:3,persDamage:3,missiles:1,breachChance:10,color:[1.0,0.35,0.22]}),
};

const drones = {
  COMBAT_1: {id:'COMBAT_1',type:'COMBAT',title:'Combat Drone Mark I',short:'Combat I',desc:'Orbits enemy ship firing lasers.',power:2,cooldown:1000,speed:15,cost:50,rarity:1,droneImage:'drone_combat',weaponBlueprint:'LASER_BURST_1'},
  COMBAT_BEAM: {id:'COMBAT_BEAM',type:'COMBAT',title:'Beam Drone Mark I',short:'Beam Drone',desc:'Orbits enemy ship slicing with a mini beam.',power:2,cooldown:1000,speed:14,cost:50,rarity:2,droneImage:'drone_beam',weaponBlueprint:'BEAM_1'},
  DEFENSE_1: {id:'DEFENSE_1',type:'DEFENSE',title:'Defense Drone Mark I',short:'Defense I',desc:'Shoots down incoming missiles.',power:2,cooldown:1000,speed:6,cost:50,rarity:1,droneImage:'drone_defense',weaponBlueprint:''},
  DEFENSE_2: {id:'DEFENSE_2',type:'DEFENSE',title:'Defense Drone Mark II',short:'Defense II',desc:'Shoots down missiles, lasers, flak, and ion.',power:3,cooldown:1000,speed:8,cost:70,rarity:3,droneImage:'drone_defense2',weaponBlueprint:''},
  DRONE_SHIELD: {id:'DRONE_SHIELD',type:'SHIELD',title:'Shield Overcharger',short:'Shield+',desc:'Periodically adds +1 Super-Shield layer.',power:2,cooldown:1000,speed:6,cost:60,rarity:3,droneImage:'drone_shield',weaponBlueprint:''},
  BOARDER: {id:'BOARDER',type:'BOARDER',title:'Boarding Drone',short:'Boarder',desc:'Breaches enemy hull and deploys a combat drone.',power:3,cooldown:1000,speed:18,cost:70,rarity:3,droneImage:'drone_boarder',weaponBlueprint:''},
  BATTLE: {id:'BATTLE',type:'BATTLE',title:'Anti-Personnel Drone',short:'Anti-Pers',desc:'Defends your ship against enemy boarders.',power:2,cooldown:1000,speed:10,cost:35,rarity:2,droneImage:'drone_anti',weaponBlueprint:''},
  REPAIR: {id:'REPAIR',type:'REPAIR',title:'System Repair Drone',short:'Sys Repair',desc:'Automatically repairs damaged systems.',power:1,cooldown:1000,speed:10,cost:30,rarity:1,droneImage:'drone_repair',weaponBlueprint:''},
  SHIP_REPAIR: {id:'SHIP_REPAIR',type:'SHIP_REPAIR',title:'Hull Repair Drone',short:'Hull Repair',desc:'Repairs damaged hull plating.',power:2,cooldown:1000,speed:10,cost:85,rarity:3,droneImage:'drone_shiprepair',weaponBlueprint:''},
};

const augments = {
  ENERGY_SHIELD: {id:'ENERGY_SHIELD',title:'Zoltan Shield',desc:'Starts every fight with a 5-point Super-Shield blocking weapons & boarding.',cost:100,rarity:0,value:0,stackable:false},
  WEAPON_PREIGNITE: {id:'WEAPON_PREIGNITE',title:'Weapon Pre-Igniter',desc:'Weapons start fully charged at the start of every jump.',cost:120,rarity:4,value:0,stackable:false},
  AUTO_COOLDOWN: {id:'AUTO_COOLDOWN',title:'Automated Re-loader',desc:'Weapons charge 10% faster.',cost:40,rarity:2,value:0.1,stackable:true},
  SCRAP_COLLECTOR: {id:'SCRAP_COLLECTOR',title:'Scrap Recovery Arm',desc:'Gain +10% bonus scrap from all salvage.',cost:50,rarity:2,value:0.1,stackable:true},
  SHIELD_RECHARGE: {id:'SHIELD_RECHARGE',title:'Shield Charge Booster',desc:'Shields recharge 15% faster.',cost:45,rarity:2,value:0.15,stackable:true},
  FTL_BOOSTER: {id:'FTL_BOOSTER',title:'FTL Recharge Booster',desc:'FTL drive charges 25% faster.',cost:50,rarity:2,value:0.25,stackable:false},
  CLOAK_FIRE: {id:'CLOAK_FIRE',title:'Stealth Weapons',desc:'Firing weapons does not reduce Cloaking duration.',cost:50,rarity:3,value:0,stackable:false},
  ROCK_ARMOR: {id:'ROCK_ARMOR',title:'Rock Plating',desc:'15% chance to negate incoming hull damage.',cost:80,rarity:3,value:0.15,stackable:false},
  ZOLTAN_BYPASS: {id:'ZOLTAN_BYPASS',title:'Zoltan Shield Bypass',desc:'Teleporter & Mind Control bypass Super-Shields.',cost:55,rarity:3,value:0,stackable:false},
  NANO_MEDBAY: {id:'NANO_MEDBAY',title:'Engi Med-bot Dispersal',desc:'Heals all friendly crew ship-wide while Medbay is powered.',cost:60,rarity:3,value:0,stackable:false},
  SLUG_GEL: {id:'SLUG_GEL',title:'Slug Repair Gel',desc:'Automatically seals hull breaches over time.',cost:60,rarity:3,value:0,stackable:false},
  FIRE_EXTINGUISHERS: {id:'FIRE_EXTINGUISHERS',title:'Fire Suppression',desc:'Automatically extinguishes fires ship-wide.',cost:65,rarity:3,value:0,stackable:false},
  O2_MASKS: {id:'O2_MASKS',title:'Emergency Respirators',desc:'Crew take 50% less suffocation damage.',cost:50,rarity:2,value:0.5,stackable:false},
  EXPLOSIVE_REPLICATOR: {id:'EXPLOSIVE_REPLICATOR',title:'Explosive Replicator',desc:'50% chance not to consume missiles when firing.',cost:60,rarity:3,value:0.5,stackable:false},
  RECON_TELEPORTER: {id:'RECON_TELEPORTER',title:'Reconstructive Teleport',desc:'Crew heal to 100% HP whenever teleporting.',cost:70,rarity:3,value:0,stackable:false},
  REPAIR_ARM: {id:'REPAIR_ARM',title:'Hull Repair Arm',desc:'Repairs +2 Hull on combat salvage (-15% scrap).',cost:50,rarity:2,value:0,stackable:false},
  DRONE_RECOVERY: {id:'DRONE_RECOVERY',title:'Drone Recovery Arm',desc:'Recovers active external drone parts after combat.',cost:50,rarity:3,value:0,stackable:false},
  FTL_JUMPER: {id:'FTL_JUMPER',title:'Adv. FTL Navigation',desc:'Allows jumping back to any previously visited beacon.',cost:50,rarity:3,value:0,stackable:false},
  LONG_RANGED_SCANNERS: {id:'LONG_RANGED_SCANNERS',title:'Long-Ranged Scanners',desc:'Reveals hostile ships and hazards on adjacent beacons.',cost:30,rarity:1,value:0,stackable:false},
};

const mkSys = (obj) => {
  const out = {};
  for (const [k, [room, power, max]] of Object.entries(obj)) {
    out[k] = { power, max: max || (['shields','engines','weapons','drones'].includes(k) ? 8 : 3), room, start: true, img: 'room_' + k, slot_dir: 'up', slot_num: 0 };
  }
  return out;
};

const ships = {
  PLAYER_SHIP_HARD: {
    id:'PLAYER_SHIP_HARD',layout:'kestral',img:'kestral',class_name:'Kestrel Cruiser',name:'The Kestrel',
    desc:'Reliable Federation cruiser balanced for all-around combat.',
    systems: mkSys({pilot:[0,1,3],doors:[2,1,3],sensors:[3,1,3],medbay:[4,1,3],shields:[5,2,8],weapons:[10,3,8],oxygen:[13,1,3],engines:[14,2,8]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_2','MISSILES_2_PLAYER'],weaponListLoad:'',weaponListCount:2,missiles:8,
    drones:[],droneListLoad:'',droneParts:2,health:30,maxPower:8,crew:['human','human','human'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_CIRCLE: {
    id:'PLAYER_SHIP_CIRCLE',layout:'engi_torus',img:'circle_cruiser',class_name:'Engi Cruiser',name:'The Torus',
    desc:'Drone-focused Engi cruiser equipped with Ion Blast II and Med-bot Dispersal.',
    systems: mkSys({pilot:[0,1,3],sensors:[1,1,3],doors:[2,1,3],shields:[3,2,8],weapons:[4,3,8],drones:[5,3,8],medbay:[6,1,3],engines:[7,2,8],oxygen:[8,1,3]}),
    weaponSlots:3,droneSlots:3,weapons:['ION_4'],weaponListLoad:'',weaponListCount:1,missiles:0,
    drones:['COMBAT_1'],droneListLoad:'',droneParts:15,health:30,maxPower:10,crew:['human','engi','engi'],augments:['NANO_MEDBAY'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_FED: {
    id:'PLAYER_SHIP_FED',layout:'fed_osprey',img:'fed_cruiser',class_name:'Federation Cruiser',name:'The Osprey',
    desc:'Features an automatic shield-piercing Artillery Beam.',
    systems: mkSys({pilot:[0,1,3],artillery:[1,1,4],sensors:[3,1,3],doors:[4,1,3],shields:[5,2,8],weapons:[6,2,8],medbay:[7,1,3],engines:[8,2,8],oxygen:[9,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_2'],weaponListLoad:'',weaponListCount:1,missiles:0,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:8,crew:['human','mantis','rock','engi'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_ENERGY: {
    id:'PLAYER_SHIP_ENERGY',layout:'zoltan_adj',img:'energy_cruiser',class_name:'Zoltan Cruiser',name:'The Adjudicator',
    desc:'Protected by a 5-point Zoltan Super-Shield and armed with a Halberd Beam.',
    systems: mkSys({pilot:[0,1,3],doors:[1,2,3],sensors:[2,1,3],shields:[3,2,8],weapons:[4,3,8],medbay:[5,1,3],engines:[6,1,8],oxygen:[7,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['BEAM_2','MISSILES_1'],weaponListLoad:'',weaponListCount:2,missiles:12,
    drones:[],droneListLoad:'',droneParts:2,health:30,maxPower:5,crew:['energy','energy','energy'],augments:['ENERGY_SHIELD'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_MANTIS: {
    id:'PLAYER_SHIP_MANTIS',layout:'mantis_gila',img:'mantis_cruiser',class_name:'Mantis Cruiser',name:'The Gila Monster',
    desc:'Built for aggressive Crew Teleporter boarding raids.',
    systems: mkSys({pilot:[0,1,3],teleporter:[1,1,3],doors:[2,1,3],shields:[3,2,8],weapons:[4,2,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3],sensors:[8,1,3]}),
    weaponSlots:3,droneSlots:2,weapons:['LASER_BURST_1','BOMB_1'],weaponListLoad:'',weaponListCount:2,missiles:16,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:7,crew:['mantis','mantis','mantis','engi'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_SLUG: {
    id:'PLAYER_SHIP_SLUG',layout:'zoltan_adj',img:'jelly_cruiser',class_name:'Slug Cruiser',name:'Man of War',
    desc:'Equipped with Anti-Bio Beam, Slug Telepathy, and automatic breach-sealing gel.',
    systems: mkSys({pilot:[0,1,3],doors:[1,2,3],shields:[3,2,8],weapons:[4,3,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_1','BOMB_1','BEAM_BIO'],weaponListLoad:'',weaponListCount:3,missiles:10,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:8,crew:['slug','slug'],augments:['SLUG_GEL'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_ROCK: {
    id:'PLAYER_SHIP_ROCK',layout:'fed_osprey',img:'rock_cruiser',class_name:'Rock Cruiser',name:'Bulwark',
    desc:'Heavily armored hull with Rock Plating and fire-immune crew.',
    systems: mkSys({pilot:[0,1,3],doors:[3,1,3],sensors:[4,1,3],shields:[5,2,8],weapons:[6,3,8],medbay:[7,1,3],engines:[8,2,8],oxygen:[9,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['MISSILES_2_PLAYER','MISSILES_3'],weaponListLoad:'',weaponListCount:2,missiles:28,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:8,crew:['rock','rock','rock'],augments:['ROCK_ARMOR'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_STEALTH: {
    id:'PLAYER_SHIP_STEALTH',layout:'stealth_nes',img:'stealth',class_name:'Stealth Cruiser',name:'The Nesasio',
    desc:'Starts without Shields, relying on Cloaking, high evasion, and Long-Ranged Scanners.',
    systems: mkSys({pilot:[0,1,3],cloaking:[1,1,3],sensors:[2,2,3],doors:[3,1,3],weapons:[4,2,8],medbay:[5,1,3],engines:[6,4,8],oxygen:[7,1,3]}),
    weaponSlots:3,droneSlots:2,weapons:['LASER_BURST_1','BEAM_1'],weaponListLoad:'',weaponListCount:2,missiles:0,
    drones:[],droneListLoad:'',droneParts:2,health:30,maxPower:8,crew:['human','human','human'],augments:['LONG_RANGED_SCANNERS'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_ANAEROBIC: {
    id:'PLAYER_SHIP_ANAEROBIC',layout:'lanius_kruos',img:'anaerobic_cruiser',class_name:'Lanius Cruiser',name:'Kruos',
    desc:'Advanced Edition cruiser featuring Clone Bay, Hacking, Chain Laser, and Flak I.',
    systems: mkSys({pilot:[0,1,3],hacking:[1,1,3],doors:[2,1,3],shields:[3,2,8],weapons:[4,3,8],clonebay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3],sensors:[8,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_CHAINGUN','SHOTGUN'],weaponListLoad:'',weaponListCount:2,missiles:0,
    drones:[],droneListLoad:'',droneParts:12,health:30,maxPower:9,crew:['anaerobic','anaerobic','human'],augments:['O2_MASKS'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_CRYSTAL: {
    id:'PLAYER_SHIP_CRYSTAL',layout:'lanius_kruos',img:'crystal_cruiser',class_name:'Crystal Cruiser',name:'Bravais',
    desc:'Ancient vessel crewed by Crystal beings with room Lockdown (K) and shield-piercing shards.',
    systems: mkSys({pilot:[0,1,3],battery:[1,1,2],doors:[2,1,3],shields:[3,2,8],weapons:[4,3,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3],sensors:[8,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['CRYSTAL_BURST_1','CRYSTAL_HEAVY_1'],weaponListLoad:'',weaponListCount:2,missiles:0,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:8,crew:['crystal','crystal','human','human'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_HARD_2: {
    id:'PLAYER_SHIP_HARD_2',layout:'kestral',img:'kestral_2',class_name:'Kestrel Cruiser B',name:'Red-Tail',
    desc:'Iconic Type-B Kestrel armed with a 4-laser volley and diverse crew.',
    systems: mkSys({pilot:[0,1,3],doors:[2,1,3],sensors:[3,1,3],medbay:[4,1,3],shields:[5,2,8],weapons:[10,4,8],oxygen:[13,1,3],engines:[14,2,8]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_1','LASER_BURST_1','LASER_HEAVY_1'],weaponListLoad:'',weaponListCount:3,missiles:0,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:9,crew:['human','human','mantis','energy'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_FED_2: {
    id:'PLAYER_SHIP_FED_2',layout:'fed_osprey',img:'fed_cruiser_2',class_name:'Federation Cruiser B',name:'Nisos',
    desc:'Upgraded Lv.2 Artillery Beam paired with Dual Lasers and Leto Missile.',
    systems: mkSys({pilot:[0,1,3],artillery:[1,2,4],sensors:[3,1,3],doors:[4,1,3],shields:[5,2,8],weapons:[6,2,8],medbay:[7,1,3],engines:[8,2,8],oxygen:[9,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_1','MISSILES_1'],weaponListLoad:'',weaponListCount:2,missiles:10,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:9,crew:['human','slug','energy'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_MANTIS_2: {
    id:'PLAYER_SHIP_MANTIS_2',layout:'mantis_gila',img:'mantis_cruiser_2',class_name:'Mantis Cruiser B',name:'The Basilisk',
    desc:'Double-shielded boarding fortress with Teleporter, Defense Drone I, and Boarding Drone.',
    systems: mkSys({pilot:[0,1,3],teleporter:[1,1,3],doors:[2,1,3],shields:[3,4,8],drones:[4,3,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3],weapons:[8,1,8]}),
    weaponSlots:4,droneSlots:2,weapons:[],weaponListLoad:'',weaponListCount:0,missiles:0,
    drones:['DEFENSE_1','BOARDER'],droneListLoad:'',droneParts:16,health:30,maxPower:10,crew:['mantis','mantis'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_STEALTH_2: {
    id:'PLAYER_SHIP_STEALTH_2',layout:'stealth_nes',img:'stealth_2',class_name:'Stealth Cruiser B',name:'DA-SR 12',
    desc:'Glass cannon equipped with Lv.2 Cloaking and the devastating Glaive Beam.',
    systems: mkSys({pilot:[0,1,3],cloaking:[1,2,3],sensors:[2,2,3],doors:[3,1,3],weapons:[4,4,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3]}),
    weaponSlots:3,droneSlots:2,weapons:['BEAM_3'],weaponListLoad:'',weaponListCount:1,missiles:0,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:8,crew:['human','human','energy'],augments:['LONG_RANGED_SCANNERS'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  PLAYER_SHIP_ENERGY_2: {
    id:'PLAYER_SHIP_ENERGY_2',layout:'zoltan_adj',img:'energy_cruiser_2',class_name:'Zoltan Cruiser B',name:'Noether',
    desc:'Starts with Zoltan Super-Shield, dual Ion Blasts, and a sweeping Pike Beam.',
    systems: mkSys({pilot:[0,1,3],doors:[1,1,3],sensors:[2,1,3],shields:[3,1,8],weapons:[4,4,8],medbay:[5,1,3],engines:[6,2,8],oxygen:[7,1,3]}),
    weaponSlots:4,droneSlots:2,weapons:['ION_1','ION_1','BEAM_LONG'],weaponListLoad:'',weaponListCount:3,missiles:0,
    drones:[],droneListLoad:'',droneParts:0,health:30,maxPower:6,crew:['energy','energy','energy'],augments:['ENERGY_SHIELD'],minSector:0,maxSector:8,boardingAI:'sabotage'
  },
  REBEL_SKINNY: {id:'REBEL_SKINNY',layout:'rebel_fighter',img:'rebel_long',class_name:'Rebel Fighter',name:'Rebel Fighter',desc:'Rebel patrol vessel.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,2,8],engines:[3,2,8],oxygen:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['LASER_BURST_1','MISSILES_1'],weaponListLoad:'',weaponListCount:2,missiles:6,drones:[],droneListLoad:'',droneParts:1,health:10,maxPower:8,crew:['human','human'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'},
  REBEL_FAT: {id:'REBEL_FAT',layout:'rebel_fighter',img:'rebel_squat',class_name:'Rebel Rigger',name:'Rebel Rigger',desc:'Drone-equipped Rebel vessel.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,2,8],drones:[3,2,8],engines:[4,2,8],oxygen:[5,1,3]}),weaponSlots:3,droneSlots:2,weapons:['LASER_BURST_2'],weaponListLoad:'',weaponListCount:1,missiles:4,drones:['COMBAT_1'],droneListLoad:'',droneParts:4,health:12,maxPower:10,crew:['human','human','human'],augments:[],minSector:1,maxSector:8,boardingAI:'sabotage'},
  AUTO_BASIC: {id:'AUTO_BASIC',layout:'auto_scout',img:'auto_basic',class_name:'Auto-Scout',name:'Rebel Auto-Scout',desc:'Unmanned AI scout ship with self-repair.',systems:mkSys({pilot:[0,2,3],shields:[1,2,8],weapons:[2,2,8],engines:[3,2,8]}),weaponSlots:3,droneSlots:1,weapons:['LASER_BURST_1','ION_1'],weaponListLoad:'',weaponListCount:2,missiles:4,drones:[],droneListLoad:'',droneParts:0,health:9,maxPower:9,crew:[],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'},
  AUTO_ASSAULT: {id:'AUTO_ASSAULT',layout:'auto_scout',img:'auto_assault',class_name:'Auto-Assault',name:'Rebel Auto-Assault',desc:'Heavy unmanned gunship.',systems:mkSys({pilot:[0,2,3],shields:[1,4,8],weapons:[2,4,8],engines:[3,3,8]}),weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_2','SHOTGUN'],weaponListLoad:'',weaponListCount:2,missiles:8,drones:['COMBAT_1'],droneListLoad:'',droneParts:4,health:13,maxPower:14,crew:[],augments:[],minSector:3,maxSector:8,boardingAI:'sabotage'},
  MANTIS_SCOUT: {id:'MANTIS_SCOUT',layout:'rebel_fighter',img:'mantis_scout',class_name:'Mantis Scout',name:'Mantis Scout',desc:'Fast Mantis raider.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,2,8],engines:[3,2,8],oxygen:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['LASER_HEAVY_1','MISSILES_1'],weaponListLoad:'',weaponListCount:2,missiles:6,drones:[],droneListLoad:'',droneParts:0,health:10,maxPower:8,crew:['mantis','mantis'],augments:[],minSector:0,maxSector:8,boardingAI:'sabotage'},
  MANTIS_FIGHTER: {id:'MANTIS_FIGHTER',layout:'rebel_fighter',img:'mantis_fighter',class_name:'Mantis Fighter',name:'Mantis Fighter',desc:'Aggressive Mantis cruiser with Crew Teleporter.',systems:mkSys({pilot:[0,1,3],shields:[1,4,8],weapons:[2,3,8],engines:[3,3,8],oxygen:[4,1,3],teleporter:[5,1,3]}),weaponSlots:3,droneSlots:1,weapons:['LASER_BURST_2','BOMB_1'],weaponListLoad:'',weaponListCount:2,missiles:8,drones:[],droneListLoad:'',droneParts:0,health:13,maxPower:12,crew:['mantis','mantis','engi'],augments:[],minSector:2,maxSector:8,boardingAI:'sabotage'},
  ROCK_SCOUT: {id:'ROCK_SCOUT',layout:'rebel_fighter',img:'rock_scout',class_name:'Rock Scout',name:'Rock Scout',desc:'Missile-armed Rock vessel.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,3,8],engines:[3,2,8],oxygen:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['MISSILES_2_PLAYER','LASER_HEAVY_1'],weaponListLoad:'',weaponListCount:2,missiles:10,drones:[],droneListLoad:'',droneParts:0,health:12,maxPower:9,crew:['rock','rock'],augments:['ROCK_ARMOR'],minSector:1,maxSector:8,boardingAI:'sabotage'},
  ENERGY_FIGHTER: {id:'ENERGY_FIGHTER',layout:'rebel_fighter',img:'energy_fighter',class_name:'Zoltan Fighter',name:'Zoltan Fighter',desc:'Protected by a Zoltan Super-Shield.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,3,8],engines:[3,2,8],oxygen:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['ION_1','BEAM_1'],weaponListLoad:'',weaponListCount:2,missiles:4,drones:[],droneListLoad:'',droneParts:0,health:10,maxPower:9,crew:['energy','energy'],augments:['ENERGY_SHIELD'],minSector:1,maxSector:8,boardingAI:'sabotage'},
  JELLY_BUTTON: {id:'JELLY_BUTTON',layout:'rebel_fighter',img:'jelly_button',class_name:'Slug Interceptor',name:'Slug Interceptor',desc:'Cunning Nebula ambush craft.',systems:mkSys({pilot:[0,1,3],shields:[1,2,8],weapons:[2,3,8],engines:[3,3,8],oxygen:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['LASER_BURST_1','BEAM_BIO'],weaponListLoad:'',weaponListCount:2,missiles:4,drones:[],droneListLoad:'',droneParts:0,health:11,maxPower:10,crew:['slug','slug'],augments:['SLUG_GEL'],minSector:1,maxSector:8,boardingAI:'sabotage'},
  ANAEROBIC_SCOUT: {id:'ANAEROBIC_SCOUT',layout:'rebel_fighter',img:'anaerobic_scout',class_name:'Lanius Scout',name:'Lanius Scout',desc:'Airless metallic scavenger vessel.',systems:mkSys({pilot:[0,1,3],shields:[1,4,8],weapons:[2,3,8],engines:[3,2,8],clonebay:[4,1,3]}),weaponSlots:3,droneSlots:1,weapons:['SHOTGUN','LASER_CHAINGUN'],weaponListLoad:'',weaponListCount:2,missiles:0,drones:[],droneListLoad:'',droneParts:2,health:12,maxPower:11,crew:['anaerobic','anaerobic'],augments:[],minSector:2,maxSector:8,boardingAI:'sabotage'},
  BOSS_1: {id:'BOSS_1',layout:'boss_flagship',img:'boss_1',class_name:'Rebel Flagship',name:'Rebel Flagship (Phase 1)',desc:'Massive dreadnought with Cloaking & Hacking.',systems:mkSys({pilot:[0,3,3],shields:[1,8,8],weapons:[2,6,8],engines:[3,4,8],oxygen:[4,2,3],cloaking:[5,3,3],medbay:[6,3,3]}),weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_2','MISSILES_3','BEAM_2','ION_4'],weaponListLoad:'',weaponListCount:4,missiles:30,drones:[],droneListLoad:'',droneParts:10,health:20,maxPower:26,crew:['human','human','human','human','human','human'],augments:[],minSector:7,maxSector:8,boardingAI:'sabotage'},
  BOSS_2: {id:'BOSS_2',layout:'boss_flagship',img:'boss_2',class_name:'Rebel Flagship',name:'Rebel Flagship (Phase 2)',desc:'Armed with Drone Power Surges & Boarding Drones.',systems:mkSys({pilot:[0,3,3],shields:[1,8,8],weapons:[2,6,8],engines:[3,4,8],oxygen:[4,2,3],drones:[5,4,8],medbay:[6,3,3]}),weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_2','MISSILES_3','BEAM_2'],weaponListLoad:'',weaponListCount:3,missiles:30,drones:['COMBAT_1','DEFENSE_1'],droneListLoad:'',droneParts:15,health:22,maxPower:26,crew:['human','human','human','human','human'],augments:[],minSector:7,maxSector:8,boardingAI:'sabotage'},
  BOSS_3: {id:'BOSS_3',layout:'boss_flagship',img:'boss_3',class_name:'Rebel Flagship',name:'Rebel Flagship (Phase 3)',desc:'12-HP Super-Shield, 7-Shot Laser Surge & Mind Control.',systems:mkSys({pilot:[0,3,3],shields:[1,8,8],weapons:[2,6,8],engines:[3,6,8],oxygen:[4,2,3],mind:[5,3,3]}),weaponSlots:4,droneSlots:2,weapons:['LASER_BURST_3','MISSILES_3'],weaponListLoad:'',weaponListCount:2,missiles:30,drones:[],droneListLoad:'',droneParts:10,health:20,maxPower:28,crew:['human','human','human','human'],augments:['ENERGY_SHIELD'],minSector:7,maxSector:8,boardingAI:'sabotage'},
};

const events = {
  START_BEACON: {text:'Welcome to the Federation Fleet! Carry vital intelligence across 8 sectors and destroy the Rebel Flagship.',choices:[{text:'Begin Mission (임무 시작)',event:{}}]},
  HOSTILE_PIRATE: {text:'A pirate cruiser drops out of FTL and locks weapons onto your hull!',hostile:true,ship:'PIRATE_STD',choices:[{text:'Battle Stations!',event:{}}]},
  DISTRESS_MINER: {
    text:'A civilian mining station is on fire after a solar flare! They plead for help.',
    choices:[
      {text:'[BLUE ROCK] Send your Rock crew into the flames to rescue survivors.',req:'rock',lvl:1,event:{text:'Your fire-immune Rock crew pulls everyone out safely! The grateful miners reward you generously.',autoReward:'standard',autoRewardLevel:'HIGH'}},
      {text:'[BLUE TELEPORTER] Beam the trapped miners directly aboard.',req:'teleporter',lvl:1,event:{text:'You lock onto their biosigns and beam them out cleanly. They transfer scrap and a weapon schematic!',autoReward:'standard',autoRewardLevel:'HIGH',weapon:'LASER_HEAVY_1'}},
      {text:'Dock and help put out the fire.',event:{text:'You extinguish the blaze with minor hull scorching and receive salvage.',autoReward:'standard',autoRewardLevel:'MED',damage:2}},
      {text:'Leave them — too risky.',event:{text:'You power up your FTL drive and move on.'}},
    ]
  },
  QUEST_CACHE: {
    text:'A retired Federation scout offers coordinates to a hidden weapons cache in this sector.',
    choices:[
      {text:'Upload the coordinates to your Star Map.',event:{text:'A golden QUEST beacon has been marked on your Star Map!',quest:'QUEST_CACHE_REWARD'}},
      {text:'Decline politely.',event:{text:'The scout wishes you luck against the Rebels.'}},
    ]
  },
  QUEST_CACHE_REWARD: {
    text:'You arrive at the secret Federation supply cache hidden inside an asteroid belt!',
    choices:[
      {text:'Open the vault and salvage the supplies.',event:{text:'Inside you find pristine weapons and a huge stash of scrap!',autoReward:'standard',autoRewardLevel:'HIGH',weapon:'SHOTGUN'}},
    ]
  },
  ENGI_HELP: {
    text:'An Engi research vessel has suffered a reactor core cascade failure.',
    choices:[
      {text:'[BLUE ENGI] Have your Engi crew stabilize their nanite core.',req:'engi',lvl:1,event:{text:'Your Engi repairs the core effortlessly! They reward you generously.',autoReward:'standard',autoRewardLevel:'HIGH'}},
      {text:'[BLUE SENSORS] Scan the core remotely to guide them.',req:'sensors',lvl:2,event:{text:'Your upgraded sensors pinpoint the fault immediately.',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Offer assistance to jump-start their backup cells.',event:{text:'They thank you and transfer scrap in return.',autoReward:'standard',autoRewardLevel:'MED'}},
    ]
  },
  MERCHANT_DRIFT: {
    text:'A wandering merchant convoy hails you near the beacon.',
    choices:[
      {text:'Open Trading Post (상점 열기)',event:{store:true}},
      {text:'Move on.',event:{}},
    ]
  },
  DERELICT_POD: {
    text:'You spot an intact escape pod drifting beside a shattered cruiser.',
    choices:[
      {text:'Recover the pod and open it.',event:{text:'A grateful survivor joins your crew!',crew:'engi',autoReward:'fuel',autoRewardLevel:'LOW'}},
      {text:'[BLUE CLONEBAY] Scan neural patterns before opening.',req:'clonebay',lvl:1,event:{text:'You safely revive a veteran Mantis warrior who pledges loyalty to your ship!',crew:'mantis',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Leave it alone.',event:{text:'You leave the pod drifting in the void.'}},
    ]
  },
  REBEL_AMBUSH: {
    text:'A Rebel patrol intercepts your transponder signal!',
    choices:[
      {text:'[BLUE CLOAKING] Engage Cloaking and slip past undetected.',req:'cloaking',lvl:1,event:{text:'You vanish from their sensors and salvage an unguarded supply buoy.',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'[BLUE ENGINES] Burn full thrust to outrun them.',req:'engines',lvl:4,event:{text:'Your powerful engines leave the Rebel patrol in the dust.'}},
      {text:'Stand and fight!',event:{text:'Weapons hot — engage the Rebel patrol!',hostile:true,ship:'REBEL_STD'}},
    ]
  },
  NEBULA_SMUGGLER: {
    text:'Inside the dense nebula, a Slug smuggler offers a mysterious cargo crate.',
    choices:[
      {text:'[BLUE SLUG] Read their mind to verify the deal.',req:'slug',lvl:1,event:{text:'You expose their hidden stash and claim the real treasure!',autoReward:'standard',autoRewardLevel:'HIGH',weapon:'BEAM_2'}},
      {text:'[BLUE LONG_RANGED_SCANNERS] Scan the crate before docking.',req:'LONG_RANGED_SCANNERS',lvl:1,event:{text:'Your scanners detect a trap — you ambush the smugglers first!',hostile:true,ship:'SLUG_STD'}},
      {text:'Accept the trade.',event:{text:'The crate holds useful fuel and scrap.',autoReward:'standard',autoRewardLevel:'MED'}},
    ]
  },
  GIANT_ALIEN_SPIDERS: {
    text:'A research station is overrun by Giant Alien Spiders! Giant alien spiders are no joke.',
    choices:[
      {text:'[BLUE BEAM_BIO] Sweep the station corridors with your Anti-Bio Beam.',req:'BEAM_BIO',lvl:1,event:{text:'The bio-beam clears the infestation cleanly without risking a single crew member!',autoReward:'standard',autoRewardLevel:'HIGH'}},
      {text:'[BLUE CLONEBAY] Send crew in with Clone Bay backup active.',req:'clonebay',lvl:1,event:{text:'After a fierce fight, the station is cleared and your crew returns with generous salvage!',autoReward:'standard',autoRewardLevel:'HIGH'}},
      {text:'Leave them alone — giant alien spiders are no joke.',event:{text:'You wisely jump away from the infested station.'}},
    ]
  },
  MANTIS_SLAVER: {
    text:'A Mantis slaver ship hails you: "Surrender a crew member or prepare to be boarded!"',
    choices:[
      {text:'Never! Power up weapons and engage!',event:{text:'The Mantis slavers charge their teleporter!',hostile:true,ship:'MANTIS_STD'}},
      {text:'[BLUE TELEPORTER] Launch a counter-boarding raid immediately!',req:'teleporter',lvl:1,event:{text:'Caught off guard, the slavers free a captive Engi and flee!',crew:'engi',autoReward:'standard',autoRewardLevel:'MED'}},
    ]
  },
  ZOLTAN_BORDER: {
    text:'A Zoltan peacekeeper patrol scans your hull for illegal weapons.',
    choices:[
      {text:'[BLUE ZOLTAN] Let your Zoltan crew negotiate passage.',req:'energy',lvl:1,event:{text:'The patrol salutes your Zoltan officer and shares reactor telemetry (+Scrap & Fuel)!',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Submit to the scan peacefully.',event:{text:'They find no contraband and transfer +2 Fuel for your journey.',autoReward:'fuel',autoRewardLevel:'LOW'}},
      {text:'Refuse the scan and open fire!',event:{text:'The Zoltan Super-Shield flares to life!',hostile:true,ship:'ZOLTAN_STD'}},
    ]
  },
  CRYSTAL_STASIS_POD: {
    text:'Deep inside a shattered asteroid, you discover an ancient crystalline stasis pod pulsing softly.',
    choices:[
      {text:'Recover the pod and unlock its stasis field.',event:{text:'A mysterious Crystal warrior awakens and joins your crew!',crew:'crystal',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Salvage the rare crystal hull plating instead.',event:{text:'You strip valuable scrap and a Hull Laser from the wreckage.',autoReward:'standard',autoRewardLevel:'HIGH',weapon:'LASER_HULL_1'}},
    ]
  },
  AUTO_SHIPYARD: {
    text:'You stumble upon an automated Rebel drone shipyard humming with activity.',
    choices:[
      {text:'[BLUE HACKING] Hack the shipyard fabricator to print a weapon!',req:'hacking',lvl:1,event:{text:'The fabricator spits out a pristine Flak Gun Mark II before shutting down!',weapon:'SHOTGUN_2',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Raid the shipyard defenses!',event:{text:'An automated Rebel gunship powers up to defend the dock!',hostile:true,ship:'AUTO_STD'}},
      {text:'Slip away quietly.',event:{text:'You leave the automated shipyard undisturbed.'}},
    ]
  },
  REBEL_STRONGHOLD: {
    text:'Scanners detect a Rebel forward supply depot guarded by a Rigger.',
    choices:[
      {text:'Assault the Rebel supply depot!',event:{text:'The Rebel Rigger deploys combat drones — engage!',hostile:true,ship:'REBEL_STD'}},
      {text:'[BLUE MIND] Cause confusion among their bridge crew and raid the outer crates.',req:'mind',lvl:1,event:{text:'While the Rebels argue on comms, you scoop up scrap and missiles!',autoReward:'missiles',autoRewardLevel:'HIGH'}},
    ]
  },
  ROCK_DISTRESS: {
    text:'A damaged Rock freighter is trapped in a dense asteroid field.',
    choices:[
      {text:'[BLUE SHIELDS] Extend your shields to cover their hull while towing them out.',req:'shields',lvl:4,event:{text:'The Rock captain is impressed by your resilience and gifts you a Hull Beam!',weapon:'BEAM_HULL',autoReward:'standard',autoRewardLevel:'MED'}},
      {text:'Brave the asteroids to pull them clear.',event:{text:'You take minor scratches but earn their gratitude.',autoReward:'standard',autoRewardLevel:'MED',damage:2}},
    ]
  },
  LANIUS_SCAVENGERS: {
    text:'A pair of metallic Lanius scavengers are stripping an old Federation wreck.',
    choices:[
      {text:'[BLUE ANAEROBIC] Your Lanius crew translates and negotiates a fair split.',req:'anaerobic',lvl:1,event:{text:'They happily share half of the salvage and a Breach Bomb II!',weapon:'BOMB_BREACH_2',autoReward:'standard',autoRewardLevel:'HIGH'}},
      {text:'Engage the Lanius scavengers!',event:{text:'The Lanius Scout turns its Flak cannon toward you!',hostile:true,ship:'LANIUS_STD'}},
    ]
  },
  FEDERATION_OUTPOST: {
    text:'A hidden Federation listening post offers emergency hull repairs and intel.',
    choices:[
      {text:'Accept hull repairs (+5 Hull) and sector charts.',event:{text:'Engineers patch your hull plating cleanly.',damage:-5,autoReward:'fuel',autoRewardLevel:'LOW'}},
      {text:'Ask for munitions instead.',event:{text:'They load extra missiles and scrap into your cargo bay.',autoReward:'missiles',autoRewardLevel:'MED'}},
    ]
  },
  PULSAR_BEACON: {
    text:'A derelict research probe orbits a spinning pulsar, broadcasting encrypted data.',
    choices:[
      {text:'[BLUE BATTERY] Shield your systems with Backup Battery power and download the data.',req:'battery',lvl:1,event:{text:'You extract valuable Federation coordinates and high-grade scrap!',autoReward:'standard',autoRewardLevel:'HIGH',quest:'QUEST_CACHE_REWARD'}},
      {text:'Attempt a quick flyby salvage.',event:{text:'You grab a modest cache of scrap before the next pulse hits.',autoReward:'standard',autoRewardLevel:'MED'}},
    ]
  },
};

const ship_events = {
  PIRATE_STD: {id:'PIRATE_STD',auto_blueprint:'REBEL_SKINNY',surrender:true,destroyed_text:'Enemy ship destroyed!',dead_crew_text:'Enemy crew eliminated!'},
  REBEL_STD: {id:'REBEL_STD',auto_blueprint:'REBEL_FAT',surrender:true,destroyed_text:'Rebel patrol destroyed!',dead_crew_text:'Rebel crew neutralized!'},
  SLUG_STD: {id:'SLUG_STD',auto_blueprint:'JELLY_BUTTON',surrender:true,destroyed_text:'Slug ship destroyed!',dead_crew_text:'Slug crew neutralized!'},
  MANTIS_STD: {id:'MANTIS_STD',auto_blueprint:'MANTIS_FIGHTER',surrender:true,destroyed_text:'Mantis cruiser destroyed!',dead_crew_text:'Mantis crew eliminated!'},
  ZOLTAN_STD: {id:'ZOLTAN_STD',auto_blueprint:'ENERGY_FIGHTER',surrender:true,destroyed_text:'Zoltan vessel destroyed!',dead_crew_text:'Zoltan crew neutralized!'},
  AUTO_STD: {id:'AUTO_STD',auto_blueprint:'AUTO_ASSAULT',surrender:false,destroyed_text:'Auto-Assault neutralized!',dead_crew_text:'Auto-Assault neutralized!'},
  LANIUS_STD: {id:'LANIUS_STD',auto_blueprint:'ANAEROBIC_SCOUT',surrender:true,destroyed_text:'Lanius scout destroyed!',dead_crew_text:'Lanius crew eliminated!'},
};

const sector_types = {
  CIVILIAN: ['CIVILIAN_SECTOR','ENGI_SECTOR','ZOLTAN_SECTOR'],
  HOSTILE: ['REBEL_SECTOR','PIRATE_SECTOR','MANTIS_SECTOR','ROCK_SECTOR','LANIUS_SECTOR'],
  NEBULA: ['NEBULA_SECTOR','SLUG_SECTOR'],
};

const evList = [
  'HOSTILE_PIRATE','DISTRESS_MINER','QUEST_CACHE','ENGI_HELP','MERCHANT_DRIFT','DERELICT_POD',
  'REBEL_AMBUSH','NEBULA_SMUGGLER','GIANT_ALIEN_SPIDERS','MANTIS_SLAVER','ZOLTAN_BORDER',
  'CRYSTAL_STASIS_POD','AUTO_SHIPYARD','REBEL_STRONGHOLD','ROCK_DISTRESS','LANIUS_SCAVENGERS',
  'FEDERATION_OUTPOST','PULSAR_BEACON'
].map(name => ({name,min:0,max:2}));
const sectors = {};
for (const [sid, sname] of [
  ['CIVILIAN_SECTOR','Civilian Sector'],['ENGI_SECTOR','Engi Controlled Sector'],['ZOLTAN_SECTOR','Zoltan Controlled Sector'],
  ['REBEL_SECTOR','Rebel Controlled Sector'],['PIRATE_SECTOR','Pirate Controlled Sector'],['MANTIS_SECTOR','Mantis Homeworlds'],
  ['ROCK_SECTOR','Rock Controlled Sector'],['LANIUS_SECTOR','Abandoned Sector'],['NEBULA_SECTOR','Uncharted Nebula'],
  ['SLUG_SECTOR','Slug Controlled Nebula'],['FINAL','The Last Stand']
]) {
  sectors[sid] = {id:sid,minSector:0,unique:false,names:[sname],tracks:['civilian'],events:evList,startEvent:'START_BEACON'};
}

const pack = { schemaVersion: 1, weapons, drones, augments, ships, layouts, events, ship_events, sector_types, sectors };
const outPath = path.join(outDir, 'standalone_data.json');
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2), 'utf8');
console.log('[standalone-data] Wrote', outPath, '| ships:', Object.keys(ships).length, 'weapons:', Object.keys(weapons).length, 'drones:', Object.keys(drones).length, 'augments:', Object.keys(augments).length, 'layouts:', Object.keys(layouts).length, 'events:', Object.keys(events).length);
