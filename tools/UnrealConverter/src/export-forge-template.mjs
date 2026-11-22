import fs from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([".gd", ".gdshader", ".tscn", ".tres", ".godot", ".cfg", ".json", ".md", ".txt"]);
const MAX_SINGLE_FILE_BYTES = 1024 * 1024; // 1 MB
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8 MB

function copyFilteredFiles(srcDir, dstDir, relBase = "", stats = { files: [], totalBytes: 0 }) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === ".godot" || entry.name === "tests" || entry.name.endsWith(".import")) {
      continue;
    }
    const srcPath = path.join(srcDir, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const dstPath = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyFilteredFiles(srcPath, dstPath, relPath, stats);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext) && entry.name !== "project.godot") {
        continue;
      }
      const buf = fs.readFileSync(srcPath);
      if (buf.length > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`Template file exceeds 1 MB PlayForge limit: ${relPath} (${buf.length} bytes)`);
      }
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.writeFileSync(dstPath, buf);
      stats.files.push(relPath);
      stats.totalBytes += buf.length;
    }
  }
  return stats;
}

export function exportPortedToForgeTemplate({
  portedDir,
  templateDir,
  templateId = "unreal-third-person",
  templateName = null,
  templateDescription = null
}) {
  const absSrc = path.resolve(portedDir);
  const absDst = path.resolve(templateDir);
  fs.rmSync(absDst, { recursive: true, force: true });
  fs.mkdirSync(absDst, { recursive: true });

  const stats = copyFilteredFiles(absSrc, absDst);
  const isStackOBot = templateId === "unreal-stack-o-bot" || templateId === "unreal-binary-stack-o-bot";
  const isBinaryUmap = templateId === "unreal-binary-stack-o-bot";

  const scriptFiles = stats.files.filter((f) => f.startsWith("scripts/") && f.endsWith(".gd")).sort();
  const assetPaths = stats.files
    .filter((f) => f.startsWith("assets/") && (f.endsWith(".tres") || f.endsWith(".gdshader") || f.endsWith(".json")))
    .sort();
  const metadata = {
    id: templateId,
    name:
      templateName ||
      (isBinaryUmap
        ? "Unreal Binary .umap Stack O Bot 3D (RE Port)"
        : isStackOBot
          ? "Unreal Stack O Bot 3D (UE Port)"
          : "Unreal Third Person 3D (UE Port)"),
    description:
      templateDescription ||
      (isStackOBot
        ? "Unreal Engine 5.4 Stack O Bot 샘플(제트팩 호버, 비활성 봇 스폰·압력판 퍼즐, Blueprint Interface/Delegate/Timeline 문 개폐, 에너지 오브·목표 패드, 포팅 메시/텍스처/머티리얼/오디오 에셋)을 Godot 4.7.2로 자동 포팅한 3D 템플릿."
        : "Unreal Engine 5.4 Third Person Template을 PlayForge Unified Game IR v0.1과 Blueprint→GDScript 컴파일러, UECharacterMovement 호환 런타임, 포팅 에셋으로 자동 포팅한 Godot 4.7.2 3D 템플릿."),
    dimension: "3d",
    assetPaths,
    guideOrder: [
      "addons/playforge_unreal_compat/unreal_compat.gd",
      "addons/playforge_unreal_compat/ue_character_movement.gd",
      ...scriptFiles,
      "scenes/main.tscn",
      "project.godot"
    ],
    guide: "README.md"
  };

  const readme = isStackOBot
    ? `# Unreal Stack O Bot 3D (UE → Godot Port)

PlayForge UnrealConverter로 Unreal Engine 5.4 **Stack O Bot** 샘플을 Godot 4.7.2로 자동 포팅한 3D 퍼즐 플랫포머 템플릿입니다.

## 주요 포팅 내용
- **제트팩 호버 & 연료 시스템**: \`UECharacterMovement\` (\`Space\` 점프 + \`LeftShift\` 제트팩 호버, 연료 소모/지면 자동 회복, \`JetpackHover\` 애니메이션 상태)
- **비활성 봇 스폰 ("Stack" 퍼즐)**: \`E\` 키(\`IA_SpawnBot\`)로 \`BP_InactiveBot\`을 생성해 압력판(\`BP_PressurePlate\`)을 누른 상태로 유지
- **복합 Blueprint 변환 (Delegate · Interface · Timeline)**: \`BP_PressurePlate\` → \`on_plate_state_changed\` Delegate + \`BPI_Interactable.bpi_on_interact\` → \`BP_Door\` Timeline 개폐
- **수집 & 클리어**: 에너지 오브(\`BP_EnergyOrb\`) 수집 및 목표 패드(\`BP_GoalPad\`) 도달
- **라이선스 준수**: 재배포 불가 UE 전용 스켈레탈 메시는 제외하고 절차적 캡슐 봇으로 안전 대체
`
    : `# Unreal Third Person 3D (UE → Godot Port)

PlayForge UnrealConverter로 Unreal Engine 5.4 Third Person Template을 Godot 4.7.2로 자동 포팅한 3D 템플릿입니다.

## 주요 포팅 내용
- **좌표·단위 변환**: UE 센티미터(왼손 Z-Up) → Godot 미터(오른손 Y-Up)
- **캐릭터 이동 호환**: \`UECharacterMovement\` (\`max_walk_speed_cm=500\`, \`jump_z_velocity_cm=700\`, \`gravity_scale=1.75\`, \`air_control=0.35\`, 경사각 44.7°)
- **Blueprint → GDScript 컴파일**: \`BP_ThirdPersonCharacter\` 이벤트 그래프 및 Enhanced Input (\`WASD\`, \`Space\`, 마우스 시점) 자동 변환
- **라이선스 준수**: 재배포 불가 UE 전용 스켈레탈 메시는 제외하고 절차적 캡슐 마네킹으로 안전 대체
`;

  const licenseTxt = `PlayForge Internal Template — Procedural Geometry & PlayForge UnrealCompat Runtime.
No proprietary Epic Games / Unreal Engine binary assets are bundled in this template.
`;

  fs.writeFileSync(path.join(absDst, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(absDst, "README.md"), readme, "utf8");
  fs.writeFileSync(path.join(absDst, "LICENSE.txt"), licenseTxt, "utf8");

  stats.files.push("metadata.json", "README.md", "LICENSE.txt");
  stats.totalBytes += Buffer.byteLength(JSON.stringify(metadata)) + Buffer.byteLength(readme) + Buffer.byteLength(licenseTxt);

  if (stats.totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`Template exceeds 8 MB PlayForge limit (${stats.totalBytes} bytes)`);
  }

  return {
    templateId,
    templateDir: absDst,
    fileCount: stats.files.length,
    totalBytes: stats.totalBytes,
    files: stats.files
  };
}
