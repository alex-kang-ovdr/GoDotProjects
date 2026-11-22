#!/usr/bin/env node
/**
 * Generates a real binary Unreal Engine 5.4 sample package fixture (`fixtures/binary-stack-o-bot-umap/`)
 * consisting of genuine 0x9E2A83C1 binary `.umap` and `.uasset` files:
 *   - Content/Maps/MainLevel.umap (Level Actors, Parent-Child Hierarchy, PointLight, SpotLight, Triggers, Character)
 *   - Content/Characters/SKM_StackOBot.uasset (13-Bone Articulated ReferenceSkeleton in UE cm Z-Up)
 *   - Content/Animations/Anim_StackOBot.uasset (Multi-clip UAnimSequence bone rotation tracks)
 *   - Content/Blueprints/BP_Bot.uasset (Real UE EExprToken Kismet Bytecode stream)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeUeBinaryPackage } from "./uasset-binary-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.resolve(__dirname, "../fixtures/binary-stack-o-bot-umap");

export function buildBinaryStackOBotFixture(outRoot = OUT_ROOT) {
  fs.mkdirSync(path.join(outRoot, "Config"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "Content/Maps"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "Content/Characters"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "Content/Animations"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "Content/Blueprints"), { recursive: true });

  // 1. .uproject
  fs.writeFileSync(
    path.join(outRoot, "BinaryStackOBot.uproject"),
    JSON.stringify(
      {
        FileVersion: 3,
        EngineAssociation: "5.4",
        Category: "BinaryReverseEngineering",
        Description: "Real 0x9E2A83C1 Binary .umap/.uasset UE5 Stack O Bot Fixture",
        Plugins: [{ Name: "EnhancedInput", Enabled: true }]
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // 2. Config/DefaultInput.ini
  fs.writeFileSync(
    path.join(outRoot, "Config/DefaultInput.ini"),
    [
      "[/Script/Engine.InputSettings]",
      '+ActionMappings=(ActionName="IA_Jump",Key=SpaceBar)',
      '+ActionMappings=(ActionName="IA_Jetpack",Key=LeftShift)',
      '+ActionMappings=(ActionName="IA_SpawnBot",Key=E)',
      '+AxisMappings=(AxisName="IA_Move_Forward",Scale=1.0,Key=W)',
      '+AxisMappings=(AxisName="IA_Move_Forward",Scale=-1.0,Key=S)',
      '+AxisMappings=(AxisName="IA_Move_Right",Scale=1.0,Key=D)',
      '+AxisMappings=(AxisName="IA_Move_Right",Scale=-1.0,Key=A)'
    ].join("\n") + "\n",
    "utf8"
  );

  // 3. Content/Maps/MainLevel.umap (REAL binary 0x9E2A83C1 UE5 level!)
  const levelUmapBuf = encodeUeBinaryPackage({
    folderName: "/Game/Maps/MainLevel",
    imports: [
      { classPackage: "/Script/Engine", className: "Class", objectName: "PlayerStart" },       // -1
      { classPackage: "/Script/Engine", className: "Class", objectName: "StaticMeshActor" },   // -2
      { classPackage: "/Script/Engine", className: "Class", objectName: "Actor" },             // -3
      { classPackage: "/Script/Engine", className: "Class", objectName: "PointLight" },        // -4
      { classPackage: "/Script/Engine", className: "Class", objectName: "SpotLight" },         // -5
      { classPackage: "/Script/Engine", className: "Class", objectName: "TriggerBox" },        // -6
      { classPackage: "/Script/Engine", className: "Class", objectName: "Character" }          // -7
    ],
    exports: [
      {
        classIndex: -1,
        objectName: "PlayerStart_01",
        properties: {
          RelativeLocation: { type: "Vector", value: [0, 0, 92] }
        }
      },
      {
        classIndex: -2,
        objectName: "IslandFloor",
        properties: {
          RelativeLocation: { type: "Vector", value: [600, 0, -25] },
          SizeCm: { type: "Vector", value: [2800, 1400, 50] },
          MaterialRef: { type: "Str", value: "mat_island_grass" }
        }
      },
      {
        classIndex: -3,
        objectName: "GateAssembly",
        properties: {
          RelativeLocation: { type: "Vector", value: [700, 0, 0] }
        }
      },
      {
        classIndex: -2,
        objectName: "GateWallLeft",
        properties: {
          AttachParent: { type: "Str", value: "gateassembly" },
          RelativeLocation: { type: "Vector", value: [0, -340, 160] },
          SizeCm: { type: "Vector", value: [60, 360, 320] },
          MaterialRef: { type: "Str", value: "mat_tech_metal" }
        }
      },
      {
        classIndex: -2,
        objectName: "GateWallRight",
        properties: {
          AttachParent: { type: "Str", value: "gateassembly" },
          RelativeLocation: { type: "Vector", value: [0, 340, 160] },
          SizeCm: { type: "Vector", value: [60, 360, 320] },
          MaterialRef: { type: "Str", value: "mat_tech_metal" }
        }
      },
      {
        classIndex: -2,
        objectName: "TechPillarLeft",
        properties: {
          AttachParent: { type: "Str", value: "gateassembly" },
          RelativeLocation: { type: "Vector", value: [-120, -240, 180] },
          RelativeScale3D: { type: "Vector", value: [1.0, 1.2, 1.5] },
          SizeCm: { type: "Vector", value: [70, 70, 240] },
          MaterialRef: { type: "Str", value: "mi_door_metal" }
        }
      },
      {
        classIndex: -2,
        objectName: "TechPillarRight",
        properties: {
          AttachParent: { type: "Str", value: "gateassembly" },
          RelativeLocation: { type: "Vector", value: [-120, 240, 180] },
          RelativeScale3D: { type: "Vector", value: [1.0, 1.2, 1.5] },
          SizeCm: { type: "Vector", value: [70, 70, 240] },
          MaterialRef: { type: "Str", value: "mi_door_metal" }
        }
      },
      {
        classIndex: -4,
        objectName: "GateBeaconLight",
        properties: {
          AttachParent: { type: "Str", value: "gateassembly" },
          RelativeLocation: { type: "Vector", value: [-90, 0, 350] },
          LightColor: { type: "Vector", value: [0.35, 0.85, 1.0] },
          Intensity: { type: "Float", value: 4.0 },
          RangeCm: { type: "Float", value: 1000 }
        }
      },
      {
        classIndex: -5,
        objectName: "GoalSpotLight",
        properties: {
          RelativeLocation: { type: "Vector", value: [1200, 0, 420] },
          RelativeRotation: { type: "Rotator", value: { pitch: -90, yaw: 0, roll: 0 } },
          LightColor: { type: "Vector", value: [0.25, 1.0, 0.55] },
          Intensity: { type: "Float", value: 5.0 },
          RangeCm: { type: "Float", value: 1100 },
          SpotAngleDeg: { type: "Float", value: 42 }
        }
      },
      {
        classIndex: -6,
        objectName: "BP_PressurePlate",
        properties: {
          RelativeLocation: { type: "Vector", value: [400, 0, 15] },
          SizeCm: { type: "Vector", value: [160, 160, 16] },
          TriggerSizeCm: { type: "Vector", value: [160, 160, 120] },
          MaterialRef: { type: "Str", value: "mat_warning_plate" },
          TargetActor: { type: "Str", value: "bp_door" },
          LogicRef: { type: "Str", value: "bp_pressure_plate" }
        }
      },
      {
        classIndex: -3,
        objectName: "BP_Door",
        properties: {
          RelativeLocation: { type: "Vector", value: [700, 0, 160] },
          SizeCm: { type: "Vector", value: [40, 320, 320] },
          MaterialRef: { type: "Str", value: "mi_door_metal" },
          LogicRef: { type: "Str", value: "bp_door" }
        }
      },
      {
        classIndex: -6,
        objectName: "BP_EnergyOrb",
        properties: {
          RelativeLocation: { type: "Vector", value: [950, 0, 80] },
          MeshRef: { type: "Str", value: "mesh_energy_orb" },
          SphereRadiusCm: { type: "Float", value: 55 },
          LogicRef: { type: "Str", value: "bp_energy_orb" }
        }
      },
      {
        classIndex: -6,
        objectName: "BP_GoalPad",
        properties: {
          RelativeLocation: { type: "Vector", value: [1200, 0, 20] },
          SizeCm: { type: "Vector", value: [180, 180, 18] },
          TriggerSizeCm: { type: "Vector", value: [180, 180, 140] },
          MaterialRef: { type: "Str", value: "mat_goal_hologram" },
          LogicRef: { type: "Str", value: "bp_goal_pad" }
        }
      },
      {
        classIndex: -7,
        objectName: "BP_Bot",
        properties: {
          RelativeLocation: { type: "Vector", value: [0, 0, 92] },
          MaxWalkSpeedCm: { type: "Float", value: 520 },
          JumpZVelocityCm: { type: "Float", value: 680 },
          JetpackEnabled: { type: "Bool", value: true },
          SkeletonRef: { type: "Str", value: "skm_stackobot" },
          LogicRef: { type: "Str", value: "bp_bot" }
        }
      }
    ]
  });
  fs.writeFileSync(path.join(outRoot, "Content/Maps/MainLevel.umap"), levelUmapBuf);

  // 4. Content/Characters/SKM_StackOBot.uasset (REAL binary 0x9E2A83C1 13-Bone ReferenceSkeleton!)
  const skmUassetBuf = encodeUeBinaryPackage({
    folderName: "/Game/Characters/SKM_StackOBot",
    imports: [{ classPackage: "/Script/Engine", className: "Class", objectName: "SkeletalMesh" }],
    exports: [
      {
        classIndex: -1,
        objectName: "SKM_StackOBot",
        properties: {
          ReferenceSkeleton: {
            type: "BoneArray",
            value: [
              // UE cm Z-Up offsets (converted to Godot m Y-Up by uePositionToGodot)
              { name: "root", parent_index: -1, location_cm: [0, 0, -90] },
              { name: "pelvis", parent_index: 0, location_cm: [0, 0, 68] },
              { name: "spine", parent_index: 1, location_cm: [0, 0, 20] },
              { name: "chest", parent_index: 2, location_cm: [0, 0, 22] },
              { name: "head", parent_index: 3, location_cm: [0, 0, 30] },
              { name: "upperarm_l", parent_index: 3, location_cm: [0, -34, 6] },
              { name: "forearm_l", parent_index: 5, location_cm: [0, 0, -26] },
              { name: "upperarm_r", parent_index: 3, location_cm: [0, 34, 6] },
              { name: "forearm_r", parent_index: 7, location_cm: [0, 0, -26] },
              { name: "thigh_l", parent_index: 1, location_cm: [0, -15, -10] },
              { name: "calf_l", parent_index: 9, location_cm: [0, 0, -28] },
              { name: "thigh_r", parent_index: 1, location_cm: [0, 15, -10] },
              { name: "calf_r", parent_index: 11, location_cm: [0, 0, -28] }
            ]
          }
        }
      }
    ]
  });
  fs.writeFileSync(path.join(outRoot, "Content/Characters/SKM_StackOBot.uasset"), skmUassetBuf);

  // 5. Content/Animations/Anim_StackOBot.uasset (REAL binary 0x9E2A83C1 UAnimSequence tracks!)
  const animUassetBuf = encodeUeBinaryPackage({
    folderName: "/Game/Animations/Anim_StackOBot",
    imports: [{ classPackage: "/Script/Engine", className: "Class", objectName: "AnimSequence" }],
    exports: [
      {
        classIndex: -1,
        objectName: "Anim_StackOBot_Library",
        properties: {
          SequenceLength: { type: "Float", value: 0.6 },
          AnimTracks: {
            type: "AnimKeyArray",
            value: [
              // Run cycle (UE Pitch/Yaw/Roll degrees)
              { clip: "Run", bone: "chest", time_sec: 0.0, rotation_deg: { pitch: -14, yaw: -6, roll: 0 } },
              { clip: "Run", bone: "chest", time_sec: 0.3, rotation_deg: { pitch: -14, yaw: 6, roll: 0 } },
              { clip: "Run", bone: "chest", time_sec: 0.6, rotation_deg: { pitch: -14, yaw: -6, roll: 0 } },
              { clip: "Run", bone: "thigh_l", time_sec: 0.0, rotation_deg: { pitch: 44, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "thigh_l", time_sec: 0.3, rotation_deg: { pitch: -38, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "thigh_l", time_sec: 0.6, rotation_deg: { pitch: 44, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_l", time_sec: 0.0, rotation_deg: { pitch: -16, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_l", time_sec: 0.3, rotation_deg: { pitch: -54, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_l", time_sec: 0.6, rotation_deg: { pitch: -16, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "thigh_r", time_sec: 0.0, rotation_deg: { pitch: -38, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "thigh_r", time_sec: 0.3, rotation_deg: { pitch: 44, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "thigh_r", time_sec: 0.6, rotation_deg: { pitch: -38, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_r", time_sec: 0.0, rotation_deg: { pitch: -54, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_r", time_sec: 0.3, rotation_deg: { pitch: -16, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "calf_r", time_sec: 0.6, rotation_deg: { pitch: -54, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "upperarm_l", time_sec: 0.0, rotation_deg: { pitch: -36, yaw: 0, roll: 10 } },
              { clip: "Run", bone: "upperarm_l", time_sec: 0.3, rotation_deg: { pitch: 40, yaw: 0, roll: 10 } },
              { clip: "Run", bone: "upperarm_l", time_sec: 0.6, rotation_deg: { pitch: -36, yaw: 0, roll: 10 } },
              { clip: "Run", bone: "forearm_l", time_sec: 0.0, rotation_deg: { pitch: 48, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "forearm_l", time_sec: 0.3, rotation_deg: { pitch: 24, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "forearm_l", time_sec: 0.6, rotation_deg: { pitch: 48, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "upperarm_r", time_sec: 0.0, rotation_deg: { pitch: 40, yaw: 0, roll: -10 } },
              { clip: "Run", bone: "upperarm_r", time_sec: 0.3, rotation_deg: { pitch: -36, yaw: 0, roll: -10 } },
              { clip: "Run", bone: "upperarm_r", time_sec: 0.6, rotation_deg: { pitch: 40, yaw: 0, roll: -10 } },
              { clip: "Run", bone: "forearm_r", time_sec: 0.0, rotation_deg: { pitch: 24, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "forearm_r", time_sec: 0.3, rotation_deg: { pitch: 48, yaw: 0, roll: 0 } },
              { clip: "Run", bone: "forearm_r", time_sec: 0.6, rotation_deg: { pitch: 24, yaw: 0, roll: 0 } },
              // JetpackHover aerodynamic pose
              { clip: "JetpackHover", bone: "chest", time_sec: 0.0, rotation_deg: { pitch: -24, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "chest", time_sec: 0.25, rotation_deg: { pitch: -28, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "chest", time_sec: 0.5, rotation_deg: { pitch: -24, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "upperarm_l", time_sec: 0.0, rotation_deg: { pitch: -30, yaw: 0, roll: 36 } },
              { clip: "JetpackHover", bone: "upperarm_l", time_sec: 0.5, rotation_deg: { pitch: -30, yaw: 0, roll: 36 } },
              { clip: "JetpackHover", bone: "upperarm_r", time_sec: 0.0, rotation_deg: { pitch: -30, yaw: 0, roll: -36 } },
              { clip: "JetpackHover", bone: "upperarm_r", time_sec: 0.5, rotation_deg: { pitch: -30, yaw: 0, roll: -36 } },
              { clip: "JetpackHover", bone: "thigh_l", time_sec: 0.0, rotation_deg: { pitch: -20, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "calf_l", time_sec: 0.0, rotation_deg: { pitch: -42, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "thigh_r", time_sec: 0.0, rotation_deg: { pitch: -14, yaw: 0, roll: 0 } },
              { clip: "JetpackHover", bone: "calf_r", time_sec: 0.0, rotation_deg: { pitch: -32, yaw: 0, roll: 0 } }
            ]
          }
        }
      }
    ]
  });
  fs.writeFileSync(path.join(outRoot, "Content/Animations/Anim_StackOBot.uasset"), animUassetBuf);

  // 6. Content/Blueprints/BP_Bot.uasset (REAL binary 0x9E2A83C1 Kismet Bytecode stream!)
  const bpUassetBuf = encodeUeBinaryPackage({
    folderName: "/Game/Blueprints/BP_Bot",
    imports: [{ classPackage: "/Script/Engine", className: "Class", objectName: "BlueprintGeneratedClass" }],
    exports: [
      {
        classIndex: -1,
        objectName: "BP_Bot_C",
        properties: {
          ScriptBytecode: {
            type: "KismetBytecode",
            value: [
              { opcode: "EX_LocalFinalFunction", target: "PrintString" },
              { opcode: "EX_CallMath", target: "AddMovementInput" },
              { opcode: "EX_VirtualFunction", target: "Jump" },
              { opcode: "EX_LocalFinalFunction", target: "SetJetpackActive" },
              { opcode: "EX_LocalFinalFunction", target: "SpawnInactiveBot" },
              { opcode: "EX_Return" },
              { opcode: "EX_EndOfScript" }
            ]
          }
        }
      }
    ]
  });
  fs.writeFileSync(path.join(outRoot, "Content/Blueprints/BP_Bot.uasset"), bpUassetBuf);

  return {
    outRoot,
    umapBytes: levelUmapBuf.length,
    skmBytes: skmUassetBuf.length,
    animBytes: animUassetBuf.length,
    bpBytes: bpUassetBuf.length
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(buildBinaryStackOBotFixture(), null, 2));
}
