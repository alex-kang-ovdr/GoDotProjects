// Hub-Billing Web Portal Controller (M1)
// Views:
// - /?view=billing : PlayCoin +25% Web/PC Shop, Free vs Pro Subscription, 0% Creator Direct Policy
// - /?view=wallet  : 3-Bucket PlayCoin Wallet, Usage, 7-day One-Click Withdrawal, Ledger & Entitlements

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
    paymentMethod: 'xsolla_auto',
    catalog: null,
    walletData: null,
    ledgerData: null,
    pendingCheckout: null,
    busy: false
  };

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

  function openCheckoutDialog({ item, catalog, api, toast, onComplete }) {
    const dialog = ensureCheckoutDialog();
    const isMock = catalog.billingMode === 'mock';
    let selectedMethod = uiState.currency === 'KRW' ? 'card_kr' : 'google_pay';
    let createdOrder = null;

    const methodOptions = uiState.currency === 'KRW'
      ? [
          { id: 'card_kr', label: '국내 신용/체크카드' },
          { id: 'kakaopay', label: '카카오페이' },
          { id: 'naverpay', label: '네이버페이' },
          { id: 'tosspay', label: '토스페이' }
        ]
      : [
          { id: 'google_pay', label: 'Google Pay (0% 수수료)' },
          { id: 'card_global', label: 'Visa / Mastercard' },
          { id: 'apple_pay', label: 'Apple Pay' },
          { id: 'paypal', label: 'PayPal' }
        ];

    function renderDialog() {
      dialog.innerHTML = `
        <div class="dialog-heading">
          <h2 id="billing-checkout-title">PlayCoin 구매 확인</h2>
          <button class="icon-button" type="button" data-billing-close aria-label="닫기">×</button>
        </div>
        ${isMock ? '<p class="billing-badge sandbox" style="margin:6px 0 0;color:#854d0e;background:#fef9c3;border-color:#fde047;">샌드박스 Mock PG 모드 · 실제 결제가 청구되지 않습니다</p>' : ''}
        <div class="checkout-summary">
          <div class="checkout-summary-line"><span>결제 금액</span><strong>${esc(formatMoney(item.amountMinor, item.currency))}</strong></div>
          <div class="checkout-summary-line"><span>유상 기본 (paid)</span><span>${esc(formatCoins(item.baseCoins))}</span></div>
          <div class="checkout-summary-line"><span>웹·PC 보너스 (+${esc(item.bonusPercent)}%, bonus)</span><strong style="color:#2c6e3b;">+${esc(formatCoins(item.bonusCoins))}</strong></div>
          <div class="checkout-summary-line total"><span>총 지급량</span><span>🪙 ${esc(formatCoins(item.totalCoins))}</span></div>
        </div>
        ${!createdOrder ? `
          <p class="checkout-notice" style="margin-bottom:4px;"><strong>결제 수단 선택</strong> ${uiState.currency === 'KRW' ? '(한국 KRW · 로컬 간편결제/카드)' : '(글로벌 · Google Pay Instant Flow 지원)'}</p>
          <div class="checkout-methods">
            ${methodOptions.map(m => `<button type="button" class="checkout-method-btn" data-pay-method="${esc(m.id)}" aria-pressed="${String(selectedMethod === m.id)}">${esc(m.label)}</button>`).join('')}
          </div>
          <label class="check-row" style="font-size:13px;margin:8px 0;">
            <input type="checkbox" id="billing-agree-terms">
            <span>유상 원금(${esc(item.baseCoins)})과 채널 보너스(+${esc(item.bonusCoins)}) 구분을 확인했으며, <strong>결제 후 7일 이내 미사용 시 전액 청약철회 가능(원금 또는 보너스 1 PlayCoin 이상 사용 시 청약철회 제한)</strong> 및 미성년자 법정대리인 동의 안내에 동의합니다.</span>
          </label>
          <div id="billing-checkout-error" class="inline-error" role="alert" hidden></div>
          <div class="dialog-actions">
            <button type="button" class="button secondary" data-billing-close>취소</button>
            <button type="button" class="button primary" id="billing-create-order" disabled>${isMock ? '샌드박스 주문 생성' : '결제 진행'}</button>
          </div>
        ` : `
          <div class="checkout-summary" style="background:#eef7ea;border-color:#b8d7b0;">
            <div class="checkout-summary-line"><span>주문 번호</span><code>${esc(createdOrder.order.id.slice(0, 12))}…</code></div>
            <div class="checkout-summary-line"><span>라우팅 PG</span><strong>${esc(createdOrder.route.provider.toUpperCase())} (${esc(createdOrder.checkout.mode)})</strong></div>
            <div class="checkout-summary-line"><span>상태</span><span>승인 대기</span></div>
          </div>
          <p class="checkout-notice">서버에서 주문 생성 및 연령·월 한도·25% 보너스 검증이 완료되었습니다. 아래 버튼을 누르면 서버 검증 후 Zero-Sum 복식부기 원장에 즉시 반영됩니다.</p>
          <div id="billing-checkout-error" class="inline-error" role="alert" hidden></div>
          <div class="dialog-actions">
            <button type="button" class="button secondary" data-billing-close>닫기</button>
            <button type="button" class="button primary" id="billing-confirm-mock">테스트 결제 승인 (즉시 지급)</button>
          </div>
        `}
      `;

      dialog.querySelectorAll('[data-billing-close]').forEach(btn => {
        btn.onclick = () => dialog.close();
      });

      if (!createdOrder) {
        const agree = dialog.querySelector('#billing-agree-terms');
        const submitBtn = dialog.querySelector('#billing-create-order');
        dialog.querySelectorAll('[data-pay-method]').forEach(btn => {
          btn.onclick = () => {
            selectedMethod = btn.dataset.payMethod;
            dialog.querySelectorAll('[data-pay-method]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.payMethod === selectedMethod)));
          };
        });
        agree.onchange = () => { submitBtn.disabled = !agree.checked; };
        submitBtn.onclick = async () => {
          const errEl = dialog.querySelector('#billing-checkout-error');
          errEl.hidden = true;
          submitBtn.disabled = true;
          submitBtn.textContent = '주문 생성 중…';
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
            if (res.checkout?.mode !== 'mock' && res.checkout?.checkoutUrl) {
              location.href = res.checkout.checkoutUrl;
              return;
            }
            createdOrder = res;
            renderDialog();
          } catch (error) {
            errEl.textContent = error.message || '주문을 생성하지 못했습니다.';
            errEl.hidden = false;
            submitBtn.disabled = !agree.checked;
            submitBtn.textContent = isMock ? '샌드박스 주문 생성' : '결제 진행';
          }
        };
      } else {
        const confirmBtn = dialog.querySelector('#billing-confirm-mock');
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
            toast(`🪙 ${formatCoins(createdOrder.order.totalCoins)} 지급 완료! (보너스 +${createdOrder.order.bonusCoins})`);
            await onComplete(confirmed);
          } catch (error) {
            errEl.textContent = error.message || '결제 확인에 실패했습니다.';
            errEl.hidden = false;
            confirmBtn.disabled = false;
            confirmBtn.textContent = '테스트 결제 승인 (즉시 지급)';
          }
        };
      }
    }

    renderDialog();
    if (!dialog.open) dialog.showModal();
  }

  async function mountShop(root, { api, toast, navigate, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>PlayCoin 상점을 불러오고 있습니다</h1></section></div>`;

    async function loadAndRender() {
      let catalog, walletData;
      try {
        [catalog, walletData] = await Promise.all([
          api(`/api/billing/catalog?currency=${encodeURIComponent(uiState.currency)}&channel=${encodeURIComponent(uiState.channel)}`, { timeout: 6000 }),
          api('/api/billing/wallet', { timeout: 6000 })
        ]);
      } catch (error) {
        root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>PlayCoin 과금 기능을 사용할 수 없습니다</h1><p class="muted">${esc(error.message || '서버에서 과금 모듈이 비활성 상태입니다.')}</p></section></div>`;
        return;
      }

      uiState.catalog = catalog;
      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      const authed = Boolean(walletData?.authenticated);
      const isPro = walletData?.subscription?.effectivePlan === 'pro';
      const isMock = catalog.billingMode === 'mock';

      root.innerHTML = `<div class="page billing-page">
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
            <span class="billing-badge">🌐 Xsolla MoR (200+국 VAT)</span>
            <span class="billing-badge">💳 Google Pay Web (글로벌 0% 수수료)</span>
            <span class="billing-badge">🇰🇷 카카오페이 · 네이버페이 · 토스페이 · 국내카드</span>
            <span class="billing-badge">🎁 기프트카드 최대 +25% (M2)</span>
            ${isMock ? '<span class="billing-badge sandbox">🧪 샌드박스 Mock PG 활성 (실청구 없음)</span>' : ''}
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
              : `${catalog.allowDemoAccount ? '<button type="button" class="button primary small" id="billing-demo-signin">🧪 데모 계정으로 바로 체험</button>' : ''}
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
                  : `<button type="button" class="button primary small" id="billing-start-pro" ${!authed || !isMock ? 'disabled' : ''}>${isMock ? '샌드박스 Pro 시작' : 'Pro 출시 예정'}</button>`
                }
              </div>
            </article>
          </div>
        </section>

        <section class="zero-fee-banner" aria-labelledby="zero-fee-title">
          <h3 id="zero-fee-title">창작자 UGC 게임·아이템 직접판매 — PlayHub 플랫폼 수수료 0%</h3>
          <p>창작자가 직접 판매자(Stripe Connect Direct Charges 등)로 대금을 수취하며 PlayHub는 판매대금을 보관하거나 정산하지 않습니다. PlayHub는 서버 기반 결제 검증과 게임 내 구매 권한(Entitlement) 발급·회수만 제공합니다. (Android·iOS·TV는 스토어 정책 검증 전까지 무료 플레이 우선)</p>
        </section>
      </div>`;

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
            toast(error.message || '데모 로그인에 실패했습니다.');
            demoBtn.disabled = false;
            demoBtn.textContent = '🧪 데모 계정으로 바로 체험';
          }
        };
      }

      root.querySelectorAll('[data-buy-sku]').forEach(btn => {
        btn.onclick = () => {
          if (!authed) {
            toast('PlayCoin 구매는 로그인된 계정에서만 가능합니다. 상단 데모 로그인 또는 Google 로그인을 이용해 주세요.');
            return;
          }
          const item = catalog.items.find(i => i.skuId === btn.dataset.buySku);
          if (!item) return;
          openCheckoutDialog({
            item,
            catalog,
            api,
            toast,
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
            toast(error.message || 'Pro 구독 활성화에 실패했습니다.');
            proBtn.disabled = false;
          }
        };
      }
    }

    await loadAndRender();
  }

  async function mountWallet(root, { api, toast, navigate, refreshSession }) {
    root.innerHTML = `<div class="page billing-page"><section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><h1>내 PlayCoin 지갑을 불러오고 있습니다</h1></section></div>`;

    async function loadAndRender() {
      let walletData;
      try {
        walletData = await api('/api/billing/wallet', { timeout: 6000 });
      } catch (error) {
        root.innerHTML = `<div class="page billing-page"><section class="surface"><h1>지갑을 불러오지 못했습니다</h1><p class="muted">${esc(error.message)}</p></section></div>`;
        return;
      }

      uiState.walletData = walletData;
      updateHeaderPill(walletData);

      if (!walletData.authenticated) {
        root.innerHTML = `<div class="page billing-page">
          <div class="section-heading"><h1>내 PlayCoin 지갑</h1><a class="button secondary small" href="/?view=billing" data-route>← PlayCoin 상점</a></div>
          <section class="surface">
            <h2>로그인이 필요합니다</h2>
            <p class="muted">PlayCoin 잔액, 구독 현황, 7일 청약철회 및 보유 아이템 권한(Entitlement)을 확인하려면 로그인해 주세요.</p>
            <div class="save-actions">
              ${walletData.allowDemoAccount ? '<button type="button" class="button primary" id="wallet-demo-signin">🧪 데모 계정으로 바로 체험</button>' : ''}
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
              toast(error.message || '데모 로그인 실패');
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
      const isPro = sub.effectivePlan === 'pro';

      root.innerHTML = `<div class="page billing-page">
        <div class="section-heading">
          <h1>내 PlayCoin 지갑</h1>
          <a class="button primary small" href="/?view=billing" data-route>+ PlayCoin 충전 (최대 +25%)</a>
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
            toast(error.message || '구독 해지에 실패했습니다.');
            cancelProBtn.disabled = false;
          }
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
            toast(error.message || '청약철회를 처리하지 못했습니다.');
            btn.disabled = false;
            btn.textContent = '7일 청약철회';
          }
        };
      });
    }

    await loadAndRender();
  }

  window.PlayHubBilling = {
    mountShop,
    mountWallet,
    refreshHeaderBalance
  };
})();
