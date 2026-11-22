(() => {
  'use strict';

  const PROVIDER_LABELS = {
    google: 'Google',
    naver: '네이버',
    email: '이메일',
    apple: 'Apple',
    guest: '게스트'
  };

  const LAST_PROVIDER_KEY = 'playhub.lastAuthProvider';

  function $(id) {
    return document.getElementById(id);
  }

  function loadLastProvider() {
    try {
      const value = localStorage.getItem(LAST_PROVIDER_KEY);
      return value && PROVIDER_LABELS[value] ? value : null;
    } catch {
      return null;
    }
  }

  function saveLastProvider(provider) {
    if (!provider || !PROVIDER_LABELS[provider]) return;
    try {
      localStorage.setItem(LAST_PROVIDER_KEY, provider);
    } catch {}
  }

  function setStatusBadge(el, text, isRecent = false) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('recent');
      return;
    }
    el.textContent = text;
    el.classList.toggle('recent', isRecent);
    el.hidden = false;
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function init(hooks) {
    const { api, getState, onAuthenticated, beforeAccountChange, navigate, toast } = hooks;
    const selectorBox = $('sso-auth-selector');
    const guestBtn = $('guest-login');
    const guestLabel = $('guest-login-label');
    const googleStatus = $('google-login-status');
    const naverStatus = $('naver-login-status');
    const guestStatus = $('guest-login-status');
    const emailStatus = $('email-login-status');
    const emailSection = $('email-auth-section');
    const loginTab = $('sso-tab-login');
    const registerTab = $('sso-tab-register');
    const loginForm = $('email-login-form');
    const registerForm = $('email-register-form');
    const errorBox = $('email-auth-error');
    const pwDetails = $('email-password-section');
    const pwForm = $('email-password-form');
    const pwError = $('email-password-error');

    let mode = 'login';
    let busy = false;

    function setMode(next) {
      mode = next === 'register' ? 'register' : 'login';
      if (loginTab) loginTab.setAttribute('aria-selected', String(mode === 'login'));
      if (registerTab) registerTab.setAttribute('aria-selected', String(mode === 'register'));
      if (loginForm) loginForm.hidden = mode !== 'login';
      if (registerForm) registerForm.hidden = mode !== 'register';
      showError(errorBox, '');
    }

    if (loginTab) loginTab.onclick = () => setMode('login');
    if (registerTab) registerTab.onclick = () => setMode('register');

    function setBusy(value) {
      busy = value;
      for (const form of [loginForm, registerForm, pwForm]) {
        if (!form) continue;
        for (const btn of form.querySelectorAll('button[type="submit"]')) btn.disabled = value;
      }
    }

    async function submitEmailAuth(endpoint, payload, successMessage) {
      if (busy) return;
      showError(errorBox, '');
      const proceed = async () => {
        setBusy(true);
        try {
          const session = await api(endpoint, { method: 'POST', body: payload });
          loginForm?.reset();
          registerForm?.reset();
          await onAuthenticated(session, successMessage);
        } catch (error) {
          if (window.PlayHubErrorUI?.isFatalError?.(error) || !error.status || error.status >= 500) {
            window.PlayHubErrorUI?.report?.(error, { fallback: '요청을 처리하지 못했습니다.' });
          } else {
            showError(errorBox, error.message || '요청을 처리하지 못했습니다.');
          }
        } finally {
          setBusy(false);
        }
      };

      const blocked = await beforeAccountChange(proceed, '이메일로 계속');
      if (!blocked) await proceed();
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('email-login-input')?.value.trim() || '';
        const password = $('email-login-password')?.value || '';
        if (!email || !password) {
          showError(errorBox, '이메일과 비밀번호를 입력해 주세요.');
          return;
        }
        await submitEmailAuth('/api/auth/email/login', { email, password }, '이메일 계정으로 로그인했습니다.');
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('email-register-input')?.value.trim() || '';
        const displayName = $('email-register-name')?.value.trim() || '';
        const password = $('email-register-password')?.value || '';
        const confirm = $('email-register-password-confirm')?.value || '';
        if (!email) {
          showError(errorBox, '이메일 주소를 입력해 주세요.');
          return;
        }
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          showError(errorBox, '비밀번호는 8자 이상이며 영문과 숫자를 모두 포함해야 합니다.');
          return;
        }
        if (password !== confirm) {
          showError(errorBox, '비밀번호 확인이 일치하지 않습니다.');
          return;
        }
        const payload = displayName ? { email, password, displayName } : { email, password };
        await submitEmailAuth('/api/auth/email/register', payload, '이메일 회원가입과 로그인이 완료되었습니다.');
      });
    }

    if (pwForm) {
      pwForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (busy) return;
        showError(pwError, '');
        const currentPassword = $('email-current-password')?.value || '';
        const newPassword = $('email-new-password')?.value || '';
        const confirm = $('email-new-password-confirm')?.value || '';
        if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
          showError(pwError, '새 비밀번호는 8자 이상이며 영문과 숫자를 모두 포함해야 합니다.');
          return;
        }
        if (newPassword !== confirm) {
          showError(pwError, '새 비밀번호 확인이 일치하지 않습니다.');
          return;
        }
        setBusy(true);
        try {
          await api('/api/auth/email/password', { method: 'POST', body: { currentPassword, newPassword } });
          pwForm.reset();
          if (pwDetails) pwDetails.open = false;
          toast('비밀번호를 변경했습니다.');
        } catch (error) {
          if (window.PlayHubErrorUI?.isFatalError?.(error) || !error.status || error.status >= 500) {
            window.PlayHubErrorUI?.report?.(error, { fallback: '비밀번호를 변경하지 못했습니다.' });
          } else {
            showError(pwError, error.message || '비밀번호를 변경하지 못했습니다.');
          }
        } finally {
          setBusy(false);
        }
      });
    }

    if (guestBtn) {
      guestBtn.addEventListener('click', async () => {
        if (busy) return;
        const { session } = getState();
        if (session?.kind === 'guest') {
          toast('게스트 계정으로 계속 플레이합니다.');
          navigate?.('/');
          return;
        }
        setBusy(true);
        guestBtn.disabled = true;
        try {
          const next = await api('/api/auth/guest', { method: 'POST', body: {} });
          await onAuthenticated(next, '게스트 모드로 시작했습니다.');
          navigate?.('/');
        } catch (error) {
          showError(errorBox, error.message || '게스트 세션을 시작하지 못했습니다.');
        } finally {
          setBusy(false);
          guestBtn.disabled = false;
        }
      });
    }

    function update() {
      const { session, limited, authStale } = getState();
      const registered = session?.kind === 'registered';
      const isGuest = session?.kind === 'guest';
      const online = Boolean(session && !limited && !authStale);
      const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
      const secureOrigin = location.protocol === 'https:' || loopback;

      if (registered && session.authProvider) saveLastProvider(session.authProvider);
      else if (isGuest) saveLastProvider('guest');
      const lastProvider = loadLastProvider();

      if (selectorBox) selectorBox.hidden = !online || registered;

      const canEmail = Boolean(online && !registered && session.emailEnabled);
      if (emailSection) emailSection.hidden = !canEmail;
      if (pwDetails) pwDetails.hidden = !(online && registered && session.authProvider === 'email');

      if (!session?.googleEnabled) setStatusBadge(googleStatus, '준비 중', false);
      else if (!secureOrigin) setStatusBadge(googleStatus, '보안 연결 필요', false);
      else setStatusBadge(googleStatus, lastProvider === 'google' ? '최근 사용' : '', true);

      if (!session?.naverEnabled) setStatusBadge(naverStatus, '준비 중', false);
      else if (!secureOrigin) setStatusBadge(naverStatus, '보안 연결 필요', false);
      else setStatusBadge(naverStatus, lastProvider === 'naver' ? '최근 사용' : '', true);

      setStatusBadge(guestStatus, lastProvider === 'guest' ? '최근 사용' : '', true);
      setStatusBadge(emailStatus, canEmail && lastProvider === 'email' ? '최근 사용' : '', true);

      if (guestBtn && guestLabel) {
        guestBtn.disabled = !online || registered || busy;
        guestLabel.textContent = isGuest ? '게스트로 계속하기 (이용 중)' : '게스트로 계속하기';
      }

      const badge = $('identity-provider-badge');
      if (badge) {
        const provider = registered ? session.authProvider : (isGuest ? 'guest' : null);
        if (provider && PROVIDER_LABELS[provider]) {
          badge.textContent = PROVIDER_LABELS[provider];
          badge.dataset.provider = provider;
          badge.hidden = false;
        } else {
          badge.hidden = true;
          badge.textContent = '';
          delete badge.dataset.provider;
        }
      }
    }

    setMode('login');
    return { update };
  }

  window.PlayHubSso = { init, PROVIDER_LABELS };
})();
