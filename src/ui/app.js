/* SARVIS minimal web and desktop client. */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const state = { keys: [], sending: false, voiceOutput: localStorage.getItem('sarvis_voice_output') !== 'off' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function formatText(value) {
    return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function appendMessage(role, content) {
    const row = document.createElement('article');
    row.className = `message ${role}`;
    row.innerHTML = `<div class="avatar">${role === 'user' ? 'U' : role === 'system' ? '!' : 'S'}</div><div><p class="message-label">${role === 'user' ? 'YOU' : role === 'system' ? 'SYSTEM' : 'SARVIS'}</p><p>${formatText(content)}</p></div>`;
    $('chatMessages').appendChild(row);
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    if (role === 'assistant' && state.voiceOutput && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(String(content).slice(0, 600))); } catch { /* optional */ }
    }
  }

  async function apiJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  const apiKeys = () => apiJson('/api/keys');
  const apiStatus = () => apiJson('/api/status');
  const apiSaveCustomKeys = (keys) => apiJson('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys }) });

  function customPayload() {
    return state.keys.filter((key) => key.source === 'custom').map((key) => ({
      id: key.id, label: key.label, provider: key.provider, endpoint: key.endpoint, model: key.model,
      // The server preserves the existing secret when apiKey is omitted.
    }));
  }

  async function refreshKeys() {
    const data = await apiKeys();
    state.keys = data.keys || [];
    renderKeys();
    return data;
  }

  function renderKeys() {
    const list = $('keysList');
    if (!list) return;
    const count = state.keys.length;
    $('keySummary').textContent = `${count} connection${count === 1 ? '' : 's'} configured. Add as many as you need.`;
    list.innerHTML = count ? state.keys.map((key) => `
      <article class="key-card">
        <div><h3>${escapeHtml(key.label || key.provider)}</h3><p class="key-meta">${escapeHtml(key.provider)} · ${escapeHtml(key.model || 'default')} · ${escapeHtml(key.endpoint)}</p></div>
        <div class="key-card-actions"><span class="key-badge">${key.source === 'custom' ? 'LOCAL' : 'ENV'}</span>${key.source === 'custom' ? `<button class="delete-key" data-key-id="${escapeHtml(key.id)}">Remove</button>` : ''}</div>
      </article>`).join('') : '<div class="key-card"><div><h3>No keys yet</h3><p class="key-meta">Local mode is available. Add one connection to enable full intelligence.</p></div></div>';
  }

  function showKeyForm(show = true) { $('keyForm').classList.toggle('hidden', !show); if (show) $('keyProvider').focus(); }

  async function saveNewKey(prefix = 'key') {
    const get = (name) => $(`${prefix}${name}`).value.trim();
    const entry = { id: `custom-${Date.now().toString(36)}`, label: get('Label') || get('Provider'), provider: get('Provider'), endpoint: get('Endpoint'), model: get('Model'), apiKey: get('Secret') };
    if (!entry.provider || !entry.endpoint || !entry.model || !entry.apiKey) throw new Error('Provider, endpoint, model, and API key are required.');
    await apiSaveCustomKeys([...customPayload(), entry]);
    await refreshKeys();
  }

  async function send(text) {
    if (!text || state.sending) return;
    state.sending = true;
    $('btnSend').disabled = true;
    $('txtInput').value = '';
    appendMessage('user', text);
    $('voiceStatus').textContent = 'Thinking...';
    try {
      const result = await apiJson('/api/hear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      appendMessage('assistant', result.reply || 'No response returned.');
      if (result.agentSteps?.length) appendMessage('system', result.agentSteps.map((step) => `${step.ok ? 'OK' : 'STOP'} ${step.tool}: ${step.detail}`).join('\n'));
      if (result.degraded) appendMessage('system', 'Running in local/degraded mode.');
    } catch (error) {
      appendMessage('system', `SARVIS could not complete that request: ${error.message}`);
    } finally {
      state.sending = false;
      $('btnSend').disabled = false;
      $('voiceStatus').textContent = '';
      $('txtInput').focus();
    }
  }

  async function refreshStatus() {
    try {
      const status = await apiStatus();
      const active = status.rotator?.keys?.find((key) => key.state === 'ACTIVE');
      $('activeProviderName').textContent = active ? `Active: ${active.label || active.provider}` : 'Local mode';
      $('healthText').textContent = `${status.rotator?.keys?.length || 0} connections`;
      $('healthPulse').classList.add('live');
    } catch {
      $('healthText').textContent = 'Offline';
      $('healthPulse').classList.remove('live');
    }
    try {
      const activeWindow = await apiJson('/api/active-window');
      if (activeWindow?.name) $('voiceStatus').textContent = `Active window: ${activeWindow.name}`;
    } catch { /* optional */ }
  }

  document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((button) => button.classList.remove('active'));
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    item.classList.add('active');
    $(item.dataset.tab).classList.add('active');
    $('pageTitle').textContent = item.textContent;
    if (item.dataset.tab === 'keysView') refreshKeys().catch((error) => { $('keySummary').textContent = error.message; });
  }));

  $('btnSend').addEventListener('click', () => send($('txtInput').value.trim()));
  $('txtInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send($('txtInput').value.trim()); } });
  document.querySelectorAll('.quick').forEach((button) => button.addEventListener('click', () => send(button.dataset.query)));

  document.querySelectorAll('.control-card').forEach((button) => button.addEventListener('click', async () => {
    try { const result = await apiJson('/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: button.dataset.command }); appendMessage('system', result.success ? 'Command completed.' : `Command failed: ${result.error || 'unknown error'}`); }
    catch (error) { appendMessage('system', `Control failed: ${error.message}`); }
  }));

  $('btnAddKey').addEventListener('click', () => showKeyForm(true));
  $('btnCancelKey').addEventListener('click', () => showKeyForm(false));
  $('keyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('keyFormStatus').textContent = 'Saving...';
    try { await saveNewKey(); $('keyForm').reset(); showKeyForm(false); $('keyFormStatus').textContent = ''; }
    catch (error) { $('keyFormStatus').textContent = error.message; }
  });
  $('keysList').addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-key');
    if (!button) return;
    const next = customPayload().filter((key) => key.id !== button.dataset.keyId);
    await apiSaveCustomKeys(next);
    await refreshKeys();
  });

  const recognitionType = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  $('btnVoice').addEventListener('click', () => {
    if (!recognitionType) { $('voiceStatus').textContent = 'Speech recognition is not available in this browser.'; return; }
    if (recognition) { recognition.stop(); recognition = null; $('voiceStatus').textContent = ''; return; }
    recognition = new recognitionType();
    recognition.lang = 'en-US';
    recognition.onstart = () => { $('voiceStatus').textContent = 'Listening...'; };
    recognition.onerror = () => { $('voiceStatus').textContent = 'Voice input failed.'; recognition = null; };
    recognition.onend = () => { recognition = null; };
    recognition.onresult = (event) => send(event.results[0][0].transcript);
    recognition.start();
  });

  $('setupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await saveNewKey('setup'); localStorage.setItem('sarvis_setup_complete', 'true'); $('setupWizard').classList.add('hidden'); await refreshStatus(); }
    catch (error) { $('setupSecret').setCustomValidity(error.message); $('setupSecret').reportValidity(); }
  });
  $('skipSetup').addEventListener('click', () => { localStorage.setItem('sarvis_setup_complete', 'true'); $('setupWizard').classList.add('hidden'); });

  try {
    const data = await refreshKeys();
    if (!data.keys?.length && localStorage.getItem('sarvis_setup_complete') !== 'true') $('setupWizard').classList.remove('hidden');
  } catch { /* the setup screen remains usable */ }
  await refreshStatus();
  setInterval(refreshStatus, 6000);
  $('txtInput').focus();
});
