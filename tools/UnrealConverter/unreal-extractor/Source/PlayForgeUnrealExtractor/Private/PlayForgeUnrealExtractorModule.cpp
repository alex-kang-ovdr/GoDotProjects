#include "PlayForgeUnrealExtractorModule.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Dom/JsonObject.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphNode.h"
#include "EdGraph/EdGraphPin.h"
#include "Engine/Blueprint.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

#define LOCTEXT_NAMESPACE "FPlayForgeUnrealExtractorModule"

void FPlayForgeUnrealExtractorModule::StartupModule()
{
    UE_LOG(LogTemp, Log, TEXT("[PlayForgeUnrealExtractor] Editor module loaded (read-only IR extractor)."));
}

void FPlayForgeUnrealExtractorModule::ShutdownModule()
{
    UE_LOG(LogTemp, Log, TEXT("[PlayForgeUnrealExtractor] Editor module unloaded."));
}

static TSharedPtr<FJsonObject> ExtractBlueprintGraphToJson(UEdGraph* Graph)
{
    TSharedPtr<FJsonObject> GraphObj = MakeShared<FJsonObject>();
    GraphObj->SetStringField(TEXT("name"), Graph ? Graph->GetName() : TEXT("Unknown"));
    GraphObj->SetStringField(TEXT("kind"), TEXT("event_graph"));

    TArray<TSharedPtr<FJsonValue>> NodesArray;
    TArray<TSharedPtr<FJsonValue>> EdgesArray;

    if (Graph)
    {
        for (UEdGraphNode* Node : Graph->Nodes)
        {
            if (!Node) continue;
            TSharedPtr<FJsonObject> NodeObj = MakeShared<FJsonObject>();
            NodeObj->SetStringField(TEXT("id"), Node->NodeGuid.ToString(EGuidFormats::DigitsWithHyphens));
            NodeObj->SetStringField(TEXT("node_class"), Node->GetClass()->GetName());
            NodeObj->SetStringField(TEXT("title"), Node->GetNodeTitle(ENodeTitleType::ListView).ToString());
            NodesArray.Add(MakeShared<FJsonValueObject>(NodeObj));

            for (UEdGraphPin* Pin : Node->Pins)
            {
                if (!Pin || Pin->Direction != EGPD_Output) continue;
                const bool bIsExec = (Pin->PinType.PinCategory == TEXT("exec"));
                for (UEdGraphPin* LinkedPin : Pin->LinkedTo)
                {
                    if (!LinkedPin || !LinkedPin->GetOwningNode()) continue;
                    TSharedPtr<FJsonObject> EdgeObj = MakeShared<FJsonObject>();
                    EdgeObj->SetStringField(TEXT("kind"), bIsExec ? TEXT("exec") : TEXT("data"));
                    EdgeObj->SetStringField(TEXT("from_node"), Node->NodeGuid.ToString(EGuidFormats::DigitsWithHyphens));
                    EdgeObj->SetStringField(TEXT("from_pin"), Pin->PinName.ToString());
                    EdgeObj->SetStringField(TEXT("to_node"), LinkedPin->GetOwningNode()->NodeGuid.ToString(EGuidFormats::DigitsWithHyphens));
                    EdgeObj->SetStringField(TEXT("to_pin"), LinkedPin->PinName.ToString());
                    EdgesArray.Add(MakeShared<FJsonValueObject>(EdgeObj));
                }
            }
        }
    }

    GraphObj->SetArrayField(TEXT("nodes"), NodesArray);
    GraphObj->SetArrayField(TEXT("edges"), EdgesArray);
    return GraphObj;
}

bool FPlayForgeUnrealExtractorModule::ExportProjectToUnifiedIR(const FString& OutputJsonPath)
{
    TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("schema_version"), TEXT("0.1"));

    TSharedPtr<FJsonObject> Source = MakeShared<FJsonObject>();
    Source->SetStringField(TEXT("engine"), TEXT("unreal"));
    Source->SetStringField(TEXT("version"), FEngineVersion::Current().ToString());
    Source->SetStringField(TEXT("project"), FApp::GetProjectName());
    Root->SetObjectField(TEXT("source"), Source);

    TSharedPtr<FJsonObject> Units = MakeShared<FJsonObject>();
    Units->SetStringField(TEXT("distance"), TEXT("meter"));
    Units->SetStringField(TEXT("coordinate_system"), TEXT("godot_3d"));
    Units->SetNumberField(TEXT("scale_factor"), 0.01);
    Root->SetObjectField(TEXT("units"), Units);

    TArray<TSharedPtr<FJsonValue>> LogicArray;
    FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry"));
    TArray<FAssetData> BlueprintAssets;
    AssetRegistryModule.Get().GetAssetsByClass(UBlueprint::StaticClass()->GetClassPathName(), BlueprintAssets, true);

    for (const FAssetData& AssetData : BlueprintAssets)
    {
        if (UBlueprint* BP = Cast<UBlueprint>(AssetData.GetAsset()))
        {
            for (UEdGraph* Graph : BP->UbergraphPages)
            {
                TSharedPtr<FJsonObject> GraphJson = ExtractBlueprintGraphToJson(Graph);
                GraphJson->SetStringField(TEXT("id"), AssetData.AssetName.ToString());
                GraphJson->SetStringField(TEXT("source_path"), AssetData.GetObjectPathString());
                LogicArray.Add(MakeShared<FJsonValueObject>(GraphJson));
            }
        }
    }

    Root->SetArrayField(TEXT("scenes"), {});
    Root->SetArrayField(TEXT("entities"), {});
    Root->SetArrayField(TEXT("logic"), LogicArray);
    Root->SetArrayField(TEXT("assets"), {});
    Root->SetArrayField(TEXT("diagnostics"), {});

    FString OutStr;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutStr);
    if (!FJsonSerializer::Serialize(Root.ToSharedRef(), Writer))
    {
        return false;
    }
    return FFileHelper::SaveStringToFile(OutStr, *OutputJsonPath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FPlayForgeUnrealExtractorModule, PlayForgeUnrealExtractor)
