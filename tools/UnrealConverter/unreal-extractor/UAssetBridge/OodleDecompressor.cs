using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace PlayForge.UAssetBridge;

/// <summary>
/// Decompresses UE5 Editor BulkData FCompressedBuffer (magic 0xB7756362) payloads
/// supporting both full in-memory buffers and zero-copy random-access Oodle block streaming
/// for multi-gigabyte Nanite FMeshDescription payloads (e.g. 1.4 GB SM_RockFlats_01).
/// </summary>
public static class OodleDecompressor
{
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate long OodleLZDecompressFn(
        byte[] compBuf, long compBufSize,
        byte[] rawBuf, long rawLen,
        int fuzzSafe, int checkCRC, int verbosity,
        IntPtr decBufBase, long decBufSize,
        IntPtr fpCallback, IntPtr callbackUserData,
        IntPtr decoderMemory, long decoderMemorySize,
        int threadPhase);

    private static OodleLZDecompressFn? _decompressFn;
    private static bool _searched;
    public static string? LoadedDllPath { get; private set; }

    private static OodleLZDecompressFn? EnsureLoaded()
    {
        if (_searched) return _decompressFn;
        _searched = true;

        var candidates = new List<string>();
        string? envPath = Environment.GetEnvironmentVariable("OO2CORE_DLL");
        if (!string.IsNullOrWhiteSpace(envPath) && File.Exists(envPath))
            candidates.Add(envPath);

        foreach (string root in new[] { @"C:\Epic Games", @"C:\Program Files\Epic Games", @"D:\Epic Games" })
        {
            if (!Directory.Exists(root)) continue;
            try { candidates.AddRange(Directory.GetFiles(root, "oo2core_*_win64.dll", SearchOption.AllDirectories)); }
            catch { }
        }

        foreach (string dllPath in candidates.Distinct())
        {
            try
            {
                IntPtr handle = NativeLibrary.Load(dllPath);
                if (NativeLibrary.TryGetExport(handle, "OodleLZ_Decompress", out IntPtr sym))
                {
                    LoadedDllPath = dllPath;
                    _decompressFn = Marshal.GetDelegateForFunctionPointer<OodleLZDecompressFn>(sym);
                    return _decompressFn;
                }
            }
            catch { }
        }
        return null;
    }

    public sealed record CompressedBufferHeader(int Offset, byte Method, byte BlockExp, uint BlockCount, long RawSize, long CompSize);
    public sealed record CompressedBufferEntry(int FileOffset, byte Method, long RawSize, long CompressedSize, byte[] Data);

    /// <summary>
    /// On-demand random-access virtual view over a multi-GB Oodle FCompressedBuffer.
    /// Decompresses only the touched 256 KB blocks (keeping an 8-block LRU cache = ~2 MB RAM).
    /// </summary>
    public sealed class SeekableCompressedBuffer
    {
        private readonly byte[] _fileBytes;
        private readonly byte _method;
        private readonly int _blockShift;
        private readonly int _blockSize;
        private readonly int[] _compSizes;
        private readonly int[] _compOffsets;
        private readonly Dictionary<int, byte[]> _cache = new();
        private readonly Queue<int> _lru = new();
        public long Length { get; }

        public SeekableCompressedBuffer(byte[] fileBytes, CompressedBufferHeader hdr)
        {
            _fileBytes = fileBytes;
            _method = hdr.Method;
            Length = hdr.RawSize;
            _blockShift = hdr.Method == 0 ? 20 : hdr.BlockExp;
            _blockSize = 1 << _blockShift;
            int nBlocks = hdr.Method == 0 ? 1 : (int)hdr.BlockCount;
            _compSizes = new int[nBlocks];
            _compOffsets = new int[nBlocks];

            if (hdr.Method == 0)
            {
                _compOffsets[0] = hdr.Offset + 64;
                _compSizes[0] = (int)hdr.RawSize;
            }
            else
            {
                int tablePos = hdr.Offset + 64;
                int cur = tablePos + nBlocks * 4;
                for (int b = 0; b < nBlocks; b++)
                {
                    int cs = (int)BinaryPrimitives.ReadUInt32BigEndian(fileBytes.AsSpan(tablePos + b * 4, 4));
                    _compSizes[b] = cs;
                    _compOffsets[b] = cur;
                    cur += cs;
                }
            }
        }

        private byte[]? GetBlock(int blockIdx)
        {
            if (_cache.TryGetValue(blockIdx, out var cached)) return cached;
            if (blockIdx < 0 || blockIdx >= _compSizes.Length) return null;

            long rawStart = (long)blockIdx * _blockSize;
            int rSize = (int)Math.Min(_blockSize, Length - rawStart);
            int cSize = _compSizes[blockIdx];
            int cOff = _compOffsets[blockIdx];
            if (rSize <= 0 || cSize <= 0 || cOff + cSize > _fileBytes.Length) return null;

            byte[] rChunk = new byte[rSize];
            if (_method == 0 || cSize == rSize)
            {
                Buffer.BlockCopy(_fileBytes, cOff, rChunk, 0, rSize);
            }
            else
            {
                var fn = EnsureLoaded();
                if (fn == null) return null;
                byte[] cChunk = new byte[cSize];
                Buffer.BlockCopy(_fileBytes, cOff, cChunk, 0, cSize);
                long dec = fn(cChunk, cSize, rChunk, rSize, 1, 0, 0, IntPtr.Zero, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, 3);
                if (dec != rSize) return null;
            }

            if (_cache.Count >= 12)
            {
                int old = _lru.Dequeue();
                _cache.Remove(old);
            }
            _cache[blockIdx] = rChunk;
            _lru.Enqueue(blockIdx);
            return rChunk;
        }

        public bool ReadBytes(long virtualPos, Span<byte> dest)
        {
            if (virtualPos < 0 || virtualPos + dest.Length > Length) return false;
            int written = 0;
            while (written < dest.Length)
            {
                long cur = virtualPos + written;
                int bIdx = _method == 0 ? 0 : (int)(cur >> _blockShift);
                int inBlock = _method == 0 ? (int)cur : (int)(cur & (_blockSize - 1));
                var blk = GetBlock(bIdx);
                if (blk == null || inBlock >= blk.Length) return false;
                int take = Math.Min(dest.Length - written, blk.Length - inBlock);
                blk.AsSpan(inBlock, take).CopyTo(dest.Slice(written, take));
                written += take;
            }
            return true;
        }

        public int ReadInt32(long pos)
        {
            Span<byte> b = stackalloc byte[4];
            return ReadBytes(pos, b) ? BinaryPrimitives.ReadInt32LittleEndian(b) : 0;
        }

        public float ReadSingle(long pos)
        {
            Span<byte> b = stackalloc byte[4];
            return ReadBytes(pos, b) ? BinaryPrimitives.ReadSingleLittleEndian(b) : 0f;
        }
    }

    public static List<CompressedBufferHeader> ScanHeaders(byte[] fileBytes, int startOffset)
    {
        var headers = new List<CompressedBufferHeader>();
        for (int i = Math.Max(0, startOffset); i <= fileBytes.Length - 64; i++)
        {
            if (BinaryPrimitives.ReadUInt32BigEndian(fileBytes.AsSpan(i, 4)) != 0xB7756362u)
                continue;

            byte method = fileBytes[i + 8];
            byte blockExp = fileBytes[i + 11];
            uint blockCount = BinaryPrimitives.ReadUInt32BigEndian(fileBytes.AsSpan(i + 12, 4));
            long totalRaw = (long)BinaryPrimitives.ReadUInt64BigEndian(fileBytes.AsSpan(i + 16, 8));
            long totalComp = (long)BinaryPrimitives.ReadUInt64BigEndian(fileBytes.AsSpan(i + 24, 8));

            if (totalRaw <= 0 || totalComp < 0 || i + 64 + totalComp > fileBytes.Length + 64)
                continue;

            headers.Add(new CompressedBufferHeader(i, method, blockExp, blockCount, totalRaw, totalComp));
            i += 63 + (int)Math.Min(totalComp, fileBytes.Length - i - 64);
        }
        return headers;
    }

    public static List<CompressedBufferEntry> ExtractAllCompressedBuffers(
        byte[] fileBytes,
        int startOffset,
        long maxRawBytesPerBuffer = 96L * 1024 * 1024,
        bool onlyLastValid = false)
    {
        var headers = ScanHeaders(fileBytes, startOffset);
        if (onlyLastValid && headers.Count > 1)
            headers = new List<CompressedBufferHeader> { headers[^1] };

        var results = new List<CompressedBufferEntry>();
        foreach (var h in headers)
        {
            if (h.RawSize > maxRawBytesPerBuffer) continue;
            byte[]? raw = DecompressOne(fileBytes, h.Offset, h.Method, h.BlockExp, h.BlockCount, h.RawSize);
            if (raw != null)
                results.Add(new CompressedBufferEntry(h.Offset, h.Method, h.RawSize, h.CompSize, raw));
        }
        return results;
    }

    /// <summary>
    /// Decompresses UE5 FArchiveSaveCompressedProxy chunked archives (magic 0x9E2A83C1):
    ///   - Version 0x00000000: Zlib chunks (32-byte summary + numChunks*16 table + Zlib streams)
    ///   - Version 0x22222222: UE5 Compressor-tagged chunks (17-byte summary after version: int64 blockSize, byte method=3 Oodle, int64 totalComp, int64 totalRaw + numChunks*16 table + Oodle blocks)
    /// </summary>
    public static byte[]? DecompressUeChunkedArchive(byte[] fileBytes, int startOffset)
    {
        for (int i = Math.Max(0, startOffset); i <= fileBytes.Length - 49; i++)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(fileBytes.AsSpan(i, 4)) != 0x9E2A83C1u)
                continue;

            uint ver = BinaryPrimitives.ReadUInt32LittleEndian(fileBytes.AsSpan(i + 4, 4));
            if (ver == 0x22222222u)
            {
                long blockSize = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan(i + 8, 8));
                byte method = fileBytes[i + 16];
                long totalComp = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan(i + 17, 8));
                long totalRaw = BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan(i + 25, 8));
                if (blockSize <= 0 || totalRaw <= 0 || totalRaw > 128L * 1024 * 1024 || totalComp <= 0) continue;
                int numChunks = (int)((totalRaw + blockSize - 1) / blockSize);
                int tablePos = i + 33;
                int dataPos = tablePos + numChunks * 16;
                if (dataPos + totalComp > fileBytes.Length) continue;

                var fn = EnsureLoaded();
                byte[] output = new byte[totalRaw];
                int outPos = 0;
                for (int c = 0; c < numChunks; c++)
                {
                    int cSize = (int)BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan(tablePos + c * 16, 8));
                    int rSize = (int)BinaryPrimitives.ReadInt64LittleEndian(fileBytes.AsSpan(tablePos + c * 16 + 8, 8));
                    if (cSize <= 0 || dataPos + cSize > fileBytes.Length) return null;
                    if (cSize == rSize || method == 0)
                    {
                        Buffer.BlockCopy(fileBytes, dataPos, output, outPos, rSize);
                    }
                    else if (fileBytes[dataPos] == 0x78) // Zlib stream (0x78 0x9C / 0x78 0xDA / 0x78 0x01)
                    {
                        using var zms = new System.IO.Compression.ZLibStream(new MemoryStream(fileBytes, dataPos, cSize), System.IO.Compression.CompressionMode.Decompress);
                        int readTotal = 0;
                        while (readTotal < rSize)
                        {
                            int n = zms.Read(output, outPos + readTotal, rSize - readTotal);
                            if (n <= 0) break;
                            readTotal += n;
                        }
                        if (readTotal != rSize) return null;
                    }
                    else
                    {
                        if (fn == null) return null;
                        byte[] cBuf = new byte[cSize];
                        Buffer.BlockCopy(fileBytes, dataPos, cBuf, 0, cSize);
                        byte[] rBuf = new byte[rSize];
                        long dec = fn(cBuf, cSize, rBuf, rSize, 1, 0, 0, IntPtr.Zero, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, 3);
                        if (dec != rSize) return null;
                        Buffer.BlockCopy(rBuf, 0, output, outPos, rSize);
                    }
                    dataPos += cSize;
                    outPos += rSize;
                }
                return output;
            }
        }
        return null;
    }

    private static byte[]? DecompressOne(byte[] fileBytes, int i, byte method, byte blockExp, uint blockCount, long totalRaw)
    {
        if (method == 0)
        {
            if (i + 64 + totalRaw > fileBytes.Length) return null;
            byte[] raw = new byte[totalRaw];
            Buffer.BlockCopy(fileBytes, i + 64, raw, 0, (int)totalRaw);
            return raw;
        }
        if (method == 3)
        {
            var fn = EnsureLoaded();
            if (fn == null) return null;
            int maxBlockRaw = 1 << blockExp;
            int tablePos = i + 64;
            int dataPos = tablePos + (int)blockCount * 4;
            if (dataPos > fileBytes.Length) return null;

            byte[] output = new byte[totalRaw];
            long outWritten = 0;
            for (int b = 0; b < blockCount; b++)
            {
                int cSize = (int)BinaryPrimitives.ReadUInt32BigEndian(fileBytes.AsSpan(tablePos + b * 4, 4));
                int rSize = (int)Math.Min(maxBlockRaw, totalRaw - outWritten);
                if (cSize <= 0 || dataPos + cSize > fileBytes.Length) return null;

                if (cSize == rSize)
                {
                    Buffer.BlockCopy(fileBytes, dataPos, output, (int)outWritten, rSize);
                    dataPos += cSize;
                }
                else
                {
                    byte[] cChunk = new byte[cSize];
                    Buffer.BlockCopy(fileBytes, dataPos, cChunk, 0, cSize);
                    dataPos += cSize;
                    byte[] rChunk = new byte[rSize];
                    long dec = fn(cChunk, cSize, rChunk, rSize, 1, 0, 0, IntPtr.Zero, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, 3);
                    if (dec != rSize) return null;
                    Buffer.BlockCopy(rChunk, 0, output, (int)outWritten, rSize);
                }
                outWritten += rSize;
            }
            return output;
        }
        return null;
    }
}
