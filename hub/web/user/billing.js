// Hub-Billing Web Portal Controller (M1 + M2)
// Views:
// - /?view=billing : PlayCoin +25% Web/PC Shop, Free vs Pro Subscription, 0% Creator Direct Policy
// - /?view=redeem  : Gift Card 16-char PIN Preview & Atomic Redemption (+25% Direct / +20% Retail)
// - /?view=wallet  : 3-Bucket PlayCoin Wallet, UsageMetering & Holds, 7-day Withdrawal, Ledger & Entitlements

(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const uuid = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  const uiState = {
    currency: 'KRW',
    channel: 'web_browser',
    paymentMethod: 'kakaopay',
    catalog: null,
    walletData: null,
    ledgerData: null,
    pendingCheckout: null,
    callbackBanner: null,
    busy: false
  };

  const ALLOWED_SDK_URLS = new Set([
    'https://js.tosspayments.com/v2/standard',
    'https://nsp.pay.naver.com/sdk/js/naverpay.min.js'
  ]);
  const loadedSdkScripts = new Map();
  const processedCallbackKeys = new Set();

  function loadExternalSdk(src) {
    if (!ALLOWED_SDK_URLS.has(src)) {
      return Promise.reject(new Error('허용되지 않은 외부 결제 SDK 주소입니다.'));
    }
    if (loadedSdkScripts.has(src)) return loadedSdkScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing && existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      const script = existing || document.createElement('script');
      const timer = setTimeout(() => reject(new Error('결제 SDK 로딩 시간이 초과되었습니다.')), 10000);
      script.onload = () => {
        clearTimeout(timer);
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        loadedSdkScripts.delete(src);
        reject(new Error('결제 SDK를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.'));
      };
      if (!existing) {
        script.src = src;
        script.async = true;
        document.head.append(script);
      }
    });
    loadedSdkScripts.set(src, promise);
    return promise;
  }

  function isMobileViewportOrUa() {
    return (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches)
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  const isDevDemoUiOn = () => window.PlayHubDevDemoUI?.isEnabled?.() === true;

  function dispatchBillingError(error, { toast, inlineEl = null, fatalRoot = null, fallback = '요청 처리 중 오류가 발생했습니다.', fatalTitle = '결제 서비스를 계속할 수 없습니다' } = {}) {
    if (window.PlayHubErrorUI?.report) {
      return window.PlayHubErrorUI.report(error, { inlineEl, fatalRoot, fallback, fatalTitle });
    }
    const msg = error?.message || fallback;
    if (inlineEl && (error?.status === 400 || error?.status === 422)) {
      inlineEl.textContent = msg;
      inlineEl.hidden = false;
      return 'inline';
    }
    toast?.(msg, { type: 'error' });
    return 'toast';
  }

  function easyPayBrandMeta(methodOrProvider) {
    const key = String(methodOrProvider || '').toLowerCase();
    if (key === 'kakaopay') return { key: 'kakaopay', label: '카카오페이', short: 'pay', badgeClass: 'brand-kakaopay' };
    if (key === 'naverpay') return { key: 'naverpay', label: '네이버페이', short: 'N', badgeClass: 'brand-naverpay' };
    if (key === 'tosspay') return { key: 'tosspay', label: '토스페이', short: 'toss', badgeClass: 'brand-tosspay' };
    if (key === 'toss') return { key: 'toss', label: '토스페이먼츠', short: 'toss', badgeClass: 'brand-tosspay' };
    if (key === 'card_kr') return { key: 'card_kr', label: '국내 신용/체크카드', short: 'CARD', badgeClass: 'brand-card' };
    if (key === 'google_pay') return { key: 'google_pay', label: 'Google Pay (0% 수수료)', short: 'GPay', badgeClass: 'brand-gpay' };
    return { key: key || 'card', label: methodOrProvider || '결제', short: 'PAY', badgeClass: 'brand-card' };
  }

  function integrationBadgeText(meta) {
    if (!meta) return '연동 준비';
    if (meta.integrationType === 'direct_api') return meta.mode === 'live' ? '직가맹 라이브' : '직가맹 테스트';
    if (meta.integrationType === 'toss_v2_direct') return meta.mode === 'live' ? '토스 Direct 라이브' : '토스 Direct 테스트';
    if (meta.integrationType === 'sandbox_simulation') return '샌드박스 시뮬레이션';
    if (meta.integrationType === 'pg_hosted') return `${String(meta.provider || 'PG').toUpperCase()} 연동`;
    return '미설정';
  }

  async function launchProviderCheckout(checkout) {
    if (!checkout) return false;
    if (checkout.checkoutType === 'toss_v2_sdk') {
      await loadExternalSdk(checkout.sdkUrl || 'https://js.tosspayments.com/v2/standard');
      if (typeof window.TossPayments !== 'function') {
        throw new Error('토스페이먼츠 SDK v2 초기화에 실패했습니다.');
      }
      const tossPayments = window.TossPayments(checkout.clientKey);
      const payment = tossPayments.payment({ customerKey: checkout.customerKey });
      await payment.requestPayment(checkout.sdkRequestParams || {
        method: checkout.method || 'CARD',
        amount: { currency: checkout.currency || 'KRW', value: checkout.amount },
        orderId: checkout.orderId,
        orderName: checkout.orderName,
        customerName: checkout.customerName,
        successUrl: checkout.successUrl,
        failUrl: checkout.failUrl,
        ...(checkout.easyPayProvider ? { card: { flowMode: 'DIRECT', easyPay: checkout.easyPayProvider } } : {})
      });
      return true;
    }

    if (checkout.checkoutType === 'naverpay_sdk') {
      await loadExternalSdk(checkout.sdkUrl || 'https://nsp.pay.naver.com/sdk/js/naverpay.min.js');
      if (!window.Naver?.Pay?.create) {
        throw new Error('네이버페이 결제 SDK 초기화에 실패했습니다.');
      }
      const oPay = window.Naver.Pay.create({
        mode: checkout.sdkMode || 'development',
        clientId: checkout.clientId,
        ...(checkout.chainId ? { chainId: checkout.chainId } : {})
      });
      oPay.open({
        merchantPayKey: checkout.merchantPayKey,
        merchantUserKey: checkout.merchantUserKey,
        productName: checkout.productName,
        productCount: checkout.productCount || 1,
        totalPayAmount: checkout.totalPayAmount,
        taxScopeAmount: checkout.taxScopeAmount,
        taxExScopeAmount: checkout.taxExScopeAmount ?? 0,
        returnUrl: checkout.returnUrl,
        productItems: checkout.productItems
      });
      return true;
    }

    if (checkout.mode !== 'mock' && checkout.checkoutUrl) {
      const targetRaw = (checkout.provider === 'kakaopay' && isMobileViewportOrUa() && checkout.mobileCheckoutUrl)
        ? checkout.mobileCheckoutUrl
        : checkout.checkoutUrl;
      const targetUrl = new URL(targetRaw, location.href);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        throw new Error('유효하지 않은 외부 결제 이동 주소입니다.');
      }
      location.href = targetUrl.toString();
      return true;
    }

    return false;
  }

  async function processPaymentReturnCallback({ api, toast, activeView }) {
    const params = new URLSearchParams(location.search);
    const tossStatus = params.get('tossStatus');
    const payProvider = (params.get('payProvider') || (tossStatus ? 'toss' : '')).toLowerCase();
    if (!payProvider) return null;

    const orderId = params.get('orderId') || '';
    const payStatus = (params.get('payStatus') || '').toLowerCase();
    const payMethod = (params.get('payMethod') || payProvider).toLowerCase();
    const resultCode = params.get('resultCode') || '';
    const paymentKey = params.get('paymentKey') || '';
    const paymentId = params.get('paymentId') || '';
    const pgToken = params.get('pg_token') || '';
    const providerPaymentId = params.get('providerPaymentId') || paymentKey || paymentId || '';
    const amountRaw = params.get('amount');
    const failCode = params.get('code') || '';
    const failMessage = params.get('message') || params.get('resultMessage') || '';

    const dedupKey = `${payProvider}:${orderId}:${tossStatus || payStatus || resultCode}:${providerPaymentId || pgToken}`;
    // Scrub callback secrets/tokens from the address bar immediately.
    try {
      history.replaceState(null, '', `/?view=${encodeURIComponent(activeView || 'wallet')}`);
    } catch {}

    if (processedCallbackKeys.has(dedupKey)) return uiState.callbackBanner;
    processedCallbackKeys.add(dedupKey);

    const brand = easyPayBrandMeta(payMethod).label;

    // 1. Handle user cancellations or PG failures cleanly without crediting coins
    if (
      tossStatus === 'fail' ||
      payStatus === 'cancel' ||
      payStatus === 'fail' ||
      (payProvider === 'naverpay' && resultCode && resultCode !== 'Success')
    ) {
      const isCancel = payStatus === 'cancel' || resultCode === 'UserCancel' || failCode === 'PAY_PROCESS_CANCELED';
      const msg = isCancel
        ? `${brand} 결제가 취소되었습니다. 청구된 금액은 없습니다.`
        : `${brand} 결제 승인에 실패했습니다.${failMessage ? ` (${failMessage})` : ''}`;
      uiState.callbackBanner = { kind: isCancel ? 'cancel' : 'error', title: isCancel ? '결제 취소됨' : '결제 실패', message: msg };
      toast(msg);
      return uiState.callbackBanner;
    }

    // 2. Confirm approved callback server-to-server (Zero Client Trust)
    const isSuccess =
      (payProvider === 'toss' && tossStatus === 'success' && orderId && paymentKey) ||
      (payProvider === 'kakaopay' && payStatus === 'success' && orderId && pgToken) ||
      (payProvider === 'naverpay' && resultCode === 'Success' && orderId && paymentId) ||
      (payProvider === 'tosspay' && payStatus === 'success' && orderId) ||
      (payProvider === 'mock' && payStatus === 'success' && orderId && providerPaymentId);

    if (!isSuccess) return null;

    try {
      const body = {
        ...(providerPaymentId ? { providerPaymentId } : {}),
        ...(pgToken ? { pgToken } : {}),
        ...(amountRaw && Number.isFinite(Number(amountRaw)) ? { amountMinor: Number(amountRaw) } : {})
      };
      const confirmed = await api(`/api/billing/orders/${encodeURIComponent(orderId)}/confirm`, {
        method: 'POST',
        body,
        timeout: 12000
      });
      const ord = confirmed?.order;
      const totalCoins = ord ? formatCoins(ord.totalCoins) : 'PlayCoin';
      const bonusNote = ord?.bonusCoins ? ` (웹·PC 보너스 +${ord.bonusCoins.toLocaleString('ko-KR')})` : '';
      const msg = confirmed?.pendingWebhook
        ? `${brand} 결제 확인이 접수되었습니다. PG 웹훅 최종 확정 후 지갑에 자동 반영됩니다.`
        : `${brand} 결제가 완료되어 🪙 ${totalCoins}${bonusNote}이(가) Zero-Sum 원장에 지급되었습니다!`;
      uiState.callbackBanner = { kind: 'success', title: `${brand} 결제 승인 완료`, message: msg };
      toast(msg);
      return uiState.callbackBanner;
    } catch (error) {
      const msg = `${brand} 서버 승인 검증 실패: ${error.message || '결제 상태를 확인해 주세요.'}`;
      uiState.callbackBanner = { kind: 'error', title: '서버 승인 실패', message: msg };
      toast(msg);
      return uiState.callbackBanner;
    }
  }

  function callbackBannerHtml() {
    const b = uiState.callbackBanner;
    if (!b) return '';
    return `<section class="easypay-callback-banner ${esc(b.kind)}" role="status">
      <div>
        <strong>${esc(b.title)}</strong>
        <p>${esc(b.message)}</p>
      </div>
      <button type="button" class="icon-button" data-dismiss-callback-banner aria-label="알림 닫기">×</button>
    </section>`;
  }

  function formatMoney(amountMinor, currency) {
    const curr = String(currency || 'KRW').toUpperCase();
    if (curr === 'KRW') return `₩${Number(amountMinor || 0).toLocaleString('ko-KR')}`;
    if (curr === 'USD') return `USD ${(Number(amountMinor || 0) / 100).toFixed(2)}`;
    return `${curr} ${Number(amountMinor || 0).toLocaleString()}`;
  }

  function formatCoins(coins) {
    return `${Number(coins || 0).toLocaleString('ko-KR')} PlayCoin`;
  }

  function formatBytes(bytes) {
    const num = Number(bytes || 0);
    if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(0)} GB`;
    return `${Math.round(num / (1024 * 1024))} MB`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR');
  }

  function orderStateLabel(state) {
    return {
      CREATED: '결제 대기',
      PENDING: '처리 중',
      PAID: '결제 완료',
      REFUNDED: '청약철회/환불',
      CHARGEBACK: '차지백(동결)',
      FAILED: '결제 실패',
      CANCELLED: '취소됨'
    }[state] || state;
  }

  function eventLabel(eventType) {
    return {
      topup: 'PlayCoin 충전 (유상/보너스)',
      giftcard_redeem: '기프트카드 등록',
      promo_grant: '프로모션 지급',
      spend: '1P 사용량/서비스 소비',
      settle: '예약 정산 차감',
      refund_clawback: '청약철회 회수',
      chargeback_clawback: '차지백 회수',
      expire: '프로모션 만료'
    }[eventType] || eventType;
  }

  function metricLabel(metricType) {
    return {
      storage_bytes: '제작공간 저장량',
      deploy_bytes: '웹 배포 용량',
      server_minutes: '멀티플레이 서버',
      egress_bytes: '전송 트래픽',
      ai_units: 'AI 어시스턴트'
    }[metricType] || metricType;
  }

  function formatMetricQuantity(metricType, quantity) {
    const num = Number(quantity || 0);
    if (metricType === 'storage_bytes' || metricType === 'deploy_bytes' || metricType === 'egress_bytes') {
      if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
      return `${Math.round(num / 1024)} KB`;
    }
    if (metricType === 'server_minutes') return `${num.toLocaleString('ko-KR')}분`;
    if (metricType === 'ai_units') return `${num.toLocaleString('ko-KR')} 유닛`;
    return num.toLocaleString('ko-KR');
  }

  function formatPinInput(raw) {
    const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    return clean.replace(/(.{4})(?=.)/g, '$1-');
  }

  function giftcardErrorText(error) {
    const code = error?.code || '';
    if (code === 'GIFTCARD_BRUTEFORCE_LOCKED') {
      const mins = Math.max(1, Math.ceil(Number(error?.details?.error?.retryAfterSec || 900) / 60));
      return `잘못된 PIN 입력 횟수를 초과해 보안상 약 ${mins}분간 일시 잠금되었습니다. 잠시 후 다시 시도해 주세요.`;
    }
    if (code === 'GIFTCARD_ALREADY_REDEEMED') return '이미 사용(등록)이 완료된 기프트카드입니다.';
    if (code === 'GIFTCARD_EXPIRED') return '유효기간이 만료된 기프트카드입니다.';
    if (code === 'GIFTCARD_PIN_INVALID') return '16자리 영문 대문자·숫자 PIN 형식을 확인해 주세요. (예: A7K9-M3P2-X8W4-N6Q5)';
    if (code === 'GIFTCARD_INVALID_OR_UNAVAILABLE') return '유효하지 않거나 아직 활성화되지 않은 기프트카드 PIN입니다.';
    return error?.message || '기프트카드 처리 중 오류가 발생했습니다.';
  }

  function billingSubnavHtml(activeView) {
    return `<nav class="billing-subnav" aria-label="PlayCoin 과금 메뉴">
      <a href="/?view=billing" data-route ${activeView === 'billing' ? 'aria-current="page"' : ''}>🪙 PlayCoin 충전 · Pro</a>
      <a href="/?view=redeem" data-route ${activeView === 'redeem' ? 'aria-current="page"' : ''}>🎁 기프트카드 등록 (+25%)</a>
      <a href="/?view=wallet" data-route ${activeView === 'wallet' ? 'aria-current="page"' : ''}>💼 내 지갑 · 사용량 · 청약철회</a>
      <a href="/?view=direct" data-route ${activeView === 'direct' ? 'aria-current="page"' : ''}>🏪 창작자 직접판매 (0%)</a>
    </nav>`;
  }

  function updateHeaderPill(walletData) {
    const pill = document.getElementById('billing-balance-pill');
    const valueEl = document.getElementById('billing-balance-value');
    if (!pill || !valueEl) return;
    if (walletData && walletData.authenticated && walletData.wallet) {
      valueEl.textContent = Number(walletData.wallet.available || 0).toLocaleString('ko-KR');
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  }

  async function refreshHeaderBalance(api) {
    try {
      const data = await api('/api/billing/wallet', { timeout: 4000 });
      uiState.walletData = data;
      updateHeaderPill(data);
      return data;
    } catch {
      updateHeaderPill(null);
      return null;
    }
  }

  function ensureCheckoutDialog() {
    let dialog = document.getElementById('billing-checkout-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'billing-checkout-dialog';
    dialog.className = 'billing-dialog';
    dialog.setAttribute('aria-labelledby', 'billing-checkout-title');
    document.body.append(dialog);
    return dialog;
  }

  function openCheckoutDialog({ item, catalog, api, toast, authed: initialAuthed = true, refreshSession, onComplete }) {
    const dialog = ensureCheckoutDialog();
    const isMock = catalog.billingMode === 'mock';
    const isUnavailable = catalog.billingMode === 'unavailable' || !Array.isArray(catalog.enabledProviders) || catalog.enabledProviders.length === 0;
    const koreaEasyPay = catalog.paymentMethods?.koreaEasyPay || {};
    let isAuthed = Boolean(initialAuthed);
    let selectedMethod = uiState.currency === 'KRW' ? 'kakaopay' : 'google_pay';
    let createdOrder = null;

    const methodOptions = uiState.currency === 'KRW'
      ? [
          { id: 'kakaopay', label: '카카오페이', meta: koreaEasyPay.kakaopay },
          { id: 'naverpay', label: '네이버페이', meta: koreaEasyPay.naverpay },
          { id: 'tosspay', label: '토스페이', meta: koreaEasyPay.tosspay },
          { id: 'card_kr', label: '국내 신용/체크카드', meta: koreaEasyPay.card_kr }
        ]
      : [
          { id: 'google_pay', label: 'Google Pay (0% 수수료)' },
          { id: 'card_global', label: 'Visa / Mastercard' },
          { id: 'apple_pay', label: 'Apple Pay' },
          { id: 'paypal', label: 'PayPal' }
        ];

    function renderDialog() {
      const demoUi = isDevDemoUiOn();
      const showDemoAccount = Boolean(catalog.allowDemoAccount) && demoUi;
      const showSandboxUi = isMock && demoUi;
      const pgUnavailable = (isUnavailable || isMock) && !showSandboxUi;
      const selectedBrand = easyPayBrandMeta(selectedMethod);
      const selectedMeta = koreaEasyPay[selectedMethod] || null;
      const submitCtaLabel = showSandboxUi
        ? `${selectedBrand.label} 샌드박스 결제 열기`
        : `${selectedBrand.label}로 결제 진행`;

      dialog.innerHTML = `
        <div class="dialog-heading">
          <h2 id="billing-checkout-title">PlayCoin 충전 확인</h2>
          <button class="icon-button" type="button" data-billing-close aria-label="닫기">×</button>
        </div>
        ${showSandboxUi ? '<p class="billing-badge sandbox" data-dev-demo-ui style="margin:6px 0 0;color:#854d0e;background:#fef9c3;border-color:#fde047;">샌드박스 모드 · 카카오페이·네이버페이·토스페이 공식 리다이렉트·승인 흐름 시뮬레이션 (실청구 없음)</p>' : ''}
        <div class="checkout-summary">
          <div class="checkout-summary-line"><span>결제 금액</span><strong>${esc(formatMoney(item.amountMinor, item.currency))}</strong></div>
          <div class="checkout-summary-line"><span>유상 기본 (paid)</span><span>${esc(formatCoins(item.baseCoins))}</span></div>
          <div class="checkout-summary-line"><span>웹·PC 보너스 (+${esc(item.bonusPercent)}%, bonus)</span><strong style="color:#2c6e3b;">+${esc(formatCoins(item.bonusCoins))}</strong></div>
          <div class="checkout-summary-line total"><span>총 지급량</span><span>🪙 ${esc(formatCoins(item.totalCoins))}</span></div>
        </div>
        ${!isAuthed ? `
          <p class="checkout-notice"><strong>로그인이 필요합니다</strong> — PlayCoin은 등록 계정에 안전하게 보호됩니다. 로그인 후 바로 결제를 계속할 수 있습니다.</p>
          <div id="billing-checkout-error" class="inline-error" role="alert" hidden></div>
          <div class="dialog-actions" style="flex-wrap:wrap;">
            <button type="button" class="button secondary" data-billing-close>취소</button>
            <a class="button primary" href="/?view=account" data-route data-billing-close>계정 로그인 화면</a>
            ${showDemoAccount ? '<button type="button" class="button secondary" id="billing-dialog-demo-signin" data-dev-demo-ui>🧪 데모 계정으로 로그인 후 충전 계속</button>' : ''}
          </div>
        ` : !createdOrder ? `
          <p class="checkout-notice" style="margin-bottom:4px;"><strong>결제 수단 선택</strong> ${uiState.currency === 'KRW' ? '(한국 KRW · 카카오페이·네이버페이·토스페이 직가맹 / 토스페이먼츠 Direct 자동 라우팅)' : '(글로벌 · Google Pay Instant Flow 지원)'}</p>
          <div class="checkout-methods">
            ${methodOptions.map(m => {
              const b = easyPayBrandMeta(m.id);
              const routeNote = m.meta ? integrationBadgeText(m.meta) : '';
              return `<button type="button" class="checkout-method-btn easypay-method-btn ${esc(b.badgeClass)}" data-pay-method="${esc(m.id)}" aria-pressed="${String(selectedMethod === m.id)}">
                <span class="easypay-method-top">
                  <span class="easypay-brand-chip ${esc(b.badgeClass)}">${esc(b.short)}</span>
                  <span class="easypay-method-label">${esc(m.label)}</span>
                </span>
                ${routeNote && showSandboxUi ? `<span class="easypay-method-sub">${esc(routeNote)}</span>` : (!isMock && routeNote ? `<span class="easypay-method-sub">${esc(routeNote)}</span>` : '')}
              </button>`;
            }).join('')}
          </div>
          ${selectedMeta && !pgUnavailable ? `<p class="checkout-notice" style="margin-top:0;">라우팅 경로: <strong>${esc(integrationBadgeText(selectedMeta))}</strong>${selectedMeta.failoverChain?.length > 1 ? ` · 장애 시 자동 폴백(${esc(selectedMeta.failoverChain.join(' → '))})` : ''}</p>` : ''}
          ${pgUnavailable ? '<p class="checkout-notice">실제 결제 PG 연결 전입니다. 결제가 준비되면 바로 충전할 수 있습니다.</p>' : ''}
          <label class="check-row" style="font-size:13px;margin:8px 0;">
            <input type="checkbox" id="billing-agree-terms">
            <span>유상 원금(${esc(item.baseCoins)})과 채널 보너스(+${esc(item.bonusCoins)}) 구분을 확인했으며, <strong>결제 후 7일 이내 미사용 시 전액 청약철회 가능(원금 또는 보너스 1 PlayCoin 이상 사용 시 청약철회 제한)</strong> 및 미성년자 법정대리인 동의 안내에 동의합니다.</span>
          </label>
          <div id="billing-checkout-error" class="inline-error" role="alert" hidden></div>
          <div class="dialog-actions">
            <button type="button" class="button secondary" data-billing-close>취소</button>
            <button type="button" class="button primary" id="billing-create-order" disabled>${esc(pgUnavailable ? '결제 준비 중' : submitCtaLabel)}</button>
          </div>
        ` : `
          <div class="easypay-sandbox-sheet ${esc(selectedBrand.badgeClass)}">
            <div class="easypay-sandbox-header">
              <span class="easypay-brand-chip ${esc(selectedBrand.badgeClass)}">${esc(selectedBrand.short)}</span>
              <div>
                <strong>${esc(createdOrder.checkout.easyPayBrand || selectedBrand.label)} 결제창 시뮬레이션</strong>
                <p class="muted" style="margin:2px 0 0;font-size:12px;">${esc(createdOrder.checkout.simulatedProtocol || 'Sandbox Checkout')}</p>
              </div>
            </div>
            <div class="checkout-summary" style="margin:10px 0 0;background:#ffffff;">
              <div class="checkout-summary-line"><span>주문 번호</span><code>${esc(createdOrder.order.id.slice(0, 12))}…</code></div>
              <div class="checkout-summary-line"><span>라우팅 PG</span><strong>${esc(createdOrder.route.provider.toUpperCase())} (${esc(createdOrder.checkout.mode)})</strong></div>
              <div class="checkout-summary-line"><span>발급 토큰 (${esc(createdOrder.checkout.simulatedTokenLabel || 'token')})</span><code>${esc(createdOrder.checkout.simulatedTokenValue || createdOrder.checkout.providerPaymentId)}</code></div>
              <div class="checkout-summary-line"><span>상태</span><span>사용자 인증 대기 (실청구 없음)</span></div>
            </div>
          </div>
          <p class="checkout-notice">실제 가맹점 키 설정 시 위 단계에서 ${esc(selectedBrand.label)} 결제창/SDK가 즉시 열립니다. 샌드박스에서는 콜백 리다이렉트 승인 또는 즉시 원장 반영을 모두 검증할 수 있습니다.</p>
          <div id="billing-checkout-error" class="inline-error" role="alert" hidden></div>
          <div class="dialog-actions" style="flex-wrap:wrap;">
            <button type="button" class="button secondary" id="billing-cancel-mock">결제 취소 시뮬레이션</button>
            <button type="button" class="button secondary" id="billing-confirm-mock">즉시 승인</button>
            <button type="button" class="button primary" id="billing-redirect-mock">${esc(selectedBrand.label)} 승인 후 콜백 복귀 →</button>
          </div>
        `}
      `;

      dialog.querySelectorAll('[data-billing-close]').forEach(btn => {
        btn.onclick = () => dialog.close();
      });

      if (!isAuthed) {
        const demoSignBtn = dialog.querySelector('#billing-dialog-demo-signin');
        if (demoSignBtn) {
          demoSignBtn.onclick = async () => {
            const errEl = dialog.querySelector('#billing-checkout-error');
            if (errEl) errEl.hidden = true;
            demoSignBtn.disabled = true;
            demoSignBtn.textContent = '데모 계정 연결 중…';
            try {
              await api('/api/billing/demo-signin', { method: 'POST', body: {} });
              if (typeof refreshSession === 'function') await refreshSession();
              isAuthed = true;
              toast('🧪 PlayHub 데모 계정으로 로그인했습니다. 결제 수단을 선택하세요.');
              renderDialog();
            } catch (error) {
              const msg = error.message || '데모 로그인에 실패했습니다.';
              toast(msg, { type: 'error' });
              if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
              demoSignBtn.disabled = false;
              demoSignBtn.textContent = '🧪 데모 계정으로 로그인 후 충전 계속';
            }
          };
        }
        return;
      }

      if (!createdOrder) {
        const agree = dialog.querySelector('#billing-agree-terms');
        const submitBtn = dialog.querySelector('#billing-create-order');
        dialog.querySelectorAll('[data-pay-method]').forEach(btn => {
          btn.onclick = () => {
            const wasChecked = agree.checked;
            selectedMethod = btn.dataset.payMethod;
            renderDialog();
            const nextAgree = dialog.querySelector('#billing-agree-terms');
            const nextSubmit = dialog.querySelector('#billing-create-order');
            if (nextAgree && nextSubmit) {
              nextAgree.checked = wasChecked;
              nextSubmit.disabled = pgUnavailable || !wasChecked;
            }
          };
        });
        agree.onchange = () => { submitBtn.disabled = pgUnavailable || !agree.checked; };
        submitBtn.onclick = async () => {
          const errEl = dialog.querySelector('#billing-checkout-error');
          errEl.hidden = true;
          submitBtn.disabled = true;
          submitBtn.textContent = '결제 세션 생성 중…';
          try {
            const res = await api('/api/billing/orders', {
              method: 'POST',
              headers: { 'Idempotency-Key': `web-ord-${uuid()}` },
              body: {
                skuId: item.skuId,
                currency: item.currency,
                channelHint: uiState.channel,
                paymentMethodHint: selectedMethod,
                agreedTermsVersion: 'v2.0-2026-11-21',
                returnUrl: '/?view=wallet'
              },
              timeout: 10000
            });
            const launched = await launchProviderCheckout(res.checkout);
            if (launched) {
              dialog.close();
              return;
            }
            createdOrder = res;
            renderDialog();
          } catch (error) {
            dispatchBillingError(error, { toast, inlineEl: errEl, fallback: '주문을 생성하지 못했습니다.' });
            submitBtn.disabled = !agree.checked;
            submitBtn.textContent = submitCtaLabel;
          }
        };
      } else {
        const redirectBtn = dialog.querySelector('#billing-redirect-mock');
        const cancelBtn = dialog.querySelector('#billing-cancel-mock');
        const confirmBtn = dialog.querySelector('#billing-confirm-mock');

        if (redirectBtn) {
          redirectBtn.onclick = () => {
            const target = createdOrder.checkout?.successCallbackUrl || '/?view=wallet';
            dialog.close();
            location.href = target;
          };
        }
        if (cancelBtn) {
          cancelBtn.onclick = () => {
            const target = createdOrder.checkout?.cancelCallbackUrl || '/?view=wallet&payProvider=mock&payStatus=cancel';
            dialog.close();
            location.href = target;
          };
        }
        confirmBtn.onclick = async () => {
          const errEl = dialog.querySelector('#billing-checkout-error');
          errEl.hidden = true;
          confirmBtn.disabled = true;
          confirmBtn.textContent = '원장 반영 중…';
          try {
            const confirmed = await api(`/api/billing/orders/${encodeURIComponent(createdOrder.order.id)}/confirm`, {
              method: 'POST',
              body: {
                providerPaymentId: createdOrder.checkout.providerPaymentId,
                amountMinor: createdOrder.order.amountMinor
              },
              timeout: 10000
            });
            dialog.close();
            toast(`🪙 ${formatCoins(createdOrder.order.totalCoins)} 지급 완료! (${selectedBrand.label} · 보너스 +${createdOrder.order.bonusCoins})`);
            await onComplete(confirmed);
          } catch (error) {
            dispatchBillingError(error, { toast, inlineEl: errEl, fallback: '결제 확인에 실패했습니다.' });
            confirmBtn.disabled = false;
            confirmBtn.textContent = '즉시 승인';
          }
        };
      }
    }

    renderDialog();
    if (!dialog.open) dialog.showModal();
  }

  async function mountShop(root, { api, toast, navigate, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>PlayCoin 상점을 불러오고 있습니다</h1></section></div>`;

    await processPaymentReturnCallback({ api, toast, activeView: 'billing' });

    async function loadAndRender() {
      let catalog, walletData;
      try {
        [catalog, walletData] = await Promise.all([
          api(`/api/billing/catalog?currency=${encodeURIComponent(uiState.currency)}&channel=${encodeURIComponent(uiState.channel)}`, { timeout: 6000 }),
          api('/api/billing/wallet', { timeout: 6000 })
        ]);
      } catch (error) {
        const msg = error.message || '서버에서 과금 모듈이 비활성 상태입니다.';
        toast(msg, { type: 'error' });
        root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>PlayCoin 충전 기능을 불러오지 못했습니다</h1><p class="muted">${esc(msg)}</p><div class="save-actions"><button type="button" class="button primary small" id="billing-retry-load">다시 시도</button><a class="button secondary small" href="/" data-route>홈으로</a></div></section></div>`;
        const retryBtn = root.querySelector('#billing-retry-load');
        if (retryBtn) retryBtn.onclick = () => void loadAndRender();
        return;
      }

      uiState.catalog = catalog;
      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      const authed = Boolean(walletData?.authenticated);
      const isPro = walletData?.subscription?.effectivePlan === 'pro';
      const isMock = catalog.billingMode === 'mock';
      const demoUi = isDevDemoUiOn();
      const showDemoAccount = Boolean(catalog.allowDemoAccount) && demoUi;
      const showSandboxUi = isMock && demoUi;
      const stageBadge = {
        stage1: 'Stage 1 · Xsolla MoR (글로벌 + 한국 간편결제)',
        stage2: 'Stage 2 · KRW Toss + 글로벌 Xsolla (자동 폴백)',
        stage3: 'Stage 3 · Toss + Stripe Google Pay (0%) + Xsolla',
        mock: showSandboxUi ? '🧪 샌드박스 Mock PG 활성 (실청구 없음)' : '',
        unavailable: '결제 PG 연동 준비 중'
      }[catalog.routingStage || (isMock ? 'mock' : 'stage1')] || '';

      root.innerHTML = `<div class="page billing-page">
        ${billingSubnavHtml('billing')}
        ${callbackBannerHtml()}
        <section class="billing-hero">
          <div class="billing-hero-top">
            <div>
              <p class="billing-eyebrow">⚡ ROBLOX-STYLE DIRECT BONUS · 최대 +25%</p>
              <h1>웹 · PC 구매 시 최대 +25% 추가 PlayCoin</h1>
              <p class="billing-hero-sub">앱 마켓 수수료 절감분을 이용자와 창작자에게 그대로 돌려드립니다. <code>1 PlayCoin = ₩14 (USD 0.01)</code> 고정 단가로 호스팅 서버 · 저장공간 · AI 초과 사용량에 통합 사용할 수 있습니다.</p>
            </div>
            <div class="billing-controls">
              <div class="billing-segmented" role="group" aria-label="통화 선택">
                <button type="button" data-currency="KRW" aria-pressed="${String(uiState.currency === 'KRW')}">KRW (₩)</button>
                <button type="button" data-currency="USD" aria-pressed="${String(uiState.currency === 'USD')}">USD ($)</button>
              </div>
              <div class="billing-segmented" role="group" aria-label="채널 선택">
                <button type="button" data-channel="web_browser" aria-pressed="${String(uiState.channel === 'web_browser')}">웹 브라우저</button>
                <button type="button" data-channel="pc_desktop" aria-pressed="${String(uiState.channel === 'pc_desktop')}">PC / Forge</button>
              </div>
            </div>
          </div>
          <div class="billing-badges">
            <span class="billing-badge easypay-hero-pill brand-kakaopay">카카오페이 · ${esc(integrationBadgeText(catalog.paymentMethods?.koreaEasyPay?.kakaopay))}</span>
            <span class="billing-badge easypay-hero-pill brand-naverpay">네이버페이 · ${esc(integrationBadgeText(catalog.paymentMethods?.koreaEasyPay?.naverpay))}</span>
            <span class="billing-badge easypay-hero-pill brand-tosspay">토스페이 · ${esc(integrationBadgeText(catalog.paymentMethods?.koreaEasyPay?.tosspay))}</span>
            <span class="billing-badge">💳 Google Pay Web (글로벌 0%)</span>
            <a class="billing-badge" href="/?view=redeem" data-route style="text-decoration:none;color:inherit;">🎁 기프트카드 +25% →</a>
            ${stageBadge ? `<span class="billing-badge${isMock ? ' sandbox' : ''}">${esc(stageBadge)}</span>` : ''}
          </div>
        </section>

        <section class="billing-account-bar" aria-label="내 계정 및 지갑 요약">
          <div class="billing-account-bar-info">
            ${authed
              ? `<strong>${esc(walletData.displayName || '등록 계정')}</strong>
                 <span>가용 잔액 <strong>🪙 ${esc(formatCoins(walletData.wallet.available))}</strong> (유상 ${esc(walletData.wallet.paid.toLocaleString())} + 보너스 ${esc(walletData.wallet.bonus.toLocaleString())})</span>
                 <span class="status-chip ${isPro ? 'active' : 'created'}">${isPro ? 'PRO 구독 중' : 'FREE 플랜'}</span>`
              : `<strong>PlayCoin 구매·보호를 위해 로그인해 주세요</strong>
                 <span class="muted">게스트 상태는 기기 초기화 시 유상 재화 유실 위험이 있어 구매가 제한됩니다.</span>`
            }
          </div>
          <div class="billing-account-bar-actions">
            ${authed
              ? `<a class="button secondary small" href="/?view=wallet" data-route>내 지갑 · 청약철회 →</a>`
              : `${showDemoAccount ? '<button type="button" class="button primary small" id="billing-demo-signin" data-dev-demo-ui>🧪 데모 계정으로 바로 체험</button>' : ''}
                 <button type="button" class="button secondary small" data-google-login hidden>Google로 로그인</button>
                 <a class="button secondary small" href="/?view=account" data-route>계정 화면</a>`
            }
          </div>
        </section>

        <section aria-labelledby="sku-grid-heading">
          <div class="section-heading">
            <h2 id="sku-grid-heading">PlayCoin 충전 패키지 (${esc(uiState.currency)})</h2>
            <span class="muted">모바일 인앱 기본가 대비 최대 +25% 상시 추가 지급</span>
          </div>
          <div class="billing-grid">
            ${catalog.items.map(item => {
              const featured = item.skuId === 'playhub.coin.t4';
              return `<article class="sku-card${featured ? ' featured' : ''}" data-sku-card="${esc(item.skuId)}">
                ${featured ? '<span class="sku-ribbon">인기 · +25% 시작</span>' : ''}
                <div>
                  <span class="sku-bonus-pill">+${esc(item.bonusPercent)}% 웹·PC 보너스</span>
                  <div class="sku-total">🪙 ${esc(item.totalCoins.toLocaleString('ko-KR'))}</div>
                  <p class="sku-breakdown">기본 ${esc(item.baseCoins.toLocaleString('ko-KR'))} + <strong>보너스 ${esc(item.bonusCoins.toLocaleString('ko-KR'))} PlayCoin</strong></p>
                </div>
                <div class="sku-price-row">
                  <div>
                    <div class="sku-price">${esc(formatMoney(item.amountMinor, item.currency))}</div>
                    <div class="sku-unit-note">모바일 기준 ${esc(item.mobileBaseCoins.toLocaleString('ko-KR'))} 대비 +${esc(item.bonusCoins.toLocaleString('ko-KR'))}</div>
                  </div>
                  <button type="button" class="button primary small" data-buy-sku="${esc(item.skuId)}">구매하기</button>
                </div>
              </article>`;
            }).join('')}
          </div>
        </section>

        <section aria-labelledby="plans-heading">
          <div class="section-heading">
            <h2 id="plans-heading">창작자 호스팅 플랜 (Free vs Pro)</h2>
            <span class="muted">PlayHub의 주 매출원은 인프라·구독·AI 사용량 과금입니다</span>
          </div>
          <div class="billing-plans-grid">
            <article class="plan-card">
              <div>
                <h3>Free 플랜</h3>
                <p class="muted">무료로 게임을 만들고 테스트할 수 있는 기본 한도</p>
                <ul class="plan-features">
                  <li>제작공간 ${esc(formatBytes(catalog.plans.free.workspaceBytes))}</li>
                  <li>소유 프로젝트 최대 ${esc(catalog.plans.free.maxProjects)}개</li>
                  <li>배포 용량 총 ${esc(formatBytes(catalog.plans.free.deployBytes))}</li>
                  <li>AI 최초 체험 크레딧 및 MO Free-Nano 체험</li>
                </ul>
              </div>
              <span class="status-chip ${!isPro ? 'active' : 'refunded'}">${!isPro ? '현재 플랜' : '기본 티어'}</span>
            </article>
            <article class="plan-card pro">
              <div>
                <h3>Pro 구독</h3>
                <p class="muted">본격적인 제작·배포·AI 협업을 위한 확장 플랜 (요금 추후 확정)</p>
                <ul class="plan-features">
                  <li>제작공간 ${esc(formatBytes(catalog.plans.pro.workspaceBytes))} (10배 확장)</li>
                  <li>소유 프로젝트 무제한</li>
                  <li>배포 용량 총 ${esc(formatBytes(catalog.plans.pro.deployBytes))}</li>
                  <li>AI 주간 사용량 한도 + 멀티플레이 무제한 CCU 확장</li>
                </ul>
              </div>
              <div class="save-actions">
                ${isPro
                  ? `<span class="status-chip active">Pro 이용 중</span><a class="button secondary small" href="/?view=wallet" data-route>구독 관리</a>`
                  : `<button type="button" class="button primary small" id="billing-start-pro" ${!authed || !showSandboxUi ? 'disabled' : ''}>${showSandboxUi ? '샌드박스 Pro 시작' : 'Pro 출시 예정'}</button>`
                }
              </div>
            </article>
          </div>
        </section>

        <section class="zero-fee-banner" aria-labelledby="zero-fee-title">
          <h3 id="zero-fee-title">창작자 UGC 게임·아이템 직접판매 — PlayHub 플랫폼 수수료 0%</h3>
          <p>창작자가 직접 판매자(Stripe Connect Direct Charges 등)로 대금을 수취하며 PlayHub는 판매대금을 보관하거나 정산하지 않습니다. PlayHub는 서버 기반 결제 검증과 게임 내 구매 권한(Entitlement) 발급·회수만 제공합니다. (Android·iOS·TV는 스토어 정책 검증 전까지 무료 플레이 우선)</p>
          <div style="margin-top:12px;">
            <a class="button secondary small" href="/?view=direct" data-route>🏪 창작자 직접판매 0% 콘솔 열기 →</a>
          </div>
        </section>
      </div>`;

      const dismissShopBanner = root.querySelector('[data-dismiss-callback-banner]');
      if (dismissShopBanner) {
        dismissShopBanner.onclick = () => {
          uiState.callbackBanner = null;
          dismissShopBanner.closest('.easypay-callback-banner')?.remove();
        };
      }

      root.querySelectorAll('[data-currency]').forEach(btn => {
        btn.onclick = () => {
          uiState.currency = btn.dataset.currency;
          void loadAndRender();
        };
      });
      root.querySelectorAll('[data-channel]').forEach(btn => {
        btn.onclick = () => {
          uiState.channel = btn.dataset.channel;
          void loadAndRender();
        };
      });

      const demoBtn = root.querySelector('#billing-demo-signin');
      if (demoBtn) {
        demoBtn.onclick = async () => {
          demoBtn.disabled = true;
          demoBtn.textContent = '데모 계정 연결 중…';
          try {
            await api('/api/billing/demo-signin', { method: 'POST', body: {} });
            await refreshSession();
            toast('🧪 PlayHub 데모 창작자 계정으로 로그인했습니다.');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '데모 로그인에 실패했습니다.' });
            demoBtn.disabled = false;
            demoBtn.textContent = '🧪 데모 계정으로 바로 체험';
          }
        };
      }

      root.querySelectorAll('[data-buy-sku]').forEach(btn => {
        btn.onclick = () => {
          const item = catalog.items.find(i => i.skuId === btn.dataset.buySku);
          if (!item) return;
          openCheckoutDialog({
            item,
            catalog,
            api,
            toast,
            authed,
            refreshSession,
            onComplete: async () => {
              await loadAndRender();
            }
          });
        };
      });

      const proBtn = root.querySelector('#billing-start-pro');
      if (proBtn) {
        proBtn.onclick = async () => {
          proBtn.disabled = true;
          try {
            await api('/api/billing/subscriptions/pro', {
              method: 'POST',
              headers: { 'Idempotency-Key': `pro-${uuid()}` },
              body: {}
            });
            toast('Pro 구독이 활성화되었습니다! (제작공간 1 GB · 프로젝트 무제한)');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: 'Pro 구독 활성화에 실패했습니다.' });
            proBtn.disabled = false;
          }
        };
      }
    }

    await loadAndRender();
  }

  async function mountWallet(root, { api, toast, navigate, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>내 PlayCoin 지갑을 불러오고 있습니다</h1></section></div>`;

    await processPaymentReturnCallback({ api, toast, activeView: 'wallet' });

    async function loadAndRender() {
      let walletData;
      try {
        walletData = await api('/api/billing/wallet', { timeout: 6000 });
      } catch (error) {
        dispatchBillingError(error, { toast, fallback: '지갑을 불러오지 못했습니다.' });
        root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>지갑을 불러오지 못했습니다</h1><p class="muted">${esc(error.message)}</p></section></div>`;
        return;
      }

      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      if (!walletData.authenticated) {
        root.innerHTML = `<div class="page billing-page">
          ${billingSubnavHtml('wallet')}
          <div class="section-heading"><h1>내 PlayCoin 지갑</h1><a class="button secondary small" href="/?view=billing" data-route>← PlayCoin 상점</a></div>
          <section class="surface">
            <h2>로그인이 필요합니다</h2>
            <p class="muted">PlayCoin 잔액, 구독·사용량 현황, 7일 청약철회 및 보유 아이템 권한(Entitlement)을 확인하려면 로그인해 주세요.</p>
            <div class="save-actions">
              ${walletData.allowDemoAccount && isDevDemoUiOn() ? '<button type="button" class="button primary" id="wallet-demo-signin" data-dev-demo-ui>🧪 데모 계정으로 바로 체험</button>' : ''}
              <a class="button secondary" href="/?view=billing" data-route>상점 둘러보기</a>
            </div>
          </section>
        </div>`;
        const demoBtn = root.querySelector('#wallet-demo-signin');
        if (demoBtn) {
          demoBtn.onclick = async () => {
            demoBtn.disabled = true;
            try {
              await api('/api/billing/demo-signin', { method: 'POST', body: {} });
              await refreshSession();
              await loadAndRender();
            } catch (error) {
              dispatchBillingError(error, { toast, fallback: '데모 로그인에 실패했습니다.' });
              demoBtn.disabled = false;
            }
          };
        }
        return;
      }

      let ledgerData = { entries: [] };
      try { ledgerData = await api('/api/billing/ledger?limit=30', { timeout: 6000 }); } catch {}

      const w = walletData.wallet;
      const sub = walletData.subscription;
      const lim = walletData.limits;
      const usage = walletData.usage || { periodKey: '', byMetric: {}, activeHolds: [], records: [] };
      const isPro = sub.effectivePlan === 'pro';
      const metricOrder = ['storage_bytes', 'deploy_bytes', 'server_minutes', 'egress_bytes', 'ai_units'];

      root.innerHTML = `<div class="page billing-page">
        ${billingSubnavHtml('wallet')}
        ${callbackBannerHtml()}
        <div class="section-heading">
          <h1>내 PlayCoin 지갑</h1>
          <div class="save-actions">
            <a class="button secondary small" href="/?view=redeem" data-route>🎁 기프트카드 등록</a>
            <a class="button primary small" href="/?view=billing" data-route>+ PlayCoin 충전 (최대 +25%)</a>
          </div>
        </div>

        ${w.frozen ? `<section class="surface" style="border-color:#dc2626;background:#fef2f2;"><strong>계정 결제 제한 (${esc(w.frozenReason)})</strong><p class="muted" style="margin:4px 0 0;">미정산 차지백 부채: ${esc(formatCoins(w.debt))}</p></section>` : ''}

        <section class="wallet-cards" aria-label="PlayCoin 3-Bucket 잔액">
          <div class="wallet-stat primary">
            <p class="wallet-stat-label">사용 가능 총 잔액</p>
            <p class="wallet-stat-value">🪙 ${esc(w.available.toLocaleString('ko-KR'))}</p>
          </div>
          <div class="wallet-stat">
            <p class="wallet-stat-label">유상 원금 (paid · 환불 대상)</p>
            <p class="wallet-stat-value">${esc(w.paid.toLocaleString('ko-KR'))}</p>
          </div>
          <div class="wallet-stat">
            <p class="wallet-stat-label">웹·PC 보너스 (bonus · 최대 +25%)</p>
            <p class="wallet-stat-value" style="color:#2c6e3b;">+${esc(w.bonus.toLocaleString('ko-KR'))}</p>
          </div>
          <div class="wallet-stat">
            <p class="wallet-stat-label">프로모션 (promo)</p>
            <p class="wallet-stat-value">${esc(w.promo.toLocaleString('ko-KR'))}</p>
          </div>
          <div class="wallet-stat">
            <p class="wallet-stat-label">서버/AI 예약 중 (reserved)</p>
            <p class="wallet-stat-value">${esc(w.reserved.toLocaleString('ko-KR'))}</p>
          </div>
        </section>

        <section class="surface">
          <div class="section-heading">
            <h2>구독 · 한도 현황</h2>
            <span class="status-chip ${isPro ? 'active' : 'created'}">${isPro ? 'PRO' : 'FREE'} · ${esc(sub.status)}</span>
          </div>
          <p class="muted" style="margin:0 0 10px;">
            제작공간 ${esc(formatBytes(sub.quotas.workspaceBytes))} · 프로젝트 ${sub.quotas.maxProjects === null ? '무제한' : `최대 ${sub.quotas.maxProjects}개`} · 배포 ${esc(formatBytes(sub.quotas.deployBytes))}
            ${sub.currentPeriodEnd ? ` · 만료일 ${esc(formatDate(new Date(sub.currentPeriodEnd).toISOString()))}` : ''}
          </p>
          <p class="muted" style="margin:0 0 12px;">
            연령 등급: <strong>${esc(lim.ageTier)}</strong> · 이번 달 KRW 결제: <strong>${esc(formatMoney(lim.monthlyUsedMinor, 'KRW'))} / ${esc(formatMoney(lim.monthlyCapMinor, 'KRW'))}</strong>
          </p>
          ${sub.planTier === 'pro' && sub.status === 'ACTIVE'
            ? '<button type="button" class="button secondary small" id="wallet-cancel-pro">Pro 구독 해지 예약</button>'
            : ''}
        </section>

        <section class="surface" aria-labelledby="wallet-usage-heading">
          <div class="section-heading">
            <h2 id="wallet-usage-heading">월간 사용량 계측 · Hold/Capture (${esc(usage.periodKey || '이번 달')})</h2>
            <span class="muted">PlayHub 1P 인프라·서버·AI 종량 소비 내역</span>
          </div>
          <div class="usage-metrics-grid">
            ${metricOrder.map(m => {
              const item = usage.byMetric?.[m] || { totalQuantity: 0, totalCoins: 0, recordCount: 0 };
              return `<div class="usage-metric-card">
                <p class="usage-metric-label">${esc(metricLabel(m))}</p>
                <p class="usage-metric-value">${esc(formatMetricQuantity(m, item.totalQuantity))}</p>
                <p class="usage-metric-cost">${item.totalCoins > 0 ? `-${esc(item.totalCoins.toLocaleString('ko-KR'))} PlayCoin` : '무료 한도 내 (0 PlayCoin)'}</p>
              </div>`;
            }).join('')}
          </div>
          ${walletData.allowDemoAccount && isDevDemoUiOn() ? `
            <div class="redeem-sandbox-bar" data-dev-demo-ui style="margin-bottom:14px;">
              <strong>🧪 샌드박스 사용량 시뮬레이터 (FIFO 차감 · Hold/Capture · Anti-Bonus-Stripping 검증):</strong>
              <button type="button" class="button secondary small" data-demo-usage="ai_direct">🤖 AI 100유닛 사용 (-20 PlayCoin)</button>
              <button type="button" class="button secondary small" data-demo-usage="server_hold_capture">🖥️ 서버 Hold/Capture (60 예약 → 35 정산)</button>
            </div>
          ` : ''}
          ${usage.activeHolds?.length ? `
            <div class="billing-list" style="margin-bottom:12px;">
              ${usage.activeHolds.map(h => `
                <div class="billing-row">
                  <div class="billing-row-meta">
                    <span class="billing-row-title">진행 중 예약 (Hold) · ${esc(h.sinkType)} · ${esc(h.sinkRefId)}</span>
                    <span class="billing-row-sub">예약 시각 ${esc(formatDate(h.createdAt))}</span>
                  </div>
                  <span class="status-chip created">예약 ${esc(h.amountCoins.toLocaleString('ko-KR'))} PlayCoin</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="billing-list">
            ${usage.records?.length ? usage.records.map(r => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(metricLabel(r.metricType))} · ${esc(formatMetricQuantity(r.metricType, r.quantity))}</span>
                  <span class="billing-row-sub">리소스 ${esc(r.resourceRefId)}${r.holdId ? ' · Hold 정산' : ''} · ${esc(formatDate(r.createdAt))}</span>
                </div>
                <div class="billing-row-right">
                  <strong>${r.billableCoins > 0 ? `-${esc(r.billableCoins.toLocaleString('ko-KR'))} PlayCoin` : '무료 (0 PlayCoin)'}</strong>
                </div>
              </div>
            `).join('') : '<p class="muted">이번 달 사용량 계측 기록이 아직 없습니다.</p>'}
          </div>
        </section>

        <section class="surface" aria-labelledby="wallet-orders-heading">
          <div class="section-heading">
            <h2 id="wallet-orders-heading">최근 충전 주문 · 7일 청약철회</h2>
            <span class="muted">미사용 7일 이내 주문은 원금+보너스 동시 회수 후 즉시 환불됩니다</span>
          </div>
          <div class="billing-list">
            ${walletData.orders.length ? walletData.orders.map(o => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(formatMoney(o.amountMinor, o.currency))} → 🪙 ${esc(formatCoins(o.totalCoins))} (기본 ${esc(o.baseCoins)} + 보너스 ${esc(o.bonusCoins)})</span>
                  <span class="billing-row-sub">${esc(o.provider.toUpperCase())} · ${esc(o.channel)} · ${esc(formatDate(o.paidAt || o.createdAt))}${o.firstSpentAt ? ' · 사용 개시됨(청약철회 불가)' : ''}</span>
                </div>
                <div class="billing-row-right">
                  <span class="status-chip ${esc(o.state.toLowerCase())}">${esc(orderStateLabel(o.state))}</span>
                  ${o.withdrawalEligible ? `<button type="button" class="button secondary small" data-withdraw-order="${esc(o.id)}">7일 청약철회</button>` : ''}
                </div>
              </div>
            `).join('') : '<p class="muted">아직 충전 주문 내역이 없습니다.</p>'}
          </div>
        </section>

        <section class="surface" aria-labelledby="wallet-ledger-heading">
          <h2 id="wallet-ledger-heading">복식부기 원장 내역</h2>
          <div class="billing-list">
            ${ledgerData.entries.length ? ledgerData.entries.map(e => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(eventLabel(e.eventType))} <span class="muted">(${esc(e.bucket)})</span></span>
                  <span class="billing-row-sub">${esc(formatDate(e.createdAt))}</span>
                </div>
                <div class="billing-row-right">
                  <strong style="color:${e.deltaCoins >= 0 ? '#166534' : '#991b1b'};">${e.deltaCoins >= 0 ? '+' : ''}${esc(e.deltaCoins.toLocaleString('ko-KR'))} PlayCoin</strong>
                </div>
              </div>
            `).join('') : '<p class="muted">원장 기록이 없습니다.</p>'}
          </div>
        </section>

        <section class="surface" aria-labelledby="wallet-entitlements-heading">
          <div class="section-heading">
            <h2 id="wallet-entitlements-heading">보유 게임 권한 (Entitlements · 창작자 직접판매 0%)</h2>
          </div>
          <div class="billing-list">
            ${walletData.entitlements.length ? walletData.entitlements.map(ent => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(ent.gameId)} · ${esc(ent.productKey)}</span>
                  <span class="billing-row-sub">발급일 ${esc(formatDate(ent.grantedAt))}</span>
                </div>
                <span class="status-chip active">${esc(ent.state)}</span>
              </div>
            `).join('') : '<p class="muted">보유 중인 게임별 구매 권한이 없습니다. (P1 웹 창작자 직접판매 연동 시 표시)</p>'}
          </div>
        </section>
      </div>`;

      const cancelProBtn = root.querySelector('#wallet-cancel-pro');
      if (cancelProBtn) {
        cancelProBtn.onclick = async () => {
          if (!confirm('Pro 구독 갱신을 해지할까요? 현재 결제 기간 만료일까지는 Pro 혜택이 유지됩니다.')) return;
          cancelProBtn.disabled = true;
          try {
            await api('/api/billing/subscriptions/cancel', { method: 'POST', body: {} });
            toast('Pro 구독 해지가 예약되었습니다.');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '구독 해지에 실패했습니다.' });
            cancelProBtn.disabled = false;
          }
        };
      }

      root.querySelectorAll('[data-demo-usage]').forEach(btn => {
        btn.onclick = async () => {
          const mode = btn.dataset.demoUsage;
          btn.disabled = true;
          try {
            const res = await api('/api/billing/usage/demo-consume', {
              method: 'POST',
              headers: { 'Idempotency-Key': `demo-use-${uuid()}` },
              body: { mode }
            });
            if (mode === 'server_hold_capture') {
              toast(`🖥️ 서버 정산 완료: 60 예약 → 35 PlayCoin 정산 (25 PlayCoin 자동 반환)`);
            } else {
              toast(`🤖 AI 100유닛 사용 완료: -20 PlayCoin (보너스/원금 FIFO 차감)`);
            }
            if (res.wallet) updateHeaderPill({ authenticated: true, wallet: res.wallet });
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '사용량 테스트 처리에 실패했습니다. PlayCoin을 먼저 충전해 주세요.' });
            btn.disabled = false;
          }
        };
      });

      const dismissBanner = root.querySelector('[data-dismiss-callback-banner]');
      if (dismissBanner) {
        dismissBanner.onclick = () => {
          uiState.callbackBanner = null;
          dismissBanner.closest('.easypay-callback-banner')?.remove();
        };
      }

      root.querySelectorAll('[data-withdraw-order]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('이 주문의 유상 원금과 채널 보너스를 모두 회수하고 7일 청약철회(전액 환불)를 진행할까요?')) return;
          btn.disabled = true;
          btn.textContent = '처리 중…';
          try {
            await api(`/api/billing/orders/${encodeURIComponent(btn.dataset.withdrawOrder)}/withdraw`, {
              method: 'POST',
              headers: { 'Idempotency-Key': `wd-${uuid()}` },
              body: { reason: 'customer_7d_withdrawal' }
            });
            toast('7일 청약철회가 완료되었습니다. 원금과 보너스 PlayCoin이 회수되었습니다.');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '청약철회를 처리하지 못했습니다.' });
            btn.disabled = false;
            btn.textContent = '7일 청약철회';
          }
        };
      });
    }

    await loadAndRender();
  }

  async function mountRedeem(root, { api, toast, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>기프트카드 등록 화면을 불러오고 있습니다</h1></section></div>`;

    const redeemState = {
      pin: '',
      preview: null,
      redeemed: null,
      errorMessage: '',
      issuedDemoInfo: null,
      busy: false
    };

    async function loadAndRender() {
      let walletData;
      try {
        walletData = await api('/api/billing/wallet', { timeout: 6000 });
      } catch (error) {
        const mode = dispatchBillingError(error, { toast, fatalRoot: root, fallback: '기프트카드 기능을 불러오지 못했습니다.' });
        if (mode !== 'page') {
          root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>기프트카드 기능을 불러오지 못했습니다</h1><p class="muted">${esc(error.message)}</p></section></div>`;
        }
        return;
      }

      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      const authed = Boolean(walletData?.authenticated);

      if (!authed) {
        root.innerHTML = `<div class="page billing-page">
          ${billingSubnavHtml('redeem')}
          <section class="billing-hero">
            <div class="billing-hero-top">
              <div>
                <p class="billing-eyebrow">🎁 GIFT CARD REDEMPTION · 최대 +25% 보너스</p>
                <h1>기프트카드 PIN 등록</h1>
                <p class="billing-hero-sub">PlayHub 직접 판매 디지털 기프트카드는 <strong>+25%</strong>, 제휴 리테일 카드는 <strong>+20%</strong> 보너스 PlayCoin이 즉시 함께 적립됩니다. 평문 PIN은 서버 DB에 저장되지 않고 HMAC-SHA256으로 보호됩니다.</p>
              </div>
            </div>
          </section>
          <section class="surface">
            <h2>로그인이 필요합니다</h2>
            <p class="muted">기프트카드 PlayCoin을 안전하게 계정에 귀속하려면 먼저 로그인해 주세요.</p>
            <div class="save-actions">
              ${walletData.allowDemoAccount && isDevDemoUiOn() ? '<button type="button" class="button primary" id="redeem-demo-signin" data-dev-demo-ui>🧪 데모 계정으로 바로 체험</button>' : ''}
              <a class="button secondary" href="/?view=billing" data-route>PlayCoin 상점 보기</a>
            </div>
          </section>
        </div>`;

        const demoBtn = root.querySelector('#redeem-demo-signin');
        if (demoBtn) {
          demoBtn.onclick = async () => {
            demoBtn.disabled = true;
            try {
              await api('/api/billing/demo-signin', { method: 'POST', body: {} });
              await refreshSession();
              toast('🧪 PlayHub 데모 창작자 계정으로 로그인했습니다.');
              await loadAndRender();
            } catch (error) {
              dispatchBillingError(error, { toast, fallback: '데모 로그인에 실패했습니다.' });
              demoBtn.disabled = false;
            }
          };
        }
        return;
      }

      const channelLabel = ch => ch === 'gift_card_retail' ? '리테일 제휴 기프트카드 (+20%)' : 'PlayHub 직접 판매 기프트카드 (+25%)';

      root.innerHTML = `<div class="page billing-page">
        ${billingSubnavHtml('redeem')}
        <section class="billing-hero">
          <div class="billing-hero-top">
            <div>
              <p class="billing-eyebrow">🎁 GIFT CARD REDEMPTION · HMAC-SHA256 보안</p>
              <h1>기프트카드 16자리 PIN 등록</h1>
              <p class="billing-hero-sub">16자리 코드를 입력해 권면액과 추가 보너스 PlayCoin을 먼저 미리보기로 확인한 뒤 지갑에 안전하게 등록하세요. (5회 연속 오입력 시 계정/IP 15분 자동 보호 잠금)</p>
            </div>
          </div>
          <div class="billing-badges">
            <span class="billing-badge">✨ 직접 판매 기프트카드 최대 +25%</span>
            <span class="billing-badge">🏪 리테일 유통 기프트카드 최대 +20%</span>
            <span class="billing-badge">🔒 평문 PIN 미저장 (HMAC-SHA256)</span>
            <span class="billing-badge">🛡️ 브루트포스 5회 자동 잠금</span>
          </div>
        </section>

        <section class="surface redeem-card" aria-labelledby="redeem-form-heading">
          <div class="section-heading">
            <h2 id="redeem-form-heading">PIN 번호 입력</h2>
            <span class="muted">현재 가용 잔액: <strong>🪙 ${esc(formatCoins(walletData.wallet.available))}</strong></span>
          </div>

          ${walletData.allowDemoAccount && isDevDemoUiOn() ? `
            <div class="redeem-sandbox-bar" data-dev-demo-ui>
              <strong>🧪 샌드박스 테스트용 PIN 즉시 발급:</strong>
              <button type="button" class="button secondary small" data-demo-gc="gift_card_direct">직접판매 +25% (1,250 PlayCoin)</button>
              <button type="button" class="button secondary small" data-demo-gc="gift_card_retail">리테일 +20% (1,200 PlayCoin)</button>
              ${redeemState.issuedDemoInfo ? `<span class="muted">발급 시리얼: <code>${esc(redeemState.issuedDemoInfo.serialNo)}</code></span>` : ''}
            </div>
          ` : ''}

          <form class="redeem-pin-form" id="redeem-preview-form" autocomplete="off">
            <input
              id="redeem-pin-input"
              class="redeem-pin-input"
              type="text"
              inputmode="text"
              maxlength="19"
              spellcheck="false"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              aria-label="기프트카드 16자리 PIN"
              value="${esc(redeemState.pin)}"
              required
            >
            <button type="submit" class="button primary" id="redeem-preview-btn" ${redeemState.busy ? 'disabled' : ''}>
              ${redeemState.busy ? '확인 중…' : 'PIN 미리보기 확인'}
            </button>
          </form>

          ${redeemState.errorMessage ? `<div class="redeem-error-box" role="alert">${esc(redeemState.errorMessage)}</div>` : ''}

          ${redeemState.preview ? `
            <div class="redeem-preview-box" aria-live="polite">
              <div class="section-heading">
                <strong>🎁 기프트카드 확인 완료 · ${esc(channelLabel(redeemState.preview.channel))}</strong>
                <span class="status-chip active">+${esc(redeemState.preview.bonusPercent)}% 보너스</span>
              </div>
              <div class="checkout-summary" style="margin:0;">
                <div class="checkout-summary-line"><span>시리얼 번호</span><strong>${esc(redeemState.preview.serialNo)}</strong></div>
                <div class="checkout-summary-line"><span>발행 파트너</span><strong>${esc(redeemState.preview.partnerName)}</strong></div>
                <div class="checkout-summary-line"><span>권면 금액</span><strong>${esc(formatMoney(redeemState.preview.faceValueMinor, redeemState.preview.currency))}</strong></div>
                <div class="checkout-summary-line"><span>기본 PlayCoin (유상 원금)</span><strong>${esc(formatCoins(redeemState.preview.baseCoins))}</strong></div>
                <div class="checkout-summary-line"><span>채널 보너스 (+${esc(redeemState.preview.bonusPercent)}%)</span><strong style="color:#2c6e3b;">+${esc(formatCoins(redeemState.preview.bonusCoins))}</strong></div>
                <div class="checkout-summary-line total"><span>최종 적립 합계</span><span>🪙 ${esc(formatCoins(redeemState.preview.totalCoins))}</span></div>
              </div>
              ${redeemState.preview.expiresAt ? `<p class="muted" style="margin:0;">유효기간: ${esc(formatDate(redeemState.preview.expiresAt))}</p>` : ''}
              <div class="save-actions">
                <button type="button" class="button primary" id="redeem-confirm-btn" ${redeemState.busy ? 'disabled' : ''}>
                  ${redeemState.busy ? '등록 처리 중…' : `🪙 ${esc(formatCoins(redeemState.preview.totalCoins))} 지갑에 등록하기`}
                </button>
                <button type="button" class="button secondary" id="redeem-clear-btn">다른 코드 입력</button>
              </div>
            </div>
          ` : ''}

          ${redeemState.redeemed ? `
            <div class="redeem-success-box" role="status">
              <strong>✅ 기프트카드 등록 완료!</strong>
              <p style="margin:0;">
                시리얼 <code>${esc(redeemState.redeemed.giftcard.serialNo)}</code>에서
                <strong>🪙 ${esc(formatCoins(redeemState.redeemed.giftcard.totalCoins))}</strong>
                (기본 ${esc(redeemState.redeemed.giftcard.baseCoins.toLocaleString())} + 보너스 ${esc(redeemState.redeemed.giftcard.bonusCoins.toLocaleString())})이 적립되었습니다.
              </p>
              <div class="save-actions" style="margin-top:6px;">
                <a class="button primary small" href="/?view=wallet" data-route>내 지갑 · 원장 확인 →</a>
              </div>
            </div>
          ` : ''}
        </section>
      </div>`;

      const pinInput = root.querySelector('#redeem-pin-input');
      if (pinInput) {
        pinInput.addEventListener('input', () => {
          const formatted = formatPinInput(pinInput.value);
          pinInput.value = formatted;
          redeemState.pin = formatted;
        });
      }

      root.querySelectorAll('[data-demo-gc]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          redeemState.errorMessage = '';
          redeemState.redeemed = null;
          try {
            const res = await api('/api/billing/giftcards/demo-issue', {
              method: 'POST',
              body: { channel: btn.dataset.demoGc }
            });
            redeemState.pin = res.card.pin;
            redeemState.issuedDemoInfo = res.card;
            redeemState.preview = null;
            toast(`🧪 테스트 기프트카드 PIN이 자동 입력되었습니다 (${res.card.serialNo})`);
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '데모 기프트카드 발급에 실패했습니다.' });
            btn.disabled = false;
          }
        };
      });

      const previewForm = root.querySelector('#redeem-preview-form');
      if (previewForm) {
        previewForm.onsubmit = async ev => {
          ev.preventDefault();
          redeemState.pin = formatPinInput(pinInput.value);
          redeemState.busy = true;
          redeemState.errorMessage = '';
          redeemState.redeemed = null;
          await loadAndRender();
          try {
            const preview = await api('/api/billing/giftcards/preview', {
              method: 'POST',
              body: { pin: redeemState.pin }
            });
            redeemState.preview = preview;
            redeemState.busy = false;
            await loadAndRender();
          } catch (error) {
            redeemState.preview = null;
            redeemState.busy = false;
            if (window.PlayHubErrorUI?.isFatalError?.(error)) {
              dispatchBillingError(error, { toast, fallback: giftcardErrorText(error) });
            } else if (!error.status || error.status >= 500) {
              dispatchBillingError(error, { toast, fallback: giftcardErrorText(error) });
            } else {
              redeemState.errorMessage = giftcardErrorText(error);
            }
            await loadAndRender();
          }
        };
      }

      const confirmBtn = root.querySelector('#redeem-confirm-btn');
      if (confirmBtn) {
        confirmBtn.onclick = async () => {
          redeemState.busy = true;
          redeemState.errorMessage = '';
          await loadAndRender();
          try {
            const res = await api('/api/billing/giftcards/redeem', {
              method: 'POST',
              headers: { 'Idempotency-Key': `gc-redeem-${uuid()}` },
              body: { pin: redeemState.pin }
            });
            redeemState.redeemed = res;
            redeemState.preview = null;
            redeemState.pin = '';
            redeemState.busy = false;
            toast(`🎁 ${formatCoins(res.giftcard.totalCoins)} 등록 완료!`);
            await loadAndRender();
          } catch (error) {
            redeemState.busy = false;
            if (window.PlayHubErrorUI?.isFatalError?.(error) || !error.status || error.status >= 500) {
              dispatchBillingError(error, { toast, fallback: giftcardErrorText(error) });
            } else {
              redeemState.errorMessage = giftcardErrorText(error);
            }
            await loadAndRender();
          }
        };
      }

      const clearBtn = root.querySelector('#redeem-clear-btn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          redeemState.pin = '';
          redeemState.preview = null;
          redeemState.errorMessage = '';
          void loadAndRender();
        };
      }
    }

    await loadAndRender();
  }

  async function mountDirect(root, { api, toast, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>창작자 직접판매 콘솔을 불러오고 있습니다</h1></section></div>`;

    const kindLabel = k => ({
      game_access: '유료 게임 이용권',
      durable: '영구 아이템/스킨',
      consumable: '소모성 아이템',
      pass: '시즌 패스'
    }[k] || k);

    async function loadAndRender() {
      let walletData;
      try {
        walletData = await api('/api/billing/wallet', { timeout: 6000 });
      } catch (error) {
        const mode = dispatchBillingError(error, { toast, fatalRoot: root, fallback: '직접판매 콘솔을 불러오지 못했습니다.' });
        if (mode !== 'page') {
          root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>직접판매 콘솔을 불러오지 못했습니다</h1><p class="muted">${esc(error.message)}</p></section></div>`;
        }
        return;
      }

      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      if (!walletData.authenticated) {
        root.innerHTML = `<div class="page billing-page">
          ${billingSubnavHtml('direct')}
          <section class="billing-hero">
            <div class="billing-hero-top">
              <div>
                <p class="billing-eyebrow">🏪 TRACK B · CREATOR DIRECT COMMERCE · 0% PLATFORM FEE</p>
                <h1>창작자 UGC 직접판매 (PlayHub 수수료 0%)</h1>
                <p class="billing-hero-sub">창작자가 직접 판매자(Stripe Connect Direct Charges)로 대금을 100% 수취합니다. PlayHub는 판매대금을 보관하거나 정산하지 않고, 개인 결제 비밀키도 절대 수집하지 않으며 서버 검증 기반 <strong>게임 권한(Entitlement)</strong>만 제공합니다.</p>
              </div>
            </div>
          </section>
          <section class="surface">
            <h2>창작자 로그인이 필요합니다</h2>
            <p class="muted">결제 계정 연결, 게임 상품 등록, 웹 직접구매 테스트를 진행하려면 로그인해 주세요.</p>
            <div class="save-actions">
              ${walletData.allowDemoAccount && isDevDemoUiOn() ? '<button type="button" class="button primary" id="direct-demo-signin" data-dev-demo-ui>🧪 데모 창작자로 바로 체험</button>' : ''}
              <a class="button secondary" href="/?view=billing" data-route>PlayCoin 상점 보기</a>
            </div>
          </section>
        </div>`;

        const demoBtn = root.querySelector('#direct-demo-signin');
        if (demoBtn) {
          demoBtn.onclick = async () => {
            demoBtn.disabled = true;
            try {
              await api('/api/billing/demo-signin', { method: 'POST', body: {} });
              await refreshSession();
              toast('🧪 PlayHub 데모 창작자 계정으로 로그인했습니다.');
              await loadAndRender();
            } catch (error) {
              dispatchBillingError(error, { toast, fallback: '데모 로그인에 실패했습니다.' });
              demoBtn.disabled = false;
            }
          };
        }
        return;
      }

      const [connData, prodData, orderData, entData] = await Promise.all([
        api('/api/billing/creator/connection', { timeout: 6000 }),
        api('/api/billing/creator/products', { timeout: 6000 }),
        api('/api/billing/creator/orders?limit=25', { timeout: 6000 }),
        api('/api/billing/entitlements', { timeout: 6000 })
      ]);

      const conn = connData.connection;
      const isMockDirect = connData.directMode === 'mock' && isDevDemoUiOn();
      const isDemo = Boolean(walletData.allowDemoAccount) && isDevDemoUiOn();

      root.innerHTML = `<div class="page billing-page">
        ${billingSubnavHtml('direct')}
        <section class="billing-hero">
          <div class="billing-hero-top">
            <div>
              <p class="billing-eyebrow">🏪 TRACK B · CREATOR DIRECT COMMERCE · 0% PLATFORM FEE</p>
              <h1>창작자 직접판매 콘솔 · PlayHub 수수료 0%</h1>
              <p class="billing-hero-sub">판매대금은 창작자 연결 계정(Stripe Connect Direct Charges)으로 <strong>직접 입금</strong>되며 PlayHub <code>PlayCoin</code> 지갑과 완전히 분리됩니다. 환불·차지백 웹훅 수신 시 게임 내 <code>Entitlement</code>가 즉시 <code>REVOKED</code> 처리됩니다.</p>
            </div>
          </div>
          <div class="billing-badges">
            <span class="billing-badge">💯 플랫폼 수수료 0% (DB CHECK 강제)</span>
            <span class="billing-badge">🔐 개인 API 비밀키 미수집 (OAuth 전용)</span>
            <span class="billing-badge">🌐 웹 브라우저 직접판매 활성</span>
            <span class="billing-badge">📱 Android · iOS · TV 무료 우선 (Fail-Closed)</span>
            ${isMockDirect ? '<span class="billing-badge sandbox">🧪 샌드박스 Direct Connect 모드</span>' : ''}
          </div>
        </section>

        <section class="surface" aria-labelledby="direct-conn-heading">
          <div class="section-heading">
            <h2 id="direct-conn-heading">1. 창작자 결제 계정 연결 (CreatorPaymentConnection)</h2>
            <span class="status-chip ${conn.connected ? 'active' : (conn.onboardingStatus === 'SUSPENDED' ? 'revoked' : 'created')}">
              ${esc(conn.onboardingStatus)} · 수수료 0%
            </span>
          </div>
          ${conn.connectedAccountId
            ? `<p class="muted" style="margin:0 0 10px;">
                연결 제공자: <strong>${esc(conn.provider)}</strong> · 연결 계정 ID: <code>${esc(conn.connectedAccountId)}</code> · 국가: <strong>${esc(conn.countryCode)}</strong> · 결제 승인: <strong>${conn.chargesEnabled ? '활성' : '대기'}</strong> · PlayHub 플랫폼 수수료: <strong>${esc(conn.platformFeePercent)}%</strong>
              </p>`
            : `<p class="muted" style="margin:0 0 10px;">아직 결제 계정이 연결되지 않았습니다. PlayHub는 창작자 개인 API 비밀키를 절대 받지 않으며 Stripe Connect OAuth 온보딩만 사용합니다.</p>`
          }
          <div class="platform-matrix">
            <span class="platform-chip allowed">✅ Web 브라우저 유료 판매 허용</span>
            <span class="platform-chip blocked">🔒 Android / Google TV (P3 전 무료 우선)</span>
            <span class="platform-chip blocked">🔒 iOS / Apple TV (P3 전 무료 우선)</span>
            <span class="platform-chip blocked">🔒 Samsung TV (P3 전 무료 우선)</span>
          </div>
          <div class="save-actions" style="margin-top:14px;">
            ${!conn.connected && conn.onboardingStatus !== 'SUSPENDED'
              ? `<button type="button" class="button primary" id="direct-connect-btn">${isMockDirect ? '🧪 Stripe Connect 테스트 계정 즉시 연결 (0% 수수료)' : 'Stripe Connect 온보딩 시작'}</button>`
              : ''
            }
          </div>
        </section>

        <section class="surface" aria-labelledby="direct-prod-heading">
          <div class="section-heading">
            <h2 id="direct-prod-heading">2. 내 게임 상품 카탈로그 (CreatorProductCatalog)</h2>
            <span class="muted">웹 플랫폼 상품 등록 · 등록 즉시 0% 직접판매 가능</span>
          </div>
          <form id="direct-product-form">
            <div class="direct-form-grid">
              <label>게임 ID
                <input name="gameId" value="match3-garden" maxlength="64" required>
              </label>
              <label>상품 키 (productKey)
                <input name="productKey" placeholder="starter_pack_01" maxlength="64" required>
              </label>
              <label>상품명
                <input name="title" placeholder="골드 스타터 스킨 팩" maxlength="100" required>
              </label>
              <label>상품 유형
                <select name="kind">
                  <option value="durable">영구 아이템/스킨 (durable)</option>
                  <option value="consumable">소모성 아이템 (consumable)</option>
                  <option value="pass">시즌 패스 (pass)</option>
                  <option value="game_access">유료 게임 이용권 (game_access)</option>
                </select>
              </label>
              <label>통화
                <select name="currency">
                  <option value="KRW">KRW (₩)</option>
                  <option value="USD">USD ($ cents)</option>
                </select>
              </label>
              <label>가격 (KRW 원 / USD 센트)
                <input name="amountMinor" type="number" min="100" step="100" value="4900" required>
              </label>
            </div>
            <div class="save-actions">
              <button type="submit" class="button primary small" ${!conn.connected ? 'disabled' : ''}>+ 상품 등록</button>
              ${!conn.connected ? '<span class="muted">먼저 위에서 Stripe Connect 계정을 연결해 주세요.</span>' : ''}
            </div>
            <p id="direct-product-error" class="inline-error" role="alert" hidden></p>
          </form>

          <div class="billing-list" style="margin-top:16px;">
            ${prodData.products.length ? prodData.products.map(p => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(p.title)} <span class="muted">(${esc(p.gameId)} · ${esc(p.productKey)})</span></span>
                  <span class="billing-row-sub">${esc(kindLabel(p.kind))} · ${esc(formatMoney(p.amountMinor, p.currency))} · PlayHub 수수료 ₩0 · 허용 플랫폼: ${esc(p.allowedPlatforms.join(', '))}</span>
                </div>
                <div class="billing-row-right">
                  <span class="status-chip ${esc(p.status.toLowerCase())}">${esc(p.status)}</span>
                  ${isMockDirect && p.status === 'ACTIVE' ? `
                    <button type="button" class="button primary small" data-direct-buy-web="${esc(p.id)}">웹 0% 구매 테스트</button>
                    <button type="button" class="button secondary small" data-direct-buy-mobile="${esc(p.id)}">모바일 차단 테스트</button>
                  ` : ''}
                </div>
              </div>
            `).join('') : '<p class="muted">아직 등록된 창작자 상품이 없습니다.</p>'}
          </div>
        </section>

        <section class="surface" aria-labelledby="direct-orders-heading">
          <div class="section-heading">
            <h2 id="direct-orders-heading">3. 창작자 직접판매 주문 · Entitlement 발급 현황</h2>
            <span class="muted">판매대금 100% 창작자 직입금 · PlayHub 지갑 잔액 변동 없음</span>
          </div>
          <div class="billing-list">
            ${orderData.orders.length ? orderData.orders.map(o => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(o.productTitle || o.productKey)} · ${esc(formatMoney(o.amountMinor, o.currency))} <span class="muted">(PlayHub 수수료 ${esc(formatMoney(o.platformFeeMinor, o.currency))})</span></span>
                  <span class="billing-row-sub">게임 ${esc(o.gameId)} · 플랫폼 ${esc(o.platform)} · 수취계정 <code>${esc(o.connectedAccountId)}</code> · 권한 상태: <strong>${esc(o.entitlementState || '—')}</strong></span>
                </div>
                <div class="billing-row-right">
                  <span class="status-chip ${esc(o.state.toLowerCase())}">${esc(o.state)}</span>
                  ${isDemo && o.state === 'PAID' ? `<button type="button" class="button secondary small" data-direct-sim-refund="${esc(o.id)}">환불→권한 회수 테스트</button>` : ''}
                </div>
              </div>
            `).join('') : '<p class="muted">아직 직접판매 주문 기록이 없습니다.</p>'}
          </div>
        </section>

        <section class="surface" aria-labelledby="direct-ent-heading">
          <div class="section-heading">
            <h2 id="direct-ent-heading">내 보유 게임 권한 (ACTIVE Entitlements)</h2>
            <span class="muted">웹 게임 런타임은 <code>GET /api/billing/entitlements?gameId=...</code>로 확인</span>
          </div>
          <div class="billing-list">
            ${entData.entitlements.length ? entData.entitlements.map(e => `
              <div class="billing-row">
                <div class="billing-row-meta">
                  <span class="billing-row-title">${esc(e.game_id)} · ${esc(e.product_key)}</span>
                  <span class="billing-row-sub">권한 ID <code>${esc(e.id.slice(0, 8))}</code> · 주문 <code>${esc(e.direct_order_id.slice(0, 8))}</code></span>
                </div>
                <div class="billing-row-right">
                  <span class="status-chip active">${esc(e.state)}</span>
                  <button type="button" class="button secondary small" data-consume-ent="${esc(e.id)}">소모성 사용</button>
                </div>
              </div>
            `).join('') : '<p class="muted">현재 보유 중인 ACTIVE 게임 권한이 없습니다.</p>'}
          </div>
        </section>
      </div>`;

      const connectBtn = root.querySelector('#direct-connect-btn');
      if (connectBtn) {
        connectBtn.onclick = async () => {
          connectBtn.disabled = true;
          try {
            const res = await api('/api/billing/creator/connection/start', {
              method: 'POST',
              body: { countryCode: 'KR', returnUrl: `${location.origin}/?view=direct`, refreshUrl: `${location.origin}/?view=direct` }
            });
            if (res.onboardingUrl) {
              location.href = res.onboardingUrl;
              return;
            }
            toast(`✅ Stripe Connect 계정 연결 완료 (${res.connection.connectedAccountId} · 플랫폼 수수료 0%)`);
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '결제 계정 연결에 실패했습니다.' });
            connectBtn.disabled = false;
          }
        };
      }

      const prodForm = root.querySelector('#direct-product-form');
      if (prodForm) {
        const prodErrEl = root.querySelector('#direct-product-error');
        prodForm.onsubmit = async ev => {
          ev.preventDefault();
          if (prodErrEl) { prodErrEl.textContent = ''; prodErrEl.hidden = true; }
          const fd = new FormData(prodForm);
          try {
            await api('/api/billing/creator/products', {
              method: 'POST',
              body: {
                gameId: String(fd.get('gameId') || '').trim(),
                productKey: String(fd.get('productKey') || '').trim(),
                title: String(fd.get('title') || '').trim(),
                kind: String(fd.get('kind') || 'durable'),
                currency: String(fd.get('currency') || 'KRW'),
                amountMinor: Number(fd.get('amountMinor')),
                allowedPlatforms: ['web']
              }
            });
            toast('상품이 등록되었습니다! (웹 직접판매 · PlayHub 수수료 0%)');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, inlineEl: prodErrEl, fallback: '상품 등록에 실패했습니다.' });
          }
        };
      }

      root.querySelectorAll('[data-direct-buy-web]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            const created = await api('/api/billing/direct/orders', {
              method: 'POST',
              headers: { 'Idempotency-Key': `dir-ord-${uuid()}` },
              body: { productId: btn.dataset.directBuyWeb, platform: 'web' }
            });
            await api(`/api/billing/direct/orders/${encodeURIComponent(created.order.id)}/confirm`, {
              method: 'POST',
              headers: { 'Idempotency-Key': `dir-conf-${uuid()}` },
              body: { providerChargeId: created.checkout.providerChargeId }
            });
            toast('🎉 웹 직접구매 완료! PlayHub 수수료 ₩0 · Entitlement(ACTIVE) 즉시 발급됨');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '직접구매 테스트에 실패했습니다.' });
            btn.disabled = false;
          }
        };
      });

      root.querySelectorAll('[data-direct-buy-mobile]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await api('/api/billing/direct/orders', {
              method: 'POST',
              headers: { 'Idempotency-Key': `dir-mob-${uuid()}` },
              body: { productId: btn.dataset.directBuyMobile, platform: 'android' }
            });
          } catch (error) {
            toast(`🛡️ 정책 차단 확인 (${error.code || error.status}): 모바일·TV는 P3 전 무료 플레이 우선(유료 판매 Fail-Closed)`, { type: 'warn' });
          }
        };
      });

      root.querySelectorAll('[data-direct-sim-refund]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await api(`/api/billing/direct/orders/${encodeURIComponent(btn.dataset.directSimRefund)}/simulate-refund`, {
              method: 'POST',
              headers: { 'Idempotency-Key': `dir-ref-${uuid()}` },
              body: { kind: 'REFUNDED' }
            });
            toast('🔄 환불 처리 완료: 해당 게임 Entitlement가 즉시 REVOKED 상태로 회수되었습니다.');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, { toast, fallback: '환불 시뮬레이션에 실패했습니다.' });
            btn.disabled = false;
          }
        };
      });

      root.querySelectorAll('[data-consume-ent]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await api(`/api/billing/entitlements/${encodeURIComponent(btn.dataset.consumeEnt)}/consume`, {
              method: 'POST',
              headers: { 'Idempotency-Key': `ent-use-${uuid()}` },
              body: {}
            });
            toast('✅ 소모성 아이템 권한이 CONSUMED 처리되었습니다.');
            await loadAndRender();
          } catch (error) {
            dispatchBillingError(error, {
              toast,
              fallback: error.code === 'ENTITLEMENT_NOT_CONSUMABLE'
                ? '영구(durable)/패스(pass) 권한은 소모 처리할 수 없으며 계속 유지됩니다.'
                : '권한 사용에 실패했습니다.'
            });
            btn.disabled = false;
          }
        };
      });
    }

    await loadAndRender();
  }

  window.PlayHubBilling = {
    mountShop,
    mountRedeem,
    mountWallet,
    mountDirect,
    refreshHeaderBalance
  };
})();
