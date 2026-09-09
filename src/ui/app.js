/**
 * JARVIS Windows Desktop - Frontend Client Application
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
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

  // Window Controls
  document.getElementById('btnMinimize')?.addEventListener('click', () => {
    window.jarvisAPI?.minimizeToTray();
  });
  document.getElementById('btnClose')?.addEventListener('click', () => {
    window.jarvisAPI?.closeApp();
  });

  // Chat Elements
  const chatMessages = document.getElementById('chatMessages');
  const txtInput = document.getElementById('txtInput');
  const btnSend = document.getElementById('btnSend');
  const btnVoice = document.getElementById('btnVoice');

  function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'msg-avatar';
    avatarDiv.textContent = role === 'user' ? 'U' : 'J';

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

  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async function handleSend() {
    const text = txtInput.value.trim();
    if (!text) return;
    txtInput.value = '';
    appendMessage('user', text);

    try {
      const res = await window.jarvisAPI.hear(text);
      appendMessage('assistant', res.reply || 'No response returned.');
    } catch (err) {
      appendMessage('assistant', 'Error communicating with JARVIS brain: ' + err.message);
    }
  }

  btnSend?.addEventListener('click', handleSend);
  txtInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
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

  // Voice Speech Recognition & TTS
  let isListening = false;
  let recognition = null;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      txtInput.value = transcript;
      handleSend();
    };

    recognition.onend = () => {
      isListening = false;
      btnVoice?.classList.remove('recording');
    };
  }

  btnVoice?.addEventListener('click', () => {
    if (!recognition) {
      alert('Speech recognition is not supported natively in this browser window environment.');
      return;
    }
    if (isListening) {
      recognition.stop();
      isListening = false;
      btnVoice.classList.remove('recording');
    } else {
      recognition.start();
      isListening = true;
      btnVoice.classList.add('recording');
    }
  });

  function speakReply(text) {
    if (!('speechSynthesis' in window)) return;
    const cleanText = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.cancel(); // Stop current speech
    window.speechSynthesis.speak(utterance);
  }

  // Windows Controls View
  document.getElementById('btnVolUp')?.addEventListener('click', () => {
    window.jarvisAPI?.executeWinCommand({ category: 'system', action: 'toggle', target: 'volume_up' });
  });
  document.getElementById('btnVolDown')?.addEventListener('click', () => {
    window.jarvisAPI?.executeWinCommand({ category: 'system', action: 'toggle', target: 'volume_down' });
  });
  document.getElementById('btnVolMute')?.addEventListener('click', () => {
    window.jarvisAPI?.executeWinCommand({ category: 'system', action: 'toggle', target: 'volume_mute' });
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
    window.jarvisAPI?.executeWinCommand({ category: 'system', action: 'setBrightness', level: val });
  });

  // App Launcher Chips
  document.querySelectorAll('.app-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const appName = chip.getAttribute('data-app');
      if (appName) {
        window.jarvisAPI?.executeWinCommand({ category: 'app', action: 'launchApp', pkg: appName });
      }
    });
  });

  // Settings & API Keys Form
  const keysForm = document.getElementById('keysForm');
  const lblSaveStatus = document.getElementById('lblSaveStatus');

  async function loadSettingsKeys() {
    if (!window.jarvisAPI) return;
    const keys = await window.jarvisAPI.loadKeys();
    for (const [k, v] of Object.entries(keys)) {
      const input = document.getElementById(k);
      if (input) input.value = v;
    }
  }
  await loadSettingsKeys();

  keysForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {};
    const keyIds = [
      'JARVIS_GEMINI_API_KEY',
      'JARVIS_GROQ_API_KEY',
      'JARVIS_OPENROUTER_API_KEY',
      'JARVIS_CEREBRAS_API_KEY',
      'JARVIS_MISTRAL_API_KEY',
      'JARVIS_TOGETHER_API_KEY',
      'JARVIS_COHERE_API_KEY',
      'JARVIS_DEEPSEEK_API_KEY',
    ];
    keyIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value.trim()) updates[id] = el.value.trim();
    });

    const res = await window.jarvisAPI.saveKeys(updates);
    if (res.success && lblSaveStatus) {
      lblSaveStatus.textContent = '✓ API Keys Saved & Rotator Reloaded';
      setTimeout(() => { lblSaveStatus.textContent = ''; }, 3000);
    }
  });

  // Status Polling for 8-Key Rotator Dashboard & Active App
  async function pollStatus() {
    if (!window.jarvisAPI) return;
    try {
      const status = await window.jarvisAPI.getStatus();
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
      const win = await window.jarvisAPI.getActiveWindow();
      const lblActiveApp = document.getElementById('lblActiveApp');
      if (lblActiveApp && win) {
        lblActiveApp.textContent = win.name ? `${win.name} (${win.title.slice(0, 15)}...)` : 'None';
      }
    } catch {
      /* ignore background poll errors */
    }
  }

  setInterval(pollStatus, 3000);
  pollStatus();
});
