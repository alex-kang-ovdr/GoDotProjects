'use strict';

const CONNECTIONS = {
  'openai-api': {
    base: 'https://api.openai.com/v1', label: 'OpenAI API', detail: 'OpenAI Platform API key.',
    keyEnv: 'OPENAI_API_KEY', modelEnv: 'PLAYFORGE_OPENAI_MODEL', defaultModel: 'gpt-5.4-mini',
    modelPattern: /^(gpt-|o[1-9])/,
  },
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta/openai', label: 'Gemini', detail: 'Google AI Studio API key.',
    keyEnv: 'GEMINI_API_KEY', modelEnv: 'PLAYFORGE_GEMINI_MODEL', defaultModel: 'gemini-4-hydrogen',
    modelPattern: /^gemini-/,
  },
  'zai-coding-plan': {
    base: 'https://api.z.ai/api/coding/paas/v4', label: 'z.ai Coding Plan', detail: 'GLM Coding Plan API key.',
    keyEnv: 'ZAI_API_KEY', modelEnv: 'PLAYFORGE_ZAI_MODEL', defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.3-flash'], keyPattern: /^[A-Za-z0-9_-]{8,128}\.[A-Za-z0-9_-]{4,128}$/,
  },
};

function createCompatibleRequest(provider, config, { messages, tools }) {
  let pendingCalls = [];
  const history = [];
  for (const [index, message] of messages.entries()) {
    if (message.role === 'tool') {
      const callIndex = message.tool_name == null
        ? 0 : pendingCalls.findIndex(call => call.function.name === message.tool_name);
      const call = callIndex < 0 ? null : pendingCalls.splice(callIndex, 1)[0];
      if (call) history.push({ role: 'tool', tool_call_id: call.id, content: message.content });
      continue;
    }
    const item = { role: message.role, content: message.content };
    if (message.role === 'assistant' && message.tool_calls?.length) {
      pendingCalls = message.tool_calls.map((call, callIndex) => ({
        id: typeof call.id === 'string' ? call.id : `call_forge_${index}_${callIndex}`,
        type: 'function',
        function: { name: call.function.name, arguments: JSON.stringify(call.function.arguments) },
        ...(provider === 'gemini' && typeof call.thought_signature === 'string' ? {
          extra_content: { google: { thought_signature: call.thought_signature } },
        } : {}),
      }));
      item.tool_calls = [...pendingCalls];
    }
    history.push(item);
  }
  return {
    url: `${CONNECTIONS[provider].base}/chat/completions`,
    headers: { authorization: `Bearer ${config.key}` },
    body: {
      model: config.model, messages: history, stream: false,
      ...(tools.length ? { tools } : {}),
    },
  };
}

function readCompatibleMessage(response, provider) {
  const message = response?.choices?.[0]?.message;
  if (message?.role !== 'assistant') return null;
  return {
    role: 'assistant',
    content: message.content ?? '',
    tool_calls: (message.tool_calls ?? []).map(call => ({
      ...(typeof call.id === 'string' ? { id: call.id } : {}),
      function: { name: call.function.name, arguments: JSON.parse(call.function.arguments) },
      ...(provider === 'gemini' && typeof call.extra_content?.google?.thought_signature === 'string'
        ? { thought_signature: call.extra_content.google.thought_signature } : {}),
    })),
  };
}

module.exports = { CONNECTIONS, createCompatibleRequest, readCompatibleMessage };
