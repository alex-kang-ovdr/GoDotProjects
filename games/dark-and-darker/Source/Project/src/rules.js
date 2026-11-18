/* Restored values + explicit prototype approximations; see docs/ORIGINAL_ALIGNMENT_V15.md. */
(function(root){
'use strict';
const rules={
  "version": "15",
  "baseline": "Season 11 / HF132; some weapon snapshots HF130",
  "classes": {
    "fighter": {
      "name": "파이터",
      "maxHealth": 100,
      "skills": [
        "sprint",
        "secondWind"
      ],
      "weapon": "armingSword",
      "secondary": "crossbow",
      "shield": "roundShield",
      "armor": "cloth"
    },
    "ranger": {
      "name": "레인저",
      "maxHealth": 91,
      "skills": [
        "backStep",
        "fieldRation"
      ],
      "weapon": "longbow",
      "secondary": "armingSword",
      "shield": null,
      "armor": "cloth"
    },
    "wizard": {
      "name": "위자드",
      "maxHealth": 83.5,
      "skills": [
        "spellMemory",
        "meditation"
      ],
      "weapon": "magicStaff",
      "secondary": "rondelDagger",
      "shield": null,
      "armor": "cloth"
    }
  },
  "skills": {
    "sprint": {
      "name": "질주",
      "cooldown": 28,
      "duration": 6,
      "rating": 50
    },
    "secondWind": {
      "name": "두 번째 바람",
      "cooldown": 0,
      "duration": 12,
      "charges": 1,
      "healFraction": 0.5
    },
    "backStep": {
      "name": "백스텝",
      "cooldown": 12,
      "duration": 0.2,
      "distance": 4
    },
    "fieldRation": {
      "name": "야전 식량",
      "cooldown": 24,
      "charges": 2,
      "heal": 40,
      "useTime": 1.5
    },
    "spellMemory": {
      "name": "주문 기억",
      "cooldown": 0
    },
    "meditation": {
      "name": "명상",
      "cooldown": 45,
      "duration": 24,
      "chargeInterval": 6
    }
  },
  "spells": {
    "fireball": {
      "id": "fireball",
      "name": "화염구",
      "tier": 4,
      "charges": 4,
      "castTime": 2,
      "direct": 20,
      "splash": 10,
      "speed": 12,
      "burn": 3,
      "burnDuration": 3,
      "radius": 2.3
    },
    "icebolt": {
      "id": "icebolt",
      "name": "얼음 화살",
      "tier": 2,
      "charges": 5,
      "castTime": 1.25,
      "direct": 30,
      "speed": 14,
      "slow": 0.2,
      "slowDuration": 1
    },
    "zap": {
      "id": "zap",
      "name": "전격",
      "tier": 1,
      "charges": 5,
      "castTime": 1.25,
      "direct": 20,
      "burn": 1,
      "burnDuration": 1,
      "range": 8
    }
  },
  "movement": {
    "baseRating": 300,
    "ratingToMps": 0.01,
    "walkMultiplier": 0.65,
    "crouchMultiplier": 0.6,
    "backwardMultiplier": 0.6,
    "crouchEye": 1.05,
    "standingEye": 1.65
  },
  "healing": {
    "potionUse": 3,
    "potionTotal": 20,
    "potionDuration": 20,
    "restInterval": 2,
    "restAmount": 1,
    "recoverableFraction": 0.65
  },
  "attackSteps": {
    "sword": [
      {
        "windup": 0.399,
        "active": 0.205,
        "recover": 0.234,
        "finish": 1.197,
        "multiplier": 1,
        "motion": "slash",
        "special": false
      },
      {
        "windup": 0.4,
        "active": 0.157,
        "recover": 0.376,
        "finish": 1.043,
        "multiplier": 1.05,
        "motion": "slash",
        "special": false
      },
      {
        "windup": 0.6,
        "active": 0.154,
        "recover": null,
        "finish": 1.213,
        "multiplier": 1.1,
        "motion": "pierce",
        "special": false
      }
    ],
    "dagger": [
      {
        "windup": 0.319,
        "active": 0.365,
        "recover": 0.115,
        "finish": 0.582,
        "multiplier": 1,
        "motion": "pierce",
        "special": false
      },
      {
        "windup": 0.3,
        "active": 0.1,
        "recover": 0.23,
        "finish": 0.867,
        "multiplier": 1,
        "motion": "pierce",
        "special": false
      },
      {
        "windup": 0.396,
        "active": 0.186,
        "recover": 0.191,
        "finish": 0.618,
        "multiplier": 1,
        "motion": "pierce",
        "special": false
      }
    ],
    "axe": [
      {
        "windup": 0.906,
        "active": 0.186,
        "recover": 0.293,
        "finish": 1.108,
        "multiplier": 1,
        "motion": "slash",
        "special": false
      },
      {
        "windup": 0.993,
        "active": 0.227,
        "recover": null,
        "finish": 1.014,
        "multiplier": 1.15,
        "motion": "slash",
        "special": false
      },
      {
        "windup": 0.758,
        "active": 0.193,
        "recover": null,
        "finish": 0.948,
        "multiplier": 1.5,
        "motion": "slash",
        "special": true
      }
    ],
    "staff": [
      {
        "windup": 0.5,
        "active": 0.25,
        "recover": 0.35,
        "finish": 0.7,
        "multiplier": 1,
        "motion": "slash",
        "special": false
      }
    ]
  },
  "approximations": [
    "World movement rating to metres conversion .01 and crouch .6/backwards .6 are prototype scales, not verified full movement formula.",
    "Attack windup/hit/recover/finish from R1 are separate branches. Source reference action speed0; derived attribute action-speed formula is not reproduced.",
    "Battle Axe implements primary steps 1/2 and the separate R special only. Secondary and Whirlwind combos are not implemented. Arming Sword and Rondel Dagger specials are not implemented.",
    "MagicStaff melee timings and geometry, Longbow draw1.2s/reload2.5s, Crossbow reload3.2s, and .5 movement multiplier during potion/ration/reload are explicit prototype values. Projectile speeds/ranges not restored remain prototype values.",
    "Meditation duration24/cooldown45 restored; one missing charge every6s is an explicit approximation instead of original spell-recharge-cost calculation. Rest does not refill SecondWind.",
    "FieldRation40HP/2charges/cooldown24 restored; 1.5s use animation is a prototype value.",
    "RecoverableHP fraction .65 and discrete rest healing of 1 HP every 2 seconds use community mechanics; difficulty/armor formula and modifier scaling remain simplified.",
    "Directional shield/weapon blocks use simple OBBs and fixed recovery. Impact Resistance / Guard Power and exact weapon animations are not fully reproduced.",
    "Spell base effects restored; scaling, exact hitboxes, Zap target range and Fireball area geometry are simplified. Procedural maps/enemies/economy/drop pools remain prototype."
  ]
};
if(typeof module!=='undefined'&&module.exports)module.exports=rules;else root.CryptRules=rules;
})(typeof window!=='undefined'?window:globalThis);
