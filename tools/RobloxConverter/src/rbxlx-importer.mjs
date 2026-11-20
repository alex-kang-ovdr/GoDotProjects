import fs from 'node:fs';

function unescapeXml(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseColor3uint8(raw) {
  const num = Number(raw) >>> 0;
  return {
    r: Number((((num >>> 16) & 0xff) / 255).toFixed(4)),
    g: Number((((num >>> 8) & 0xff) / 255).toFixed(4)),
    b: Number(((num & 0xff) / 255).toFixed(4))
  };
}

function parseSubFloat(body, tag, fallback = 0) {
  const m = body.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m ? Number(m[1].trim()) : fallback;
}

function parsePropertiesXml(propXml) {
  const props = {};
  const propRe = /<(\w+)\s+name="([^"]+)">([\s\S]*?)<\/\1>|<(\w+)\s+name="([^"]+)"\s*\/>/g;
  let m;
  while ((m = propRe.exec(propXml))) {
    const type = m[1] || m[4];
    const name = m[2] || m[5];
    const rawBody = m[3] ?? '';

    if (type === 'ProtectedString' || type === 'string' || type === 'BinaryString') {
      const cdata = rawBody.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      props[name] = cdata ? cdata[1] : unescapeXml(rawBody);
    } else if (type === 'bool') {
      props[name] = rawBody.trim().toLowerCase() === 'true';
    } else if (type === 'float' || type === 'double' || type === 'int' || type === 'token') {
      props[name] = Number(rawBody.trim());
    } else if (type === 'Color3uint8') {
      props[name] = parseColor3uint8(rawBody.trim());
    } else if (type === 'Color3') {
      props[name] = {
        r: parseSubFloat(rawBody, 'R', 1),
        g: parseSubFloat(rawBody, 'G', 1),
        b: parseSubFloat(rawBody, 'B', 1)
      };
    } else if (type === 'Vector3') {
      props[name] = {
        x: parseSubFloat(rawBody, 'X', 0),
        y: parseSubFloat(rawBody, 'Y', 0),
        z: parseSubFloat(rawBody, 'Z', 0)
      };
    } else if (type === 'CoordinateFrame') {
      props[name] = {
        x: parseSubFloat(rawBody, 'X', 0),
        y: parseSubFloat(rawBody, 'Y', 0),
        z: parseSubFloat(rawBody, 'Z', 0),
        r00: parseSubFloat(rawBody, 'R00', 1),
        r01: parseSubFloat(rawBody, 'R01', 0),
        r02: parseSubFloat(rawBody, 'R02', 0),
        r10: parseSubFloat(rawBody, 'R10', 0),
        r11: parseSubFloat(rawBody, 'R11', 1),
        r12: parseSubFloat(rawBody, 'R12', 0),
        r20: parseSubFloat(rawBody, 'R20', 0),
        r21: parseSubFloat(rawBody, 'R21', 0),
        r22: parseSubFloat(rawBody, 'R22', 1)
      };
    } else if (type === 'Ref') {
      props[name] = rawBody.trim();
    }
  }
  return props;
}

export function importRbxlxString(xmlText, sourceLabel = 'memory.rbxlx') {
  const versionMatch = xmlText.match(/<roblox\b[^>]*version="([^"]+)"/);
  const root = {
    schema: 'playforge.roblox.ir.v1',
    source: sourceLabel,
    robloxXmlVersion: versionMatch ? versionMatch[1] : 'unknown',
    unitPolicy: {
      robloxUnit: 'stud',
      godotUnit: 'meter',
      metersPerStud: 0.28,
      handedness: 'left_y_up_to_right_y_up'
    },
    stats: {
      totalInstances: 0,
      classCounts: {},
      scriptCount: 0,
      partCount: 0
    },
    children: []
  };

  // Mask CDATA blocks so tag scanning never splits inside Luau source code
  const cdataStore = [];
  const masked = xmlText.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (full) => {
    const id = cdataStore.length;
    cdataStore.push(full);
    return `__CDATA_TOKEN_${id}__`;
  });
  const restoreCdata = (s) => s.replace(/__CDATA_TOKEN_(\d+)__/g, (_, i) => cdataStore[Number(i)]);

  const stack = [root];
  const tokenRe = /<Item\s+class="([^"]+)"(?:\s+referent="([^"]*)")?\s*>|<Properties>([\s\S]*?)<\/Properties>|<\/Item>/g;
  let m;
  while ((m = tokenRe.exec(masked))) {
    if (m[0].startsWith('<Item')) {
      const cls = m[1];
      const referent = m[2] || `REF_${root.stats.totalInstances + 1}`;
      const node = {
        className: cls,
        referent,
        name: cls,
        properties: {},
        children: []
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      root.stats.totalInstances++;
      root.stats.classCounts[cls] = (root.stats.classCounts[cls] || 0) + 1;
      if (['Script', 'LocalScript', 'ModuleScript'].includes(cls)) root.stats.scriptCount++;
      if (['Part', 'SpawnLocation', 'MeshPart'].includes(cls)) root.stats.partCount++;
    } else if (m[0].startsWith('<Properties>')) {
      const current = stack[stack.length - 1];
      if (current && current !== root) {
        const props = parsePropertiesXml(restoreCdata(m[3]));
        current.properties = props;
        if (typeof props.Name === 'string' && props.Name.length > 0) {
          current.name = props.Name;
        }
      }
    } else if (m[0] === '</Item>') {
      if (stack.length > 1) stack.pop();
    }
  }

  return root;
}

export function importRbxlxFile(filePath) {
  const xmlText = fs.readFileSync(filePath, 'utf8');
  return importRbxlxString(xmlText, filePath);
}
