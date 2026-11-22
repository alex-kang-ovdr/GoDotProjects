// Hub-Agent Core Orchestration Service.
// Connects Operator Gemini (OAuth CLI / API Key) to Hub Chat, Forge AI Chat, 3D Modeling, and Project Porting,
// enforcing Free Trial / Pro Weekly Included Token Quotas + PlayCoin Overage Metering.

import { ApiError, safeString, uid } from '../security.mjs';
import { runAtomic } from '../billing/idempotency.mjs';
import { getWallet, reserveHold, releaseHold, settleHold } from '../billing/ledger.mjs';
import { getSubscription, recordMeteredUsage } from '../billing/subscriptions.mjs';
import { ensureHubAgentSchema, HUB_AGENT_FEATURES } from './schema.mjs';
import {
  readAgentPolicy,
  updateAgentPolicy,
  getQuotaSnapshot,
  computeTokenSettlement,
  estimatePreCallBudget
} from './pricing.mjs';
import {
  MODELING_SYSTEM_PROMPT,
  extractJsonFromText,
  normalizeMeshRecipe,
  compileRecipeToGlb
} from './modeling-glb.mjs';
import {
  analyzeSourceProject,
  buildPortingPrompt,
  normalizePortedProjectBundle
} from './porting-engine.mjs';

const KST_OFFSET_MS = 9 * 3600_000;

function currentKstPeriodKey(stamp) {
  return new Date(stamp + KST_OFFSET_MS).toISOString().slice(0, 7);
}

const DEFAULT_HUB_CHAT_SYSTEM_PROMPT = [
  '당신은 PlayHub & PlayForge 플랫폼의 공식 내장 AI 에이전트(Hub-Agent)입니다.',
  'Godot 4.7.2 게임 개발(GDScript 2.0, 씬 설계, 물리, 멀티플레이), 3D 모델링 기획, Roblox/Unity/Unreal 포팅, PlayHub 출시 및 수익화를 정확하고 간결한 한국어로 안내하세요.'
].join(' ');

export function createHubAgentService({
  db,
  geminiProvider,
  now = Date.now,
  audit = () => {}
}) {
  ensureHubAgentSchema(db, now);

  // Generated .glb cache in memory (bounded LRU) for instant browser download
  const recentGlbAssets = new Map();
  const MAX_CACHED_GLBS = 24;

  function rememberGlbAsset(assetId, principalId, filename, glbBuffer, recipe, metrics) {
    recentGlbAssets.set(assetId, {
      assetId,
      principalId,
      filename,
      glbBuffer,
      recipe,
      metrics,
      createdAt: now()
    });
    while (recentGlbAssets.size > MAX_CACHED_GLBS) {
      const oldest = recentGlbAssets.keys().next().value;
      if (oldest === assetId) break;
      recentGlbAssets.delete(oldest);
    }
  }

  function getGlbAsset(assetId, principalId = null) {
    const entry = recentGlbAssets.get(assetId);
    if (!entry) return null;
    if (principalId && entry.principalId !== principalId) return null;
    return entry;
  }

  function assertRegisteredPrincipal(principalId) {
    if (!safeString(principalId, 128)) {
      throw new ApiError(401, 'REGISTERED_ACCOUNT_REQUIRED', '로그인한 계정만 AI 기능을 이용할 수 있습니다.');
    }
    const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id = ?').get(principalId);
    if (!user || user.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', '등록된 계정(Google·네이버·이메일)으로 로그인 후 AI 기능을 이용할 수 있습니다.');
    }
    return user;
  }

  function getPublicStatus(principalId = null) {
    const policy = readAgentPolicy(db);
    const conn = geminiProvider.getConnectionStatus({ preferredProvider: policy.defaultProvider });
    const base = {
      available: conn.ready,
      activeMode: conn.activeMode,
      defaultModel: policy.defaultModel,
      models: conn.models,
      pricing: {
        tokensPerCoin: policy.tokensPerCoin,
        inputWeight: policy.inputWeightBps / 10000,
        cachedWeight: policy.cachedWeightBps / 10000,
        outputWeight: policy.outputWeightBps / 10000,
        proModelMultiplier: policy.proMultiplierBps / 10000,
        minCoinsPerCall: policy.minCoinsPerCall,
        freeTrialTokens: policy.freeTrialTokens,
        proWeeklyTokens: policy.proWeeklyTokens,
        byokZeroCoin: true
      }
    };

    if (!principalId) return base;
    const user = db.prepare('SELECT id, kind FROM users WHERE id = ?').get(principalId);
    if (!user || user.kind !== 'registered') {
      return { ...base, authenticated: false };
    }

    const subscription = getSubscription(db, principalId, now);
    const wallet = getWallet(db, principalId, now);
    const quota = getQuotaSnapshot(db, {
      principalId,
      planTier: subscription.effectivePlan,
      policy,
      now
    });

    return {
      ...base,
      authenticated: true,
      planTier: subscription.effectivePlan,
      wallet,
      quota
    };
  }

  function getUserUsageLogs(principalId, { limit = 30 } = {}) {
    assertRegisteredPrincipal(principalId);
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const rows = db.prepare(`
      SELECT *
      FROM hub_agent_usage_logs
      WHERE principal_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(principalId, safeLimit);

    const totals = db.prepare(`
      SELECT
        COUNT(*) AS call_count,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(weighted_tokens), 0) AS weighted_tokens,
        COALESCE(SUM(quota_tokens_used), 0) AS quota_tokens_used,
        COALESCE(SUM(overage_tokens), 0) AS overage_tokens,
        COALESCE(SUM(charged_coins), 0) AS charged_coins
      FROM hub_agent_usage_logs
      WHERE principal_id = ? AND status = 'SUCCEEDED'
    `).get(principalId);

    return {
      summary: {
        callCount: totals.call_count,
        totalTokens: totals.total_tokens,
        weightedTokens: totals.weighted_tokens,
        quotaTokensUsed: totals.quota_tokens_used,
        overageTokens: totals.overage_tokens,
        chargedCoins: totals.charged_coins
      },
      records: rows.map(r => ({
        id: r.id,
        feature: r.feature,
        authMode: r.auth_mode,
        planTier: r.plan_tier,
        provider: r.provider,
        model: r.model,
        inputTokens: r.input_tokens,
        cachedTokens: r.cached_tokens,
        outputTokens: r.output_tokens,
        thinkingTokens: r.thinking_tokens,
        totalTokens: r.total_tokens,
        weightedTokens: r.weighted_tokens,
        quotaTokensUsed: r.quota_tokens_used,
        overageTokens: r.overage_tokens,
        chargedCoins: r.charged_coins,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString()
      }))
    };
  }

  async function executeMeteredAiCall({
    principalId,
    feature,
    model = '',
    messages = [],
    systemPrompt = '',
    tools = [],
    responseMimeType = '',
    maxOutputTokens = 4096,
    stream = false,
    onDelta = null,
    byok = null,
    signal
  }) {
    if (!HUB_AGENT_FEATURES.has(feature)) {
      throw new ApiError(400, 'INVALID_AGENT_FEATURE');
    }
    assertRegisteredPrincipal(principalId);

    const policy = readAgentPolicy(db);
    const subscription = getSubscription(db, principalId, now);
    const planTier = subscription.effectivePlan;
    const isByok = Boolean(byok && typeof byok === 'object' && String(byok.apiKey || '').trim());
    const callId = uid();

    let activeHold = null;
    const chosenModel = String(model || '').trim() || policy.defaultModel;

    if (!isByok) {
      const conn = geminiProvider.getConnectionStatus({ preferredProvider: policy.defaultProvider });
      if (!conn.ready) {
        throw new ApiError(
          503,
          'HUB_AGENT_NOT_CONNECTED',
          '허브 내장 Gemini 에이전트가 아직 연결되지 않았습니다. 운영자 관리 콘솔에서 Gemini 계정을 연결하거나 본인 AI API 키를 연동해 주세요.'
        );
      }

      const preWallet = getWallet(db, principalId, now);
      const preQuota = getQuotaSnapshot(db, { principalId, planTier, policy, now });
      const promptChars = Buffer.byteLength(
        [systemPrompt, ...messages.map(m => m.content || ''), JSON.stringify(tools || [])].join('\n'),
        'utf8'
      );

      const budget = estimatePreCallBudget({
        promptChars,
        feature,
        model: chosenModel,
        policy,
        remainingQuotaTokens: preQuota.remainingTokens,
        availableCoins: preWallet.available
      });

      if (!budget.allowed) {
        const quotaMsg = planTier === 'pro'
          ? '이번 주 Pro 포함 AI 토큰 한도를 모두 사용했으며 보유 PlayCoin이 부족합니다.'
          : 'Free 기본 AI 체험 한도를 모두 사용했으며 보유 PlayCoin이 부족합니다.';
        throw new ApiError(
          402,
          'INSUFFICIENT_PLAYCOIN',
          `${quotaMsg} PlayCoin을 충전하거나 Pro 구독 또는 본인 AI 계정을 연동해 주세요.`,
          {
            requiredCoins: budget.requiredCoins,
            availableCoins: preWallet.available,
            planTier,
            quota: preQuota
          }
        );
      }

      if (budget.holdCoins > 0) {
        const reserved = reserveHold(db, {
          principalId,
          amountCoins: budget.holdCoins,
          sinkType: 'usage_ai_units',
          sinkRefId: `${feature}:${callId}`,
          idempotencyKey: `hub-agent-hold:${callId}`,
          ttlMs: 10 * 60_000,
          now
        });
        activeHold = reserved.hold;
      }
    }

    let llmOut;
    try {
      llmOut = await geminiProvider.generate({
        preferredProvider: policy.defaultProvider,
        defaultModel: policy.defaultModel,
        model: chosenModel,
        messages,
        systemPrompt,
        tools,
        responseMimeType,
        maxOutputTokens,
        stream,
        onDelta,
        byok: isByok ? byok : null,
        signal
      });
    } catch (error) {
      if (activeHold) {
        try { releaseHold(db, { holdId: activeHold.id, now }); } catch {}
      }
      const stamp = now();
      try {
        db.prepare(`
          INSERT INTO hub_agent_usage_logs (
            id, principal_id, feature, auth_mode, plan_tier, provider, model,
            input_tokens, cached_tokens, output_tokens, thinking_tokens, total_tokens,
            weighted_tokens, quota_tokens_used, overage_tokens, charged_coins,
            hold_id, usage_record_id, journal_entry_id, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, NULL, NULL, 'FAILED', ?)
        `).run(
          callId,
          principalId,
          feature,
          isByok ? 'user_byok' : 'hub_managed',
          planTier,
          isByok ? `user:${byok.provider || 'byok'}` : `hub:${policy.defaultProvider}`,
          chosenModel,
          activeHold?.id || null,
          stamp
        );
      } catch {}
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 502,
        error?.code || 'AGENT_UPSTREAM_FAILED',
        error?.message || 'AI 공급자 응답 처리에 실패했습니다.'
      );
    }

    const resolvedAuthMode = llmOut.authMode || (isByok ? 'user_byok' : 'hub_managed');
    const resolvedProvider = llmOut.provider || (isByok ? `user:${byok?.provider || 'byok'}` : `hub:${policy.defaultProvider}`);

    const receipt = runAtomic(db, () => {
      const stamp = now();
      const periodKey = currentKstPeriodKey(stamp);
      const latestQuota = getQuotaSnapshot(db, { principalId, planTier, policy, now });

      const settlement = computeTokenSettlement({
        usage: llmOut.usage,
        model: llmOut.model || chosenModel,
        policy,
        authMode: resolvedAuthMode,
        remainingQuotaTokens: isByok ? 0 : latestQuota.remainingTokens
      });

      if (!isByok && settlement.quotaTokensUsed > 0) {
        if (planTier === 'pro') {
          db.prepare('UPDATE hub_agent_quotas SET pro_week_used = pro_week_used + ?, updated_at = ? WHERE principal_id = ?')
            .run(settlement.quotaTokensUsed, stamp, principalId);
        } else {
          db.prepare('UPDATE hub_agent_quotas SET free_trial_used = free_trial_used + ?, updated_at = ? WHERE principal_id = ?')
            .run(settlement.quotaTokensUsed, stamp, principalId);
        }
      }

      let actualChargedCoins = 0;
      let usageRecordId = null;
      let journalEntryId = null;

      if (activeHold) {
        const cappedHoldSettle = Math.min(activeHold.amount_coins, settlement.chargedCoins);
        if (cappedHoldSettle === 0) {
          settleHold(db, {
            holdId: activeHold.id,
            actualCoins: 0,
            idempotencyKey: `hub-agent-settle0:${callId}`,
            now
          });
        } else {
          const metered = recordMeteredUsage(db, {
            principalId,
            metricType: 'ai_units',
            resourceRefId: `${feature}:${callId}`,
            quantity: Math.max(1, settlement.totalTokens),
            billableCoins: cappedHoldSettle,
            holdId: activeHold.id,
            periodKey,
            idempotencyKey: `hub-agent-meter:${callId}`,
            now
          });
          actualChargedCoins += cappedHoldSettle;
          usageRecordId = metered.usageId;
          journalEntryId = metered.journalEntryId || null;

          // If actual tokens slightly exceeded the initial hold, settle remainder if wallet allows
          const extraNeeded = settlement.chargedCoins - cappedHoldSettle;
          if (extraNeeded > 0) {
            const afterHoldWallet = getWallet(db, principalId, now);
            const extraTake = Math.min(afterHoldWallet.available, extraNeeded);
            if (extraTake > 0) {
              const extraMetered = recordMeteredUsage(db, {
                principalId,
                metricType: 'ai_units',
                resourceRefId: `${feature}:${callId}:overage`,
                quantity: Math.max(1, settlement.overageTokens),
                billableCoins: extraTake,
                holdId: null,
                periodKey,
                idempotencyKey: `hub-agent-meter-extra:${callId}`,
                now
              });
              actualChargedCoins += extraTake;
              journalEntryId = extraMetered.journalEntryId || journalEntryId;
            }
          }
        }
      } else if (!isByok && settlement.chargedCoins > 0) {
        const curWallet = getWallet(db, principalId, now);
        const take = Math.min(curWallet.available, settlement.chargedCoins);
        if (take > 0) {
          const metered = recordMeteredUsage(db, {
            principalId,
            metricType: 'ai_units',
            resourceRefId: `${feature}:${callId}`,
            quantity: Math.max(1, settlement.totalTokens),
            billableCoins: take,
            holdId: null,
            periodKey,
            idempotencyKey: `hub-agent-meter:${callId}`,
            now
          });
          actualChargedCoins = take;
          usageRecordId = metered.usageId;
          journalEntryId = metered.journalEntryId || null;
        }
      }

      db.prepare(`
        INSERT INTO hub_agent_usage_logs (
          id, principal_id, feature, auth_mode, plan_tier, provider, model,
          input_tokens, cached_tokens, output_tokens, thinking_tokens, total_tokens,
          weighted_tokens, quota_tokens_used, overage_tokens, charged_coins,
          hold_id, usage_record_id, journal_entry_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCEEDED', ?)
      `).run(
        callId,
        principalId,
        feature,
        resolvedAuthMode,
        planTier,
        resolvedProvider,
        llmOut.model || chosenModel,
        settlement.inputTokens,
        settlement.cachedTokens,
        settlement.outputTokens,
        settlement.thinkingTokens,
        settlement.totalTokens,
        settlement.weightedTokens,
        settlement.quotaTokensUsed,
        settlement.overageTokens,
        actualChargedCoins,
        activeHold?.id || null,
        usageRecordId,
        journalEntryId,
        stamp
      );

      const updatedWallet = getWallet(db, principalId, now);
      const updatedQuota = getQuotaSnapshot(db, { principalId, planTier, policy, now });

      return {
        callId,
        feature,
        authMode: resolvedAuthMode,
        planTier,
        provider: resolvedProvider,
        model: llmOut.model || chosenModel,
        tokenUsage: {
          inputTokens: settlement.inputTokens,
          cachedTokens: settlement.cachedTokens,
          outputTokens: settlement.outputTokens,
          thinkingTokens: settlement.thinkingTokens,
          totalTokens: settlement.totalTokens,
          weightedTokens: settlement.weightedTokens,
          quotaTokensUsed: settlement.quotaTokensUsed,
          overageTokens: settlement.overageTokens
        },
        chargedCoins: actualChargedCoins,
        wallet: updatedWallet,
        quota: updatedQuota
      };
    });

    return {
      content: llmOut.content ?? llmOut.message?.content ?? '',
      toolCalls: llmOut.toolCalls || llmOut.message?.tool_calls || [],
      billing: receipt
    };
  }

  async function chat({
    principalId,
    feature = 'hub_chat',
    messages = [],
    tools = [],
    model = '',
    systemPrompt = '',
    stream = false,
    onDelta = null,
    byok = null,
    signal
  }) {
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 64) {
      throw new ApiError(400, 'INVALID_CHAT_MESSAGES', '대화 메시지 배열(1~64개)이 필요합니다.');
    }
    const cleanMessages = messages.map(m => ({
      role: ['system', 'user', 'assistant', 'tool'].includes(m?.role) ? m.role : 'user',
      content: String(m?.content ?? '').slice(0, 32_000),
      ...(Array.isArray(m?.tool_calls) ? { tool_calls: m.tool_calls } : {}),
      ...(typeof m?.tool_name === 'string' ? { tool_name: m.tool_name } : {})
    }));

    const hasSystemInMessages = cleanMessages.some(m => m.role === 'system');
    const effectiveSystem = systemPrompt || (feature === 'hub_chat' && !hasSystemInMessages ? DEFAULT_HUB_CHAT_SYSTEM_PROMPT : '');

    const out = await executeMeteredAiCall({
      principalId,
      feature: feature === 'forge_chat' ? 'forge_chat' : 'hub_chat',
      model,
      messages: cleanMessages,
      systemPrompt: effectiveSystem,
      tools,
      stream,
      onDelta,
      byok,
      signal
    });

    return {
      message: {
        role: 'assistant',
        content: out.content,
        tool_calls: out.toolCalls
      },
      tokenUsage: out.billing.tokenUsage,
      billing: out.billing
    };
  }

  async function generate3dModel({
    principalId,
    prompt,
    style = 'stylized',
    name = '',
    model = '',
    byok = null,
    signal
  }) {
    const cleanPrompt = String(prompt || '').trim().slice(0, 4000);
    if (!cleanPrompt) {
      throw new ApiError(400, 'MODELING_PROMPT_REQUIRED', '생성할 3D 모델에 대한 자연어 설명을 입력해 주세요.');
    }

    const userMsg = [
      `Create a detailed 3D MeshRecipe v1 JSON for: "${cleanPrompt}"`,
      `Preferred visual style: ${String(style || 'stylized').slice(0, 32)}`,
      name ? `Preferred PascalCase asset name: ${String(name).slice(0, 48)}` : '',
      'Include 16 to 36 well-connected 3D parts with accurate proportions and PBR materials.'
    ].filter(Boolean).join('\n');

    const out = await executeMeteredAiCall({
      principalId,
      feature: 'modeling_3d',
      model,
      systemPrompt: MODELING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
      responseMimeType: 'application/json',
      maxOutputTokens: 6144,
      byok,
      signal
    });

    const rawObj = extractJsonFromText(out.content);
    const recipe = normalizeMeshRecipe(rawObj, name || 'PlayHubModel3D');
    const { glbBuffer, metrics } = compileRecipeToGlb(recipe);
    const assetId = `glb_${uid().replace(/-/g, '').slice(0, 16)}`;
    const filename = `${recipe.name.toLowerCase()}.glb`;
    rememberGlbAsset(assetId, principalId, filename, glbBuffer, recipe, metrics);

    return {
      assetId,
      filename,
      downloadUrl: `/api/hub-agent/modeling/${assetId}/model.glb`,
      glbBase64: glbBuffer.toString('base64'),
      recipe,
      metrics,
      tokenUsage: out.billing.tokenUsage,
      billing: out.billing
    };
  }

  async function portProject({
    principalId,
    sourceEngine,
    projectName = '',
    files = [],
    sourceCode = '',
    instructions = '',
    model = '',
    byok = null,
    signal
  }) {
    const analysis = analyzeSourceProject({ sourceEngine, files, sourceCode });
    const { systemPrompt, userPrompt } = buildPortingPrompt({
      projectName,
      analysis,
      instructions: String(instructions || '').slice(0, 2000)
    });

    const out = await executeMeteredAiCall({
      principalId,
      feature: 'project_porting',
      model,
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
      byok,
      signal
    });

    const bundle = normalizePortedProjectBundle(out.content, { projectName, analysis });
    return {
      ...bundle,
      tokenUsage: out.billing.tokenUsage,
      billing: out.billing
    };
  }

  // --- Operator Admin Methods ---
  function getAdminOverview() {
    const policy = readAgentPolicy(db);
    const connection = geminiProvider.getConnectionStatus({ preferredProvider: policy.defaultProvider });

    const byFeature = db.prepare(`
      SELECT
        feature,
        auth_mode,
        COUNT(*) AS calls,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(weighted_tokens), 0) AS weighted_tokens,
        COALESCE(SUM(quota_tokens_used), 0) AS quota_tokens_used,
        COALESCE(SUM(overage_tokens), 0) AS overage_tokens,
        COALESCE(SUM(charged_coins), 0) AS charged_coins
      FROM hub_agent_usage_logs
      WHERE status = 'SUCCEEDED'
      GROUP BY feature, auth_mode
      ORDER BY charged_coins DESC, total_tokens DESC
    `).all();

    const recentLogs = db.prepare(`
      SELECT *
      FROM hub_agent_usage_logs
      ORDER BY created_at DESC
      LIMIT 30
    `).all().map(r => ({
      id: r.id,
      principalId: r.principal_id,
      feature: r.feature,
      authMode: r.auth_mode,
      planTier: r.plan_tier,
      provider: r.provider,
      model: r.model,
      totalTokens: r.total_tokens,
      weightedTokens: r.weighted_tokens,
      quotaTokensUsed: r.quota_tokens_used,
      overageTokens: r.overage_tokens,
      chargedCoins: r.charged_coins,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString()
    }));

    return {
      ok: true,
      connection,
      policy,
      metricsByFeature: byFeature,
      recentLogs
    };
  }

  async function adminConnectOAuth({ openBrowser = true, actor = 'admin' } = {}) {
    const out = await geminiProvider.startOAuthConnect({ openBrowser });
    updateAgentPolicy(db, { defaultProvider: 'gemini-oauth' }, now);
    audit('hub_agent_oauth_connect_start', actor, {
      alreadyConnected: out.alreadyConnected,
      pending: out.pending
    });
    return {
      ...out,
      policy: readAgentPolicy(db)
    };
  }

  function adminConnectApiKey({ apiKey, defaultModel, actor = 'admin' }) {
    const status = geminiProvider.saveApiKey(apiKey);
    const patch = { defaultProvider: 'gemini-apikey' };
    if (defaultModel) patch.defaultModel = defaultModel;
    const policy = updateAgentPolicy(db, patch, now);
    audit('hub_agent_apikey_saved', actor, { maskedKey: status.apiKey.maskedKey, defaultModel: policy.defaultModel });
    return { status, policy };
  }

  function adminDisconnect({ target = 'all', actor = 'admin' } = {}) {
    const status = geminiProvider.disconnect({ target });
    audit('hub_agent_disconnected', actor, { target });
    return { status, policy: readAgentPolicy(db) };
  }

  function adminUpdatePolicy(patch, { actor = 'admin' } = {}) {
    const policy = updateAgentPolicy(db, patch, now);
    audit('hub_agent_policy_updated', actor, {
      defaultProvider: policy.defaultProvider,
      defaultModel: policy.defaultModel,
      tokensPerCoin: policy.tokensPerCoin,
      freeTrialTokens: policy.freeTrialTokens,
      proWeeklyTokens: policy.proWeeklyTokens
    });
    return {
      policy,
      connection: geminiProvider.getConnectionStatus({ preferredProvider: policy.defaultProvider })
    };
  }

  async function adminSmokeTest({ prompt = '한국어로 짧게 연결 정상이라고 답해주세요.', model = '' } = {}) {
    const policy = readAgentPolicy(db);
    const out = await geminiProvider.generate({
      preferredProvider: policy.defaultProvider,
      defaultModel: policy.defaultModel,
      model: model || policy.defaultModel,
      messages: [{ role: 'user', content: String(prompt).slice(0, 500) }],
      maxOutputTokens: 256
    });
    return {
      ok: true,
      provider: out.provider,
      model: out.model,
      reply: out.content,
      usage: out.usage
    };
  }

  return {
    getPublicStatus,
    getUserUsageLogs,
    getGlbAsset,
    chat,
    generate3dModel,
    portProject,
    getAdminOverview,
    adminConnectOAuth,
    adminConnectApiKey,
    adminDisconnect,
    adminUpdatePolicy,
    adminSmokeTest,
    close: () => geminiProvider.close()
  };
}
