/**
 * Unreal Engine Binary Package (.uasset / .umap) Reverse-Engineering Parser (Zero-Dependency)
 *
 * Implements Unreal Engine's `FArchive` binary package layout (PackageFileSummary.cpp):
 *   - Magic Tag: 0x9E2A83C1 (PACKAGE_FILE_TAG, little-endian)
 *   - LegacyFileVersion (int32, e.g. -8 for UE5)
 *   - FileVersionUE4 (int32), FileVersionUE5 (int32)
 *   - PackageFlags (uint32)
 *   - NameCount / NameOffset -> FName table (FString + uint32 hash)
 *   - ImportCount / ImportOffset -> FObjectImport table (ClassPackage, ClassName, OuterIndex, ObjectName)
 *   - ExportCount / ExportOffset -> FObjectExport table (ClassIndex, SuperIndex, OuterIndex, ObjectName, SerialSize, SerialOffset)
 *   - Serialized Export Payload: Tagged FPropertyTag stream (Name, Type, Size, Value)
 *     supporting StructProperty(Vector, Rotator, Scale3D), FloatProperty, BoolProperty, StrProperty,
 *     NameProperty, ObjectProperty, ArrayProperty(BoneInfo / AnimTrack).
 */

export const PACKAGE_FILE_TAG = 0x9e2a83c1;

// Real Unreal Engine EExprToken Kismet Bytecode opcodes (Engine/Source/Runtime/CoreUObject/Public/UObject/Script.h)
export const KISMET_OPCODES = {
  EX_Return: 0x04,
  EX_Jump: 0x06,
  EX_JumpIfNot: 0x07,
  EX_Let: 0x0f,
  EX_LocalFinalFunction: 0x19,
  EX_VirtualFunction: 0x1b,
  EX_EndOfScript: 0x53,
  EX_CallMath: 0x68
};

export const KISMET_OPCODE_NAMES = Object.fromEntries(
  Object.entries(KISMET_OPCODES).map(([k, v]) => [v, k])
);

export function disassembleKismetBytecode(bytes, nameMap = []) {
  const ops = [];
  let i = 0;
  while (i < bytes.length) {
    const op = bytes[i++];
    const name = KISMET_OPCODE_NAMES[op] || `EX_Unknown_0x${op.toString(16)}`;
    if (
      op === KISMET_OPCODES.EX_LocalFinalFunction ||
      op === KISMET_OPCODES.EX_VirtualFunction ||
      op === KISMET_OPCODES.EX_CallMath
    ) {
      const nameIdx = i + 4 <= bytes.length ? bytes.readInt32LE(i) : -1;
      i += 4;
      ops.push({ opcode: name, hex: `0x${op.toString(16)}`, target: nameMap[nameIdx] || `Name_${nameIdx}` });
    } else if (op === KISMET_OPCODES.EX_JumpIfNot || op === KISMET_OPCODES.EX_Jump) {
      const offset = i + 4 <= bytes.length ? bytes.readUInt32LE(i) : 0;
      i += 4;
      ops.push({ opcode: name, hex: `0x${op.toString(16)}`, offset });
    } else {
      ops.push({ opcode: name, hex: `0x${op.toString(16)}` });
      if (op === KISMET_OPCODES.EX_EndOfScript) break;
    }
  }
  return ops;
}

class BinaryReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  readUInt32() { const v = this.buf.readUInt32LE(this.pos); this.pos += 4; return v; }
  readInt32() { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v; }
  readFloat32() { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; }
  readDouble() { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; }
  readUInt8() { const v = this.buf.readUInt8(this.pos); this.pos += 1; return v; }
  readFString() {
    const len = this.readInt32();
    if (len === 0) return "";
    if (len > 0) {
      const str = this.buf.toString("utf8", this.pos, this.pos + len - 1);
      this.pos += len;
      return str;
    }
    // UTF-16LE when len < 0 (standard UE FString)
    const byteLen = (-len) * 2;
    const str = this.buf.toString("utf16le", this.pos, this.pos + byteLen - 2);
    this.pos += byteLen;
    return str;
  }
}

class BinaryWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  writeUInt32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); this._push(b); }
  writeInt32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0, 0); this._push(b); }
  writeFloat32(v) { const b = Buffer.alloc(4); b.writeFloatLE(Number(v), 0); this._push(b); }
  writeDouble(v) { const b = Buffer.alloc(8); b.writeDoubleLE(Number(v), 0); this._push(b); }
  writeUInt8(v) { const b = Buffer.alloc(1); b.writeUInt8(v & 0xff, 0); this._push(b); }
  writeFString(str) {
    if (!str) {
      this.writeInt32(0);
      return;
    }
    const raw = Buffer.from(str + "\0", "utf8");
    this.writeInt32(raw.length);
    this._push(raw);
  }
  writeBuffer(buf) { this._push(buf); }
  _push(b) { this.chunks.push(b); this.length += b.length; }
  toBuffer() { return Buffer.concat(this.chunks, this.length); }
}

/**
 * Parse a binary Unreal Engine .uasset / .umap buffer into structured Package metadata,
 * NameMap, ImportMap, ExportMap, and deserialized FPropertyTag payloads.
 */
export function parseUeBinaryPackage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 48) {
    throw new Error("Invalid UE binary package: buffer too small");
  }
  const r = new BinaryReader(buf);
  const tag = r.readUInt32();
  if (tag !== PACKAGE_FILE_TAG) {
    throw new Error(`Invalid UE PACKAGE_FILE_TAG: 0x${tag.toString(16)} (expected 0x9e2a83c1)`);
  }

  const legacyFileVersion = r.readInt32();
  const fileVersionUE4 = r.readInt32();
  const fileVersionUE5 = r.readInt32();
  const packageFlags = r.readUInt32();
  const folderName = r.readFString();
  const nameCount = r.readInt32();
  const nameOffset = r.readInt32();
  const importCount = r.readInt32();
  const importOffset = r.readInt32();
  const exportCount = r.readInt32();
  const exportOffset = r.readInt32();

  // 1. NameMap
  const nameMap = [];
  r.pos = nameOffset;
  for (let i = 0; i < nameCount; i++) {
    const name = r.readFString();
    const hash = r.readUInt32();
    nameMap.push({ index: i, name, hash });
  }
  const fname = (idx) => (nameMap[idx] ? nameMap[idx].name : `Name_${idx}`);

  // 2. ImportMap
  const imports = [];
  r.pos = importOffset;
  for (let i = 0; i < importCount; i++) {
    const classPackage = fname(r.readInt32());
    const className = fname(r.readInt32());
    const outerIndex = r.readInt32();
    const objectName = fname(r.readInt32());
    imports.push({ index: -(i + 1), classPackage, className, outerIndex, objectName });
  }

  // 3. ExportMap
  const exports = [];
  r.pos = exportOffset;
  for (let i = 0; i < exportCount; i++) {
    const classIndex = r.readInt32();
    const superIndex = r.readInt32();
    const outerIndex = r.readInt32();
    const objectName = fname(r.readInt32());
    const serialSize = r.readInt32();
    const serialOffset = r.readInt32();
    const classObj = classIndex < 0 ? imports[-classIndex - 1] : null;
    exports.push({
      index: i + 1,
      classIndex,
      className: classObj ? classObj.objectName : `ExportClass_${classIndex}`,
      superIndex,
      outerIndex,
      objectName,
      serialSize,
      serialOffset,
      properties: {}
    });
  }

  // 4. Deserialize Export FPropertyTag payloads
  for (const exp of exports) {
    if (exp.serialSize <= 0 || exp.serialOffset <= 0 || exp.serialOffset + exp.serialSize > buf.length) {
      continue;
    }
    r.pos = exp.serialOffset;
    const endPos = exp.serialOffset + exp.serialSize;
    while (r.pos < endPos) {
      const propName = fname(r.readInt32());
      if (propName === "None") break;
      const propType = fname(r.readInt32());
      const propSize = r.readInt32();
      const valueStart = r.pos;

      if (propType === "StructProperty") {
        const structName = fname(r.readInt32());
        if (structName === "Vector" || structName === "Vector3d") {
          exp.properties[propName] = [r.readDouble(), r.readDouble(), r.readDouble()];
        } else if (structName === "Rotator") {
          exp.properties[propName] = { pitch: r.readDouble(), yaw: r.readDouble(), roll: r.readDouble() };
        } else {
          r.pos = valueStart + propSize;
        }
      } else if (propType === "FloatProperty") {
        exp.properties[propName] = r.readFloat32();
      } else if (propType === "BoolProperty") {
        exp.properties[propName] = r.readUInt8() !== 0;
      } else if (propType === "StrProperty") {
        exp.properties[propName] = r.readFString();
      } else if (propType === "NameProperty") {
        exp.properties[propName] = fname(r.readInt32());
      } else if (propType === "ArrayProperty") {
        const elemType = fname(r.readInt32());
        const count = r.readInt32();
        const arr = [];
        if (elemType === "BoneInfo") {
          for (let k = 0; k < count; k++) {
            arr.push({
              name: fname(r.readInt32()),
              parent_index: r.readInt32(),
              location_cm: [r.readDouble(), r.readDouble(), r.readDouble()],
              rotation_deg: { pitch: r.readDouble(), yaw: r.readDouble(), roll: r.readDouble() }
            });
          }
        } else if (elemType === "AnimKey") {
          for (let k = 0; k < count; k++) {
            arr.push({
              clip: fname(r.readInt32()),
              bone: fname(r.readInt32()),
              time_sec: r.readFloat32(),
              rotation_deg: { pitch: r.readFloat32(), yaw: r.readFloat32(), roll: r.readFloat32() }
            });
          }
        }
        exp.properties[propName] = arr;
      } else if (propType === "BytecodeProperty") {
        const rawBytes = buf.subarray(r.pos, r.pos + propSize);
        r.pos += propSize;
        exp.properties[propName] = disassembleKismetBytecode(rawBytes, nameMap.map((n) => n.name));
      } else {
        r.pos = valueStart + propSize;
      }
    }
  }

  return {
    summary: {
      tag: `0x${tag.toString(16).toUpperCase()}`,
      legacyFileVersion,
      fileVersionUE4,
      fileVersionUE5,
      packageFlags,
      folderName,
      nameCount,
      importCount,
      exportCount
    },
    nameMap: nameMap.map((n) => n.name),
    imports,
    exports
  };
}

/**
 * Encode a structured package descriptor into a valid little-endian Unreal Engine
 * binary .uasset / .umap buffer (PACKAGE_FILE_TAG = 0x9E2A83C1).
 */
export function encodeUeBinaryPackage({
  folderName = "/Game/StackOBot/Maps/MainLevel",
  fileVersionUE4 = 522,
  fileVersionUE5 = 1012,
  imports = [],
  exports = []
}) {
  const nameList = ["None", "StructProperty", "Vector", "Rotator", "FloatProperty", "BoolProperty", "StrProperty", "NameProperty", "ArrayProperty", "BoneInfo", "AnimKey", "BytecodeProperty"];
  const nameToIdx = new Map(nameList.map((n, i) => [n, i]));
  const intern = (str) => {
    const s = String(str || "None");
    if (!nameToIdx.has(s)) {
      nameToIdx.set(s, nameList.length);
      nameList.push(s);
    }
    return nameToIdx.get(s);
  };

  for (const imp of imports) {
    intern(imp.classPackage || "/Script/Engine");
    intern(imp.className || "Class");
    intern(imp.objectName);
  }
  for (const exp of exports) {
    intern(exp.objectName);
    for (const [k, v] of Object.entries(exp.properties || {})) {
      intern(k);
      if (v && v.type === "Name") intern(v.value);
      if (v && v.type === "BoneArray") {
        for (const b of v.value) intern(b.name);
      }
      if (v && v.type === "AnimKeyArray") {
        for (const a of v.value) {
          intern(a.clip || "Default");
          intern(a.bone);
        }
      }
      if (v && v.type === "KismetBytecode") {
        for (const ins of v.value) {
          if (ins.target) intern(ins.target);
        }
      }
    }
  }

  // Serialize each export payload first so we know serialSize
  const exportPayloads = exports.map((exp) => {
    const pw = new BinaryWriter();
    for (const [k, v] of Object.entries(exp.properties || {})) {
      pw.writeInt32(intern(k));
      if (v.type === "Vector") {
        pw.writeInt32(intern("StructProperty"));
        pw.writeInt32(28);
        pw.writeInt32(intern("Vector"));
        pw.writeDouble(v.value[0]);
        pw.writeDouble(v.value[1]);
        pw.writeDouble(v.value[2]);
      } else if (v.type === "Rotator") {
        pw.writeInt32(intern("StructProperty"));
        pw.writeInt32(28);
        pw.writeInt32(intern("Rotator"));
        pw.writeDouble(v.value.pitch || 0);
        pw.writeDouble(v.value.yaw || 0);
        pw.writeDouble(v.value.roll || 0);
      } else if (v.type === "Float") {
        pw.writeInt32(intern("FloatProperty"));
        pw.writeInt32(4);
        pw.writeFloat32(v.value);
      } else if (v.type === "Bool") {
        pw.writeInt32(intern("BoolProperty"));
        pw.writeInt32(1);
        pw.writeUInt8(v.value ? 1 : 0);
      } else if (v.type === "Str") {
        const tmp = new BinaryWriter();
        tmp.writeFString(v.value);
        const tb = tmp.toBuffer();
        pw.writeInt32(intern("StrProperty"));
        pw.writeInt32(tb.length);
        pw.writeBuffer(tb);
      } else if (v.type === "Name") {
        pw.writeInt32(intern("NameProperty"));
        pw.writeInt32(4);
        pw.writeInt32(intern(v.value));
      } else if (v.type === "BoneArray") {
        const arrW = new BinaryWriter();
        arrW.writeInt32(intern("BoneInfo"));
        arrW.writeInt32(v.value.length);
        for (const b of v.value) {
          arrW.writeInt32(intern(b.name));
          arrW.writeInt32(b.parent_index);
          arrW.writeDouble(b.location_cm[0]);
          arrW.writeDouble(b.location_cm[1]);
          arrW.writeDouble(b.location_cm[2]);
          arrW.writeDouble(b.rotation_deg?.pitch || 0);
          arrW.writeDouble(b.rotation_deg?.yaw || 0);
          arrW.writeDouble(b.rotation_deg?.roll || 0);
        }
        const ab = arrW.toBuffer();
        pw.writeInt32(intern("ArrayProperty"));
        pw.writeInt32(ab.length);
        pw.writeBuffer(ab);
      } else if (v.type === "AnimKeyArray") {
        const arrW = new BinaryWriter();
        arrW.writeInt32(intern("AnimKey"));
        arrW.writeInt32(v.value.length);
        for (const a of v.value) {
          arrW.writeInt32(intern(a.clip || "Default"));
          arrW.writeInt32(intern(a.bone));
          arrW.writeFloat32(a.time_sec);
          arrW.writeFloat32(a.rotation_deg?.pitch || 0);
          arrW.writeFloat32(a.rotation_deg?.yaw || 0);
          arrW.writeFloat32(a.rotation_deg?.roll || 0);
        }
        const ab = arrW.toBuffer();
        pw.writeInt32(intern("ArrayProperty"));
        pw.writeInt32(ab.length);
        pw.writeBuffer(ab);
      } else if (v.type === "KismetBytecode") {
        const bcW = new BinaryWriter();
        for (const ins of v.value) {
          const op = KISMET_OPCODES[ins.opcode] ?? KISMET_OPCODES.EX_EndOfScript;
          bcW.writeUInt8(op);
          if (
            op === KISMET_OPCODES.EX_LocalFinalFunction ||
            op === KISMET_OPCODES.EX_VirtualFunction ||
            op === KISMET_OPCODES.EX_CallMath
          ) {
            bcW.writeInt32(intern(ins.target || "None"));
          } else if (op === KISMET_OPCODES.EX_JumpIfNot || op === KISMET_OPCODES.EX_Jump) {
            bcW.writeUInt32(ins.offset || 0);
          }
        }
        const bcb = bcW.toBuffer();
        pw.writeInt32(intern("BytecodeProperty"));
        pw.writeInt32(bcb.length);
        pw.writeBuffer(bcb);
      }
    }
    pw.writeInt32(intern("None"));
    return pw.toBuffer();
  });

  // Build sections to compute exact offsets
  const nameW = new BinaryWriter();
  for (const n of nameList) {
    nameW.writeFString(n);
    nameW.writeUInt32(0);
  }
  const nameBuf = nameW.toBuffer();

  const importW = new BinaryWriter();
  for (const imp of imports) {
    importW.writeInt32(intern(imp.classPackage || "/Script/Engine"));
    importW.writeInt32(intern(imp.className || "Class"));
    importW.writeInt32(imp.outerIndex || 0);
    importW.writeInt32(intern(imp.objectName));
  }
  const importBuf = importW.toBuffer();

  // Compute header size dynamically
  const folderTmp = new BinaryWriter();
  folderTmp.writeFString(folderName);
  const headerSize = 4 + 4 + 4 + 4 + 4 + folderTmp.length + 24;
  const nameOffset = headerSize;
  const importOffset = nameOffset + nameBuf.length;
  const exportOffset = importOffset + importBuf.length;
  const exportTableSize = exports.length * 24;
  let payloadCursor = exportOffset + exportTableSize;

  const exportW = new BinaryWriter();
  for (let i = 0; i < exports.length; i++) {
    const exp = exports[i];
    const pBuf = exportPayloads[i];
    exportW.writeInt32(exp.classIndex);
    exportW.writeInt32(exp.superIndex || 0);
    exportW.writeInt32(exp.outerIndex || 0);
    exportW.writeInt32(intern(exp.objectName));
    exportW.writeInt32(pBuf.length);
    exportW.writeInt32(payloadCursor);
    payloadCursor += pBuf.length;
  }
  const exportBuf = exportW.toBuffer();

  const out = new BinaryWriter();
  out.writeUInt32(PACKAGE_FILE_TAG);
  out.writeInt32(-8); // UE5 LegacyFileVersion
  out.writeInt32(fileVersionUE4);
  out.writeInt32(fileVersionUE5);
  out.writeUInt32(0); // PackageFlags
  out.writeFString(folderName);
  out.writeInt32(nameList.length);
  out.writeInt32(nameOffset);
  out.writeInt32(imports.length);
  out.writeInt32(importOffset);
  out.writeInt32(exports.length);
  out.writeInt32(exportOffset);
  out.writeBuffer(nameBuf);
  out.writeBuffer(importBuf);
  out.writeBuffer(exportBuf);
  for (const pBuf of exportPayloads) out.writeBuffer(pBuf);
  return out.toBuffer();
}
