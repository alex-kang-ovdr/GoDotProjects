'use strict';
// A stdio transport tap. Forward protocol bytes unchanged and retain acknowledged edits only.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

function observeLines(observe) {
  const decoder = new StringDecoder('utf8');
  let tail = '';
  return chunk => {
    tail += decoder.write(chunk);
    let end;
    while ((end = tail.indexOf('\n')) >= 0) {
      const line = tail.slice(0, end).trim();
      tail = tail.slice(end + 1);
      if (line) observe(JSON.parse(line));
    }
    if (tail.length > 8 * 1024 * 1024) throw new Error('MCP message exceeds 8 MB');
  };
}

function capture(write) {
  const pending = new Map();
  const applied = new Map();
  return {
    request(packet) {
      if (packet.method !== 'tools/call' || packet.params?.name !== 'pf_workspace_apply' ||
          packet.id == null || packet.params.arguments?.dryRun === true) return;
      if (pending.has(packet.id)) throw new Error('Duplicate pending JSON-RPC request ID');
      pending.set(packet.id, packet);
    },
    response(packet) {
      if (!pending.has(packet.id) || packet.method) return;
      const request = pending.get(packet.id);
      pending.delete(packet.id);
      if (packet.error || !packet.result || packet.result.isError) return;
      const args = request.params.arguments;
      if (!Array.isArray(args.operations)) throw new Error('Acknowledged apply has no operations array');
      const scope = JSON.stringify([args.workspaceId, args.workflowRunId, args.idempotencyKey]);
      const payload = JSON.stringify(args.operations);
      if (args.idempotencyKey && applied.has(scope)) {
        if (applied.get(scope) !== payload) throw new Error('Conflicting acknowledged idempotency key');
        return;
      }
      if (args.idempotencyKey) applied.set(scope, payload);
      const revision = packet.result.structuredContent?.revision;
      const params = { name: request.params.name, arguments: { operations: args.operations } };
      if (Number.isSafeInteger(revision) && revision >= 0) params._meta = { 'playforge/revision': revision };
      write({ jsonrpc: '2.0', id: request.id, method: 'tools/call', params });
    },
  };
}

function main([output, separator, executable, ...args]) {
  if (!output || separator !== '--' || !executable) throw new Error('Usage: node record-agent-mcp.cjs <new.jsonl> -- <mcp-server-executable> [args...]');
  const fd = fs.openSync(output, 'wx');
  const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  const tap = capture(packet => fs.writeSync(fd, JSON.stringify(packet) + '\n'));
  let failed = false;
  function observe(stream, listener) {
    const read = observeLines(listener);
    stream.on('data', chunk => {
      if (failed) return;
      try { read(chunk); }
      catch (error) { failed = true; process.stderr.write('Agent recording failed: ' + error.message + '\n'); }
    });
  }
  observe(process.stdin, tap.request);
  observe(child.stdout, tap.response);
  child.stdin.on('error', error => { if (error.code !== 'EPIPE') process.stderr.write(error.message + '\n'); });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.on('error', error => { failed = true; process.stderr.write(error.message + '\n'); });
  child.on('close', code => {
    fs.closeSync(fd);
    process.stdin.unpipe(child.stdin);
    process.stdin.pause();
    process.exitCode = failed ? 1 : (code ?? 1);
  });
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { capture, observeLines };
