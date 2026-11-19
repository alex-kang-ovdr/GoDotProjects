'use strict';

function createClaudeRequest(config, { messages, tools }) {
  const dialogue = [];
  let pendingCalls = [];
  const append = (role, content) => {
    const last = dialogue.at(-1);
    if (last?.role === role) last.content.push(...content);
    else dialogue.push({ role, content });
  };
  for (const [index, message] of messages.entries()) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      // Forge reports tool results in call order. Names disambiguate when available.
      const callIndex = message.tool_name == null
        ? 0 : pendingCalls.findIndex(call => call.name === message.tool_name);
      const call = callIndex < 0 ? null : pendingCalls.splice(callIndex, 1)[0];
      if (call) append('user', [{ type: 'tool_result', tool_use_id: call.id, content: message.content }]);
      continue;
    }
    const content = message.content ? [{ type: 'text', text: message.content }] : [];
    if (message.role === 'assistant') {
      pendingCalls = (message.tool_calls ?? []).map(({ function: fn }, callIndex) => ({
        type: 'tool_use', id: `toolu_forge_${index}_${callIndex}`, name: fn.name, input: fn.arguments,
      }));
      content.push(...pendingCalls);
    }
    if (content.length) append(message.role, content);
  }
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': config.key,
      'anthropic-version': '2023-06-01',
      ...(config.workspace ? { 'anthropic-workspace-id': config.workspace } : {}),
    },
    body: {
      model: config.model,
      max_tokens: 4096,
      system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
      messages: dialogue,
      ...(tools.length ? { tools: tools.map(({ function: fn }) => ({
        name: fn.name, description: fn.description, input_schema: fn.parameters ?? { type: 'object' },
      })) } : {}),
    },
  };
}

function readClaudeMessage(response) {
  if (!Array.isArray(response?.content) || response.role !== 'assistant') return null;
  return {
    role: 'assistant',
    content: response.content.filter(block => block?.type === 'text').map(block => block.text).join('\n'),
    tool_calls: response.content.filter(block => block?.type === 'tool_use')
      .map(block => ({ function: { name: block.name, arguments: block.input } })),
  };
}

module.exports = { createClaudeRequest, readClaudeMessage };
