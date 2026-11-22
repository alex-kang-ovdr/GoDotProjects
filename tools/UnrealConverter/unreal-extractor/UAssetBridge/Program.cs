using System.Text.Json;
using PlayForge.UAssetBridge;
using UAssetAPI;
using UAssetAPI.ExportTypes;
using UAssetAPI.Kismet.Bytecode;
using UAssetAPI.PropertyTypes.Objects;
using UAssetAPI.PropertyTypes.Structs;
using UAssetAPI.UnrealTypes;

// PlayForge UAssetAPI Bridge CLI (MIT, powered by github.com/atenfyr/UAssetAPI v1.1.0 + Oodle BulkData Decompressor)
// Modes:
//   extract-real-project <UEContentDir> <OutPortedGodotDir> <OutAuditJsonPath>
//   parse <assetPath.umap|.uasset> [UE5_4|UE5_3|UE4_27] [outputJsonPath]
//   inspect-summary <assetPath.umap|.uasset> [UE5_4]
if (args.Length < 1)
{
    Console.Error.WriteLine("Usage:");
    Console.Error.WriteLine("  UAssetBridge extract-real-project <UEContentDir> <OutPortedGodotDir> <OutAuditJsonPath>");
    Console.Error.WriteLine("  UAssetBridge [parse|inspect-summary|dump-structure] <assetPath.umap|.uasset> [EngineVersion] [outputJsonPath]");
    return 1;
}

if (args[0] == "extract-real-project")
{
    if (args.Length < 4)
    {
        Console.Error.WriteLine("Usage: UAssetBridge extract-real-project <UEContentDir> <OutPortedGodotDir> <OutAuditJsonPath>");
        return 1;
    }
    return StackOBotProjectExtractor.RunFullExtraction(args[1], args[2], args[3]);
}

int argOffset = (args[0] == "parse" || args[0] == "inspect-summary" || args[0] == "dump-structure") ? 1 : 0;
bool summaryOnly = args[0] == "inspect-summary";
bool dumpStructure = args[0] == "dump-structure";
if (args.Length <= argOffset)
{
    Console.Error.WriteLine("Missing asset path.");
    return 1;
}

string assetPath = args[argOffset];
EngineVersion ver = EngineVersion.UNKNOWN;
if (args.Length > argOffset + 1 && Enum.TryParse<EngineVersion>("VER_" + args[argOffset + 1], true, out var parsedVer))
{
    ver = parsedVer;
}

using var fs = new FileStream(assetPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
var asset = new UAsset(new AssetBinaryReader(fs), ver);

if (dumpStructure)
{
    Console.WriteLine($"FILE: {Path.GetFileName(assetPath)} (Exports={asset.Exports.Count}, FileLen={new FileInfo(assetPath).Length})");
    foreach (var e in asset.Exports)
    {
        int extraLen = e.Extras != null ? e.Extras.Length : 0;
        Console.WriteLine($"  [{e.GetType().Name}] Class={e.GetExportClassType()} Name={e.ObjectName} Size={e.SerialSize} Extras={extraLen}");
        if (e is NormalExport ne && ne.Data != null)
        {
            foreach (var p in ne.Data)
            {
                Console.WriteLine($"    Prop: {p.Name} ({p.PropertyType}) [{p.GetType().Name}]");
            }
        }
        if (e is FunctionExport fe && fe.ScriptBytecode != null)
        {
            Console.WriteLine($"    KismetBytecode count={fe.ScriptBytecode.Length}");
        }
    }
    return 0;
}

var exportedObjects = new List<object>();
foreach (var exp in asset.Exports)
{
    var props = new Dictionary<string, object?>();
    var kismetOps = new List<string>();

    if (exp is FunctionExport fnExp && fnExp.ScriptBytecode != null)
    {
        foreach (KismetExpression expr in fnExp.ScriptBytecode)
        {
            kismetOps.Add(expr.Token.ToString());
        }
    }

    if (exp is NormalExport norm)
    {
        foreach (var prop in norm.Data)
        {
            string key = prop.Name.ToString();
            if (prop is StructPropertyData sp && sp.Value.Count > 0)
            {
                if (sp.Value[0] is VectorPropertyData vec)
                    props[key] = new { X = vec.Value.X, Y = vec.Value.Y, Z = vec.Value.Z };
                else if (sp.Value[0] is RotatorPropertyData rot)
                    props[key] = new { Pitch = rot.Value.Pitch, Yaw = rot.Value.Yaw, Roll = rot.Value.Roll };
                else if (sp.Value[0] is LinearColorPropertyData lc)
                    props[key] = new { R = lc.Value.R, G = lc.Value.G, B = lc.Value.B, A = lc.Value.A };
            }
            else if (prop is FloatPropertyData fp) props[key] = fp.Value;
            else if (prop is DoublePropertyData dp) props[key] = dp.Value;
            else if (prop is IntPropertyData ip) props[key] = ip.Value;
            else if (prop is BoolPropertyData bp) props[key] = bp.Value;
            else if (prop is StrPropertyData strp) props[key] = strp.Value?.ToString();
            else if (prop is NamePropertyData np) props[key] = np.Value?.ToString();
            else if (prop is ObjectPropertyData op && op.Value != null)
            {
                if (op.Value.IsImport())
                    props[key] = new { ObjectName = op.Value.ToImport(asset).ObjectName.ToString() };
                else if (op.Value.IsExport())
                    props[key] = new { ObjectName = op.Value.ToExport(asset).ObjectName.ToString() };
            }
        }
    }

    exportedObjects.Add(new
    {
        Type = exp.GetExportClassType().ToString(),
        Name = exp.ObjectName.ToString(),
        Outer = exp.OuterIndex.IsExport() ? exp.OuterIndex.ToExport(asset).ObjectName.ToString() : null,
        Properties = props,
        KismetBytecode = kismetOps.Count > 0 ? kismetOps : null
    });
}

object payload = summaryOnly
    ? new
    {
        PackageTag = "0x9E2A83C1",
        EngineVersion = ver.ToString(),
        NameCount = asset.GetNameMapIndexList().Count,
        ImportCount = asset.Imports.Count,
        ExportCount = asset.Exports.Count
    }
    : exportedObjects;

string json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
if (args.Length > argOffset + 2)
{
    File.WriteAllText(args[argOffset + 2], json);
    Console.WriteLine($"[PlayForge UAssetBridge] Exported {exportedObjects.Count} objects -> {args[argOffset + 2]}");
}
else
{
    Console.WriteLine(json);
}
return 0;
