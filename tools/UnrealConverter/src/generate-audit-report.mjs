#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dirname, "..");

export function generateFailedAssetsTodoMarkdown(auditJsonPath, outMdPath) {
  const audit = JSON.parse(fs.readFileSync(auditJsonPath, "utf8"));
  const { totals, by_category: byCategory, assets } = audit;

  const failed = assets.filter((a) => a.Status === "FAILED_UNSUPPORTED");
  const partial = assets.filter((a) => a.Status === "PORTED_PARTIAL");
  const full = assets.filter((a) => a.Status === "PORTED_FULL");

  const lines = [
    `# Epic Games \`StackOBot_5.4\` 전체 에셋 실포팅 감사 및 미완/실패 에셋 개선 TODO 리포트`,
    ``,
    `- **원본 프로젝트**: \`StackOBot_5.4\` (UE 5.4 공식 샘플, OFPA WorldPartition + Nanite + Niagara + MetaSound + ControlRig + Enhanced Input)`,
    `- **전체 에셋 전수 검사 수**: **${totals.total_assets_audited}개** (\`.uasset\` / \`.umap\`) + **\`MainWorld\` OFPA ExternalActors ${totals.mainworld_external_actors}개**`,
    `- **완전 포팅 (\`PORTED_FULL\`)**: **${totals.ported_full}개** (${((totals.ported_full / Math.max(1, totals.total_assets_audited)) * 100).toFixed(1)}%)`,
    `- **부분/근사 포팅 (\`PORTED_PARTIAL\`)**: **${totals.ported_partial}개** (${((totals.ported_partial / Math.max(1, totals.total_assets_audited)) * 100).toFixed(1)}%)`,
    `- **포팅 실패/미지원 (\`FAILED_UNSUPPORTED\`)**: **${totals.failed_unsupported}개** (${((totals.failed_unsupported / Math.max(1, totals.total_assets_audited)) * 100).toFixed(1)}%)`,
    `- **레벨 인스턴스 복원**: StaticMeshActor **${totals.static_mesh_actors}개**, Blueprint Actor **${totals.blueprint_actors}개**, MultiMesh 인스턴스 **${totals.multimesh_total_instances}개** (\`BPP_Struct_001..004\` + \`InstancedFoliageActor\`), 16-bit Landscape 지형 **${totals.landscape_triangles} tris**`,
    ``,
    `---`,
    ``,
    `## 1. 카테고리별 포팅 달성 현황`,
    ``,
    `| 카테고리 | 전체 에셋 수 | 완전 포팅 (\`FULL\`) | 부분 포팅 (\`PARTIAL\`) | 실패/미지원 (\`FAILED\`) | 비고 |`,
    `|---|---:|---:|---:|---:|---|`
  ];

  for (const c of byCategory) {
    lines.push(`| **${c.category}** | ${c.total} | ${c.full} | ${c.partial} | ${c.failed} | ${c.failed === 0 && c.partial === 0 ? "100% 완료" : "하단 TODO 참조"} |`);
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 2. 포팅 실패/미지원 에셋 전수 목록 (\`FAILED_UNSUPPORTED\`: ${failed.length}건) 및 기술적 개선 방안`,
    ``
  );

  if (failed.length === 0) {
    lines.push(`> 실패 에셋 없음`);
  } else {
    lines.push(
      `| # | 카테고리 | 에셋 경로 | UE 클래스 | 실패 원인 (Root Cause) | 엔지니어링 개선 방안 (Actionable TODO) |`,
      `|---:|---|---|---|---|---|`
    );
    failed.forEach((f, idx) => {
      lines.push(
        `| ${idx + 1} | \`${f.Category}\` | \`${f.RelativePath}\` | \`${f.UnrealClass}\` | ${(f.FailureReason || f.Details || "").replace(/\|/g, "\\|")} | ${(f.RemediationTodo || "").replace(/\|/g, "\\|")} |`
      );
    });
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 3. 부분/근사 포팅 에셋 전수 목록 (\`PORTED_PARTIAL\`: ${partial.length}건) 및 고도화 TODO`,
    ``,
    `| # | 카테고리 | 에셋 경로 | UE 클래스 | 부분 포팅 사유 | 고도화 TODO |`,
    `|---:|---|---|---|---|---|`
  );

  partial.forEach((p, idx) => {
    lines.push(
      `| ${idx + 1} | \`${p.Category}\` | \`${p.RelativePath}\` | \`${p.UnrealClass}\` | ${(p.FailureReason || p.Details || "").replace(/\|/g, "\\|")} | ${(p.RemediationTodo || "").replace(/\|/g, "\\|")} |`
    );
  });

  lines.push(
    ``,
    `---`,
    ``,
    `## 4. 핵심 미지원 서브시스템별 심층 아키텍처 개선 로드맵 (Engineering Investigation)`,
    ``,
    `### TODO-1: UE5 \`USkeletalMesh\` 순수 바이너리 스키닝 추출기 (\`SKM_Backpack.uasset\` 등 FBX 미동봉 에셋)`,
    `- **현상**: \`SKM_Bot\`은 공식 소스 번들(\`SKM_Antbot.fbx\`)을 통해 53본 스키닝 메시로 100% 포팅되었으나, \`SKM_Backpack.uasset\`은 \`UAssetAPI\`에서 \`RawExport\`(\`FSkeletalMeshRenderData\` / \`SkeletalMeshEditorData\`)로 노출되어 FBX 없이는 정점 가중치 추출이 누락됨.`,
    `- **바이너리 구조 및 해결 방안**:`,
    `  1. 에디터 전용 \`.uasset\`의 \`SkeletalMeshEditorData\` BulkData(\`FRawSkeletalMeshBulkData\`)에서 \`FSkeletalMeshImportData\`(\`Points\`, \`Wedges\`, \`Faces\`, \`RawBoneInfluences\`) 직렬화 스트림을 직접 파싱하거나, \`FabianFG/CUE4Parse\`의 \`USkeletalMesh\` \`FSkeletalMeshLODRenderData\`(\`StaticVertexBuffers.PositionVertexBuffer\`, \`SkinWeightVertexBuffer\`) 리더를 \`UAssetBridge\`에 통합.`,
    `  2. 파싱된 본 인덱스(\`JOINTS_0\`)·가중치(\`WEIGHTS_0\`)·역바인드 행렬(\`inverseBindMatrices\`)을 glTF 2.0(\`.glb\`)으로 직렬화해 Godot 4.7 \`GLTFDocument\`로 무손실 임포트.`,
    ``,
    `### TODO-2: UE5 \`MetaSoundSource\` 절차적 오디오 신시사이저 그래프 (\`SFX_CollectCoin\`, \`SFX_Jetpack\`, \`SFX_Music\`)`,
    `- **현상**: \`JetpackStart/Loop/End.uasset\`(\`USoundWave\`)는 \`FCompressedBuffer\` 내 원본 RIFF WAVE PCM을 100% 추출 완료했으나, \`SFX_CollectCoin\`·\`SFX_Jetpack\`·\`SFX_Music\`은 파형 데이터가 없는 UE5 **\`MetaSoundSource\` 절차적 DSP 노드 그래프**(오실레이터·ADSR 엔벨로프·바이쿼드 필터·랜덤 피치 트리거)로 구성됨.`,
    `- **해결 방안 (2-Track)**:`,
    `  1. **정적 바운스 트랙**: Unreal Engine 설치 환경에서는 Headless Commandlet(\`UnrealEditor-Cmd.exe -run=MetaSoundBounce\`)으로 \`MetaSoundFrontendDocument\`를 오프라인 렌더링해 \`.wav\`로 베이크.`,
    `  2. **런타임 합성 트랙**: \`UAssetAPI\`로 \`FMetasoundFrontendDocument.RootGraph.Nodes\`(Sine/Saw, ADSR, BiquadFilter, Mixer)를 추출해 Godot \`AudioStreamGenerator\` GDScript/GDExtension DSP 그래프로 트랜스파일.`,
    ``,
    `### TODO-3: UE5 \`UNiagaraSystem\` HLSL VM 바이트코드 & Ribbon/SkeletalMesh DI (\`FX_WindBands\`, \`FX_CharacterDesolve\`)`,
    `- **현상**: 스프라이트 기반 이미터(\`FX_JetpackThruster\`, \`FX_SpawnPadActive\`, \`NS_GroundSwish\`, \`NS_Vents\`)는 Godot \`GPUParticles3D\`로 치환했으나, 리본 트레일(\`FX_WindBands\`의 \`NiagaraRibbonRendererProperties\`)과 스켈레탈 메시 표면 샘플링(\`FX_CharacterDesolve\`의 \`NiagaraDataInterfaceSkeletalMesh\`)은 Godot Compatibility 렌더러의 기본 파티클과 1:1 대응되지 않음.`,
    `- **해결 방안**:`,
    `  1. \`NiagaraRibbonRendererProperties\` → Godot 4 \`GPUParticles3D\`의 \`RibbonTrailMesh\` / \`TubeTrailMesh\`(\`use_trails = true\`)로 매핑 (Forward+/Mobile 렌더러 전환 또는 커스텀 트레일 메시 제너레이터 적용).`,
    `  2. \`FX_CharacterDesolve\` → \`M_AntBotDesolve\`(\`T_DesolveNoise.png\` 알파 시저 디졸브 셰이더) + 메시 표면 포인트 클라우드 샘플링 텍스처를 \`custom_shader\` \`ParticleProcessMaterial\`로 컴파일.`,
    ``,
    `### TODO-4: UE5 \`ControlRig\` (\`CR_Bot_Correction\`, \`CR_MovingPlatform\`) & \`PhysicsAsset\` (\`PhA_Bot\`)`,
    `- **현상**: \`RigVM\` 바이트코드 기반 절차적 본 보정(\`CR_Bot_Correction\`)과 래그돌(\`PhA_Bot\`) 미변환.`,
    `- **해결 방안**:`,
    `  1. \`RigVM\` AST에서 \`FRigUnit_TwoBoneIKSimple\` / \`FRigUnit_ModifyTransforms\` 노드를 분석해 Godot 4.4+ \`SkeletonModifier3D\` (\`TwoBoneIK3D\`, \`LookAtModifier3D\`) 노드로 자동 생성.`,
    `  2. \`PhysicsAsset\`의 \`SkeletalBodySetup\`(\`SphylElems\`) 및 \`PhysicsConstraintTemplate\` 각도 제한을 Godot \`PhysicalBoneSimulator3D\` + \`PhysicalBone3D\`(\`Generic6DOFJoint3D\`)로 변환.`,
    ``,
    `### TODO-5: 마스터 머티리얼 그래프(\`M_*\`, \`MF_*\`) & Runtime Virtual Texture (\`RVT_*\`)`,
    `- **현상**: \`MI_*\` 인스턴스의 스칼라·벡터·텍스처 파라미터는 추출되었으나, 마스터 머티리얼 내부 \`MF_TreeWind\`(버텍스 바람 흔들림), \`RVT\`(지형-바위 경계 블렌딩), \`SM_SlopeWarpLandscape\` 월드 스페이스 워프 노드는 근사 셰이더로 대체됨.`,
    `- **해결 방안**:`,
    `  1. \`UMaterial.EditorOnlyData\` 내 \`ExpressionCollection\`(\`UMaterialExpression*\` Export 체인)을 \`UAssetBridge\`에서 직접 직렬화해 기존 \`material-shader-compiler.mjs\` 입력 IR로 연결 → 1:1 \`.gdshader\`(\`vertex()\` WPO 바람 포함) 자동 생성.`,
    `  2. \`RuntimeVirtualTextureVolume\` 영역을 오프라인 월드 Top-Down 투영 텍스처로 베이크하여 바위/프롭 하단 경계면에서 월드 XZ UV로 샘플링.`,
    ``,
    `### TODO-6: UMG \`WidgetBlueprint\` (\`BPW_MainMenu\`, \`BPW_PauseMenu\`, \`BPW_HeadupDisplay\`, \`BPW_Controls\`, \`BPW_HintText\`)`,
    `- **현상**: 핵심 인게임 HUD 카운터는 동작하나, 원본 \`UWidgetTree\` 계층·앵커·CommonUI 버튼 스타일이 자동 컴파일되지 않음.`,
    `- **해결 방안**:`,
    `  - \`WidgetBlueprint\` 내 \`WidgetTree.RootWidget\`(\`CanvasPanel\`, \`Overlay\`, \`VerticalBox\`, \`HorizontalBox\`, \`Image\`, \`TextBlock\`) 및 \`CanvasPanelSlot.LayoutData\`(\`Offsets\`, \`Anchors\`, \`Alignment\`)를 파싱해 Godot \`Control\` / \`Container\` \`.tscn\` 및 \`Theme\` 리소스를 자동 생성.`,
    ``,
    `---`,
    ``,
    `## 5. 완전 포팅 에셋 요약 (\`PORTED_FULL\`: ${full.length}건 중 대표 항목)`,
    ``,
    `- **레벨 & 지형**: \`MainWorld.umap\` + 419 OFPA ExternalActors + 6 \`LandscapeStreamingProxy\` 16-bit 하이트맵 지형 + \`BPP_Struct_001..004\` 모듈러 건물 MultiMesh`,
    `- **캐릭터 & 리깅 & 애니메이션**: \`SKM_Bot\`(\`SKM_Antbot.fbx\` 53본 스키닝) + \`SK_Bot\`(53본 바인드 포즈) + \`A_Bot_*\` 15종 전체 애니메이션 클립`,
    `- **정적 메시**: \`FMeshDescription\` Oodle 압축 해제로 원본 정점·노멀·UV·멀티 머티리얼 슬롯 추출 완료`,
    `- **텍스처 & 오디오**: Oodle \`FCompressedBuffer\` 내 원본 PNG 텍스처 및 \`JetpackStart/Loop/End\` RIFF WAVE PCM 무손실 추출 완료`,
    ``
  );

  fs.mkdirSync(path.dirname(outMdPath), { recursive: true });
  fs.writeFileSync(outMdPath, lines.join("\n"), "utf8");
  return { total: totals.total_assets_audited, full: full.length, partial: partial.length, failed: failed.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auditPath = process.argv[2] || path.join(CONVERTER_ROOT, "audit/stack-o-bot-5.4-porting-audit.json");
  const outPath = process.argv[3] || path.join(CONVERTER_ROOT, "audit/FAILED_ASSETS_TODO.md");
  const res = generateFailedAssetsTodoMarkdown(auditPath, outPath);
  console.log(JSON.stringify(res));
}
