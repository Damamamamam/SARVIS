/**
 * SARVIS Web Assistant - browser client application.
 */
document.addEventListener('DOMContentLoaded', async () => {

  // =============================================
  // SETUP WIZARD LOGIC
  // =============================================
  const setupWizard = document.getElementById('setupWizard');
  const setupForm = document.getElementById('setupForm');
  const setupSubmitBtn = document.getElementById('setupSubmitBtn');
  const geminiInput = document.getElementById('setup_SARVIS_GEMINI_API_KEY');
  const geminiField = document.getElementById('setupFieldGemini');
  const appContainer = document.getElementById('appContainer');
  let prefilledKeyExists = false;

  const SETUP_KEY_IDS = [
    'SARVIS_GEMINI_API_KEY',
    'SARVIS_GROQ_API_KEY',
    'SARVIS_OPENROUTER_API_KEY',
    'SARVIS_CEREBRAS_API_KEY',
    'SARVIS_MISTRAL_API_KEY',
    'SARVIS_TOGETHER_API_KEY',
    'SARVIS_COHERE_API_KEY',
    'SARVIS_DEEPSEEK_API_KEY',
    'SARVIS_OPENCODE_ZEN_API_KEY',
  ];

  /** Show the wizard overlay. If prefill=true, loads existing keys into wizard fields. */
  async function showSetupWizard(prefill = false) {
    prefilledKeyExists = false;
    if (prefill) {
      try {
        const currentKeys = await apiLoadKeys();
        prefilledKeyExists = Object.keys(currentKeys).length > 0;
        SETUP_KEY_IDS.forEach(id => {
          const el = document.getElementById('setup_' + id);
          if (el && currentKeys[id] && currentKeys[id] !== `your_${id.toLowerCase().replace('sarvis_', '')}_here`) {
            el.value = currentKeys[id];
          }
        });
        validateGeminiField();
      } catch { /* ignore load errors */ }
    }
    setupWizard?.classList.add('visible');
    setupWizard?.classList.remove('exiting');
    appContainer?.classList.add('hidden-by-wizard');
  }

  /** Animate the wizard out and reveal the main app. */
  function hideSetupWizard() {
    if (!setupWizard) return;
    setupWizard.classList.add('exiting');
    appContainer?.classList.remove('hidden-by-wizard');
    setTimeout(() => {
      setupWizard.classList.remove('visible', 'exiting');
    }, 500);
  }

  /** Validate the Gemini field and toggle the submit button state. */
  function validateGeminiField() {
    const hasKey = prefilledKeyExists || SETUP_KEY_IDS.some(id => {
      const value = document.getElementById('setup_' + id)?.value?.trim() ?? '';
      return value.length > 0 && !value.startsWith('••••');
    });
    if (hasKey) {
      geminiField?.classList.remove('error');
      geminiField?.classList.add('valid');
      if (setupSubmitBtn) setupSubmitBtn.disabled = false;
    } else {
      geminiField?.classList.remove('valid');
      // Don't show error state until user has tried to submit
      if (setupSubmitBtn) setupSubmitBtn.disabled = true;
    }
  }

  SETUP_KEY_IDS.forEach(id => document.getElementById('setup_' + id)?.addEventListener('input', validateGeminiField));

  // Setup form submission
  setupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const hasNewKey = SETUP_KEY_IDS.some(id => {
      const value = document.getElementById('setup_' + id)?.value?.trim() ?? '';
      return value.length > 0 && !value.startsWith('••••');
    });
    if (!hasNewKey && !prefilledKeyExists) {
      geminiField?.classList.add('error');
      geminiField?.classList.remove('valid');
      geminiInput?.focus();
      return;
    }

    // Collect all keys
    const updates = {};
    SETUP_KEY_IDS.forEach(id => {
      const el = document.getElementById('setup_' + id);
      if (el && el.value.trim()) {
        updates[id] = el.value.trim();
      }
    });

    // Save keys and mark setup complete (works in Electron and web).
    try {
      const clean = {};
      for (const [k, v] of Object.entries(updates)) {
        if (v && !String(v).startsWith('••••')) clean[k] = v;
      }
      await apiSaveKeys(clean);
      if (window.jarvisAPI?.completeSetup) await window.jarvisAPI.completeSetup();
      localStorage.setItem('sarvis_setup_complete', 'true');
    } catch (err) {
      console.error('Setup save failed', err);
    }

    // Also update the settings form on the main page
    SETUP_KEY_IDS.forEach(id => {
      const mainInput = document.getElementById(id);
      const setupInput = document.getElementById('setup_' + id);
      if (mainInput && setupInput) {
        mainInput.value = setupInput.value;
      }
    });

    hideSetupWizard();
  });

  // Check first-run state on load (Electron event + proactive check; web falls back to /api/keys).
  if (window.jarvisAPI) {
    // Method 1: Listen for the main process event (sent on ready-to-show)
    window.jarvisAPI.onFirstRunState?.((isFirst) => {
      if (isFirst) showSetupWizard(false);
    });

    // Method 2: Proactive check (fallback if event already fired)
    try {
      const isFirst = await window.jarvisAPI.isFirstRun();
      if (isFirst && !setupWizard?.classList.contains('visible')) {
        showSetupWizard(false);
      }
    } catch { /* ignore */ }
  } else {
    // Web mode: show the wizard only when no provider is configured yet.
    try {
      const keys = await apiLoadKeys();
      const anyConfigured = Object.keys(keys).length > 0;
      const dismissed = localStorage.getItem('sarvis_setup_complete') === 'true';
      if (!anyConfigured && !dismissed) showSetupWizard(false);
    } catch { /* offline: leave the app usable */ }
  }

  // "Reconfigure API Keys" button in Settings tab
  document.getElementById('btnReconfigureKeys')?.addEventListener('click', () => {
    showSetupWizard(true);
  });

  // =============================================
  // NAVIGATION TABS
  // =============================================
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      navItems.forEach(i => i.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Window Controls (Electron only; hidden/no-op on web)
  document.getElementById('btnMinimize')?.addEventListener('click', () => {
    if (window.jarvisAPI?.minimizeToTray) window.jarvisAPI.minimizeToTray();
  });
  document.getElementById('btnClose')?.addEventListener('click', () => {
    if (window.jarvisAPI?.closeApp) window.jarvisAPI.closeApp();
  });

  // =============================================
  // TRANSPORT: Electron IPC when present, else web API + WebSocket.
  // This is what lets SARVIS run as a plain web app.
  // =============================================
  const isElectron = Boolean(window.jarvisAPI?.hear);
  const pendingWs = new Map();
  let wsConn = null;
  let wsState = 'offline'; // offline | connecting | online
  let wsRetryMs = 1000;
  const wsListeners = { status: [], nudge: [] };

  function setTransportBadge(mode) {
    const el = document.getElementById('activeProviderName');
    if (!el) return;
    if (!el.dataset.base) el.dataset.base = el.textContent || 'Rotator Ready';
    el.textContent = isElectron ? el.dataset.base : `${el.dataset.base} · WEB`;
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function ensureWs() {
    if (isElectron || typeof WebSocket === 'undefined') return null;
    if (wsConn && (wsConn.readyState === WebSocket.OPEN || wsConn.readyState === WebSocket.CONNECTING)) return wsConn;
    wsState = 'connecting';
    try {
      wsConn = new WebSocket(wsUrl());
    } catch {
      wsState = 'offline';
      return null;
    }
    wsConn.onopen = () => { wsState = 'online'; wsRetryMs = 1000; };
    wsConn.onclose = () => {
      wsState = 'offline';
      wsConn = null;
      setTimeout(() => { wsRetryMs = Math.min(wsRetryMs * 2, 15000); ensureWs(); }, wsRetryMs);
    };
    wsConn.onerror = () => { try { wsConn?.close(); } catch { /* ignore */ } };
    wsConn.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'reply' && msg.id && pendingWs.has(msg.id)) {
          pendingWs.get(msg.id)(msg);
          pendingWs.delete(msg.id);
        } else if (msg.type === 'nudge') {
          wsListeners.nudge.forEach((fn) => { try { fn(msg.nudge); } catch { /* ignore */ } });
        }
      } catch { /* ignore malformed */ }
    };
    return wsConn;
  }

  function hearViaWs(text, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const ws = ensureWs();
      if (!ws) return reject(new Error('WebSocket unavailable'));
      const id = `w_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
      const timer = setTimeout(() => { pendingWs.delete(id); reject(new Error('Brain timed out')); }, timeoutMs);
      pendingWs.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      const send = () => ws.send(JSON.stringify({ type: 'hear', id, text }));
      if (ws.readyState === WebSocket.OPEN) send();
      else ws.addEventListener('open', send, { once: true });
    });
  }

  async function apiHear(text) {
    if (isElectron) return window.jarvisAPI.hear(text);
    // Prefer WebSocket (live replies + nudges), fall back to REST.
    try {
      const msg = await hearViaWs(text);
      return { reply: msg.reply, degraded: msg.degraded };
    } catch {
      const r = await fetch('/api/hear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error(`Brain HTTP ${r.status}`);
      return r.json();
    }
  }

  async function apiStatus() {
    if (isElectron) return window.jarvisAPI.getStatus();
    const r = await fetch('/api/status');
    if (!r.ok) throw new Error(`Status HTTP ${r.status}`);
    return r.json();
  }

  async function apiLoadKeys() {
    if (isElectron) return window.jarvisAPI.loadKeys();
    const r = await fetch('/api/keys');
    if (!r.ok) return {};
    const { configured } = await r.json();
    // Web never leaks secrets: mark configured keys so inputs show as set.
    const out = {};
    for (const [k, v] of Object.entries(configured || {})) {
      if (v) out[k] = '•••••••• (configured)';
    }
    return out;
  }

  async function apiSaveKeys(updates) {
    if (isElectron) return window.jarvisAPI.saveKeys(updates);
    const r = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `Save HTTP ${r.status}`);
    }
    return r.json();
  }

  async function apiCommand(cmd) {
    if (isElectron && window.jarvisAPI.executeWinCommand) return window.jarvisAPI.executeWinCommand(cmd);
    const r = await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    return r.json().catch(() => ({ success: false }));
  }

  async function apiActiveWindow() {
    if (isElectron && window.jarvisAPI.getActiveWindow) return window.jarvisAPI.getActiveWindow();
    const r = await fetch('/api/active-window');
    if (!r.ok) return null;
    return r.json();
  }

  setTransportBadge();
  if (!isElectron) ensureWs();

  // Chat Elements
  const chatMessages = document.getElementById('chatMessages');
  const txtInput = document.getElementById('txtInput');
  const btnSend = document.getElementById('btnSend');
  const btnVoice = document.getElementById('btnVoice');

  // Voice output toggle (jarvis-mcp `speak` equivalent), persisted.
  let voiceOutput = (localStorage.getItem('sarvis_voice_output') ?? 'on') === 'on';

  function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'msg-avatar';
    avatarDiv.textContent = role === 'user' ? 'U' : role === 'system' ? '!' : 'J';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.innerHTML = formatMarkdown(content);

    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentDiv);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (role === 'assistant') {
      speakReply(content);
    }
  }

  function setVoiceStatus(s) {
    // jarvis-mcp `voice_status` equivalent: surface mic state in the UI.
    let badge = document.getElementById('voiceStatusBadge');
    if (!badge && txtInput?.parentElement) {
      badge = document.createElement('span');
      badge.id = 'voiceStatusBadge';
      badge.style.cssText = 'font-size:11px;color:#888;margin-left:8px;white-space:nowrap;';
      txtInput.parentElement.appendChild(badge);
    }
    if (badge) badge.textContent = s ? `🎙 ${s}` : '';
    btnVoice?.classList.toggle('recording', s === 'listening' || s === 'conversing');
    btnVoice?.setAttribute('title', s ? `Mic: ${s} (click to stop, double-click for converse mode)` : 'Voice input (click = once, double-click = converse mode)');
  }

  function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function formatMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  let sending = false;

  async function handleSend() {
    const text = txtInput.value.trim();
    if (!text || sending) return;
    sending = true;
    btnSend?.setAttribute('disabled', 'true');
    txtInput.value = '';
    appendMessage('user', text);
    setVoiceStatus('thinking…');
    // Typing indicator so sends always get visible feedback.
    const typing = document.createElement('div');
    typing.className = 'message assistant typing';
    typing.innerHTML = '<div class="msg-avatar">J</div><div class="msg-content">…</div>';
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await apiHear(text);
      typing.remove();
      appendMessage('assistant', res.reply || 'No response returned.');
      if (res.degraded) appendMessage('system', 'Note: running in degraded/local mode (no LLM key reached).');
    } catch (err) {
      typing.remove();
      appendMessage('assistant', 'Error communicating with SARVIS brain: ' + (err?.message || err));
    } finally {
      sending = false;
      btnSend?.removeAttribute('disabled');
      setVoiceStatus(converseMode ? 'conversing' : '');
      txtInput.focus();
    }
  }

  btnSend?.addEventListener('click', handleSend);
  txtInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Quick Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query');
      if (query) {
        txtInput.value = query;
        handleSend();
      }
    });
  });

  // Voice Speech Recognition & TTS (+ jarvis-mcp style converse mode).
  // Click mic = single utterance. Double-click = continuous converse loop
  // (speak reply aloud, then listen again) until clicked again.
  let isListening = false;
  let converseMode = false;
  let recognition = null;

  function newRecognizer() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      txtInput.value = transcript;
      handleSend().finally(() => {
        // In converse mode keep the loop alive after each reply is spoken.
        if (converseMode) setTimeout(() => { if (converseMode) startListening(); }, 800);
      });
    };
    rec.onerror = () => {
      if (converseMode) setTimeout(() => { if (converseMode) startListening(); }, 1200);
    };
    rec.onend = () => {
      isListening = false;
      if (!converseMode) {
        setVoiceStatus('');
        btnVoice?.classList.remove('recording');
      } else {
        // Recognition ended but converse mode is on: restart unless TTS speaking.
        setVoiceStatus('conversing');
        if (!window.speechSynthesis?.speaking) setTimeout(() => { if (converseMode && !isListening) startListening(); }, 600);
      }
    };
    return rec;
  }

  function startListening() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      appendMessage('system', 'Speech recognition is not supported in this browser. Type instead.');
      return;
    }
    try {
      recognition = newRecognizer();
      recognition.start();
      isListening = true;
      setVoiceStatus(converseMode ? 'conversing' : 'listening');
    } catch {
      /* mic busy — will retry on next cycle */
    }
  }

  function stopListening() {
    converseMode = false;
    try { recognition?.stop(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    isListening = false;
    setVoiceStatus('');
  }

  btnVoice?.addEventListener('click', () => {
    if (isListening || converseMode) stopListening();
    else startListening();
  });
  // Double-click enters hands-free converse mode (jarvis-mcp `converse` equivalent).
  btnVoice?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (!voiceOutput) {
      voiceOutput = true;
      localStorage.setItem('sarvis_voice_output', 'on');
    }
    converseMode = true;
    appendMessage('system', 'Converse mode on: I will listen, reply aloud, and listen again. Click the mic to stop.');
    if (!isListening) startListening();
    else setVoiceStatus('conversing');
  });

  function speakReply(text) {
    if (!voiceOutput || !('speechSynthesis' in window)) return;
    try {
      const cleanText = String(text).replace(/[*_#`]/g, '').slice(0, 500);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        // jarvis-mcp `get_voice_input` equivalent: resume listening after speaking in converse mode.
        if (converseMode && !isListening) setTimeout(() => { if (converseMode) startListening(); }, 300);
      };
      window.speechSynthesis.cancel(); // Stop current speech
      window.speechSynthesis.speak(utterance);
    } catch { /* TTS unavailable */ }
  }

  // Windows Controls View
  document.getElementById('btnVolUp')?.addEventListener('click', () => {
    apiCommand({ category: 'system', action: 'toggle', target: 'volume_up' });
  });
  document.getElementById('btnVolDown')?.addEventListener('click', () => {
    apiCommand({ category: 'system', action: 'toggle', target: 'volume_down' });
  });
  document.getElementById('btnVolMute')?.addEventListener('click', () => {
    apiCommand({ category: 'system', action: 'toggle', target: 'volume_mute' });
  });

  const rngBrightness = document.getElementById('rngBrightness');
  const lblBrightnessVal = document.getElementById('lblBrightnessVal');
  rngBrightness?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    const pct = Math.round((val / 255) * 100);
    if (lblBrightnessVal) lblBrightnessVal.textContent = `${pct}%`;
  });
  rngBrightness?.addEventListener('change', (e) => {
    const val = Number(e.target.value);
    apiCommand({ category: 'system', action: 'setBrightness', level: val });
  });

  // App Launcher Chips
  document.querySelectorAll('.app-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const appName = chip.getAttribute('data-app');
      if (appName) {
        apiCommand({ category: 'app', action: 'launchApp', pkg: appName });
      }
    });
  });

  // Settings & API Keys Form
  const keysForm = document.getElementById('keysForm');
  const lblSaveStatus = document.getElementById('lblSaveStatus');

  async function loadSettingsKeys() {
    try {
      const keys = await apiLoadKeys();
      for (const [k, v] of Object.entries(keys)) {
        const input = document.getElementById(k);
        // Never overwrite a value the user is currently editing; in web mode
        // values are masked placeholders, so only fill empty inputs.
        if (input && (!input.value || !isElectron)) {
          if (isElectron || !input.value) input.value = v;
        }
      }
    } catch { /* settings load is best-effort */ }
  }
  await loadSettingsKeys();

  keysForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {};
    const keyIds = [
      'SARVIS_GEMINI_API_KEY',
      'SARVIS_GROQ_API_KEY',
      'SARVIS_OPENROUTER_API_KEY',
      'SARVIS_CEREBRAS_API_KEY',
      'SARVIS_MISTRAL_API_KEY',
      'SARVIS_TOGETHER_API_KEY',
      'SARVIS_COHERE_API_KEY',
      'SARVIS_DEEPSEEK_API_KEY',
      'SARVIS_OPENCODE_ZEN_API_KEY',
    ];
    keyIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value.trim() && !el.value.startsWith('••••')) updates[id] = el.value.trim();
    });

    try {
      const res = await apiSaveKeys(updates);
      if (res.success && lblSaveStatus) {
        lblSaveStatus.textContent = '✓ API Keys Saved & Rotator Reloaded';
        setTimeout(() => { lblSaveStatus.textContent = ''; }, 3000);
      }
      if (!isElectron) localStorage.setItem('sarvis_setup_complete', 'true');
    } catch (err) {
      if (lblSaveStatus) lblSaveStatus.textContent = '✗ Save failed: ' + (err?.message || err);
    }
  });

  // Status Polling for 9-Key Rotator Dashboard & Active App
  async function pollStatus() {
    try {
      const status = await apiStatus();
      if (!status) return;

      // Update Header Provider Badge
      const activeKey = status.rotator.keys.find(k => k.state === 'ACTIVE');
      const lblActiveProvider = document.getElementById('activeProviderName');
      if (lblActiveProvider) {
        lblActiveProvider.textContent = activeKey ? `Active: ${activeKey.provider.toUpperCase()}` : 'Degraded (No Active Key)';
      }

      // Update Rotator Grid
      const grid = document.getElementById('rotatorGrid');
      if (grid) {
        grid.innerHTML = status.rotator.keys.map(k => `
          <div class="provider-card ${k.state === 'ACTIVE' ? 'active' : ''}">
            <div class="provider-name">${k.provider}</div>
            <div class="provider-badge ${k.state}">${k.state}</div>
            <div class="provider-stats">Calls: ${k.stats.calls} | Failures: ${k.stats.failures}</div>
          </div>
        `).join('');
      }

      // Active Window
      const win = await apiActiveWindow();
      const lblActiveApp = document.getElementById('lblActiveApp');
      if (lblActiveApp && win) {
        lblActiveApp.textContent = win.name ? `${win.name} (${String(win.title || '').slice(0, 15)}...)` : 'None';
      }
    } catch {
      /* ignore background poll errors */
    }
  }

  // Live nudges over WebSocket (web mode) mirror Electron's brain:nudge.
  wsListeners.nudge.push((nudge) => {
    appendMessage('assistant', `⚠️ Screen-time nudge: you've been on ${nudge.app} for ${Math.round((nudge.totalMs || 0) / 60000)} min.`);
  });
  if (window.jarvisAPI?.onNudge) {
    window.jarvisAPI.onNudge((nudge) => {
      appendMessage('assistant', `⚠️ Screen-time nudge: you've been on ${nudge.app} for ${Math.round((nudge.totalMs || 0) / 60000)} min.`);
    });
  }

  // Voice-output toggle button next to the mic (jarvis-mcp `speak` on/off).
  if (btnVoice && !document.getElementById('btnVoiceOut')) {
    const t = document.createElement('button');
    t.id = 'btnVoiceOut';
    t.className = 'mic-btn';
    t.title = 'Toggle spoken replies';
    t.textContent = voiceOutput ? '🔊' : '🔇';
    t.style.marginLeft = '6px';
    t.addEventListener('click', () => {
      voiceOutput = !voiceOutput;
      localStorage.setItem('sarvis_voice_output', voiceOutput ? 'on' : 'off');
      t.textContent = voiceOutput ? '🔊' : '🔇';
      if (!voiceOutput) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
    });
    btnVoice.parentElement?.appendChild(t);
  }

  setInterval(pollStatus, 5000);
  pollStatus();
  txtInput?.focus();
});
