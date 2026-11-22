using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using UAssetAPI;
using UAssetAPI.ExportTypes;
using UAssetAPI.PropertyTypes.Objects;
using UAssetAPI.PropertyTypes.Structs;
using UAssetAPI.UnrealTypes;

namespace PlayForge.UAssetBridge;

/// <summary>
/// Exports real UE5 UStaticMesh (FMeshDescription -> Godot-space multi-material .obj),
/// UTexture2D (FCompressedBuffer PNG / raw pixels -> .png), USoundWave (RIFF WAVE -> .wav),
/// and UE5 LandscapeStreamingProxy heightmaps (-> walkable Godot .obj terrain).
/// </summary>
public static class MeshAndTextureExporter
{
    public sealed record MeshExportResult(
        bool Success,
        string Mode, // "FULL_MESHDESC" | "NANITE_DECIMATED" | "COLLISION_HULL_FALLBACK" | "FAILED"
        int VertexCount,
        int TriangleCount,
        int OriginalTriangleCount,
        List<string> MaterialSlots,
        List<string> ImportedMaterials,
        string? Error);

    public sealed record TextureExportResult(
        bool Success,
        string Mode, // "NATIVE_PNG" | "ENCODED_RAW_PNG" | "FAILED"
        int Width,
        int Height,
        string? Error);

    public static TextureExportResult ExportTexture2D(UAsset ua, byte[] fileBytes, string outPngPath)
    {
        try
        {
            var texExp = ua.Exports.OfType<NormalExport>().FirstOrDefault(e => e.GetExportClassType().ToString() == "Texture2D");
            if (texExp == null)
                return new TextureExportResult(false, "FAILED", 0, 0, "No Texture2D export found");

            int sizeX = 0, sizeY = 0, srcFmt = 1;
            if (texExp["Source"] is StructPropertyData srcStruct)
            {
                sizeX = (srcStruct["SizeX"] as IntPropertyData)?.Value ?? 0;
                sizeY = (srcStruct["SizeY"] as IntPropertyData)?.Value ?? 0;
                if (srcStruct["Format"] is BytePropertyData bp) srcFmt = bp.Value;
                else if (srcStruct["Format"] is EnumPropertyData ep)
                {
                    string es = ep.Value.ToString();
                    if (es.Contains("G8")) srcFmt = 0;
                    else if (es.Contains("RGBA16F")) srcFmt = 4;
                    else if (es.Contains("RGBA16")) srcFmt = 3;
                    else if (es.Contains("G16")) srcFmt = 7;
                    else srcFmt = 1; // TSF_BGRA8
                }
            }

            int lastEnd = (int)ua.Exports.Max(e => e.SerialOffset + e.SerialSize);
            var bufs = OodleDecompressor.ExtractAllCompressedBuffers(fileBytes, lastEnd, 128L * 1024 * 1024);
            if (bufs.Count == 0)
                return new TextureExportResult(false, "FAILED", sizeX, sizeY, "No FCompressedBuffer payload found");

            byte[] raw = bufs[0].Data;
            Directory.CreateDirectory(Path.GetDirectoryName(outPngPath)!);

            // Case 1: UE5 Source bPNGCompressed == true -> raw IS already a PNG file!
            if (raw.Length > 16 && raw[0] == 0x89 && raw[1] == 0x50 && raw[2] == 0x4E && raw[3] == 0x47)
            {
                int w = BinaryPrimitives.ReadInt32BigEndian(raw.AsSpan(16, 4));
                int h = BinaryPrimitives.ReadInt32BigEndian(raw.AsSpan(20, 4));
                File.WriteAllBytes(outPngPath, raw);
                return new TextureExportResult(true, "NATIVE_PNG", w, h, null);
            }

            // Case 2: Raw pixel buffer -> convert Mip0 to RGBA8 and write valid PNG
            if (sizeX <= 0 || sizeY <= 0)
                return new TextureExportResult(false, "FAILED", sizeX, sizeY, "Unknown raw texture dimensions");

            // Downscale huge 4K raw textures to 1024 max for fast OpenGL Compatibility loading
            int step = Math.Max(1, Math.Max(sizeX, sizeY) / 1024);
            int outW = Math.Max(1, sizeX / step);
            int outH = Math.Max(1, sizeY / step);
            byte[] rgba = new byte[outW * outH * 4];

            if (srcFmt == 0 && raw.Length >= sizeX * sizeY) // TSF_G8
            {
                for (int y = 0; y < outH; y++)
                    for (int x = 0; x < outW; x++)
                    {
                        byte g = raw[(y * step) * sizeX + (x * step)];
                        int di = (y * outW + x) * 4;
                        rgba[di] = g; rgba[di + 1] = g; rgba[di + 2] = g; rgba[di + 3] = 255;
                    }
            }
            else if (srcFmt == 3 && raw.Length >= sizeX * sizeY * 8) // TSF_RGBA16
            {
                for (int y = 0; y < outH; y++)
                    for (int x = 0; x < outW; x++)
                    {
                        int si = ((y * step) * sizeX + (x * step)) * 8;
                        int di = (y * outW + x) * 4;
                        rgba[di] = raw[si + 1];
                        rgba[di + 1] = raw[si + 3];
                        rgba[di + 2] = raw[si + 5];
                        rgba[di + 3] = raw[si + 7];
                    }
            }
            else if (raw.Length >= sizeX * sizeY * 4) // TSF_BGRA8 / BGRE8
            {
                for (int y = 0; y < outH; y++)
                    for (int x = 0; x < outW; x++)
                    {
                        int si = ((y * step) * sizeX + (x * step)) * 4;
                        int di = (y * outW + x) * 4;
                        rgba[di] = raw[si + 2];     // R
                        rgba[di + 1] = raw[si + 1]; // G
                        rgba[di + 2] = raw[si + 0]; // B
                        rgba[di + 3] = raw[si + 3]; // A
                    }
            }
            else
            {
                return new TextureExportResult(false, "FAILED", sizeX, sizeY, $"Unsupported raw format={srcFmt} len={raw.Length}");
            }

            WriteRgbaPng(outPngPath, outW, outH, rgba);
            return new TextureExportResult(true, "ENCODED_RAW_PNG", outW, outH, null);
        }
        catch (Exception ex)
        {
            return new TextureExportResult(false, "FAILED", 0, 0, ex.Message);
        }
    }

    public static void WriteRgbaPng(string path, int width, int height, byte[] rgba)
    {
        using var fs = new FileStream(path, FileMode.Create, FileAccess.Write);
        fs.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });

        Span<byte> ihdr = stackalloc byte[13];
        BinaryPrimitives.WriteInt32BigEndian(ihdr[0..4], width);
        BinaryPrimitives.WriteInt32BigEndian(ihdr[4..8], height);
        ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        WritePngChunk(fs, "IHDR"u8, ihdr);

        using var idatMs = new MemoryStream();
        using (var zlib = new ZLibStream(idatMs, CompressionLevel.Fastest, leaveOpen: true))
        {
            byte[] rowBuf = new byte[1 + width * 4];
            rowBuf[0] = 0; // filter None
            for (int y = 0; y < height; y++)
            {
                Buffer.BlockCopy(rgba, y * width * 4, rowBuf, 1, width * 4);
                zlib.Write(rowBuf, 0, rowBuf.Length);
            }
        }
        WritePngChunk(fs, "IDAT"u8, idatMs.ToArray());
        WritePngChunk(fs, "IEND"u8, ReadOnlySpan<byte>.Empty);
    }

    private static void WritePngChunk(Stream s, ReadOnlySpan<byte> type, ReadOnlySpan<byte> data)
    {
        Span<byte> lenBytes = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(lenBytes, data.Length);
        s.Write(lenBytes);
        s.Write(type);
        if (!data.IsEmpty) s.Write(data);

        uint crc = 0xFFFFFFFFu;
        crc = UpdateCrc32(crc, type);
        crc = UpdateCrc32(crc, data);
        crc ^= 0xFFFFFFFFu;
        Span<byte> crcBytes = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(crcBytes, crc);
        s.Write(crcBytes);
    }

    private static uint UpdateCrc32(uint crc, ReadOnlySpan<byte> bytes)
    {
        foreach (byte b in bytes)
        {
            crc ^= b;
            for (int k = 0; k < 8; k++)
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : (crc >> 1);
        }
        return crc;
    }

    public static bool ExportSoundWave(UAsset ua, byte[] fileBytes, string outWavPath, out string detail)
    {
        var sw = ua.Exports.OfType<NormalExport>().FirstOrDefault(e => e.GetExportClassType().ToString() == "SoundWave");
        if (sw == null)
        {
            string rootClasses = string.Join(",", ua.Exports.Where(e => e.GetExportClassType().ToString() != "MetaData").Select(e => e.GetExportClassType().ToString()).Distinct());
            detail = $"Not a USoundWave ({rootClasses})";
            return false;
        }
        int lastEnd = (int)ua.Exports.Max(e => e.SerialOffset + e.SerialSize);
        var bufs = OodleDecompressor.ExtractAllCompressedBuffers(fileBytes, lastEnd, 64L * 1024 * 1024);
        foreach (var b in bufs)
        {
            if (b.Data.Length > 44 && b.Data[0] == 'R' && b.Data[1] == 'I' && b.Data[2] == 'F' && b.Data[3] == 'F')
            {
                Directory.CreateDirectory(Path.GetDirectoryName(outWavPath)!);
                File.WriteAllBytes(outWavPath, b.Data);
                detail = $"RIFF WAVE ({b.Data.Length} bytes)";
                return true;
            }
        }
        detail = "No RIFF WAVE PCM payload in SoundWave FCompressedBuffer";
        return false;
    }

    public static MeshExportResult ExportStaticMeshToGodotObj(UAsset ua, byte[] fileBytes, string outObjPath, int maxTrisTarget = 24000)
    {
        var importedMats = ua.Imports
            .Where(imp => imp.ClassName.ToString() is "MaterialInstanceConstant" or "Material")
            .Select(imp => imp.ObjectName.ToString())
            .Distinct()
            .ToList();

        try
        {
            int lastEnd = (int)ua.Exports.Max(e => e.SerialOffset + e.SerialSize);
            var headers = OodleDecompressor.ScanHeaders(fileBytes, lastEnd);
            for (int hi = headers.Count - 1; hi >= 0; hi--)
            {
                var hdr = headers[hi];
                if (hdr.RawSize <= 96L * 1024 * 1024)
                {
                    var bufs = OodleDecompressor.ExtractAllCompressedBuffers(fileBytes, hdr.Offset, 96L * 1024 * 1024, onlyLastValid: false);
                    if (bufs.Count > 0)
                    {
                        var parsed = TryParseMeshDescriptionToObj(bufs[0].Data, outObjPath, importedMats, maxTrisTarget);
                        if (parsed.Success) return parsed;
                    }
                }
                else
                {
                    var streamed = TryStreamGiantMeshDescriptionToObj(new OodleDecompressor.SeekableCompressedBuffer(fileBytes, hdr), outObjPath, importedMats, 10000);
                    if (streamed.Success) return streamed;
                }
            }

            // Fallback: BodySetup.AggGeom ConvexElems / BoxElems
            return TryExportBodySetupCollisionHull(ua, outObjPath, importedMats);
        }
        catch (Exception ex)
        {
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, ex.Message);
        }
    }

    private static int FindAsciiTag(byte[] md, string tag, int start, int end, out int afterStringPos)
    {
        int maxEnd = Math.Min(end, md.Length - 8);
        for (int k = Math.Max(0, start); k < maxEnd; k++)
        {
            int sl = BitConverter.ToInt32(md, k);
            if (sl >= tag.Length + 1 && sl <= tag.Length + 3 && k + 4 + sl <= md.Length && md[k + 4 + sl - 1] == 0)
            {
                bool ascii = true;
                for (int c = 0; c < sl - 1; c++)
                {
                    if (md[k + 4 + c] < 32 || md[k + 4 + c] > 126) { ascii = false; break; }
                }
                if (!ascii) continue;
                string s = Encoding.ASCII.GetString(md, k + 4, sl - 1).Trim();
                if (s == tag)
                {
                    afterStringPos = k + 4 + sl;
                    return k;
                }
            }
        }
        afterStringPos = -1;
        return -1;
    }

    private static MeshExportResult TryParseMeshDescriptionToObj(
        byte[] md,
        string outObjPath,
        List<string> importedMats,
        int maxTrisTarget)
    {
        int secVerts = FindAsciiTag(md, "Vertices", 0, Math.Min(256, md.Length), out _);
        if (secVerts < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing Vertices header");

        int posTag = FindAsciiTag(md, "Position", secVerts, md.Length, out int posHdr);
        if (posTag < 0 || posHdr + 28 > md.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing Position attribute");

        int numVerts = BitConverter.ToInt32(md, posHdr + 8);
        int posElemBytes = BitConverter.ToInt32(md, posHdr + 20);
        int posTotalCount = BitConverter.ToInt32(md, posHdr + 24);
        int posDataStart = posHdr + 28;
        int posTotalBytes = posElemBytes * posTotalCount;
        if (numVerts <= 0 || posElemBytes != 12 || posDataStart + posTotalBytes > md.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Invalid Position buffer");

        int secVI = FindAsciiTag(md, "VertexInstances", posDataStart + posTotalBytes - 4, md.Length, out _);
        if (secVI < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing VertexInstances");

        int viIdxTag = FindAsciiTag(md, "VertexIndex", secVI, md.Length, out int viIdxHdr);
        if (viIdxTag < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing VI.VertexIndex");

        int numVI = BitConverter.ToInt32(md, viIdxHdr + 8);
        int viIdxDataStart = viIdxHdr + 28;
        int viIdxEnd = viIdxDataStart + numVI * 4;

        int uvTag = FindAsciiTag(md, "TextureCoordinate", viIdxEnd - 4, md.Length, out int uvHdr);
        int uvDataStart = -1, uvStrideBytes = 8;
        int searchAfterVI = viIdxEnd;
        if (uvTag >= 0 && uvHdr + 28 <= md.Length)
        {
            int uvCount = BitConverter.ToInt32(md, uvHdr + 8);
            int uvElemSize = BitConverter.ToInt32(md, uvHdr + 20);
            int uvTotalItems = BitConverter.ToInt32(md, uvHdr + 24);
            if (uvCount == numVI && uvElemSize == 8 && uvCount > 0)
            {
                uvDataStart = uvHdr + 28;
                uvStrideBytes = uvElemSize * Math.Max(1, uvTotalItems / uvCount);
                searchAfterVI = uvDataStart + uvElemSize * uvTotalItems;
            }
        }

        int nrmTag = FindAsciiTag(md, "Normal", searchAfterVI - 4, Math.Min(searchAfterVI + 65536, md.Length), out int nrmHdr);
        int nrmDataStart = -1, nrmStrideBytes = 12;
        if (nrmTag >= 0 && nrmHdr + 28 <= md.Length)
        {
            int nrmCount = BitConverter.ToInt32(md, nrmHdr + 8);
            int nrmElemSize = BitConverter.ToInt32(md, nrmHdr + 20);
            int nrmTotalItems = BitConverter.ToInt32(md, nrmHdr + 24);
            if (nrmCount == numVI && nrmElemSize == 12 && nrmCount > 0)
            {
                nrmDataStart = nrmHdr + 28;
                nrmStrideBytes = nrmElemSize * Math.Max(1, nrmTotalItems / nrmCount);
                searchAfterVI = nrmDataStart + nrmElemSize * nrmTotalItems;
            }
        }

        int secTris = FindAsciiTag(md, "Triangles", searchAfterVI, md.Length, out _);
        if (secTris < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing Triangles section");

        int triVITag = FindAsciiTag(md, "VertexInstanceIndex", secTris, md.Length, out int triVIHdr);
        if (triVITag < 0 || triVIHdr + 28 > md.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Missing Triangles.VertexInstanceIndex");

        int numTris = BitConverter.ToInt32(md, triVIHdr + 8);
        int triVIDataStart = triVIHdr + 28;
        int triVIEnd = triVIDataStart + numTris * 12;
        if (numTris <= 0 || triVIEnd > md.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Invalid triangle buffer");

        int secPolys = FindAsciiTag(md, "Polygons", triVIEnd - 4, md.Length, out _);
        int polyGrpSearchEnd = secPolys > 0 ? secPolys : md.Length;
        int triPgTag = FindAsciiTag(md, "PolygonGroupIndex", triVIEnd - 4, polyGrpSearchEnd, out int triPgHdr);
        int triPgDataStart = (triPgTag >= 0 && triPgHdr + 28 + numTris * 4 <= md.Length) ? (triPgHdr + 28) : -1;

        var slotNames = new List<string>();
        int secPG = FindAsciiTag(md, "PolygonGroups", secPolys > 0 ? secPolys : triVIEnd, md.Length, out _);
        if (secPG >= 0)
        {
            int slotTag = FindAsciiTag(md, "ImportedMaterialSlotName", secPG, md.Length, out int slotHdr);
            if (slotTag >= 0 && slotHdr + 24 <= md.Length)
            {
                int slotCount = BitConverter.ToInt32(md, slotHdr + 8);
                int cur = slotHdr + 24;
                for (int s = 0; s < Math.Min(slotCount, 32) && cur + 4 <= md.Length; s++)
                {
                    int sl = BitConverter.ToInt32(md, cur);
                    cur += 4;
                    if (sl <= 0 || sl > 128 || cur + sl > md.Length) break;
                    slotNames.Add(Encoding.ASCII.GetString(md, cur, sl - 1).Trim());
                    cur += sl;
                }
            }
        }
        if (slotNames.Count == 0) slotNames.Add("Slot_0");

        // Convert UE cm (LH Z-up: X fwd, Y right, Z up) -> Godot m (RH Y-up: X=uy*0.01, Y=uz*0.01, Z=-ux*0.01)
        var gx = new float[numVerts];
        var gy = new float[numVerts];
        var gz = new float[numVerts];
        float minX = float.MaxValue, minY = float.MaxValue, minZ = float.MaxValue;
        float maxX = float.MinValue, maxY = float.MinValue, maxZ = float.MinValue;
        for (int v = 0; v < numVerts; v++)
        {
            int o = posDataStart + v * 12;
            float ux = BitConverter.ToSingle(md, o);
            float uy = BitConverter.ToSingle(md, o + 4);
            float uz = BitConverter.ToSingle(md, o + 8);
            float x = uy * 0.01f, y = uz * 0.01f, z = -ux * 0.01f;
            gx[v] = x; gy[v] = y; gz[v] = z;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        // Optional spatial vertex-cluster decimation if ultra-high-poly Nanite LOD0 (> maxTrisTarget)
        bool decimated = false;
        int[]? clusterMap = null;
        if (numTris > maxTrisTarget)
        {
            decimated = true;
            int gridRes = Math.Clamp((int)Math.Cbrt(maxTrisTarget * 2.2), 28, 84);
            float dx = Math.Max(0.0001f, maxX - minX);
            float dy = Math.Max(0.0001f, maxY - minY);
            float dz = Math.Max(0.0001f, maxZ - minZ);
            clusterMap = new int[numVerts];
            var cellRep = new Dictionary<long, int>(numVerts / 2);
            for (int v = 0; v < numVerts; v++)
            {
                long cx = (long)((gx[v] - minX) / dx * gridRes);
                long cy = (long)((gy[v] - minY) / dy * gridRes);
                long cz = (long)((gz[v] - minZ) / dz * gridRes);
                long key = (cx << 40) ^ (cy << 20) ^ cz;
                if (!cellRep.TryGetValue(key, out int rep))
                {
                    rep = v;
                    cellRep[key] = v;
                }
                clusterMap[v] = rep;
            }
        }

        Directory.CreateDirectory(Path.GetDirectoryName(outObjPath)!);
        var ic = CultureInfo.InvariantCulture;
        using var sw = new StreamWriter(outObjPath, false, new UTF8Encoding(false), 65536);
        sw.WriteLine("# PlayForge UE5 FMeshDescription -> Godot 4.7.2 (m, RH Y-Up)");

        // Emit compact referenced vertex/uv/normal streams
        var vRemap = new Dictionary<int, int>(Math.Min(numVerts, 32768));
        var viRemap = new Dictionary<int, int>(Math.Min(numVI, 65536));
        var trisByGroup = new Dictionary<int, List<(int a, int b, int c)>>();

        int writtenVerts = 0, writtenVI = 0, writtenTris = 0;
        var posLines = new List<string>(Math.Min(numVerts, 32768));
        var uvLines = new List<string>(Math.Min(numVI, 65536));
        var nrmLines = new List<string>(Math.Min(numVI, 65536));

        int MapVI(int vi, out int mappedVert)
        {
            int rawV = BitConverter.ToInt32(md, viIdxDataStart + vi * 4);
            if (rawV < 0 || rawV >= numVerts) { mappedVert = -1; return -1; }
            int effV = clusterMap != null ? clusterMap[rawV] : rawV;
            if (!vRemap.TryGetValue(effV, out int vIdx1))
            {
                vIdx1 = ++writtenVerts;
                vRemap[effV] = vIdx1;
                posLines.Add(string.Create(ic, $"v {gx[effV]:F5} {gy[effV]:F5} {gz[effV]:F5}"));
            }
            mappedVert = vIdx1;
            if (!viRemap.TryGetValue(vi, out int viIdx1))
            {
                viIdx1 = ++writtenVI;
                viRemap[vi] = viIdx1;
                float u = 0f, v = 0f;
                if (uvDataStart >= 0)
                {
                    int uo = uvDataStart + vi * uvStrideBytes;
                    u = BitConverter.ToSingle(md, uo);
                    v = 1.0f - BitConverter.ToSingle(md, uo + 4);
                    if (float.IsNaN(u) || float.IsInfinity(u)) u = 0f;
                    if (float.IsNaN(v) || float.IsInfinity(v)) v = 0f;
                }
                uvLines.Add(string.Create(ic, $"vt {u:F5} {v:F5}"));

                float nx = 0f, ny = 1f, nz = 0f;
                if (nrmDataStart >= 0)
                {
                    int no = nrmDataStart + vi * nrmStrideBytes;
                    float unx = BitConverter.ToSingle(md, no);
                    float uny = BitConverter.ToSingle(md, no + 4);
                    float unz = BitConverter.ToSingle(md, no + 8);
                    nx = uny; ny = unz; nz = -unx;
                    if (float.IsNaN(nx) || (Math.Abs(nx) < 1e-5f && Math.Abs(ny) < 1e-5f && Math.Abs(nz) < 1e-5f))
                    { nx = 0f; ny = 1f; nz = 0f; }
                }
                nrmLines.Add(string.Create(ic, $"vn {nx:F4} {ny:F4} {nz:F4}"));
            }
            return viIdx1;
        }

        for (int t = 0; t < numTris; t++)
        {
            int to = triVIDataStart + t * 12;
            int vi0 = BitConverter.ToInt32(md, to);
            int vi1 = BitConverter.ToInt32(md, to + 4);
            int vi2 = BitConverter.ToInt32(md, to + 8);
            if (vi0 < 0 || vi0 >= numVI || vi1 < 0 || vi1 >= numVI || vi2 < 0 || vi2 >= numVI) continue;

            int mvi0 = MapVI(vi0, out int mv0);
            int mvi1 = MapVI(vi1, out int mv1);
            int mvi2 = MapVI(vi2, out int mv2);
            if (mv0 < 0 || mv1 < 0 || mv2 < 0 || mv0 == mv1 || mv1 == mv2 || mv0 == mv2) continue;

            int pg = triPgDataStart >= 0 ? Math.Max(0, BitConverter.ToInt32(md, triPgDataStart + t * 4)) : 0;
            if (!trisByGroup.TryGetValue(pg, out var list))
            {
                list = new List<(int, int, int)>();
                trisByGroup[pg] = list;
            }
            // Reverse LH (0, 1, 2) -> RH (0, 2, 1) so outward normals match CCW front faces in Godot!
            // Store packed indices: each entry encodes v/vt/vn
            list.Add((
                (mv0 << 20) | mvi0,
                (mv2 << 20) | mvi2,
                (mv1 << 20) | mvi1));
            writtenTris++;
        }

        // Wait: if writtenVerts >= (1 << 12), bitpacking (mv << 20) could overflow if mvi >= (1<<20). Let's store clean structs instead!
        if (writtenVerts > 2000 || writtenVI > 500000)
        {
            // Re-collect without bit-shift risk if large mesh
            trisByGroup.Clear();
            writtenTris = 0;
            for (int t = 0; t < numTris; t++)
            {
                int to = triVIDataStart + t * 12;
                int vi0 = BitConverter.ToInt32(md, to);
                int vi1 = BitConverter.ToInt32(md, to + 4);
                int vi2 = BitConverter.ToInt32(md, to + 8);
                if (vi0 < 0 || vi0 >= numVI || vi1 < 0 || vi1 >= numVI || vi2 < 0 || vi2 >= numVI) continue;
                int rawV0 = BitConverter.ToInt32(md, viIdxDataStart + vi0 * 4);
                int rawV1 = BitConverter.ToInt32(md, viIdxDataStart + vi1 * 4);
                int rawV2 = BitConverter.ToInt32(md, viIdxDataStart + vi2 * 4);
                if (rawV0 < 0 || rawV0 >= numVerts || rawV1 < 0 || rawV1 >= numVerts || rawV2 < 0 || rawV2 >= numVerts) continue;
                int mv0 = vRemap[clusterMap != null ? clusterMap[rawV0] : rawV0];
                int mv1 = vRemap[clusterMap != null ? clusterMap[rawV1] : rawV1];
                int mv2 = vRemap[clusterMap != null ? clusterMap[rawV2] : rawV2];
                if (mv0 == mv1 || mv1 == mv2 || mv0 == mv2) continue;
                int pg = triPgDataStart >= 0 ? Math.Max(0, BitConverter.ToInt32(md, triPgDataStart + t * 4)) : 0;
                if (!trisByGroup.TryGetValue(pg, out var list)) { list = new List<(int, int, int)>(); trisByGroup[pg] = list; }
                // Store raw VI indices; look up vRemap + viRemap when writing!
                list.Add((vi0, vi2, vi1));
                writtenTris++;
            }
            foreach (string l in posLines) sw.WriteLine(l);
            foreach (string l in uvLines) sw.WriteLine(l);
            foreach (string l in nrmLines) sw.WriteLine(l);
            foreach (var kv in trisByGroup.OrderBy(k => k.Key))
            {
                string slot = kv.Key < slotNames.Count ? SanitizeIdent(slotNames[kv.Key]) : $"Slot_{kv.Key}";
                sw.WriteLine($"g {slot}");
                sw.WriteLine($"usemtl {slot}");
                foreach (var (a, b, c) in kv.Value)
                {
                    int va = vRemap[clusterMap != null ? clusterMap[BitConverter.ToInt32(md, viIdxDataStart + a * 4)] : BitConverter.ToInt32(md, viIdxDataStart + a * 4)];
                    int vb = vRemap[clusterMap != null ? clusterMap[BitConverter.ToInt32(md, viIdxDataStart + b * 4)] : BitConverter.ToInt32(md, viIdxDataStart + b * 4)];
                    int vc = vRemap[clusterMap != null ? clusterMap[BitConverter.ToInt32(md, viIdxDataStart + c * 4)] : BitConverter.ToInt32(md, viIdxDataStart + c * 4)];
                    int ta = viRemap[a], tb = viRemap[b], tc = viRemap[c];
                    sw.WriteLine(string.Create(ic, $"f {va}/{ta}/{ta} {vb}/{tb}/{tb} {vc}/{tc}/{tc}"));
                }
            }
        }
        else
        {
            foreach (string l in posLines) sw.WriteLine(l);
            foreach (string l in uvLines) sw.WriteLine(l);
            foreach (string l in nrmLines) sw.WriteLine(l);
            foreach (var kv in trisByGroup.OrderBy(k => k.Key))
            {
                string slot = kv.Key < slotNames.Count ? SanitizeIdent(slotNames[kv.Key]) : $"Slot_{kv.Key}";
                sw.WriteLine($"g {slot}");
                sw.WriteLine($"usemtl {slot}");
                foreach (var (pa, pb, pc) in kv.Value)
                {
                    int va = pa >> 20, ta = pa & 0xFFFFF;
                    int vb = pb >> 20, tb = pb & 0xFFFFF;
                    int vc = pc >> 20, tc = pc & 0xFFFFF;
                    sw.WriteLine(string.Create(ic, $"f {va}/{ta}/{ta} {vb}/{tb}/{tb} {vc}/{tc}/{tc}"));
                }
            }
        }

        if (writtenTris == 0)
            return new MeshExportResult(false, "FAILED", 0, 0, numTris, slotNames, importedMats, "Zero valid triangles");

        return new MeshExportResult(
            true,
            decimated ? "NANITE_DECIMATED" : "FULL_MESHDESC",
            writtenVerts,
            writtenTris,
            numTris,
            slotNames,
            importedMats,
            null);
    }

    private static long FindStreamAsciiTag(OodleDecompressor.SeekableCompressedBuffer sb, string tag, long start, long maxSpan, out long afterStringPos)
    {
        int chunkLen = (int)Math.Min(maxSpan, sb.Length - start);
        if (chunkLen <= 16) { afterStringPos = -1; return -1; }
        byte[] buf = new byte[chunkLen];
        if (!sb.ReadBytes(start, buf)) { afterStringPos = -1; return -1; }
        int rel = FindAsciiTag(buf, tag, 0, buf.Length, out int relAfter);
        if (rel >= 0)
        {
            afterStringPos = start + relAfter;
            return start + rel;
        }
        afterStringPos = -1;
        return -1;
    }

    /// <summary>
    /// Zero-full-allocation streaming Nanite FMeshDescription decimator for >100 MB raw payloads (e.g. 1.4 GB SM_RockFlats_01).
    /// Jumps across Oodle blocks in O(1) using exact attribute byte lengths!
    /// </summary>
    private static MeshExportResult TryStreamGiantMeshDescriptionToObj(
        OodleDecompressor.SeekableCompressedBuffer sb,
        string outObjPath,
        List<string> importedMats,
        int targetTris)
    {
        if (FindStreamAsciiTag(sb, "Vertices", 0, 256, out _) < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing Vertices");

        // TSparseArray bitmask for up to 2M vertices is <= 512 KB
        if (FindStreamAsciiTag(sb, "Position", 0, 1024 * 1024, out long posHdr) < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing Position");

        int numVerts = sb.ReadInt32(posHdr + 8);
        int posElemBytes = sb.ReadInt32(posHdr + 20);
        int posTotalCount = sb.ReadInt32(posHdr + 24);
        long posDataStart = posHdr + 28;
        long afterPos = posDataStart + (long)posElemBytes * posTotalCount;
        if (numVerts <= 0 || posElemBytes != 12 || afterPos >= sb.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Invalid Position");

        if (FindStreamAsciiTag(sb, "VertexInstances", afterPos - 4, 2 * 1024 * 1024, out _) < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing VI");

        if (FindStreamAsciiTag(sb, "VertexIndex", afterPos, 4 * 1024 * 1024, out long viIdxHdr) < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing VI.VertexIndex");

        int numVI = sb.ReadInt32(viIdxHdr + 8);
        long viIdxDataStart = viIdxHdr + 28;
        long cur = viIdxDataStart + (long)numVI * 4;

        // Jump over all remaining VI attributes (TextureCoordinate, Normal, Tangent, BinormalSign, Color) + UVs + Edges!
        // Scan backwards from the end of the stream (last 64 MB) for "Triangles" -> "VertexInstanceIndex"!
        long tailStart = Math.Max(cur, sb.Length - 80L * 1024 * 1024);
        long secTris = -1;
        for (long scan = sb.Length - 4 * 1024 * 1024; scan >= tailStart - 4 * 1024 * 1024; scan -= 3 * 1024 * 1024)
        {
            long s0 = Math.Max(cur, scan);
            secTris = FindStreamAsciiTag(sb, "Triangles", s0, 4 * 1024 * 1024, out _);
            if (secTris >= 0) break;
            if (s0 == cur) break;
        }
        if (secTris < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing Triangles");

        if (FindStreamAsciiTag(sb, "VertexInstanceIndex", secTris, 4 * 1024 * 1024, out long triVIHdr) < 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Missing Tri.VIIndex");

        int numTris = sb.ReadInt32(triVIHdr + 8);
        long triVIDataStart = triVIHdr + 28;
        if (numTris <= 0 || triVIDataStart + (long)numTris * 12 > sb.Length)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Invalid Tris");

        // Read all vertex positions (e.g. 500k * 12 = 6 MB — tiny!) and spatial-cluster to ~36^3 grid!
        byte[] rawPos = new byte[numVerts * 12];
        if (!sb.ReadBytes(posDataStart, rawPos))
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: Pos read failed");

        byte[] rawVIIndex = new byte[numVI * 4];
        if (!sb.ReadBytes(viIdxDataStart, rawVIIndex))
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: VIIndex read failed");

        byte[] rawTriVI = new byte[numTris * 12];
        if (!sb.ReadBytes(triVIDataStart, rawTriVI))
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Stream: TriVI read failed");

        float minX = float.MaxValue, minY = float.MaxValue, minZ = float.MaxValue;
        float maxX = float.MinValue, maxY = float.MinValue, maxZ = float.MinValue;
        var gx = new float[numVerts];
        var gy = new float[numVerts];
        var gz = new float[numVerts];
        for (int v = 0; v < numVerts; v++)
        {
            float ux = BitConverter.ToSingle(rawPos, v * 12);
            float uy = BitConverter.ToSingle(rawPos, v * 12 + 4);
            float uz = BitConverter.ToSingle(rawPos, v * 12 + 8);
            float x = uy * 0.01f, y = uz * 0.01f, z = -ux * 0.01f;
            gx[v] = x; gy[v] = y; gz[v] = z;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        int gridRes = 34;
        float dx = Math.Max(0.001f, maxX - minX), dy = Math.Max(0.001f, maxY - minY), dz = Math.Max(0.001f, maxZ - minZ);
        var clusterMap = new int[numVerts];
        var cellRep = new Dictionary<long, int>(32768);
        for (int v = 0; v < numVerts; v++)
        {
            long cx = (long)((gx[v] - minX) / dx * gridRes);
            long cy = (long)((gy[v] - minY) / dy * gridRes);
            long cz = (long)((gz[v] - minZ) / dz * gridRes);
            long key = (cx << 40) ^ (cy << 20) ^ cz;
            if (!cellRep.TryGetValue(key, out int rep)) { rep = v; cellRep[key] = v; }
            clusterMap[v] = rep;
        }

        var vRemap = new Dictionary<int, int>(cellRep.Count);
        var outVerts = new List<(float x, float y, float z)>(cellRep.Count);
        var seenFaces = new HashSet<long>();
        var outFaces = new List<(int a, int b, int c, float nx, float ny, float nz)>();

        for (int t = 0; t < numTris; t++)
        {
            int vi0 = BitConverter.ToInt32(rawTriVI, t * 12);
            int vi1 = BitConverter.ToInt32(rawTriVI, t * 12 + 4);
            int vi2 = BitConverter.ToInt32(rawTriVI, t * 12 + 8);
            if ((uint)vi0 >= (uint)numVI || (uint)vi1 >= (uint)numVI || (uint)vi2 >= (uint)numVI) continue;
            int rv0 = BitConverter.ToInt32(rawVIIndex, vi0 * 4);
            int rv1 = BitConverter.ToInt32(rawVIIndex, vi1 * 4);
            int rv2 = BitConverter.ToInt32(rawVIIndex, vi2 * 4);
            if ((uint)rv0 >= (uint)numVerts || (uint)rv1 >= (uint)numVerts || (uint)rv2 >= (uint)numVerts) continue;
            int c0 = clusterMap[rv0], c1 = clusterMap[rv1], c2 = clusterMap[rv2];
            if (c0 == c1 || c1 == c2 || c0 == c2) continue;

            if (!vRemap.TryGetValue(c0, out int i0)) { i0 = outVerts.Count + 1; vRemap[c0] = i0; outVerts.Add((gx[c0], gy[c0], gz[c0])); }
            if (!vRemap.TryGetValue(c2, out int i1)) { i1 = outVerts.Count + 1; vRemap[c2] = i1; outVerts.Add((gx[c2], gy[c2], gz[c2])); }
            if (!vRemap.TryGetValue(c1, out int i2)) { i2 = outVerts.Count + 1; vRemap[c1] = i2; outVerts.Add((gx[c1], gy[c1], gz[c1])); }

            int sMin = Math.Min(i0, Math.Min(i1, i2));
            int sMax = Math.Max(i0, Math.Max(i1, i2));
            int sMid = i0 + i1 + i2 - sMin - sMax;
            long fKey = ((long)sMin << 40) ^ ((long)sMid << 20) ^ sMax;
            if (!seenFaces.Add(fKey)) continue;

            var p0 = outVerts[i0 - 1]; var p1 = outVerts[i1 - 1]; var p2 = outVerts[i2 - 1];
            float e1x = p1.x - p0.x, e1y = p1.y - p0.y, e1z = p1.z - p0.z;
            float e2x = p2.x - p0.x, e2y = p2.y - p0.y, e2z = p2.z - p0.z;
            float nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            float nl = MathF.Sqrt(nx * nx + ny * ny + nz * nz);
            if (nl < 1e-6f) continue;
            outFaces.Add((i0, i1, i2, nx / nl, ny / nl, nz / nl));
        }

        if (outFaces.Count == 0)
            return new MeshExportResult(false, "FAILED", 0, 0, numTris, new List<string>(), importedMats, "Stream: 0 clustered faces");

        Directory.CreateDirectory(Path.GetDirectoryName(outObjPath)!);
        var ic = CultureInfo.InvariantCulture;
        using var sw = new StreamWriter(outObjPath, false, new UTF8Encoding(false), 65536);
        sw.WriteLine("# PlayForge Streaming Nanite FMeshDescription -> Godot 4.7.2");
        sw.WriteLine("g Rock\nusemtl Rock");
        foreach (var v in outVerts)
        {
            sw.WriteLine(string.Create(ic, $"v {v.x:F4} {v.y:F4} {v.z:F4}"));
            sw.WriteLine(string.Create(ic, $"vt {v.x * 0.16f:F4} {v.z * 0.16f:F4}"));
        }
        for (int f = 0; f < outFaces.Count; f++)
            sw.WriteLine(string.Create(ic, $"vn {outFaces[f].nx:F4} {outFaces[f].ny:F4} {outFaces[f].nz:F4}"));
        for (int f = 0; f < outFaces.Count; f++)
        {
            var fc = outFaces[f];
            int ni = f + 1;
            sw.WriteLine($"f {fc.a}/{fc.a}/{ni} {fc.b}/{fc.b}/{ni} {fc.c}/{fc.c}/{ni}");
        }
        return new MeshExportResult(true, "NANITE_DECIMATED", outVerts.Count, outFaces.Count, numTris, new List<string> { "Rock" }, importedMats, null);
    }

    private static MeshExportResult TryExportBodySetupCollisionHull(UAsset ua, string outObjPath, List<string> importedMats)
    {
        var bs = ua.Exports.OfType<NormalExport>().FirstOrDefault(e => e.GetExportClassType().ToString() == "BodySetup");
        if (bs == null || bs["AggGeom"] is not StructPropertyData agg)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "No MeshDescription and no BodySetup");

        var verts = new List<(float x, float y, float z)>();
        var tris = new List<(int a, int b, int c)>();
        if (agg["ConvexElems"] is ArrayPropertyData convexArr)
        {
            foreach (var elem in convexArr.Value.OfType<StructPropertyData>())
            {
                int baseV = verts.Count + 1;
                if (elem["VertexData"] is ArrayPropertyData vd && elem["IndexData"] is ArrayPropertyData id)
                {
                    foreach (var vp in vd.Value.OfType<StructPropertyData>())
                    {
                        if (vp.Value[0] is VectorPropertyData vec)
                            verts.Add(((float)(vec.Value.Y * 0.01), (float)(vec.Value.Z * 0.01), (float)(-vec.Value.X * 0.01)));
                    }
                    for (int k = 0; k + 2 < id.Value.Length; k += 3)
                    {
                        int i0 = ((IntPropertyData)id.Value[k]).Value;
                        int i1 = ((IntPropertyData)id.Value[k + 1]).Value;
                        int i2 = ((IntPropertyData)id.Value[k + 2]).Value;
                        tris.Add((baseV + i0, baseV + i2, baseV + i1));
                    }
                }
            }
        }
        if (tris.Count == 0)
            return new MeshExportResult(false, "FAILED", 0, 0, 0, new List<string>(), importedMats, "Empty BodySetup ConvexElems");

        Directory.CreateDirectory(Path.GetDirectoryName(outObjPath)!);
        var ic = CultureInfo.InvariantCulture;
        using var sw = new StreamWriter(outObjPath, false, new UTF8Encoding(false));
        sw.WriteLine("vt 0 0\nvn 0 1 0");
        foreach (var v in verts) sw.WriteLine(string.Create(ic, $"v {v.x:F5} {v.y:F5} {v.z:F5}"));
        foreach (var t in tris) sw.WriteLine($"f {t.a}/1/1 {t.b}/1/1 {t.c}/1/1");
        return new MeshExportResult(true, "COLLISION_HULL_FALLBACK", verts.Count, tris.Count, tris.Count, new List<string> { "Slot_0" }, importedMats, null);
    }

    /// <summary>
    private static byte[]? ReadLandscapeBulkPayload(byte[] fileBytes, long mipStart, int maxRawNeeded)
    {
        if (mipStart < 0 || mipStart + 48 > fileBytes.Length) return null;
        uint tag = BinaryPrimitives.ReadUInt32LittleEndian(fileBytes.AsSpan((int)mipStart, 4));
        if (tag == 0x9E2A83C1u)
        {
            long blockSize = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan((int)mipStart + 8, 8));
            long totalRaw = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan((int)mipStart + 24, 8));
            if (blockSize <= 0 || totalRaw <= 0 || totalRaw > 16 * 1024 * 1024) return null;
            int numChunks = (int)((totalRaw + blockSize - 1) / blockSize);
            long hdrEnd = mipStart + 32 + (long)numChunks * 16;
            if (hdrEnd > fileBytes.Length) return null;

            byte[] outRaw = new byte[totalRaw];
            long compCur = hdrEnd;
            int rawWritten = 0;
            for (int c = 0; c < numChunks; c++)
            {
                long cSize = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan((int)(mipStart + 32 + c * 16), 8));
                long rSize = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan((int)(mipStart + 40 + c * 16), 8));
                if (cSize <= 0 || compCur + cSize > fileBytes.Length) return null;
                using var cms = new MemoryStream(fileBytes, (int)compCur, (int)cSize);
                using var zstream = new ZLibStream(cms, CompressionMode.Decompress);
                int readTotal = 0;
                while (readTotal < rSize)
                {
                    int n = zstream.Read(outRaw, rawWritten + readTotal, (int)rSize - readTotal);
                    if (n <= 0) break;
                    readTotal += n;
                }
                rawWritten += (int)rSize;
                compCur += cSize;
            }
            return outRaw;
        }
        int avail = (int)Math.Min(maxRawNeeded, fileBytes.Length - mipStart);
        byte[] slice = new byte[avail];
        Buffer.BlockCopy(fileBytes, (int)mipStart, slice, 0, avail);
        return slice;
    }

    /// <summary>
    /// Reconstructs the real UE5 MainWorld Landscape heightfield across all LandscapeStreamingProxy ExternalActors!
    /// </summary>
    public static (bool Success, int Verts, int Tris) ExportLandscapeProxiesToGodotObj(IEnumerable<string> proxyActorPaths, string outObjPath)
    {
        var ic = CultureInfo.InvariantCulture;
        var posLines = new List<string>();
        var uvLines = new List<string>();
        var nrmLines = new List<string>();
        var faceLines = new List<string>();
        int vBase = 1;
        const int step = 2;

        foreach (string af in proxyActorPaths)
        {
            using var fs = new FileStream(af, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var ua = new UAsset(new AssetBinaryReader(fs), EngineVersion.UNKNOWN);
            byte[] bytes = File.ReadAllBytes(af);
            int lastEnd = (int)ua.Exports.Max(e => e.SerialOffset + e.SerialSize);

            var rootComp = ua.Exports.OfType<NormalExport>().FirstOrDefault(e => e.ObjectName.ToString() == "RootComponent0");
            var (rx, ry, rz) = ReadVec3(rootComp?["RelativeLocation"], 0, 0, 0);
            var (sx, sy, sz) = ReadVec3(rootComp?["RelativeScale3D"], 100, 100, 100);

            foreach (var lc in ua.Exports.OfType<NormalExport>().Where(e => e.GetExportClassType().ToString() == "LandscapeComponent"))
            {
                int secX = (lc["SectionBaseX"] as IntPropertyData)?.Value ?? 0;
                int secY = (lc["SectionBaseY"] as IntPropertyData)?.Value ?? 0;
                int quads = (lc["ComponentSizeQuads"] as IntPropertyData)?.Value ?? 63;
                var (lcx, lcy, lcz) = ReadVec3(lc["RelativeLocation"], secX, secY, 0);

                double minLocalZ = -256.0, maxLocalZ = 256.0;
                if (lc["CachedLocalBox"] is StructPropertyData boxSt && boxSt.Value.Count > 0 && boxSt.Value[0] is BoxPropertyData bpd)
                {
                    minLocalZ = bpd.Value.Min.Z;
                    maxLocalZ = bpd.Value.Max.Z;
                }

                double hBiasX = 0, hBiasY = 0;
                if (lc["HeightmapScaleBias"] is StructPropertyData hsb && hsb.Value.Count > 0 && hsb.Value[0] is Vector4PropertyData v4)
                {
                    hBiasX = v4.Value.Z; hBiasY = v4.Value.W;
                }

                var hmIdx = (lc["HeightmapTexture"] as ObjectPropertyData)?.Value;
                if (hmIdx == null || !hmIdx.IsExport()) continue;
                if (hmIdx.ToExport(ua) is not NormalExport hmTex || hmTex.Extras == null || hmTex.Extras.Length < 22) continue;

                int texW = 64, texH = 64;
                if (hmTex["Source"] is StructPropertyData src)
                {
                    texW = (src["SizeX"] as IntPropertyData)?.Value ?? 64;
                    texH = (src["SizeY"] as IntPropertyData)?.Value ?? 64;
                }
                long relOff = BitConverter.ToInt64(hmTex.Extras, 14);
                long mipStart = lastEnd + relOff;
                bool isZlib = mipStart >= 0 && mipStart + 4 <= bytes.Length && BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan((int)mipStart, 4)) == 0x9E2A83C1u;
                byte[]? mipBuf = ReadLandscapeBulkPayload(bytes, mipStart, texW * texH * 4);
                if (mipBuf == null || mipBuf.Length < texW * texH * 2) continue;

                // Determine BGRA8 (4B/px: R=high, G=low) vs G16 (2B/px) using Zlib flag & CachedLocalBox check!
                bool useBgra4 = isZlib && mipBuf.Length >= texW * texH * 4;
                if (!isZlib && mipBuf.Length >= texW * texH * 4)
                {
                    double testG16 = ((int)BitConverter.ToUInt16(mipBuf, 0) - 32768) / 128.0;
                    double testBgra = (((mipBuf[2] << 8) | mipBuf[1]) - 32768) / 128.0;
                    bool g16InBox = testG16 >= minLocalZ - 4.0 && testG16 <= maxLocalZ + 4.0;
                    bool bgraInBox = testBgra >= minLocalZ - 4.0 && testBgra <= maxLocalZ + 4.0;
                    if (bgraInBox && !g16InBox) useBgra4 = true;
                }

                int u0 = (int)Math.Round(hBiasX * texW);
                int v0 = (int)Math.Round(hBiasY * texH);
                int gridN = (quads + 1 - 1) / step + 1;
                var worldG = new (float x, float y, float z)[gridN, gridN];

                for (int gy = 0; gy < gridN; gy++)
                {
                    int ly = Math.Min(quads, gy * step);
                    for (int gx = 0; gx < gridN; gx++)
                    {
                        int lx = Math.Min(quads, gx * step);
                        int tx = Math.Clamp(u0 + lx, 0, texW - 1);
                        int ty = Math.Clamp(v0 + ly, 0, texH - 1);
                        int pIdx = ty * texW + tx;
                        ushort h16 = useBgra4
                            ? (ushort)((mipBuf[pIdx * 4 + 2] << 8) | mipBuf[pIdx * 4 + 1])
                            : BitConverter.ToUInt16(mipBuf, pIdx * 2);
                        double localZ = Math.Clamp(((int)h16 - 32768) / 128.0, minLocalZ, maxLocalZ);
                        double ueWorldX = rx + (lcx + lx) * sx;
                        double ueWorldY = ry + (lcy + ly) * sy;
                        double ueWorldZ = rz + (lcz + localZ) * sz;
                        worldG[gx, gy] = ((float)(ueWorldY * 0.01), (float)(ueWorldZ * 0.01), (float)(-ueWorldX * 0.01));
                    }
                }

                for (int gy = 0; gy < gridN; gy++)
                {
                    for (int gx = 0; gx < gridN; gx++)
                    {
                        var p = worldG[gx, gy];
                        posLines.Add(string.Create(ic, $"v {p.x:F3} {p.y:F3} {p.z:F3}"));
                        uvLines.Add(string.Create(ic, $"vt {p.x * 0.12f:F3} {p.z * 0.12f:F3}"));

                        var px0 = worldG[Math.Max(0, gx - 1), gy];
                        var px1 = worldG[Math.Min(gridN - 1, gx + 1), gy];
                        var py0 = worldG[gx, Math.Max(0, gy - 1)];
                        var py1 = worldG[gx, Math.Min(gridN - 1, gy + 1)];
                        // Cross tangent vectors in Godot RH space so normal points +Y up
                        float dxX = px1.x - px0.x, dxY = px1.y - px0.y, dxZ = px1.z - px0.z;
                        float dyX = py1.x - py0.x, dyY = py1.y - py0.y, dyZ = py1.z - py0.z;
                        float nx = dyY * dxZ - dyZ * dxY;
                        float ny = dyZ * dxX - dyX * dxZ;
                        float nz = dyX * dxY - dyY * dxX;
                        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
                        float len = MathF.Max(1e-5f, MathF.Sqrt(nx * nx + ny * ny + nz * nz));
                        nrmLines.Add(string.Create(ic, $"vn {nx / len:F4} {ny / len:F4} {nz / len:F4}"));
                    }
                }

                for (int gy = 0; gy < gridN - 1; gy++)
                {
                    for (int gx = 0; gx < gridN - 1; gx++)
                    {
                        int i00 = vBase + gy * gridN + gx;
                        int i10 = i00 + 1;
                        int i01 = i00 + gridN;
                        int i11 = i01 + 1;
                        // Note: gx increases -> ueWorldX increases -> Godot Z decreases (-Z), gy increases -> ueWorldY increases -> Godot +X!
                        // Check CCW from +Y above: i00(x,z) -> i01(x+dx, z) -> i11(x+dx, z-dz): (dx,0,0) x (dx,0,-dz) = (0, +dx*dz, 0) = +Y!
                        faceLines.Add(string.Create(ic, $"f {i00}/{i00}/{i00} {i01}/{i01}/{i01} {i11}/{i11}/{i11}"));
                        faceLines.Add(string.Create(ic, $"f {i00}/{i00}/{i00} {i11}/{i11}/{i11} {i10}/{i10}/{i10}"));
                    }
                }
                vBase += gridN * gridN;
            }
        }

        if (faceLines.Count == 0) return (false, 0, 0);
        Directory.CreateDirectory(Path.GetDirectoryName(outObjPath)!);
        using var sw = new StreamWriter(outObjPath, false, new UTF8Encoding(false), 65536);
        sw.WriteLine("# PlayForge Real UE5 MainWorld Landscape Heightfield -> Godot 4.7.2");
        sw.WriteLine("g Landscape\nusemtl Landscape");
        foreach (string l in posLines) sw.WriteLine(l);
        foreach (string l in uvLines) sw.WriteLine(l);
        foreach (string l in nrmLines) sw.WriteLine(l);
        foreach (string l in faceLines) sw.WriteLine(l);
        return (true, posLines.Count, faceLines.Count);
    }

    private static (double x, double y, double z) ReadVec3(PropertyData? prop, double dx, double dy, double dz)
    {
        if (prop is StructPropertyData sp && sp.Value.Count > 0 && sp.Value[0] is VectorPropertyData vp)
            return (vp.Value.X, vp.Value.Y, vp.Value.Z);
        return (dx, dy, dz);
    }

    public static string SanitizeIdent(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "Slot_0";
        var sb = new StringBuilder(s.Length);
        foreach (char c in s)
            sb.Append(char.IsLetterOrDigit(c) || c == '_' ? c : '_');
        return sb.ToString();
    }
}
