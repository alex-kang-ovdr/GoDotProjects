'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const readEditorCommandLines = `
  $ErrorActionPreference = 'Stop'
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $commandLines = @(
    Get-CimInstance -ClassName Win32_Process -Property ExecutablePath, CommandLine |
      Where-Object {
        [string]::Equals($_.ExecutablePath, $env:PLAYFORGE_EDITOR_EXECUTABLE, [StringComparison]::OrdinalIgnoreCase)
      } |
      ForEach-Object { $_.CommandLine }
  )
  ConvertTo-Json -InputObject $commandLines -Compress
`;

function splitWindowsCommandLine(commandLine) {
  const args = [];
  let index = 0;
  while (index < commandLine.length) {
    if (/\s/.test(commandLine[index])) {
      index += 1;
      continue;
    }
    let value = '';
    let quoted = false;
    while (index < commandLine.length && (quoted || !/\s/.test(commandLine[index]))) {
      let slashes = 0;
      while (commandLine[index] === '\\') {
        slashes += 1;
        index += 1;
      }
      if (commandLine[index] === '"') {
        value += '\\'.repeat(Math.floor(slashes / 2));
        index += 1;
        if (slashes % 2) value += '"';
        else if (quoted && commandLine[index] === '"') {
          value += '"';
          index += 1;
        } else quoted = !quoted;
      } else {
        value += '\\'.repeat(slashes);
        if (index === commandLine.length || (!quoted && /\s/.test(commandLine[index]))) break;
        value += commandLine[index++];
      }
    }
    args.push(value);
  }
  return args;
}

function matchesEditorProject(commandLine, project) {
  if (typeof commandLine !== 'string') return false;
  const args = splitWindowsCommandLine(commandLine).slice(1);
  const end = args.findIndex(arg => arg === '--' || arg === '++');
  const options = end < 0 ? args : args.slice(0, end);
  if (!options.includes('--editor') && !options.includes('-e')) return false;
  if (options.some(arg => ['--headless', '--import', '--quit', '--quit-after'].includes(arg))) return false;
  const display = options.lastIndexOf('--display-driver');
  if (display >= 0 && options[display + 1] === 'headless') return false;
  const gamePath = options.lastIndexOf('--path');
  if (gamePath === -1 || !options[gamePath + 1] || !path.isAbsolute(options[gamePath + 1])) return false;
  try {
    return fs.realpathSync(options[gamePath + 1]).toLowerCase() === project;
  } catch {
    return false;
  }
}

function isGodotProjectOpen(executable, folder) {
  if (process.platform !== 'win32' || !process.env.SystemRoot) return false;
  try {
    const resolvedExecutable = fs.realpathSync(executable);
    const project = fs.realpathSync(folder).toLowerCase();
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', readEditorCommandLines], {
      env: { ...process.env, PLAYFORGE_EDITOR_EXECUTABLE: resolvedExecutable },
      windowsHide: true, encoding: 'utf8', timeout: 3000, maxBuffer: 128 * 1024,
    });
    return result.status === 0 && JSON.parse(result.stdout).some(commandLine => matchesEditorProject(commandLine, project));
  } catch {
    return false;
  }
}

module.exports = { isGodotProjectOpen };
