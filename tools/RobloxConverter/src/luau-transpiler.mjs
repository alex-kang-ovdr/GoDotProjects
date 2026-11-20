import { analyzeLuauScript, loadCapabilityRegistry } from './luau-analyzer.mjs';

function splitTopLevel(str, sep = ',') {
  const parts = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\' && i + 1 < str.length) {
        cur += str[++i];
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      cur += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (depth === 0 && str.slice(i, i + sep.length) === sep) {
      parts.push(cur.trim());
      cur = '';
      i += sep.length - 1;
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') parts.push(cur.trim());
  return parts;
}

function findTopLevelToken(str, token) {
  let depth = 0;
  let inStr = null;
  for (let i = 0; i <= str.length - token.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && str.slice(i, i + token.length) === token) {
      return i;
    }
  }
  return -1;
}

function stripInlineComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '-' && line[i + 1] === '-') return line.slice(0, i).trimEnd();
  }
  return line;
}

function replaceOuterCall(expr, methodName, builder) {
  let out = expr;
  const needle = `:${methodName}(`;
  let guard = 0;
  while (guard++ < 30) {
    const idx = out.indexOf(needle);
    if (idx === -1) break;
    // Find receiver start before ':'
    let rStart = idx - 1;
    let pDepth = 0;
    while (rStart >= 0) {
      const c = out[rStart];
      if (c === ')' || c === ']') pDepth++;
      else if (c === '(' || c === '[') {
        if (pDepth === 0) break;
        pDepth--;
      } else if (pDepth === 0 && !/[\w.]/.test(c)) {
        break;
      }
      rStart--;
    }
    rStart++;
    const receiver = out.slice(rStart, idx).trim();

    // Find matching ')' for '('
    const openIdx = idx + needle.length - 1;
    let depth = 0;
    let inStr = null;
    let closeIdx = -1;
    for (let i = openIdx; i < out.length; i++) {
      const c = out[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'") inStr = c;
      else if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) break;
    const argsRaw = out.slice(openIdx + 1, closeIdx);
    const replacement = builder(receiver, argsRaw);
    out = out.slice(0, rStart) + replacement + out.slice(closeIdx + 1);
  }
  return out;
}

function translateExpr(raw, ctx) {
  let s = raw.trim();
  if (!s) return '';

  // Handle Lua ternary: `cond and a or b`
  const andIdx = findTopLevelToken(s, ' and ');
  const orIdx = findTopLevelToken(s, ' or ');
  if (andIdx > 0 && orIdx > andIdx) {
    const cond = s.slice(0, andIdx).trim();
    const tVal = s.slice(andIdx + 5, orIdx).trim();
    const fVal = s.slice(orIdx + 4).trim();
    if (!cond.includes(' or ') && !tVal.includes(' and ') && !fVal.includes(' and ')) {
      return `(${translateExpr(tVal, ctx)} if ${translateExpr(cond, ctx)} else ${translateExpr(fVal, ctx)})`;
    }
  }

  // Handle Lua default fallback `a or b` when NOT inside a boolean condition
  if (orIdx > 0 && !ctx.inCondition && !s.includes(' == ') && !s.includes(' != ') && !s.includes(' ~= ')) {
    const lhs = s.slice(0, orIdx).trim();
    const rhs = s.slice(orIdx + 4).trim();
    const lhsT = translateExpr(lhs, ctx);
    const rhsT = translateExpr(rhs, ctx);
    return `(${lhsT} if ${lhsT} != null else ${rhsT})`;
  }

  // Handle string concatenation `..`
  const concatIdx = findTopLevelToken(s, '..');
  if (concatIdx > 0) {
    const parts = splitTopLevel(s, '..').map((p) => `str(${translateExpr(p, ctx)})`);
    return parts.join(' + ');
  }

  // Handle `cframe + Vector3.new(...)`
  const plusIdx = findTopLevelToken(s, ' + ');
  if (plusIdx > 0 && /CFrame|targetCFrame/i.test(s.slice(0, plusIdx)) && /Vector3/.test(s.slice(plusIdx))) {
    const lhs = translateExpr(s.slice(0, plusIdx), ctx);
    const rhs = translateExpr(s.slice(plusIdx + 3), ctx);
    return `RobloxCompat.cframe_add_vec3(${lhs}, ${rhs})`;
  }

  // Handle plain function calls with `..` inside arguments (e.g. timer(60, a .. b), warn("msg" .. x))
  const plainCall = s.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
  if (plainCall && !['if', 'while', 'for', 'return', 'not'].includes(plainCall[1])) {
    const fn = plainCall[1] === 'warn' ? 'push_warning' : plainCall[1] === 'tostring' ? 'str' : plainCall[1];
    const innerArgs = plainCall[2].trim();
    if (innerArgs && innerArgs.includes('..')) {
      const translatedArgs = splitTopLevel(innerArgs).map((a) => translateExpr(a, ctx)).join(', ');
      return `${fn}(${translatedArgs})`;
    }
  }

  // Handle empty/array table literals `{a, b, c}` -> `[a, b, c]` or `{}`
  if (s === '{}') return '{}';
  if (s.startsWith('{') && s.endsWith('}') && !s.includes('=')) {
    const items = splitTopLevel(s.slice(1, -1)).map((x) => translateExpr(x, ctx));
    return `[${items.join(', ')}]`;
  }

  // Handle string.format(fmt, a, b, ...)
  if (/^string\.format\s*\(/.test(s) && s.endsWith(')')) {
    const inner = s.slice(s.indexOf('(') + 1, -1);
    const args = splitTopLevel(inner).map((a) => translateExpr(a, ctx));
    return `RobloxCompat.string_format(${args[0]}, [${args.slice(1).join(', ')}])`;
  }

  // Handle `not debounce[player]` or `debounce[player]` / `chaosNames[ChaosFunction]`
  s = s.replace(/\b(\w+)\[([^\]]+)\]/g, (full, tbl, keyExpr) => {
    if (ctx.arrayVars.has(tbl)) {
      return `${tbl}[int(${translateExpr(keyExpr, ctx)}) - 1]`;
    }
    if (ctx.dictVars.has(tbl)) {
      return `${tbl}.get(${translateExpr(keyExpr, ctx)}, null)`;
    }
    return `${tbl}[${translateExpr(keyExpr, ctx)}]`;
  });

  // Length operator `#arr`
  s = s.replace(/#(\w+)/g, '$1.size()');

  // Enums: Enum.HumanoidStateType.GettingUp -> "GettingUp"
  s = s.replace(/\bEnum\.\w+\.(\w+)\b/g, '"$1"');

  // Handle `PivotTo(cframe + vec3)` cleanly before Vector3 replacement
  s = replaceOuterCall(s, 'PivotTo', (recv, args) => `RobloxCompat.pivot_to(${recv}, ${translateExpr(args, ctx)})`);

  // Standard Roblox globals & math/constructors
  s = s.replace(/\bscript\.Parent\b/g, '_rbx_script_parent');
  s = s.replace(/\bgame\.Workspace\b/g, 'RobloxCompat.get_workspace()');
  s = s.replace(/\bgame\.Players\b/g, 'RobloxCompat.get_service("Players")');
  s = s.replace(/\bPlayers\.LocalPlayer\b/g, 'RobloxCompat.get_local_player()');
  s = s.replace(/\bVector3\.zero\b/g, 'Vector3.ZERO');
  s = s.replace(/\bVector3\.new\s*\(/g, ctx.angularContext ? 'RobloxCompat.roblox_angular_vel_to_godot(' : 'RobloxCompat.vec3(');
  s = s.replace(/\bCFrame\.Angles\s*\(/g, 'RobloxCompat.cframe_angles(');
  s = s.replace(/\bCFrame\.new\s*\(/g, 'RobloxCompat.cframe_new(');
  s = s.replace(/\bColor3\.fromRGB\s*\(/g, 'Color8(');
  s = s.replace(/\bColor3\.new\s*\(/g, 'Color(');
  s = s.replace(/\bRandom\.new\s*\(\s*\)/g, 'RobloxCompat.random_new()');
  s = s.replace(/\bInstance\.new\s*\(/g, 'RobloxCompat.instance_new(');
  s = s.replace(/\bmath\.rad\s*\(/g, 'deg_to_rad(');
  s = s.replace(/\bmath\.floor\s*\(/g, 'floori(');
  s = s.replace(/\bmath\.clamp\s*\(/g, 'clamp(');
  s = s.replace(/\bmath\.abs\s*\(/g, 'abs(');
  s = s.replace(/\bmath\.max\s*\(/g, 'max(');
  s = s.replace(/\bmath\.min\s*\(/g, 'min(');
  s = s.replace(/\btostring\s*\(/g, 'str(');
  s = s.replace(/\bwarn\s*\(/g, 'push_warning(');
  s = s.replace(/\bnil\b/g, 'null');
  s = s.replace(/~=/g, '!=');

  // Modulo on possibly float/Variant in GDScript: `timeLeft % 60` -> `int(timeLeft) % 60`
  s = s.replace(/\b(\w+)\s*%\s*(\d+)\b/g, 'int($1) % $2');

  // Colon method calls
  s = replaceOuterCall(s, 'GetService', (_recv, args) => `RobloxCompat.get_service(${args})`);
  s = replaceOuterCall(s, 'GetDataStore', (_recv, args) => `RobloxCompat.get_datastore_stub(${args})`);
  s = replaceOuterCall(s, 'GetAsync', (recv, args) => `${recv}.get_async(${args})`);
  s = replaceOuterCall(s, 'SetAsync', (recv, args) => `${recv}.set_async(${args})`);
  s = replaceOuterCall(s, 'WaitForChild', (recv, args) => `RobloxCompat.wait_for_child(${recv}, ${args})`);
  s = replaceOuterCall(s, 'FindFirstChild', (recv, args) => `RobloxCompat.find_first_child(${recv}, ${args})`);
  s = replaceOuterCall(s, 'FindFirstChildOfClass', (recv, args) => `RobloxCompat.find_first_child_of_class(${recv}, ${args})`);
  s = replaceOuterCall(s, 'FindFirstAncestorOfClass', (recv, args) => `RobloxCompat.find_first_ancestor_of_class(${recv}, ${args})`);
  s = replaceOuterCall(s, 'GetChildren', (recv) => `RobloxCompat.get_rbx_children(${recv})`);
  s = replaceOuterCall(s, 'GetDescendants', (recv) => `RobloxCompat.get_descendants(${recv})`);
  s = replaceOuterCall(s, 'IsA', (recv, args) => `RobloxCompat.is_a(${recv}, ${args})`);
  s = replaceOuterCall(s, 'GetAttribute', (recv, args) => `RobloxCompat.get_attribute(${recv}, ${args})`);
  s = replaceOuterCall(s, 'SetAttribute', (recv, args) => `RobloxCompat.set_attribute(${recv}, ${args})`);
  s = replaceOuterCall(s, 'GetPivot', (recv) => `RobloxCompat.get_pivot(${recv})`);
  s = replaceOuterCall(s, 'PivotTo', (recv, args) => `RobloxCompat.pivot_to(${recv}, ${translateExpr(args, ctx)})`);
  s = replaceOuterCall(s, 'GetPlayers', () => `RobloxCompat.get_players()`);
  s = replaceOuterCall(s, 'GetPlayerFromCharacter', (_recv, args) => `RobloxCompat.get_player_from_character(${translateExpr(args, ctx)})`);
  s = replaceOuterCall(s, 'NextInteger', (recv, args) => `${recv}.next_integer(${args})`);
  s = replaceOuterCall(s, 'ChangeState', (recv, args) => `${recv}.change_state(${args})`);
  s = replaceOuterCall(s, 'VectorToWorldSpace', (recv, args) => {
    const cfExpr = recv.endsWith('.CFrame') ? `RobloxCompat.get_cframe(${recv.slice(0, -7)})` : recv;
    return `RobloxCompat.vector_to_world_space(${cfExpr}, ${translateExpr(args, ctx)})`;
  });

  // Property reads
  s = s.replace(/\b(\w+)\.CFrame\b/g, 'RobloxCompat.get_cframe($1)');
  s = s.replace(/\b(\w+)\.Name\b/g, 'RobloxCompat.get_roblox_name($1)');
  s = s.replace(/\b(\w+)\.Parent\b/g, '$1.get_parent()');
  s = s.replace(/\b(\w+)\.UserId\b/g, '$1.user_id');
  s = s.replace(/\b(\w+)\.Character\b/g, '$1.character');
  s = s.replace(/\b(\w+)\.Value\b/g, '$1.value');
  s = s.replace(/\b(\w+)\.PrimaryPart\b/g, 'RobloxCompat.find_first_child($1, "HumanoidRootPart")');

  // Boxed closure variables
  for (const bv of ctx.boxedVars) {
    s = s.replace(new RegExp(`\\b${bv}\\b`, 'g'), `${bv}[0]`);
  }

  return s;
}

export function transpileLuauToGdScript(source, options = {}) {
  const {
    scriptName = 'ConvertedScript',
    scriptPath = scriptName,
    registry = loadCapabilityRegistry()
  } = options;

  const analysis = analyzeLuauScript(source, scriptPath, registry);
  const rawLines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Pre-scan variable kinds for accurate GDScript translation
  const ctx = {
    dictVars: new Set(),
    arrayVars: new Set(),
    callableVars: new Set(),
    methodNames: new Set(),
    boxedVars: new Set(),
    inCondition: false,
    angularContext: false
  };

  for (const line of rawLines) {
    const t = stripInlineComment(line).trim();
    let m;
    if ((m = t.match(/^local\s+function\s+(\w+)\s*\(/))) ctx.methodNames.add(m[1]);
    if ((m = t.match(/^local\s+(\w+)\s*=\s*\{\s*\}\s*$/))) ctx.dictVars.add(m[1]);
    if ((m = t.match(/^local\s+(\w+)\s*=\s*\{\s*$/))) ctx.dictVars.add(m[1]);
    if ((m = t.match(/^local\s+(\w+)\s*=\s*\{[^=]+\}\s*$/))) ctx.arrayVars.add(m[1]);
  }
  for (const line of rawLines) {
    const t = stripInlineComment(line).trim();
    let m;
    if ((m = t.match(/^local\s+(\w+)\s*=\s*(\w+)\s*$/)) && ctx.methodNames.has(m[2])) {
      ctx.callableVars.add(m[1]);
    }
    if ((m = t.match(/^local\s+(\w+)\s*=\s*(\w+)\[/)) && ctx.arrayVars.has(m[2])) {
      ctx.callableVars.add(m[1]);
    }
  }

  // Detect closure-mutated boolean locals (e.g. Disapearing.legacy.luau `local isTouched = false` mutated inside `local function fade`)
  const hasNestedLocalFunc = rawLines.some((l) => /^\t+local\s+function\s+\w+/.test(l) || /^ {2,}local\s+function\s+\w+/.test(l));
  if (hasNestedLocalFunc) {
    for (const line of rawLines) {
      const m = line.match(/^\s+local\s+(\w+)\s*=\s*(false|true|\d+)\s*$/);
      if (m) ctx.boxedVars.add(m[1]);
    }
  }

  const classVars = [];
  const classMethods = [];
  const runBody = [];
  let targetBuf = runBody;
  let indent = 1; // inside run_script() by default
  const stack = []; // { kind, prevTarget, prevIndent, closeLine? }
  let dictLiteralActive = null; // { name, entries: [] }
  let pcallActive = null; // { varName, successName, lines: [] }
  let topLevelWhileSpawned = false;

  const pushLine = (text) => {
    targetBuf.push('\t'.repeat(Math.max(0, indent)) + text);
  };

  for (let idx = 0; idx < rawLines.length; idx++) {
    const cleaned = stripInlineComment(rawLines[idx]).trim();
    if (!cleaned) continue;

    // Collect multi-line dictionary literal (e.g. chaosNames = { [low_speed] = "Low Speed", ... })
    if (dictLiteralActive) {
      if (cleaned === '}') {
        const entries = dictLiteralActive.entries.join(', ');
        if (stack.length === 0) {
          classVars.push(`var ${dictLiteralActive.name}: Dictionary = {}`);
          runBody.push(`\t${dictLiteralActive.name} = { ${entries} }`);
        } else {
          pushLine(`var ${dictLiteralActive.name}: Dictionary = { ${entries} }`);
        }
        dictLiteralActive = null;
        continue;
      }
      const dm = cleaned.match(/^\[([^\]]+)\]\s*=\s*(.+?),?$/);
      if (dm) {
        dictLiteralActive.entries.push(`${translateExpr(dm[1], ctx)}: ${translateExpr(dm[2].replace(/,$/, ''), ctx)}`);
      }
      continue;
    }

    // Collect multi-line pcall(function() ... end)
    if (pcallActive) {
      if (cleaned === 'end)') {
        if (pcallActive.varName) {
          pushLine(`var ${pcallActive.successName} := true`);
          const retLine = pcallActive.lines.find((l) => l.startsWith('return '));
          const expr = retLine ? translateExpr(retLine.slice(7), ctx) : 'null';
          pushLine(`var ${pcallActive.varName} = ${expr}`);
        } else {
          for (const pl of pcallActive.lines) {
            pushLine(translateExpr(pl, ctx));
          }
        }
        pcallActive = null;
        continue;
      }
      pcallActive.lines.push(cleaned);
      continue;
    }

    // Start of `local success, val = pcall(function()`
    let m;
    if ((m = cleaned.match(/^local\s+(\w+)\s*,\s*(\w+)\s*=\s*pcall\s*\(\s*function\s*\(\s*\)\s*$/))) {
      pcallActive = { successName: m[1], varName: m[2], lines: [] };
      continue;
    }
    if (/^pcall\s*\(\s*function\s*\(\s*\)\s*$/.test(cleaned)) {
      pcallActive = { successName: null, varName: null, lines: [] };
      continue;
    }

    // Start of multi-line dict literal `local chaosNames = {`
    if ((m = cleaned.match(/^local\s+(\w+)\s*=\s*\{\s*$/))) {
      ctx.dictVars.add(m[1]);
      dictLiteralActive = { name: m[1], entries: [] };
      continue;
    }

    // Block closing: `end)` or `end`
    if (cleaned === 'end)' || cleaned === 'end') {
      const top = stack.pop();
      if (!top) continue;
      if (top.kind === 'top_func') {
        targetBuf = top.prevTarget;
        indent = top.prevIndent;
        classMethods.push('');
      } else if (top.kind === 'connect' || top.kind === 'task_spawn') {
        indent = top.prevIndent;
        pushLine(top.closeLine);
      } else if (top.kind === 'top_while') {
        indent = top.prevIndent;
        pushLine(')');
      } else {
        indent = Math.max(1, indent - 1);
      }
      continue;
    }

    // `elseif <cond> then`
    if ((m = cleaned.match(/^elseif\s+(.+)\s+then$/))) {
      indent = Math.max(1, indent - 1);
      ctx.inCondition = true;
      pushLine(`elif ${translateExpr(m[1], ctx)}:`);
      ctx.inCondition = false;
      indent++;
      continue;
    }

    // `else`
    if (cleaned === 'else') {
      indent = Math.max(1, indent - 1);
      pushLine('else:');
      indent++;
      continue;
    }

    // Single-line `if <cond> then return ... end`
    if ((m = cleaned.match(/^if\s+(.+)\s+then\s+(return(?:\s+.*)?)\s+end$/))) {
      ctx.inCondition = true;
      const cond = translateExpr(m[1], ctx);
      ctx.inCondition = false;
      const retBody = m[2].trim();
      const retGd = retBody === 'return' ? 'return' : `return ${translateExpr(retBody.slice(7), ctx)}`;
      pushLine(`if ${cond}: ${retGd}`);
      continue;
    }

    // Multi-line `if <cond> then`
    if ((m = cleaned.match(/^if\s+(.+)\s+then$/))) {
      ctx.inCondition = true;
      pushLine(`if ${translateExpr(m[1], ctx)}:`);
      ctx.inCondition = false;
      stack.push({ kind: 'if' });
      indent++;
      continue;
    }

    // `local function name(params)`
    if ((m = cleaned.match(/^local\s+function\s+(\w+)\s*\(([^)]*)\)\s*$/))) {
      const fnName = m[1];
      const params = m[2].trim();
      if (stack.length === 0) {
        stack.push({ kind: 'top_func', prevTarget: targetBuf, prevIndent: indent });
        targetBuf = classMethods;
        indent = 0;
        pushLine(`func ${fnName}(${params}):`);
        indent = 1;
      } else {
        pushLine(`var ${fnName} := func(${params}):`);
        stack.push({ kind: 'nested_func' });
        indent++;
      }
      continue;
    }

    // `task.spawn(function()`
    if (/^task\.spawn\s*\(\s*function\s*\(\s*\)\s*$/.test(cleaned)) {
      pushLine('RobloxCompat.task_spawn(func():');
      stack.push({ kind: 'task_spawn', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }

    // Signal connections with inline `function(args)`:
    // 1. RunService.Heartbeat:Connect(function(dt)
    if ((m = cleaned.match(/^RunService\.Heartbeat:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      pushLine(`RobloxCompat.connect_heartbeat(func(${m[1].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }
    // 2. Players.PlayerAdded:Connect(function(player)
    if ((m = cleaned.match(/^(?:game\.)?Players\.PlayerAdded:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      pushLine(`RobloxCompat.players_on_added(func(${m[1].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }
    // 3. player.CharacterAdded:Connect(function(char)
    if ((m = cleaned.match(/^(\w+)\.CharacterAdded:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      pushLine(`${m[1]}.character_added.connect(func(${m[2].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }
    // 4. <part>.Touched:Connect(function(hit)
    if ((m = cleaned.match(/^([\w.]+)\.Touched:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      pushLine(`RobloxCompat.connect_touched(${translateExpr(m[1], ctx)}, func(${m[2].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }
    // 5. <obj>.ChildAdded:Connect(function(child)
    if ((m = cleaned.match(/^([\w.]+)\.ChildAdded:Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/))) {
      pushLine(`RobloxCompat.connect_child_added(${translateExpr(m[1], ctx)}, func(${m[2].trim()}):`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }
    // 6. <obj>:GetAttributeChangedSignal("Attr"):Connect(function()
    if ((m = cleaned.match(/^([\w.]+):GetAttributeChangedSignal\(([^)]+)\):Connect\s*\(\s*function\s*\(\s*\)\s*$/))) {
      pushLine(`RobloxCompat.connect_attribute_changed(${translateExpr(m[1], ctx)}, ${m[2].trim()}, func():`);
      stack.push({ kind: 'connect', prevIndent: indent, closeLine: ')' });
      indent++;
      continue;
    }

    // Signal connections with named handler function:
    if ((m = cleaned.match(/^([\w.]+)\.Touched:Connect\s*\(\s*(\w+)\s*\)\s*$/))) {
      pushLine(`RobloxCompat.connect_touched(${translateExpr(m[1], ctx)}, ${m[2]})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.ChildAdded:Connect\s*\(\s*(\w+)\s*\)\s*$/))) {
      pushLine(`RobloxCompat.connect_child_added(${translateExpr(m[1], ctx)}, ${m[2]})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.DescendantAdded:Connect\s*\(\s*(\w+)\s*\)\s*$/))) {
      pushLine(`RobloxCompat.connect_descendant_added(${translateExpr(m[1], ctx)}, ${m[2]})`);
      continue;
    }
    if ((m = cleaned.match(/^(?:game\.)?Players\.PlayerAdded:Connect\s*\(\s*(\w+)\s*\)\s*$/))) {
      pushLine(`RobloxCompat.players_on_added(${m[1]})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+):GetAttributeChangedSignal\(([^)]+)\):Connect\s*\(\s*(\w+)\s*\)\s*$/))) {
      pushLine(`RobloxCompat.connect_attribute_changed(${translateExpr(m[1], ctx)}, ${m[2].trim()}, ${m[3]})`);
      continue;
    }

    // Numeric for-loop: `for i = start, stop[, step] do`
    if ((m = cleaned.match(/^for\s+(\w+)\s*=\s*(.+?)\s*,\s*(.+?)(?:\s*,\s*(.+?))?\s+do$/))) {
      const v = m[1];
      const a = translateExpr(m[2], ctx);
      const b = translateExpr(m[3], ctx);
      const step = m[4] ? translateExpr(m[4], ctx) : '1';
      const isNeg = step.trim().startsWith('-');
      const endExpr = isNeg ? `(${b}) - 1` : `(${b}) + 1`;
      pushLine(`for ${v} in range(${a}, ${endExpr}, ${step}):`);
      stack.push({ kind: 'for' });
      indent++;
      continue;
    }

    // Iterator for-loop: `for _, item in ipairs(expr) do` or Luau generalized `for _, item in expr do`
    if ((m = cleaned.match(/^for\s+\w+\s*,\s*(\w+)\s+in\s+(?:i?pairs\s*\((.+)\)|(.+))\s+do$/))) {
      const itemVar = m[1];
      const iterExpr = translateExpr(m[2] || m[3], ctx);
      pushLine(`for ${itemVar} in ${iterExpr}:`);
      stack.push({ kind: 'for' });
      indent++;
      continue;
    }

    // `while <cond> do`
    if ((m = cleaned.match(/^while\s+(.+)\s+do$/))) {
      const cond = translateExpr(m[1], ctx);
      if (stack.length === 0 && cond === 'true' && !topLevelWhileSpawned) {
        topLevelWhileSpawned = true;
        pushLine('RobloxCompat.task_spawn(func():');
        stack.push({ kind: 'top_while', prevIndent: indent });
        indent++;
        pushLine('while true:');
        indent++;
      } else {
        pushLine(`while ${cond}:`);
        stack.push({ kind: 'while' });
        indent++;
      }
      continue;
    }

    // `task.wait(sec)`
    if ((m = cleaned.match(/^task\.wait\s*\(([^)]*)\)\s*$/))) {
      const sec = m[1].trim() || '0.03';
      pushLine(`await RobloxCompat.task_wait(${translateExpr(sec, ctx)})`);
      continue;
    }

    // `return ...`
    if (cleaned === 'return') {
      pushLine('return');
      continue;
    }
    if ((m = cleaned.match(/^return\s+(.+)$/))) {
      pushLine(`return ${translateExpr(m[1], ctx)}`);
      continue;
    }

    // `local x = expr`
    if ((m = cleaned.match(/^local\s+(\w+)\s*=\s*(.+)$/))) {
      const name = m[1];
      const rhs = translateExpr(m[2], ctx);
      if (stack.length === 0) {
        classVars.push(`var ${name}`);
        pushLine(`${name} = ${rhs}`);
      } else if (ctx.boxedVars.has(name)) {
        pushLine(`var ${name} := [${rhs}]`);
      } else {
        pushLine(`var ${name} = ${rhs}`);
      }
      continue;
    }

    // Property / Table / Adapter assignments:
    // Lighting.FogStart / FogEnd / FogColor
    if ((m = cleaned.match(/^game:GetService\("Lighting"\)\.FogStart\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_lighting_fog(${translateExpr(m[1], ctx)}, -1.0, null)`);
      continue;
    }
    if ((m = cleaned.match(/^game:GetService\("Lighting"\)\.FogEnd\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_lighting_fog(-1.0, ${translateExpr(m[1], ctx)}, null)`);
      continue;
    }
    if ((m = cleaned.match(/^game:GetService\("Lighting"\)\.FogColor\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_lighting_fog(-1.0, -1.0, ${translateExpr(m[1], ctx)})`);
      continue;
    }

    // BasePart special setters
    if ((m = cleaned.match(/^([\w.]+)\.AssemblyAngularVelocity\s*=\s*(.+)$/))) {
      ctx.angularContext = true;
      const rhs = translateExpr(m[2], ctx);
      ctx.angularContext = false;
      pushLine(`RobloxCompat.set_angular_velocity(${translateExpr(m[1], ctx)}, ${rhs})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.AssemblyLinearVelocity\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_linear_velocity(${translateExpr(m[1], ctx)}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.CFrame\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_cframe(${translateExpr(m[1], ctx)}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.Anchored\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_anchored(${translateExpr(m[1], ctx)}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.CanCollide\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_can_collide(${translateExpr(m[1], ctx)}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.Transparency\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_transparency(${translateExpr(m[1], ctx)}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Parent\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.set_parent(${m[1]}, ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Name\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.set_meta("roblox_name", ${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Value\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.value = ${translateExpr(m[2], ctx)}`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.RespawnLocation\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.respawn_location = ${translateExpr(m[2], ctx)}`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.WalkSpeed\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.set_walk_speed(${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^([\w.]+)\.Humanoid\.Health\s*=\s*(.+)$/))) {
      pushLine(`RobloxCompat.find_first_child_of_class(${translateExpr(m[1], ctx)}, "Humanoid").set_health(${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Health\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.set_health(${translateExpr(m[2], ctx)})`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Visible\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.visible = ${translateExpr(m[2], ctx)}`);
      continue;
    }
    if ((m = cleaned.match(/^(\w+)\.Text\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}.text = ${translateExpr(m[2], ctx)}`);
      continue;
    }

    // Dict deletion `debounce[player] = nil`
    if ((m = cleaned.match(/^(\w+)\[([^\]]+)\]\s*=\s*nil\s*$/))) {
      pushLine(`${m[1]}.erase(${translateExpr(m[2], ctx)})`);
      continue;
    }
    // Dict assignment `debounce[player] = true`
    if ((m = cleaned.match(/^(\w+)\[([^\]]+)\]\s*=\s*(.+)$/))) {
      pushLine(`${m[1]}[${translateExpr(m[2], ctx)}] = ${translateExpr(m[3], ctx)}`);
      continue;
    }

    // General variable assignment
    if ((m = cleaned.match(/^(\w+)\s*=\s*(.+)$/))) {
      const lhs = ctx.boxedVars.has(m[1]) ? `${m[1]}[0]` : m[1];
      pushLine(`${lhs} = ${translateExpr(m[2], ctx)}`);
      continue;
    }

    // Callable variable invocation `currentChaos(character)`
    if ((m = cleaned.match(/^(\w+)\s*\((.*)\)\s*$/)) && ctx.callableVars.has(m[1])) {
      const args = m[2].trim() ? splitTopLevel(m[2]).map((a) => translateExpr(a, ctx)).join(', ') : '';
      pushLine(`${m[1]}.call(${args})`);
      continue;
    }

    // Generic function / method call statement
    if (/^[\w.:"'()]+\s*\(.*\)\s*$/.test(cleaned)) {
      const translated = translateExpr(cleaned, ctx);
      // If calling an async helper method like timer(...) inside async loop, await it
      if (/^timer\s*\(/.test(translated)) {
        pushLine(`await ${translated}`);
      } else {
        pushLine(translated);
      }
      continue;
    }

    pushLine(`# TODO Unmapped Luau: ${cleaned}`);
  }

  const out = [
    'extends Node',
    `# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ${scriptPath}`,
    `# Strategy: ${analysis.strategy} | Grades: D=${analysis.grade_counts.D} A=${analysis.grade_counts.A} R=${analysis.grade_counts.R} X=${analysis.grade_counts.X} V=${analysis.grade_counts.V}`,
    '',
    'var _rbx_script_parent: Node = null',
    ...classVars,
    '',
    ...classMethods,
    'func run_script(script_parent: Node) -> void:',
    '\t_rbx_script_parent = script_parent',
    ...(runBody.length ? runBody : ['\tpass']),
    ''
  ];

  const code = out.join('\n');
  const todoFallbackLines = out.filter((l) => l.includes('# TODO Unmapped Luau:')).length;

  return {
    code,
    analysis,
    todoFallbackLines
  };
}
