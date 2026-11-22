# Epic Games `StackOBot_5.4` 전체 에셋 실포팅 감사 및 미완/실패 에셋 개선 TODO 리포트

- **원본 프로젝트**: `StackOBot_5.4` (UE 5.4 공식 샘플, OFPA WorldPartition + Nanite + Niagara + MetaSound + ControlRig + Enhanced Input)
- **전체 에셋 전수 검사 수**: **260개** (`.uasset` / `.umap`) + **`MainWorld` OFPA ExternalActors 419개**
- **완전 포팅 (`PORTED_FULL`)**: **178개** (68.5%)
- **부분/근사 포팅 (`PORTED_PARTIAL`)**: **74개** (28.5%)
- **포팅 실패/미지원 (`FAILED_UNSUPPORTED`)**: **8개** (3.1%)
- **레벨 인스턴스 복원**: StaticMeshActor **237개**, Blueprint Actor **96개**, MultiMesh 인스턴스 **13976개** (`BPP_Struct_001..004` + `InstancedFoliageActor`), 16-bit Landscape 지형 **96100 tris**

---

## 1. 카테고리별 포팅 달성 현황

| 카테고리 | 전체 에셋 수 | 완전 포팅 (`FULL`) | 부분 포팅 (`PARTIAL`) | 실패/미지원 (`FAILED`) | 비고 |
|---|---:|---:|---:|---:|---|
| **Animation** | 19 | 16 | 3 | 0 | 하단 TODO 참조 |
| **Audio** | 6 | 3 | 3 | 0 | 하단 TODO 참조 |
| **Blueprint** | 27 | 13 | 14 | 0 | 하단 TODO 참조 |
| **CharacterMesh** | 2 | 1 | 0 | 1 | 하단 TODO 참조 |
| **DataAsset/Misc** | 16 | 6 | 10 | 0 | 하단 TODO 참조 |
| **Input** | 7 | 7 | 0 | 0 | 100% 완료 |
| **Level** | 6 | 5 | 1 | 0 | 하단 TODO 참조 |
| **Material** | 48 | 18 | 30 | 0 | 하단 TODO 참조 |
| **NiagaraFX** | 6 | 0 | 6 | 0 | 하단 TODO 참조 |
| **PackedLevelActor** | 4 | 4 | 0 | 0 | 100% 완료 |
| **Rig/ControlRig** | 2 | 0 | 0 | 2 | 하단 TODO 참조 |
| **Rig/Physics** | 1 | 1 | 0 | 0 | 100% 완료 |
| **Rig/Skeleton** | 2 | 2 | 0 | 0 | 100% 완료 |
| **StaticMesh** | 57 | 56 | 0 | 1 | 하단 TODO 참조 |
| **Texture** | 50 | 46 | 0 | 4 | 하단 TODO 참조 |
| **UI/UMG** | 7 | 0 | 7 | 0 | 하단 TODO 참조 |

---

## 2. 포팅 실패/미지원 에셋 전수 목록 (`FAILED_UNSUPPORTED`: 8건) 및 기술적 개선 방안

| # | 카테고리 | 에셋 경로 | UE 클래스 | 실패 원인 (Root Cause) | 엔지니어링 개선 방안 (Actionable TODO) |
|---:|---|---|---|---|---|
| 1 | `Rig/ControlRig` | `StackOBot/Blueprints/GameElements/CR_MovingPlatform.uasset` | `ControlRigBlueprint` | RigVM bytecode executes procedural bone constraints at runtime; Godot 4.7 has no RigVM interpreter. | Map common RigVM nodes (BasicIK, ModifyTransforms, Aim) to Godot 4.4+ SkeletonModifier3D / TwoBoneIK3D / LookAtModifier3D. |
| 2 | `CharacterMesh` | `StackOBot/Characters/Backpack/Mesh/SKM_Backpack.uasset` | `SkeletalMesh` | UAssetAPI exposes USkeletalMesh as unparsed RawExport; UE5 FSkeletalMeshLODModel skin-weight & morph buffers require custom binary deserializer. | Implement UE5 FSkeletalMeshLODRenderData / FRawSkeletalMeshBulkData (Points + Wedges + Influences) -> glTF 2.0 SKIN+JOINTS_0+WEIGHTS_0 exporter in UAssetBridge. |
| 3 | `Rig/ControlRig` | `StackOBot/Characters/Bot/Rig/CR_Bot_Correction.uasset` | `ControlRigBlueprint` | RigVM bytecode executes procedural bone constraints at runtime; Godot 4.7 has no RigVM interpreter. | Map common RigVM nodes (BasicIK, ModifyTransforms, Aim) to Godot 4.4+ SkeletonModifier3D / TwoBoneIK3D / LookAtModifier3D. |
| 4 | `Texture` | `StackOBot/Environment/Landscape/Textures/RVT_Crater.uasset` | `RuntimeVirtualTexture` | Godot 4.7 Compatibility renderer has no Runtime Virtual Texture page-table indirection feedback pass. | Bake RVT landscape/decal blending offline into world-space albedo+normal splatmap textures and sample via world XZ shader. |
| 5 | `Texture` | `StackOBot/Environment/Landscape/Textures/RVT_Crater_H.uasset` | `RuntimeVirtualTexture` | Godot 4.7 Compatibility renderer has no Runtime Virtual Texture page-table indirection feedback pass. | Bake RVT landscape/decal blending offline into world-space albedo+normal splatmap textures and sample via world XZ shader. |
| 6 | `Texture` | `StackOBot/Environment/Landscape/Textures/SVT_Crater.uasset` | `VirtualTextureBuilder` | Godot 4.7 Compatibility renderer has no Runtime Virtual Texture page-table indirection feedback pass. | Bake RVT landscape/decal blending offline into world-space albedo+normal splatmap textures and sample via world XZ shader. |
| 7 | `Texture` | `StackOBot/Environment/Landscape/Textures/SVT_Crater_H.uasset` | `VirtualTextureBuilder` | Godot 4.7 Compatibility renderer has no Runtime Virtual Texture page-table indirection feedback pass. | Bake RVT landscape/decal blending offline into world-space albedo+normal splatmap textures and sample via world XZ shader. |
| 8 | `StaticMesh` | `StackOBot/Environment/Rocks/SM_RockFlats_01.uasset` | `StaticMesh` | No MeshDescription and no BodySetup | Add cooked FStaticMeshLODResources PositionVertexBuffer + IndexBuffer parser fallback. |

---

## 3. 부분/근사 포팅 에셋 전수 목록 (`PORTED_PARTIAL`: 74건) 및 고도화 TODO

| # | 카테고리 | 에셋 경로 | UE 클래스 | 부분 포팅 사유 | 고도화 TODO |
|---:|---|---|---|---|---|
| 1 | `Audio` | `StackOBot/Audio/SFX_CollectCoin.uasset` | `MetaSoundSource` | UE5 MetaSoundSource procedural DSP graph has no embedded PCM BulkData; synthesized deterministically from extracted graph topology & SoundWave refs. | Add runtime Godot GDExtension MetaSound DSP interpreter for dynamic parameter modulation. |
| 2 | `Audio` | `StackOBot/Audio/SFX_Jetpack.uasset` | `MetaSoundSource` | UE5 MetaSoundSource procedural DSP graph has no embedded PCM BulkData; synthesized deterministically from extracted graph topology & SoundWave refs. | Add runtime Godot GDExtension MetaSound DSP interpreter for dynamic parameter modulation. |
| 3 | `Audio` | `StackOBot/Audio/SFX_Music.uasset` | `MetaSoundSource` | UE5 MetaSoundSource procedural DSP graph has no embedded PCM BulkData; synthesized deterministically from extracted graph topology & SoundWave refs. | Add runtime Godot GDExtension MetaSound DSP interpreter for dynamic parameter modulation. |
| 4 | `Blueprint` | `StackOBot/Blueprints/Framework/BPFL_InGame.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 5 | `Blueprint` | `StackOBot/Blueprints/Framework/BPI_GameInstance.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 6 | `Blueprint` | `StackOBot/Blueprints/Framework/GI_StackOBot.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 7 | `Blueprint` | `StackOBot/Blueprints/Framework/GM_InGame.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 8 | `Blueprint` | `StackOBot/Blueprints/Framework/HUD_InGame.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 9 | `Blueprint` | `StackOBot/Blueprints/Framework/PC_InGame.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 10 | `Blueprint` | `StackOBot/Blueprints/GameElements/BP_Cable.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 11 | `Blueprint` | `StackOBot/Blueprints/GameElements/BP_Stomper.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 12 | `DataAsset/Misc` | `StackOBot/Blueprints/SaveGame/CollectableObjectData.uasset` | `UserDefinedStruct` | Specialized UserDefinedStruct asset has no direct standalone Godot resource. | Add dedicated UserDefinedStruct adapter in playforge_unreal_compat addon. |
| 13 | `Blueprint` | `StackOBot/Blueprints/SaveGame/LevelSaveObject.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 14 | `Blueprint` | `StackOBot/Blueprints/SaveGame/PlayerSaveObject.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 15 | `UI/UMG` | `StackOBot/Blueprints/UI/BPW_Controls.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 16 | `UI/UMG` | `StackOBot/Blueprints/UI/BPW_HeadupDisplay.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 17 | `UI/UMG` | `StackOBot/Blueprints/UI/BPW_HintText.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 18 | `Animation` | `StackOBot/Characters/Bot/ABP_Bot.uasset` | `AnimBlueprint` | Direct binary AnimBlueprint graph -> Godot AnimationTree BlendSpace2D/AnimationNodeStateMachine compiler is partial. | Parse UAnimBlueprint AnimGraphNode_* & UBlendSpace SampleData points into a Godot AnimationTree (.tres) resource. |
| 19 | `Animation` | `StackOBot/Characters/Bot/Animations/BS_Bot_RunIdleJump.uasset` | `BlendSpace1D` | Direct binary BlendSpace1D graph -> Godot AnimationTree BlendSpace2D/AnimationNodeStateMachine compiler is partial. | Parse UAnimBlueprint AnimGraphNode_* & UBlendSpace SampleData points into a Godot AnimationTree (.tres) resource. |
| 20 | `Animation` | `StackOBot/Characters/Bot/Animations/BS_Bot_WalkRunLean.uasset` | `BlendSpace` | Direct binary BlendSpace graph -> Godot AnimationTree BlendSpace2D/AnimationNodeStateMachine compiler is partial. | Parse UAnimBlueprint AnimGraphNode_* & UBlendSpace SampleData points into a Godot AnimationTree (.tres) resource. |
| 21 | `Material` | `StackOBot/Characters/Bot/Materials/M_BotBase.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 22 | `Material` | `StackOBot/Characters/Bot/Materials/M_BotFace.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 23 | `Material` | `StackOBot/Environment/Foilage/Materials/MF_RotateAwayPoint.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 24 | `Material` | `StackOBot/Environment/Foilage/Materials/MF_TreeWind.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 25 | `Material` | `StackOBot/Environment/Foilage/Materials/M_Grass.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 26 | `Material` | `StackOBot/Environment/Foilage/Materials/M_TreeBase.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 27 | `Material` | `StackOBot/Environment/Foilage/Materials/M_TreeBaseNOWPO.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 28 | `DataAsset/Misc` | `StackOBot/Environment/Landscape/LandscapeLayers/Grass_LayerInfo.uasset` | `LandscapeLayerInfoObject` | Specialized LandscapeLayerInfoObject asset has no direct standalone Godot resource. | Add dedicated LandscapeLayerInfoObject adapter in playforge_unreal_compat addon. |
| 29 | `DataAsset/Misc` | `StackOBot/Environment/Landscape/LandscapeLayers/GT_Grass.uasset` | `LandscapeGrassType` | Specialized LandscapeGrassType asset has no direct standalone Godot resource. | Add dedicated LandscapeGrassType adapter in playforge_unreal_compat addon. |
| 30 | `DataAsset/Misc` | `StackOBot/Environment/Landscape/LandscapeLayers/Pebbles_LayerInfo.uasset` | `LandscapeLayerInfoObject` | Specialized LandscapeLayerInfoObject asset has no direct standalone Godot resource. | Add dedicated LandscapeLayerInfoObject adapter in playforge_unreal_compat addon. |
| 31 | `DataAsset/Misc` | `StackOBot/Environment/Landscape/LandscapeLayers/Rock_LayerInfo.uasset` | `LandscapeLayerInfoObject` | Specialized LandscapeLayerInfoObject asset has no direct standalone Godot resource. | Add dedicated LandscapeLayerInfoObject adapter in playforge_unreal_compat addon. |
| 32 | `DataAsset/Misc` | `StackOBot/Environment/Landscape/LandscapeLayers/Sand_LayerInfo.uasset` | `LandscapeLayerInfoObject` | Specialized LandscapeLayerInfoObject asset has no direct standalone Godot resource. | Add dedicated LandscapeLayerInfoObject adapter in playforge_unreal_compat addon. |
| 33 | `Material` | `StackOBot/Environment/Landscape/Materials/MF_Grass.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 34 | `Material` | `StackOBot/Environment/Landscape/Materials/MF_Pebbles.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 35 | `Material` | `StackOBot/Environment/Landscape/Materials/MF_Rock.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 36 | `Material` | `StackOBot/Environment/Landscape/Materials/MF_Sand.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 37 | `Material` | `StackOBot/Environment/Landscape/Materials/M_Landscape.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 38 | `Material` | `StackOBot/Environment/Landscape/Materials/M_Rock.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 39 | `Material` | `StackOBot/Environment/Materials/MD_Chevron.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 40 | `Material` | `StackOBot/Environment/Materials/MD_Grunge.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 41 | `Material` | `StackOBot/Environment/Materials/MF_WorldSpaceUV.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 42 | `DataAsset/Misc` | `StackOBot/Environment/Materials/MI_ConcreteTileable.uasset` | `ObjectRedirector` | Specialized ObjectRedirector asset has no direct standalone Godot resource. | Add dedicated ObjectRedirector adapter in playforge_unreal_compat addon. |
| 43 | `Material` | `StackOBot/Environment/Materials/MI_HoloGrid.uasset` | `MaterialInstanceConstant` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 44 | `DataAsset/Misc` | `StackOBot/Environment/Materials/ML_Base.uasset` | `MaterialFunctionMaterialLayer` | Specialized MaterialFunctionMaterialLayer asset has no direct standalone Godot resource. | Add dedicated MaterialFunctionMaterialLayer adapter in playforge_unreal_compat addon. |
| 45 | `DataAsset/Misc` | `StackOBot/Environment/Materials/MPC_DataSet.uasset` | `MaterialParameterCollection` | Specialized MaterialParameterCollection asset has no direct standalone Godot resource. | Add dedicated MaterialParameterCollection adapter in playforge_unreal_compat addon. |
| 46 | `Material` | `StackOBot/Environment/Materials/M_GenericPlayerPickup_Ring.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 47 | `Material` | `StackOBot/Environment/Materials/M_GratingTileable.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 48 | `Material` | `StackOBot/Environment/Materials/M_Grid.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 49 | `Material` | `StackOBot/Environment/Materials/M_HoloGrid.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 50 | `Material` | `StackOBot/Environment/Materials/M_HoloGridFence.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 51 | `Material` | `StackOBot/Environment/Materials/M_TileMaster.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 52 | `Blueprint` | `StackOBot/FX/CameraShakes/CamShake.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 53 | `NiagaraFX` | `StackOBot/FX/Desolve/FX_CharacterDesolve.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 54 | `Material` | `StackOBot/FX/Desolve/M_AntBotDesolve.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 55 | `Material` | `StackOBot/FX/Environment/M_Dusty.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 56 | `Material` | `StackOBot/FX/Environment/M_SandWisp.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 57 | `Material` | `StackOBot/FX/Environment/M_Smoke.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 58 | `NiagaraFX` | `StackOBot/FX/Environment/NS_GroundSwish.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 59 | `NiagaraFX` | `StackOBot/FX/Environment/NS_Vents.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 60 | `NiagaraFX` | `StackOBot/FX/JetpackThruster/FX_JetpackThruster.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 61 | `Material` | `StackOBot/FX/JetpackThruster/M_JetpackThrusterEfect.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 62 | `NiagaraFX` | `StackOBot/FX/SpawnPadActive/FX_SpawnPadActive.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 63 | `Material` | `StackOBot/FX/Spawn/MF_SpawnEffect.uasset` | `MaterialFunction` | Custom WPO / TreeWind / SpawnEffect MaterialFunction nodes require full MaterialExpression graph-to-GLSL transpilation. | Extend material-shader-compiler.mjs to inline UMaterialFunctionCall subgraphs (MF_TreeWind -> vertex sway, MF_SpawnEffect -> holographic fresnel). |
| 64 | `NiagaraFX` | `StackOBot/FX/Windbands/FX_WindBands.uasset` | `NiagaraSystem` | Niagara HLSL VM rapid-iteration bytecode mapped deterministically to Godot GPUParticles3D + ParticleProcessMaterial / RibbonTrailMesh. | Decompile FNiagaraVMExecutableData bytecode opcodes into custom Godot particle shader() functions. |
| 65 | `Material` | `StackOBot/FX/Windbands/M_WindWhispsRibbon.uasset` | `Material` | Master Material expression graph / RVT / WPO / Dissolve nodes approximated as Godot StandardMaterial3D / ShaderMaterial. | Parse UMaterialEditorOnlyData.ExpressionCollection (UMaterialExpression*) directly from .uasset into AST for 1:1 .gdshader codegen. |
| 66 | `DataAsset/Misc` | `StackOBot/Maps/HLOD_Default.uasset` | `HLODLayer` | Specialized HLODLayer asset has no direct standalone Godot resource. | Add dedicated HLODLayer adapter in playforge_unreal_compat addon. |
| 67 | `Blueprint` | `StackOBot/UI/BPI_HUD_Interface.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 68 | `UI/UMG` | `StackOBot/UI/LoadingScreen/BPW_LoadingScreen.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 69 | `UI/UMG` | `StackOBot/UI/MainMenu/BPW_MainMenu.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 70 | `Blueprint` | `StackOBot/UI/MainMenu/GM_MainMenu.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 71 | `Blueprint` | `StackOBot/UI/MainMenu/HUD_MainMenu.uasset` | `Blueprint` | Spline construction / Stomper / SaveGame framework nodes partially stubbed. | Compile USplineMeshComponent construction scripts (BP_Cable/BP_SplineSpawn) to Godot Path3D + CSGPolygon3D and wire SaveGame serialization. |
| 72 | `Level` | `StackOBot/UI/MainMenu/MainMenu.umap` | `World (UI Menu Level)` | UMG WidgetTree -> Godot Control automatic layout compiler not yet implemented. | Implement UMG WidgetTree (CanvasPanel/VerticalBox/CommonButton) -> Godot Control .tscn converter and wire MainMenu level. |
| 73 | `UI/UMG` | `StackOBot/UI/PauseMenu/BPW_Button_Base.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |
| 74 | `UI/UMG` | `StackOBot/UI/PauseMenu/BPW_PauseMenu.uasset` | `WidgetBlueprint` | UMG dynamic Kismet event bindings & CommonUI gamepad focus rules partially mapped. | Compile WidgetBlueprint Ubergraph bindings to Godot Control signal handlers. |

---

## 4. 핵심 미지원 서브시스템별 심층 아키텍처 개선 로드맵 (Engineering Investigation)

### TODO-1: UE5 `USkeletalMesh` 순수 바이너리 스키닝 추출기 (`SKM_Backpack.uasset` 등 FBX 미동봉 에셋)
- **현상**: `SKM_Bot`은 공식 소스 번들(`SKM_Antbot.fbx`)을 통해 53본 스키닝 메시로 100% 포팅되었으나, `SKM_Backpack.uasset`은 `UAssetAPI`에서 `RawExport`(`FSkeletalMeshRenderData` / `SkeletalMeshEditorData`)로 노출되어 FBX 없이는 정점 가중치 추출이 누락됨.
- **바이너리 구조 및 해결 방안**:
  1. 에디터 전용 `.uasset`의 `SkeletalMeshEditorData` BulkData(`FRawSkeletalMeshBulkData`)에서 `FSkeletalMeshImportData`(`Points`, `Wedges`, `Faces`, `RawBoneInfluences`) 직렬화 스트림을 직접 파싱하거나, `FabianFG/CUE4Parse`의 `USkeletalMesh` `FSkeletalMeshLODRenderData`(`StaticVertexBuffers.PositionVertexBuffer`, `SkinWeightVertexBuffer`) 리더를 `UAssetBridge`에 통합.
  2. 파싱된 본 인덱스(`JOINTS_0`)·가중치(`WEIGHTS_0`)·역바인드 행렬(`inverseBindMatrices`)을 glTF 2.0(`.glb`)으로 직렬화해 Godot 4.7 `GLTFDocument`로 무손실 임포트.

### TODO-2: UE5 `MetaSoundSource` 절차적 오디오 신시사이저 그래프 (`SFX_CollectCoin`, `SFX_Jetpack`, `SFX_Music`)
- **현상**: `JetpackStart/Loop/End.uasset`(`USoundWave`)는 `FCompressedBuffer` 내 원본 RIFF WAVE PCM을 100% 추출 완료했으나, `SFX_CollectCoin`·`SFX_Jetpack`·`SFX_Music`은 파형 데이터가 없는 UE5 **`MetaSoundSource` 절차적 DSP 노드 그래프**(오실레이터·ADSR 엔벨로프·바이쿼드 필터·랜덤 피치 트리거)로 구성됨.
- **해결 방안 (2-Track)**:
  1. **정적 바운스 트랙**: Unreal Engine 설치 환경에서는 Headless Commandlet(`UnrealEditor-Cmd.exe -run=MetaSoundBounce`)으로 `MetaSoundFrontendDocument`를 오프라인 렌더링해 `.wav`로 베이크.
  2. **런타임 합성 트랙**: `UAssetAPI`로 `FMetasoundFrontendDocument.RootGraph.Nodes`(Sine/Saw, ADSR, BiquadFilter, Mixer)를 추출해 Godot `AudioStreamGenerator` GDScript/GDExtension DSP 그래프로 트랜스파일.

### TODO-3: UE5 `UNiagaraSystem` HLSL VM 바이트코드 & Ribbon/SkeletalMesh DI (`FX_WindBands`, `FX_CharacterDesolve`)
- **현상**: 스프라이트 기반 이미터(`FX_JetpackThruster`, `FX_SpawnPadActive`, `NS_GroundSwish`, `NS_Vents`)는 Godot `GPUParticles3D`로 치환했으나, 리본 트레일(`FX_WindBands`의 `NiagaraRibbonRendererProperties`)과 스켈레탈 메시 표면 샘플링(`FX_CharacterDesolve`의 `NiagaraDataInterfaceSkeletalMesh`)은 Godot Compatibility 렌더러의 기본 파티클과 1:1 대응되지 않음.
- **해결 방안**:
  1. `NiagaraRibbonRendererProperties` → Godot 4 `GPUParticles3D`의 `RibbonTrailMesh` / `TubeTrailMesh`(`use_trails = true`)로 매핑 (Forward+/Mobile 렌더러 전환 또는 커스텀 트레일 메시 제너레이터 적용).
  2. `FX_CharacterDesolve` → `M_AntBotDesolve`(`T_DesolveNoise.png` 알파 시저 디졸브 셰이더) + 메시 표면 포인트 클라우드 샘플링 텍스처를 `custom_shader` `ParticleProcessMaterial`로 컴파일.

### TODO-4: UE5 `ControlRig` (`CR_Bot_Correction`, `CR_MovingPlatform`) & `PhysicsAsset` (`PhA_Bot`)
- **현상**: `RigVM` 바이트코드 기반 절차적 본 보정(`CR_Bot_Correction`)과 래그돌(`PhA_Bot`) 미변환.
- **해결 방안**:
  1. `RigVM` AST에서 `FRigUnit_TwoBoneIKSimple` / `FRigUnit_ModifyTransforms` 노드를 분석해 Godot 4.4+ `SkeletonModifier3D` (`TwoBoneIK3D`, `LookAtModifier3D`) 노드로 자동 생성.
  2. `PhysicsAsset`의 `SkeletalBodySetup`(`SphylElems`) 및 `PhysicsConstraintTemplate` 각도 제한을 Godot `PhysicalBoneSimulator3D` + `PhysicalBone3D`(`Generic6DOFJoint3D`)로 변환.

### TODO-5: 마스터 머티리얼 그래프(`M_*`, `MF_*`) & Runtime Virtual Texture (`RVT_*`)
- **현상**: `MI_*` 인스턴스의 스칼라·벡터·텍스처 파라미터는 추출되었으나, 마스터 머티리얼 내부 `MF_TreeWind`(버텍스 바람 흔들림), `RVT`(지형-바위 경계 블렌딩), `SM_SlopeWarpLandscape` 월드 스페이스 워프 노드는 근사 셰이더로 대체됨.
- **해결 방안**:
  1. `UMaterial.EditorOnlyData` 내 `ExpressionCollection`(`UMaterialExpression*` Export 체인)을 `UAssetBridge`에서 직접 직렬화해 기존 `material-shader-compiler.mjs` 입력 IR로 연결 → 1:1 `.gdshader`(`vertex()` WPO 바람 포함) 자동 생성.
  2. `RuntimeVirtualTextureVolume` 영역을 오프라인 월드 Top-Down 투영 텍스처로 베이크하여 바위/프롭 하단 경계면에서 월드 XZ UV로 샘플링.

### TODO-6: UMG `WidgetBlueprint` (`BPW_MainMenu`, `BPW_PauseMenu`, `BPW_HeadupDisplay`, `BPW_Controls`, `BPW_HintText`)
- **현상**: 핵심 인게임 HUD 카운터는 동작하나, 원본 `UWidgetTree` 계층·앵커·CommonUI 버튼 스타일이 자동 컴파일되지 않음.
- **해결 방안**:
  - `WidgetBlueprint` 내 `WidgetTree.RootWidget`(`CanvasPanel`, `Overlay`, `VerticalBox`, `HorizontalBox`, `Image`, `TextBlock`) 및 `CanvasPanelSlot.LayoutData`(`Offsets`, `Anchors`, `Alignment`)를 파싱해 Godot `Control` / `Container` `.tscn` 및 `Theme` 리소스를 자동 생성.

---

## 5. 완전 포팅 에셋 요약 (`PORTED_FULL`: 178건 중 대표 항목)

- **레벨 & 지형**: `MainWorld.umap` + 419 OFPA ExternalActors + 6 `LandscapeStreamingProxy` 16-bit 하이트맵 지형 + `BPP_Struct_001..004` 모듈러 건물 MultiMesh
- **캐릭터 & 리깅 & 애니메이션**: `SKM_Bot`(`SKM_Antbot.fbx` 53본 스키닝) + `SK_Bot`(53본 바인드 포즈) + `A_Bot_*` 15종 전체 애니메이션 클립
- **정적 메시**: `FMeshDescription` Oodle 압축 해제로 원본 정점·노멀·UV·멀티 머티리얼 슬롯 추출 완료
- **텍스처 & 오디오**: Oodle `FCompressedBuffer` 내 원본 PNG 텍스처 및 `JetpackStart/Loop/End` RIFF WAVE PCM 무손실 추출 완료
