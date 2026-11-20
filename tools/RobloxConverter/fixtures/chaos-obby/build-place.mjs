import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let refSeq = 1;
const nextRef = () => `RBXCHAOS${String(refSeq++).padStart(8, '0')}`;

function rgbToColor3uint8(r, g, b) {
  return ((0xff << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

function cframeXml(x, y, z, rot = [1, 0, 0, 0, 1, 0, 0, 0, 1]) {
  return `
      <CoordinateFrame name="CFrame">
        <X>${x}</X><Y>${y}</Y><Z>${z}</Z>
        <R00>${rot[0]}</R00><R01>${rot[1]}</R01><R02>${rot[2]}</R02>
        <R10>${rot[3]}</R10><R11>${rot[4]}</R11><R12>${rot[5]}</R12>
        <R20>${rot[6]}</R20><R21>${rot[7]}</R21><R22>${rot[8]}</R22>
      </CoordinateFrame>`;
}

function partItem({
  className = 'Part',
  name,
  pos,
  size,
  rgb,
  shape = 1,
  material = 256,
  anchored = true,
  canCollide = true,
  transparency = 0,
  children = ''
}) {
  const c3 = rgbToColor3uint8(...rgb);
  return `
    <Item class="${className}" referent="${nextRef()}">
      <Properties>
        <string name="Name">${name}</string>
        <bool name="Anchored">${anchored}</bool>
        <bool name="CanCollide">${canCollide}</bool>
        <Color3uint8 name="Color3uint8">${c3}</Color3uint8>
        <token name="Material">${material}</token>
        <float name="Transparency">${transparency}</float>
        <token name="shape">${shape}</token>${cframeXml(...pos)}
        <Vector3 name="size"><X>${size[0]}</X><Y>${size[1]}</Y><Z>${size[2]}</Z></Vector3>
      </Properties>${children}
    </Item>`;
}

function folderItem(name, children = '', className = 'Folder') {
  return `
    <Item class="${className}" referent="${nextRef()}">
      <Properties>
        <string name="Name">${name}</string>
      </Properties>${children}
    </Item>`;
}

function scriptItem(className, name, relPath) {
  const source = fs.readFileSync(path.join(dir, relPath), 'utf8').replace(/\r\n/g, '\n');
  const safe = source.replaceAll(']]>', ']]]]><![CDATA[>');
  return `
    <Item class="${className}" referent="${nextRef()}">
      <Properties>
        <string name="Name">${name}</string>
        <ProtectedString name="Source"><![CDATA[${safe}]]></ProtectedString>
      </Properties>
    </Item>`;
}

const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
  <External>null</External>
  <External>nil</External>
  <Item class="Workspace" referent="${nextRef()}">
    <Properties>
      <string name="Name">Workspace</string>
      <float name="Gravity">196.2</float>
      <float name="FallenPartsDestroyHeight">-120</float>
    </Properties>
    <Item class="Camera" referent="${nextRef()}">
      <Properties>
        <string name="Name">Camera</string>
        <float name="FieldOfView">65</float>${cframeXml(-36, 30, 54)}
      </Properties>
    </Item>
    ${partItem({ name: 'LobbyFloor', pos: [-24, 0, 0], size: [26, 2, 26], rgb: [72, 80, 96], material: 256 })}
    ${folderItem('Spawnpoints',
      partItem({ className: 'SpawnLocation', name: 'LobbySpawn', pos: [-26, 1.5, 0], size: [8, 1, 8], rgb: [90, 180, 255], material: 256 })
    )}
    ${folderItem('Teleports',
      folderItem('Lobby',
        partItem({ name: 'EnterRedPad', pos: [-15, 1.5, 0], size: [6, 1, 8], rgb: [0, 230, 255], material: 288 })
      )
    )}
    ${folderItem('Checkpoints',
      partItem({ className: 'SpawnLocation', name: 'Red 0', pos: [0, 1.5, 0], size: [10, 2, 10], rgb: [220, 65, 65], material: 256 }) +
      folderItem('Red 1',
        partItem({ name: 'CheckpointBase', pos: [48, 3.5, 0], size: [10, 2, 10], rgb: [235, 110, 60], material: 256 }) +
        partItem({ className: 'SpawnLocation', name: 'CheckpointPad', pos: [48, 4.8, 0], size: [6, 0.6, 6], rgb: [255, 220, 90], material: 288 }),
        'Model'
      ) +
      partItem({ className: 'SpawnLocation', name: 'Red 2', pos: [92, 6, 0], size: [12, 2, 12], rgb: [60, 235, 130], material: 288 })
    )}
    ${folderItem('Rotation',
      folderItem('Right',
        folderItem('Right60',
          partItem({ name: 'Right60_Beam1', pos: [14, 2.5, 0], size: [14, 1.2, 3.5], rgb: [255, 195, 50], material: 288 })
        ) +
        folderItem('Right480',
          partItem({ name: 'Right480_Blade1', pos: [60, 5.2, -3], size: [10, 1.0, 2.0], rgb: [255, 95, 155], material: 288 })
        )
      ) +
      folderItem('Left',
        folderItem('Left60',
          partItem({ name: 'Left60_Beam1', pos: [28, 3.0, 0], size: [14, 1.2, 3.5], rgb: [120, 210, 255], material: 288 })
        ) +
        folderItem('Left480',
          partItem({ name: 'Left480_Blade1', pos: [60, 5.2, 3], size: [10, 1.0, 2.0], rgb: [195, 105, 255], material: 288 })
        )
      ) +
      folderItem('CylRight',
        folderItem('CylRight30',
          partItem({ name: 'CylRight30_Log1', pos: [70, 5.0, -4], size: [10, 4, 4], rgb: [90, 230, 190], shape: 2, material: 256 })
        )
      ) +
      folderItem('CylLeft',
        folderItem('CylLeft30',
          partItem({ name: 'CylLeft30_Log1', pos: [70, 5.0, 4], size: [10, 4, 4], rgb: [255, 155, 80], shape: 2, material: 256 })
        )
      )
    )}
    ${folderItem('Disappearing',
      partItem({ name: 'FadeTile_1', pos: [36, 3.2, -4], size: [6, 1.2, 6], rgb: [170, 235, 255], material: 288 }) +
      partItem({ name: 'FadeTile_2', pos: [40, 3.4, 2], size: [6, 1.2, 6], rgb: [170, 235, 255], material: 288 }) +
      partItem({ name: 'FadeTile_3', pos: [80, 5.5, 0], size: [8, 1.2, 8], rgb: [170, 235, 255], material: 288 }) +
      scriptItem('Script', 'Disapearing', 'Scripts/ServerScripts/Disapearing.legacy.luau')
    )}
    ${folderItem('Lava',
      partItem({ name: 'LavaFloor_1', pos: [26, -3.5, 0], size: [52, 1.5, 22], rgb: [255, 55, 25], material: 288 }) +
      partItem({ name: 'LavaBar_2', pos: [60, 4.3, 0], size: [20, 0.9, 2.2], rgb: [255, 45, 20], material: 288 })
    )}
  </Item>
  <Item class="Lighting" referent="${nextRef()}">
    <Properties>
      <string name="Name">Lighting</string>
      <float name="FogStart">100</float>
      <float name="FogEnd">500</float>
      <Color3 name="FogColor"><R>0.7843137</R><G>0.7843137</G><B>0.7843137</B></Color3>
    </Properties>
  </Item>
  <Item class="ReplicatedStorage" referent="${nextRef()}">
    <Properties>
      <string name="Name">ReplicatedStorage</string>
    </Properties>
  </Item>
  <Item class="ServerScriptService" referent="${nextRef()}">
    <Properties>
      <string name="Name">ServerScriptService</string>
    </Properties>
    ${scriptItem('Script', 'Motion', 'Scripts/ServerScripts/Motion.legacy.luau')}
    ${scriptItem('Script', 'Checkpoints', 'Scripts/ServerScripts/Checkpoints.legacy.luau')}
    ${scriptItem('Script', 'LavaObstacles', 'Scripts/ServerScripts/Lava Obstacles.legacy.luau')}
    ${scriptItem('Script', 'Teleport', 'Scripts/ServerScripts/Teleport.legacy.luau')}
    ${scriptItem('Script', 'ChaosFeatures', 'Scripts/ServerScripts/Chaos Features.legacy.luau')}
  </Item>
  <Item class="StarterGui" referent="${nextRef()}">
    <Properties>
      <string name="Name">StarterGui</string>
    </Properties>
    <Item class="ScreenGui" referent="${nextRef()}">
      <Properties>
        <string name="Name">ChaosHUD</string>
        <bool name="ResetOnSpawn">false</bool>
      </Properties>
      <Item class="TextLabel" referent="${nextRef()}">
        <Properties>
          <string name="Name">TimerLabel</string>
          <string name="Text">Next Chaos Event In: 04:00</string>
          <bool name="Visible">false</bool>
        </Properties>
        ${scriptItem('LocalScript', 'Timer', 'Scripts/LocalScripts/Timer.local.luau')}
      </Item>
    </Item>
  </Item>
</roblox>
`;

const outPath = path.join(dir, 'ChaosObby.rbxlx');
fs.writeFileSync(outPath, xml, 'utf8');
console.log(`Generated ${outPath} (${xml.length} bytes)`);
