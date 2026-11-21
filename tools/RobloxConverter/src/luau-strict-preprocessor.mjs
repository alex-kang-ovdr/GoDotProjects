// Strict Luau preprocessor & ModuleScript transpiler for Rojo projects
// Handles: --!strict, export type / type blocks, :: casts, param/return type annotations,
// multi-line function headers, numeric underscores (10_000), backtick string interpolation,
// inline `if c then a else b`, Luau module functions `function Mod.fn(...)`, and table literals.

export function stripLuauTypeBlocks(source) {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  let inTypeBlock = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '--!strict' || trimmed === '--!nonstrict' || trimmed === '--!native') {
      continue;
    }

    if (inTypeBlock) {
      for (const ch of raw) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        inTypeBlock = false;
        braceDepth = 0;
      }
      continue;
    }

    if (/^(?:export\s+)?type\s+\w+(?:<[^>]+>)?\s*=/.test(trimmed)) {
      let opens = 0;
      let closes = 0;
      for (const ch of trimmed) {
        if (ch === '{') opens++;
        else if (ch === '}') closes++;
      }
      if (opens > closes) {
        inTypeBlock = true;
        braceDepth = opens - closes;
      }
      continue;
    }

    out.push(raw);
  }
  return out.join('\n');
}

export function joinMultilineSignaturesAndCalls(source) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // Join multi-line function declarations: `function Foo.bar(\n  a,\n  b\n): Ret`
    if (/^(?:local\s+)?function\s+[\w.:]+\s*\($/.test(trimmed)) {
      let combined = trimmed;
      i++;
      while (i < lines.length) {
        const part = lines[i].trim();
        combined += ' ' + part;
        i++;
        if (/\)/.test(part)) break;
      }
      out.push(combined);
      continue;
    }
    // Join multi-line expressions ending with binary operator or starting next line with `*` / `+` / `and` / `or`
    if (i + 1 < lines.length && /^\s*(\*|\+|\.\.|and\b|or\b)/.test(lines[i + 1]) && !trimmed.startsWith('--')) {
      let combined = line;
      while (i + 1 < lines.length && /^\s*(\*|\+|\.\.|and\b|or\b)/.test(lines[i + 1])) {
        i++;
        combined += ' ' + lines[i].trim();
      }
      out.push(combined);
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

export function stripTypeAnnotationsFromParams(paramsRaw) {
  if (!paramsRaw.trim()) return '';
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of paramsRaw) {
    if (ch === '(' || ch === '{' || ch === '<' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === '>' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts
    .map((p) => {
      const colonIdx = p.indexOf(':');
      return (colonIdx >= 0 ? p.slice(0, colonIdx) : p).trim();
    })
    .filter((p) => p !== '...')
    .join(', ');
}

export function convertBacktickInterpolation(expr, translateSubExpr) {
  return expr.replace(/`([^`]*)`/g, (_full, body) => {
    const pieces = [];
    let cur = '';
    let i = 0;
    while (i < body.length) {
      if (body[i] === '{') {
        if (cur) {
          pieces.push(JSON.stringify(cur));
          cur = '';
        }
        let depth = 1;
        let j = i + 1;
        while (j < body.length && depth > 0) {
          if (body[j] === '{') depth++;
          else if (body[j] === '}') depth--;
          j++;
        }
        const inner = body.slice(i + 1, j - 1).trim();
        pieces.push(`str(${translateSubExpr(inner)})`);
        i = j;
      } else {
        cur += body[i++];
      }
    }
    if (cur) pieces.push(JSON.stringify(cur));
    return pieces.length ? pieces.join(' + ') : '""';
  });
}

export function convertInlineIfExpression(expr, translateSubExpr) {
  // `(if cond then a else b)` -> `(a if cond else b)`
  let out = expr;
  let guard = 0;
  while (guard++ < 10) {
    const m = out.match(/\(\s*if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+?)\s*\)/);
    if (!m) break;
    const repl = `(${translateSubExpr(m[2])} if ${translateSubExpr(m[1])} else ${translateSubExpr(m[3])})`;
    out = out.slice(0, m.index) + repl + out.slice(m.index + m[0].length);
  }
  return out;
}

export function stripNumericUnderscores(expr) {
  return expr.replace(/\b(\d[\d_]*\d)\b/g, (m) => m.replace(/_/g, ''));
}

export function stripInlineTypeCasts(expr) {
  // Remove Luau `:: TypeName?` or `:: { ... }` casts
  return expr
    .replace(/\s*::\s*\{\s*[^}]+\s*\}\??/g, '')
    .replace(/\s*::\s*[A-Za-z_][\w.]*\??/g, '');
}

export function convertLuauPowerAndFloorDiv(expr) {
  let out = expr;
  // `a ^ b` -> `pow(a, b)`
  out = out.replace(/(\b[\w.]+\b|\d+(?:\.\d+)?)\s*\^\s*(\b[\w.]+\b|\d+(?:\.\d+)?)/g, 'pow($1, $2)');
  // `a // b` -> `floori(float(a) / float(b))`
  out = out.replace(/(\b[\w.]+\b|\d+)\s*\/\/\s*(\b[\w.]+\b|\d+)/g, 'floori(float($1) / float($2))');
  return out;
}

/**
 * Transpiles a pure/shared or gameplay Luau ModuleScript (like Config.luau, Formulas.luau,
 * Pattern.luau, Rewards.luau, Economy.luau, Combat.luau) into a clean GDScript Node module.
 */
export function transpileLuauModuleToGdScript(source, moduleName, modulePath, analysis) {
  const cleaned = joinMultilineSignaturesAndCalls(stripLuauTypeBlocks(source));
  const rawLines = cleaned.split('\n');

  // Detect module table name (`local Foo = {}` and `return Foo`)
  const retMatch = cleaned.match(/return\s+(\w+)\s*$/);
  const modVar = retMatch ? retMatch[1] : moduleName;

  const stripComment = (l) => {
    let inS = null;
    for (let i = 0; i < l.length - 1; i++) {
      const c = l[i];
      if (inS) {
        if (c === '\\') i++;
        else if (c === inS) inS = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') inS = c;
      else if (c === '-' && l[i + 1] === '-') return l.slice(0, i).trimEnd();
    }
    return l;
  };

  // Pre-scan array & dict vars for 1-based vs 0-based safety
  const arrayVars = new Set(['SUFFIXES', 'cells', 'list', 'others', 'targets', 'patchColors', 'Gear', 'Zones', 'PlotColors', 'DropperColors', 'Items', 'Colors', 'DevProducts']);
  const dictVars = new Set(['winnerSet', 'payouts', 'survived', 'ownership', 'handledReceipts', 'buckets']);
  const tableInsertTargets = new Set([...cleaned.matchAll(/\btable\.insert\s*\(\s*(\w+)/g)].map((m) => m[1]));
  for (const t of tableInsertTargets) arrayVars.add(t);
  const RESERVED_GODOT_METHODS = new Set(['get', 'set', 'free', 'call', 'duplicate', 'get_children', 'add_child', 'print']);
  const safeMethodName = (n) => (RESERVED_GODOT_METHODS.has(n) ? `rbx_${n}` : n);
  const funcParams = new Set();

  function splitArgs(str) {
    const res = [];
    let d = 0, inS = null, cur = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (inS) {
        cur += c;
        if (c === '\\' && i + 1 < str.length) cur += str[++i];
        else if (c === inS) inS = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inS = c; cur += c; }
      else if ('([{'.includes(c)) { d++; cur += c; }
      else if (')]}'.includes(c)) { d = Math.max(0, d - 1); cur += c; }
      else if (c === ',' && d === 0) { res.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    if (cur.trim()) res.push(cur.trim());
    return res;
  }

  function convertTableLiteral(lit) {
    const inner = lit.slice(1, -1).trim();
    if (!inner) return '{}';
    const items = splitArgs(inner);
    const hasKeys = items.some((it) => /^(\[[^\]]+\]|[A-Za-z_]\w*)\s*=/.test(it));
    if (!hasKeys) {
      return `[${items.map((it) => txExpr(it)).join(', ')}]`;
    }
    const pairs = items.map((it) => {
      let m;
      if ((m = it.match(/^\[([^\]]+)\]\s*=\s*([\s\S]+)$/))) {
        return `${txExpr(m[1])}: ${txExpr(m[2])}`;
      }
      if ((m = it.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/))) {
        return `"${m[1]}": ${txExpr(m[2])}`;
      }
      return txExpr(it);
    });
    return `{ ${pairs.join(', ')} }`;
  }

  function txExpr(raw, inCond = false) {
    let s = stripInlineTypeCasts(stripNumericUnderscores(raw.trim()));
    if (!s) return '';

    // Backtick interpolation
    if (s.includes('`')) {
      s = convertBacktickInterpolation(s, (sub) => txExpr(sub));
    }

    // Inline `(if c then a else b)`
    if (s.includes('if ') && s.includes(' then ') && s.includes(' else ')) {
      s = convertInlineIfExpression(s, (sub) => txExpr(sub));
    }

    // Whole-expression table literal `{ ... }`
    if (s.startsWith('{') && s.endsWith('}')) {
      return convertTableLiteral(s);
    }

    // Parenthesized `(x or default)` inside larger expressions (e.g. `a * (state.zoneMultiplier or 1)`)
    s = s.replace(/\(\s*([^()]+?)\s+or\s+([^()]+?)\s*\)/g, (_m, a, b) => {
      const at = txExpr(a);
      const bt = txExpr(b);
      return `((${at} if ${at} != null else ${bt}))`;
    });

    // Lua ternary `a and b or c`
    const andI = s.indexOf(' and ');
    const orI = s.indexOf(' or ');
    if (andI > 0 && orI > andI && !s.includes('(')) {
      const c = s.slice(0, andI).trim();
      const t = s.slice(andI + 5, orI).trim();
      const f = s.slice(orI + 4).trim();
      return `(${txExpr(t)} if ${txExpr(c, true)} else ${txExpr(f)})`;
    }
    if (andI > 0 && !inCond && !s.includes(' or ') && /FindFirstChild/.test(s)) {
      const lhs = s.slice(0, andI).trim();
      const rhs = s.slice(andI + 5).trim();
      return `(${txExpr(rhs)} if ${txExpr(lhs, true)} != null else null)`;
    }
    if (orI > 0 && !inCond && !s.includes(' == ') && !s.includes(' != ') && !s.includes(' ~= ') && !s.includes(' and ') && !s.includes(' * ')) {
      const lhs = s.slice(0, orI).trim();
      const rhs = s.slice(orI + 4).trim();
      const lt = txExpr(lhs);
      const rt = txExpr(rhs);
      return `(${lt} if ${lt} != null else ${rt})`;
    }

    // String concat `..`
    if (s.includes('..')) {
      const parts = s.split('..').map((p) => `str(${txExpr(p)})`);
      return parts.join(' + ');
    }

    // Power & floor division
    s = convertLuauPowerAndFloorDiv(s);

    // `string.format(fmt, a, ...)`
    if (/^string\.format\s*\(/.test(s) && s.endsWith(')')) {
      const args = splitArgs(s.slice(s.indexOf('(') + 1, -1)).map((a) => txExpr(a));
      return `RobloxCompat.string_format(${args[0]}, [${args.slice(1).join(', ')}])`;
    }

    // Module self calls `Mod.fn(...)` -> `safeFn(...)`
    s = s.replace(new RegExp(`\\b${modVar}\\.(\\w+)\\s*\\(`, 'g'), (_m, fn) => `${safeMethodName(fn)}(`);

    // Function-parameter calls like `randInt(1, i)` or `predicate(c)` -> `randInt.call(1, i)`
    for (const fp of funcParams) {
      s = s.replace(new RegExp(`\\b${fp}\\s*\\(`, 'g'), `${fp}.call(`);
    }

    // `table.create(n, v)` / `table.insert(t, v)`
    s = s.replace(/\btable\.create\s*\(/g, 'RobloxCompat.table_create(');
    s = s.replace(/\btable\.insert\s*\(/g, 'RobloxCompat.table_insert(');

    // Float division inside math.ceil(a / b) so GDScript int/int doesn't truncate before ceil
    s = s.replace(/\bmath\.ceil\s*\(\s*([\w.]+)\s*\/\s*([\w.]+)\s*\)/g, 'ceili(float($1) / float($2))');

    // 1-based array vs dict indexing
    s = s.replace(/\b(\w+)\[([^\]]+)\]/g, (_full, tbl, idxExpr) => {
      const tIdx = txExpr(idxExpr);
      if (arrayVars.has(tbl)) return `${tbl}[int(${tIdx}) - 1]`;
      if (dictVars.has(tbl)) return `${tbl}.get(${tIdx}, null)`;
      return `${tbl}[${tIdx}]`;
    });

    // `#arr` -> `arr.size()`
    s = s.replace(/#([\w.]+)/g, '$1.size()');

    // Constructors & stdlib
    s = s.replace(/\bEnum\.\w+\.(\w+)\b/g, '"$1"');
    s = s.replace(/\bV\s*\(/g, 'RobloxCompat.vec3(');
    s = s.replace(/\bVector3\.new\s*\(/g, 'RobloxCompat.vec3(');
    s = s.replace(/\bVector3\.zero\b/g, 'Vector3.ZERO');
    s = s.replace(/\bColor3\.fromRGB\s*\(/g, 'Color8(');
    s = s.replace(/\bColor3\.new\s*\(/g, 'Color(');
    s = s.replace(/\bInstance\.new\s*\(/g, 'RobloxCompat.instance_new(');
    s = s.replace(/\bmath\.floor\s*\(/g, 'floori(');
    s = s.replace(/\bmath\.ceil\s*\(/g, 'ceili(');
    s = s.replace(/\bmath\.min\s*\(/g, 'min(');
    s = s.replace(/\bmath\.max\s*\(/g, 'max(');
    s = s.replace(/\bmath\.clamp\s*\(/g, 'clamp(');
    s = s.replace(/\bmath\.rad\s*\(/g, 'deg_to_rad(');
    s = s.replace(/\bmath\.log10\s*\(/g, 'RobloxCompat.log10(');
    s = s.replace(/\btostring\s*\(/g, 'str(');
    s = s.replace(/\bnil\b/g, 'null');
    s = s.replace(/~=/g, '!=');

    // Roblox service/method calls
    s = s.replace(/\bgame:GetService\s*\(([^)]+)\)/g, 'RobloxCompat.get_service($1)');
    s = s.replace(/\brequire\s*\([^)]*?\.(\w+)\)/g, 'RobloxCompat.require_module("$1")');
    s = s.replace(/\b(\w+):FindFirstChild\s*\(([^)]+)\)/g, 'RobloxCompat.find_first_child($1, $2)');
    s = s.replace(/\b(\w+):WaitForChild\s*\(([^)]+)\)/g, 'RobloxCompat.wait_for_child($1, $2)');
    s = s.replace(/\b(\w+):GetAttribute\s*\(([^)]+)\)/g, 'RobloxCompat.get_attribute($1, $2)');
    s = s.replace(/\b(\w+):SetAttribute\s*\(([^)]+)\)/g, 'RobloxCompat.set_attribute($1, $2)');
    s = s.replace(/\b(\w+):TakeDamage\s*\(([^)]+)\)/g, '$1.take_damage($2)');
    s = s.replace(/\bPlayers:GetPlayerByUserId\s*\(([^)]+)\)/g, 'RobloxCompat.get_player_by_user_id($1)');
    s = s.replace(/\b(\w+):FireClient\s*\(([^)]+)\)/g, '$1.fire_client($2)');

    // Properties
    s = s.replace(/\b(\w+)\.Value\b/g, '$1.value');
    s = s.replace(/\b(\w+)\.UserId\b/g, '$1.user_id');
    s = s.replace(/\b(\w+)\.Health\b/g, '$1.health');
    s = s.replace(/\b(\w+)\.Name\b/g, 'RobloxCompat.get_roblox_name($1)');

    return s;
  }

  const classVars = [];
  const classMethods = [];
  const initBody = [];
  let buf = initBody;
  let indent = 1;
  const stack = [];
  let multiTable = null; // { target, lines: [], braceDepth, isField }
  let todoCount = 0;

  const emit = (line) => buf.push('\t'.repeat(Math.max(0, indent)) + line);

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = stripComment(rawLines[i]).trim();
    if (!trimmed) continue;

    // Collect multi-line table literal (Config.Zones = { ... }, payouts[userId] = { ... }, return { ... })
    if (multiTable) {
      multiTable.lines.push(trimmed);
      for (const ch of trimmed) {
        if (ch === '{') multiTable.braceDepth++;
        else if (ch === '}') multiTable.braceDepth--;
      }
      if (multiTable.braceDepth <= 0) {
        const joined = multiTable.lines.join(' ');
        const cleanJoined = stripInlineTypeCasts(joined);
        // Recursively convert nested Lua `{ k = v }` literals from inside out
        const gdVal = convertNestedLuaTables(cleanJoined, txExpr);
        if (multiTable.isField) {
          classVars.push(`var ${multiTable.varName}`);
          initBody.push(`\t${multiTable.varName} = ${gdVal}`);
        } else if (multiTable.kind === 'return') {
          emit(`return ${gdVal}`);
        } else {
          emit(`${multiTable.lhs} = ${gdVal}`);
        }
        multiTable = null;
      }
      continue;
    }

    // Skip `local Mod = {}` and final `return Mod`
    if (trimmed === `local ${modVar} = {}` || trimmed === `return ${modVar}`) continue;
    if (trimmed === 'local V = Vector3.new') continue;

    // `local Config = {` top-level table module (like lantai-runtuh/src/shared/Config.luau)
    let m;
    if (stack.length === 0 && (m = trimmed.match(new RegExp(`^local\\s+${modVar}\\s*=\\s*\\{\\s*$`)))) {
      multiTable = { isField: true, varName: '_data', lines: ['{'], braceDepth: 1 };
      continue;
    }

    // `Mod.Field = {` multi-line field table
    if (stack.length === 0 && (m = trimmed.match(new RegExp(`^${modVar}\\.(\\w+)\\s*=\\s*\\{\\s*$`)))) {
      multiTable = { isField: true, varName: m[1], lines: ['{'], braceDepth: 1 };
      continue;
    }
    // `local NAME = {` multi-line table
    if ((m = trimmed.match(/^local\s+(\w+)\s*=\s*\{\s*$/))) {
      multiTable = { isField: stack.length === 0, varName: m[1], lhs: `var ${m[1]}`, lines: ['{'], braceDepth: 1 };
      continue;
    }
    // `lhs = {` multi-line table inside function (preserve assignable LHS without dict.get rewrite)
    if ((m = trimmed.match(/^([\w.\[\]]+)\s*=\s*\{\s*$/))) {
      let lhsCode = m[1];
      const idxM = lhsCode.match(/^(\w+)\[(.+)\]$/);
      if (idxM) {
        lhsCode = arrayVars.has(idxM[1]) ? `${idxM[1]}[int(${txExpr(idxM[2])}) - 1]` : `${idxM[1]}[${txExpr(idxM[2])}]`;
      } else {
        lhsCode = txExpr(lhsCode);
      }
      multiTable = { isField: false, lhs: lhsCode, lines: ['{'], braceDepth: 1 };
      continue;
    }
    // `return {` multi-line table
    if (/^return\s*\{\s*$/.test(trimmed)) {
      multiTable = { isField: false, kind: 'return', lines: ['{'], braceDepth: 1 };
      continue;
    }

    // `end` / `end)`
    if (trimmed === 'end' || trimmed === 'end)') {
      const top = stack.pop();
      if (!top) continue;
      if (top.kind === 'func') {
        buf = top.prevBuf;
        indent = top.prevIndent;
        classMethods.push('');
        funcParams.clear();
      } else if (top.kind === 'connect' || top.kind === 'inline_cb') {
        indent = top.prevIndent;
        emit(')');
      } else {
        indent = Math.max(1, indent - 1);
      }
      continue;
    }

    // `function Mod.fn(params): Ret` or `local function fn(params): Ret`
    if ((m = trimmed.match(new RegExp(`^(?:local\\s+)?function\\s+(?:${modVar}\\.)?(\\w+)\\s*\\(([^)]*)\\)`)))) {
      const fnName = safeMethodName(m[1]);
      const rawP = m[2];
      const cleanP = stripTypeAnnotationsFromParams(rawP);
      // Detect function-typed parameters like `randInt: RandInt` or `predicate: (number) -> boolean`
      for (const seg of rawP.split(',')) {
        if (/->|RandInt|predicate/i.test(seg)) {
          const pName = seg.split(':')[0].trim();
          if (pName) funcParams.add(pName);
        }
      }
      stack.push({ kind: 'func', prevBuf: buf, prevIndent: indent });
      buf = classMethods;
      indent = 0;
      emit(`func ${fnName}(${cleanP}):`);
      indent = 1;
      continue;
    }

    // `elseif` / `else`
    if ((m = trimmed.match(/^elseif\s+(.+)\s+then$/))) {
      indent = Math.max(1, indent - 1);
      emit(`elif ${txExpr(m[1], true)}:`);
      indent++;
      continue;
    }
    if (trimmed === 'else') {
      indent = Math.max(1, indent - 1);
      emit('else:');
      indent++;
      continue;
    }

    // `if cond then`
    if ((m = trimmed.match(/^if\s+(.+)\s+then$/))) {
      emit(`if ${txExpr(m[1], true)}:`);
      stack.push({ kind: 'if' });
      indent++;
      continue;
    }

    // Signal `humanoid.Died:Connect(function()`
    if ((m = trimmed.match(/^(\w+)\.Died:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      emit(`${m[1]}.died.connect(func(${m[2].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent });
      indent++;
      continue;
    }

    // Inline callback argument `local others = indicesWhere(cells, function(c)`
    if ((m = trimmed.match(/^local\s+(\w+)\s*=\s*(\w+)\(([^,]+),\s*function\s*\(([^)]*)\)\s*$/))) {
      emit(`var ${m[1]} = ${m[2]}(${txExpr(m[3])}, func(${stripTypeAnnotationsFromParams(m[4])}):`);
      stack.push({ kind: 'inline_cb', prevIndent: indent });
      indent++;
      continue;
    }

    // Numeric for-loop `for i = a, b[, step] do`
    if ((m = trimmed.match(/^for\s+(\w+)\s*=\s*(.+?)\s*,\s*(.+?)(?:\s*,\s*(.+?))?\s+do$/))) {
      const a = txExpr(m[2]);
      const b = txExpr(m[3]);
      const step = m[4] ? txExpr(m[4]) : '1';
      const endExpr = step.startsWith('-') ? `(${b}) - 1` : `(${b}) + 1`;
      emit(`for ${m[1]} in range(${a}, ${endExpr}, ${step}):`);
      stack.push({ kind: 'for' });
      indent++;
      continue;
    }

    // Iterator for-loop `for i, c in cells do` or `for _, x in ipairs(list) do`
    if ((m = trimmed.match(/^for\s+(\w+)\s*,\s*(\w+)\s+in\s+(?:i?pairs\s*\((.+)\)|(.+))\s+do$/))) {
      const kVar = m[1], vVar = m[2], iter = txExpr(m[3] || m[4]);
      if (kVar === '_') {
        emit(`for ${vVar} in ${iter}:`);
      } else {
        emit(`for _idx_${kVar} in range(${iter}.size()):`);
        stack.push({ kind: 'for' });
        indent++;
        emit(`var ${kVar} = _idx_${kVar} + 1`);
        emit(`var ${vVar} = ${iter}[_idx_${kVar}]`);
        continue;
      }
      stack.push({ kind: 'for' });
      indent++;
      continue;
    }

    // Multi-swap `list[i], list[j] = list[j], list[i]`
    if ((m = trimmed.match(/^(\w+)\[([^\]]+)\]\s*,\s*(\w+)\[([^\]]+)\]\s*=\s*\3\[\4\]\s*,\s*\1\[\2\]$/))) {
      const a = txExpr(`${m[1]}[${m[2]}]`);
      const b = txExpr(`${m[3]}[${m[4]}]`);
      emit(`var _swap_tmp = ${a}`);
      emit(`${a} = ${b}`);
      emit(`${b} = _swap_tmp`);
      continue;
    }

    // Multi-local `local a, b, c = x, y, z`
    if ((m = trimmed.match(/^local\s+(\w+(?:\s*,\s*\w+)+)\s*=\s*(.+)$/))) {
      const names = m[1].split(',').map((n) => n.trim());
      const vals = splitArgs(m[2]);
      for (let k = 0; k < names.length; k++) {
        emit(`var ${names[k]} = ${txExpr(vals[k] || 'null')}`);
      }
      continue;
    }

    // `local varName` (uninitialized)
    if ((m = trimmed.match(/^local\s+(\w+)(?:\s*:\s*[^=]+)?$/))) {
      emit(`var ${m[1]} = null`);
      continue;
    }

    // `local varName[: Type] = expr`
    if ((m = trimmed.match(/^local\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(.+)$/))) {
      const vName = m[1];
      const rawRhs = m[2].trim();
      const rhs = rawRhs === '{}' && tableInsertTargets.has(vName) ? '[]' : txExpr(rawRhs);
      if (stack.length === 0) {
        classVars.push(`var ${vName}`);
        initBody.push(`\t${vName} = ${rhs}`);
      } else {
        emit(`var ${vName} = ${rhs}`);
      }
      continue;
    }

    // `Mod.Field = expr`
    if (stack.length === 0 && (m = trimmed.match(new RegExp(`^${modVar}\\.(\\w+)\\s*=\\s*(.+)$`)))) {
      classVars.push(`var ${m[1]}`);
      initBody.push(`\t${m[1]} = ${txExpr(m[2])}`);
      continue;
    }

    // `assert(cond, msg)`
    if ((m = trimmed.match(/^assert\s*\((.+)\)$/))) {
      const args = splitArgs(m[1]);
      emit(`assert(${txExpr(args[0], true)}${args[1] ? ', ' + txExpr(args[1]) : ''})`);
      continue;
    }

    // `return ...`
    if (trimmed === 'return') { emit('return'); continue; }
    if ((m = trimmed.match(/^return\s+(.+)$/))) {
      emit(`return ${txExpr(m[1])}`);
      continue;
    }

    // Property setters
    if ((m = trimmed.match(/^(\w+)\.Name\s*=\s*(.+)$/))) {
      emit(`${m[1]}.set_meta("roblox_name", ${txExpr(m[2])})`);
      continue;
    }
    if ((m = trimmed.match(/^(\w+)\.Parent\s*=\s*(.+)$/))) {
      emit(`RobloxCompat.set_parent(${m[1]}, ${txExpr(m[2])})`);
      continue;
    }
    if ((m = trimmed.match(/^(\w+)\.Value\s*([+\-*/]?=)\s*(.+)$/))) {
      emit(`${m[1]}.value ${m[2]} ${txExpr(m[3])}`);
      continue;
    }

    // Array/Dict element assignment `cells[idx] = val` (supports nested `cells[others[k]] = target`)
    if ((m = trimmed.match(/^(\w+)\[(.+)\]\s*=\s*(.+)$/))) {
      const tbl = m[1], idx = txExpr(m[2]), val = txExpr(m[3]);
      if (arrayVars.has(tbl)) emit(`${tbl}[int(${idx}) - 1] = ${val}`);
      else emit(`${tbl}[${idx}] = ${val}`);
      continue;
    }

    // Compound / plain assignment
    if ((m = trimmed.match(/^([\w.]+)\s*([+\-*/]?=)\s*(.+)$/))) {
      emit(`${txExpr(m[1])} ${m[2]} ${txExpr(m[3])}`);
      continue;
    }

    // Call statement
    if (/^[\w.:"'()]+\s*\(.*\)$/.test(trimmed)) {
      emit(txExpr(trimmed));
      continue;
    }

    todoCount++;
    emit(`# TODO Unmapped Luau: ${trimmed}`);
  }

  // If top-level table module (e.g. `local Config = { ... }`), expose keys via `_data` + helper `get_field`
  const out = [
    'extends Node',
    `# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ${modulePath}`,
    `# Strategy: ${analysis.strategy} | Grades: D=${analysis.grade_counts.D} A=${analysis.grade_counts.A} R=${analysis.grade_counts.R} X=${analysis.grade_counts.X} V=${analysis.grade_counts.V}`,
    '',
    ...classVars,
    '',
    'func _ready() -> void:',
    ...(initBody.length ? initBody : ['\tpass']),
    `\tRobloxCompat.register_module("${moduleName}", self)`,
    '',
    ...classMethods
  ];

  return {
    code: out.join('\n'),
    analysis,
    todoFallbackLines: todoCount
  };
}

function convertNestedLuaTables(str, txExpr) {
  // Replace innermost `{ ... }` repeatedly with placeholders so nested tables/arrays convert accurately
  const store = [];
  let cur = str;
  let guard = 0;
  while (guard++ < 200) {
    const m = cur.match(/\{[^{}]*\}/);
    if (!m) break;
    const rawBlock = m[0];
    const inner = rawBlock.slice(1, -1).trim();
    let converted;
    if (!inner) {
      converted = '{}';
    } else {
      const parts = [];
      let d = 0, inS = null, buf = '';
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (inS) {
          buf += c;
          if (c === '\\' && i + 1 < inner.length) buf += inner[++i];
          else if (c === inS) inS = null;
          continue;
        }
        if (c === '"' || c === "'") { inS = c; buf += c; }
        else if ('(['.includes(c)) { d++; buf += c; }
        else if (')]'.includes(c)) { d = Math.max(0, d - 1); buf += c; }
        else if (c === ',' && d === 0) { parts.push(buf.trim()); buf = ''; }
        else buf += c;
      }
      if (buf.trim()) parts.push(buf.trim());
      const nonEmpty = parts.filter(Boolean);
      const isDict = nonEmpty.some((p) => /^(\[[^\]]+\]|[A-Za-z_]\w*)\s*=/.test(p));
      if (!isDict) {
        converted = `[${nonEmpty.map((p) => txExpr(p)).join(', ')}]`;
      } else {
        const pairs = nonEmpty.map((p) => {
          let km;
          if ((km = p.match(/^\[([^\]]+)\]\s*=\s*([\s\S]+)$/))) {
            return `${txExpr(km[1])}: ${txExpr(km[2])}`;
          }
          if ((km = p.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/))) {
            return `"${km[1]}": ${txExpr(km[2])}`;
          }
          return txExpr(p);
        });
        converted = `{ ${pairs.join(', ')} }`;
      }
    }
    const token = `__TBL_${store.length}__`;
    store.push(converted);
    cur = cur.slice(0, m.index) + token + cur.slice(m.index + rawBlock.length);
  }
  // Unwind tokens
  for (let i = store.length - 1; i >= 0; i--) {
    cur = cur.replaceAll(`__TBL_${i}__`, store[i]);
  }
  return cur;
}
