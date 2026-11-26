using System.Buffers.Binary;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;

// Read PE metadata directly. The inspected assembly is never loaded or executed.
if (args.Length != 2)
{
    Console.Error.WriteLine("LogicTrace <Cosmoteer.dll> <output.json>");
    return 2;
}

using var stream = File.OpenRead(args[0]);
using var pe = new PEReader(stream);
var metadata = pe.GetMetadataReader();
var opcodes = typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static)
    .Where(field => field.FieldType == typeof(OpCode))
    .Select(field => (OpCode)field.GetValue(null)!)
    .ToDictionary(op => unchecked((ushort)op.Value));

var selected = new Dictionary<string, string[]>
{
    ["Cosmoteer.Ships.Parts.Resources.ResourceConverter"] = ["OnConversionTick", "WantsResourceConversion"],
    ["Cosmoteer.Ships.Parts.Resources.ResourceConsumer"] = ["OnStorageResourcesChanged", "UpdateSinkRegistration"],
    ["Cosmoteer.Ships.Parts.Weapons.Weapon"] = ["TryFireSyncStep"],
    ["Cosmoteer.Ships.Parts.Weapons.Emitter"] = ["HasResources", "OnFireTriggered", "Fire"],
    ["Cosmoteer.Ships.Parts.Weapons.BulletEmitter"] = ["Emit"]
};
var methods = new List<object>();
var found = new HashSet<string>();
foreach (var handle in metadata.TypeDefinitions)
{
    var definition = metadata.GetTypeDefinition(handle);
    var type = NameOf(handle);
    if (!selected.TryGetValue(type, out var names)) continue;
    foreach (var methodHandle in definition.GetMethods())
    {
        var method = metadata.GetMethodDefinition(methodHandle);
        var name = metadata.GetString(method.Name);
        if (!names.Contains(name) || method.RelativeVirtualAddress == 0) continue;
        var body = pe.GetMethodBody(method.RelativeVirtualAddress).GetILBytes()!;
        var calls = ReadCalls(body).ToArray();
        methods.Add(new { type, name, token = Token(methodHandle), calls });
        found.Add(type + "." + name);
    }
}
var missing = selected.SelectMany(pair => pair.Value.Select(name => pair.Key + "." + name))
    .Where(name => !found.Contains(name)).ToArray();
if (missing.Length > 0)
{
    Console.Error.WriteLine("Missing methods: " + string.Join(", ", missing));
    return 1;
}
stream.Position = 0;
var report = new
{
    assembly = metadata.GetString(metadata.GetAssemblyDefinition().Name),
    sha256 = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant(),
    module_id = metadata.GetGuid(metadata.GetModuleDefinition().Mvid),
    methods
};
File.WriteAllText(args[1], JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }) + "\n");
Console.WriteLine($"{methods.Count} methods inspected");
return 0;

string Token(EntityHandle handle) => $"0x{MetadataTokens.GetToken(handle):X8}";

string NameOf(EntityHandle handle)
{
    switch (handle.Kind)
    {
        case HandleKind.TypeDefinition:
            var definition = metadata.GetTypeDefinition((TypeDefinitionHandle)handle);
            var parent = definition.GetDeclaringType();
            return (parent.IsNil ? metadata.GetString(definition.Namespace) : NameOf(parent))
                   + "." + metadata.GetString(definition.Name);
        case HandleKind.TypeReference:
            var reference = metadata.GetTypeReference((TypeReferenceHandle)handle);
            return metadata.GetString(reference.Namespace) + "." + metadata.GetString(reference.Name);
        case HandleKind.MethodDefinition:
            var method = metadata.GetMethodDefinition((MethodDefinitionHandle)handle);
            return NameOf(method.GetDeclaringType()) + "." + metadata.GetString(method.Name);
        case HandleKind.MemberReference:
            var member = metadata.GetMemberReference((MemberReferenceHandle)handle);
            return NameOf(member.Parent) + "." + metadata.GetString(member.Name);
        case HandleKind.MethodSpecification:
            return NameOf(metadata.GetMethodSpecification((MethodSpecificationHandle)handle).Method);
        default:
            return handle.Kind + "(" + Token(handle) + ")";
    }
}

IEnumerable<object> ReadCalls(byte[] body)
{
    for (int pos = 0; pos < body.Length;)
    {
        var offset = pos;
        ushort code = body[pos++];
        if (code == 0xfe) code = (ushort)(0xfe00 | body[pos++]);
        var op = opcodes[code];
        if (op.OperandType == OperandType.InlineMethod)
        {
            var target = MetadataTokens.EntityHandle(BinaryPrimitives.ReadInt32LittleEndian(body.AsSpan(pos)));
            yield return new { offset, op = op.Name, target = NameOf(target), token = Token(target) };
        }
        pos += op.OperandType switch
        {
            OperandType.InlineNone => 0,
            OperandType.ShortInlineI or OperandType.ShortInlineBrTarget or OperandType.ShortInlineVar => 1,
            OperandType.InlineVar => 2,
            OperandType.InlineI8 or OperandType.InlineR => 8,
            OperandType.InlineSwitch => 4 + 4 * BinaryPrimitives.ReadInt32LittleEndian(body.AsSpan(pos)),
            OperandType.InlineBrTarget or OperandType.InlineField or OperandType.InlineI or OperandType.InlineMethod
                or OperandType.InlineSig or OperandType.InlineString or OperandType.InlineTok or OperandType.InlineType
                or OperandType.ShortInlineR => 4,
            _ => throw new InvalidDataException("Unknown operand: " + op.OperandType)
        };
    }
}
