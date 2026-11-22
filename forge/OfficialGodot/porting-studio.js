(() => {
  'use strict';

  const query = new URLSearchParams(location.search);
  const embedded = query.get('embedded') === '1';
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const apiPath = route => (forgeBase && route.startsWith('/') && !route.startsWith(forgeBase + '/')) ? forgeBase + route : route;

  const $ = id => document.getElementById(id);
  let csrfToken = null;
  let lastBundle = null;

  const SAMPLES = {
    roblox: {
      name: 'RobloxCoinRunner',
      code: `local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local score = 0
local coinPart = Instance.new("Part")
coinPart.Size = Vector3.new(2, 2, 0.5)
coinPart.Position = Vector3.new(0, 3, -10)

coinPart.Touched:Connect(function(hit)
  local player = Players:GetPlayerFromCharacter(hit.Parent)
  if player then
    score += 10
    print("Score:", score)
  end
end)

RunService.Heartbeat:Connect(function(dt)
  coinPart.CFrame = coinPart.CFrame * CFrame.Angles(0, math.rad(90 * dt), 0)
end)`
    },
    unity: {
      name: 'UnityTopDownShooter',
      code: `using UnityEngine;

public class PlayerController : MonoBehaviour {
    [SerializeField] private float moveSpeed = 6.5f;
    [SerializeField] private GameObject bulletPrefab;
    private Rigidbody2D rb;

    void Awake() {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update() {
        Vector2 move = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")).normalized;
        rb.linearVelocity = move * moveSpeed;
        if (Input.GetKeyDown(KeyCode.Space) && bulletPrefab != null) {
            Instantiate(bulletPrefab, transform.position, Quaternion.identity);
        }
    }
}`
    },
    unreal: {
      name: 'UnrealDashHero',
      code: `// Unreal Engine 5 ACharacter Dash & Jump Blueprint/C++ Summary
class ADashHeroCharacter : public ACharacter {
  UPROPERTY(EditAnywhere, BlueprintReadWrite)
  float DashImpulseCm = 1200.0f;

  UFUNCTION(BlueprintCallable)
  void PerformDash() {
    FVector Forward = GetActorForwardVector();
    LaunchCharacter(Forward * DashImpulseCm, true, false);
  }

  virtual void BeginPlay() override {
    Super::BeginPlay();
    GetCharacterMovement()->JumpZVelocity = 620.0f;
  }
};`
    }
  };

  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const r = await fetch(apiPath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    csrfToken = d.csrfToken || null;
    return csrfToken;
  }

  async function refreshStatus() {
    try {
      await ensureCsrf();
      const r = await fetch(apiPath('/api/porting/status'), { credentials: 'same-origin', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        $('quota-pill').textContent = '포팅 준비 필요';
        return;
      }
      if (d.userByokConnected) {
        $('quota-pill').textContent = `본인 AI 연동됨 (${d.userByokProvider}) · 0 PlayCoin`;
      } else {
        const qLabel = d.planTier === 'pro' ? 'Pro 주간 한도' : 'Free 체험 한도';
        const rem = Number(d.quota?.remainingTokens || 0).toLocaleString();
        const coins = Number(d.wallet?.available || 0).toLocaleString();
        $('quota-pill').textContent = `${qLabel} ${rem} 토큰 · 🪙 ${coins} PlayCoin`;
      }
    } catch {
      $('quota-pill').textContent = '연결 확인 실패';
    }
  }

  function setStatus(msg, kind = '') {
    const el = $('status-box');
    el.textContent = msg;
    el.className = 'status' + (kind ? ` ${kind}` : '');
  }

  function renderFiles(files) {
    const tabs = $('file-tabs');
    const viewer = $('file-viewer');
    tabs.replaceChildren();
    files.forEach((file, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-tab' + (idx === 0 ? ' active' : '');
      btn.textContent = file.path;
      btn.onclick = () => {
        for (const c of tabs.children) c.classList.remove('active');
        btn.classList.add('active');
        viewer.textContent = file.content;
      };
      tabs.append(btn);
    });
    viewer.textContent = files[0]?.content || '';
  }

  document.querySelectorAll('[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sample;
      const sample = SAMPLES[key];
      if (!sample) return;
      $('source-engine').value = key;
      $('project-name').value = sample.name;
      $('source-code').value = sample.code;
    });
  });

  $('close-btn').addEventListener('click', () => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ source: 'playforge-porting-studio', type: 'close' }, location.origin);
    } else {
      location.href = apiPath('/OfficialGodot/');
    }
  });

  $('convert-btn').addEventListener('click', async () => {
    const sourceCode = $('source-code').value.trim();
    if (!sourceCode) {
      setStatus('포팅할 원본 코드를 입력하거나 예제 버튼을 눌러주세요.', 'error');
      return;
    }
    $('convert-btn').disabled = true;
    setStatus('정적 API 매핑 분석 및 Gemini AI 심층 포팅을 진행 중입니다…');
    try {
      const token = await ensureCsrf();
      const byokProvider = $('byok-provider').value;
      const byokKey = $('byok-key').value.trim();
      const payload = {
        sourceEngine: $('source-engine').value,
        projectName: $('project-name').value.trim() || 'PortedGodotGame',
        sourceCode,
        instructions: $('instructions').value.trim(),
        createNewProject: $('save-new-project').checked,
        ...(byokProvider && byokKey ? { byok: { provider: byokProvider, apiKey: byokKey } } : {})
      };
      const res = await fetch(apiPath('/api/porting/convert'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-CSRF-Token': token } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `포팅 변환 실패 (HTTP ${res.status})`);
      }

      lastBundle = data;
      const b = data.billing || {};
      const receipt = b.authMode === 'user_byok'
        ? '본인 AI 키 사용 · 0 PlayCoin 차감'
        : b.chargedCoins > 0
          ? `🪙 ${b.chargedCoins} PlayCoin 차감 (총 ${Number(b.tokenUsage?.totalTokens || 0).toLocaleString()} 토큰)`
          : `✨ 포함 한도 적용 · 0 PlayCoin 차감 (사용 ${Number(b.tokenUsage?.quotaTokensUsed || 0).toLocaleString()} 가중 토큰)`;

      setStatus(`포팅 완료! (${receipt})`, 'ok');
      $('result-card').hidden = false;
      $('result-title').textContent = `${data.projectName} · 파일 ${(data.files || []).length}개`;
      $('result-summary').textContent = data.summary || '';
      renderFiles(data.files || []);

      const openLink = $('open-project-link');
      if (data.savedProject?.id) {
        openLink.href = apiPath(`/OfficialGodot/editor.html?project=${encodeURIComponent(data.savedProject.id)}`);
        openLink.style.display = 'inline-block';
        if (embedded && window.parent !== window) {
          window.parent.postMessage({
            source: 'playforge-porting-studio',
            type: 'ported-project',
            projectId: data.savedProject.id,
            projectName: data.savedProject.name
          }, location.origin);
        }
      } else {
        openLink.style.display = 'none';
      }
      await refreshStatus();
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      $('convert-btn').disabled = false;
    }
  });

  $('download-json-btn').addEventListener('click', () => {
    if (!lastBundle) return;
    const blob = new Blob([JSON.stringify({
      projectName: lastBundle.projectName,
      sourceEngine: lastBundle.sourceEngine,
      files: lastBundle.files
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(lastBundle.projectName || 'ported-godot').toLowerCase()}.godot-bundle.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  void refreshStatus();
})();
