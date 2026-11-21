#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

/**
 * PlayForge Unreal Engine Editor Extractor Module (Windows Local Worker).
 * Read-only traversal of AssetRegistry, UWorld Actors/Components, and UBlueprint EdGraphs
 * emitting PlayForge Unified Game IR v0.1 JSON.
 */
class FPlayForgeUnrealExtractorModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

    static bool ExportProjectToUnifiedIR(const FString& OutputJsonPath);
};
