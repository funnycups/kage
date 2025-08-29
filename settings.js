/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Kage: A simple Live2D widget for your desktop.
 *
 * Copyright (C) 2025 FunnyCups (https://github.com/funnycups)
 */
const i18next = {
  t: (key, options) => {
    let translation = window.i18n.resources[key] || key;
    if (options) {
      for (const optKey in options) {
        translation = translation.replace(`{{${optKey}}}`, options[optKey]);
      }
    }
    return translation;
  }
};

function updateUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) {
      el.setAttribute(attr, i18next.t(key));
    } else {
      el.innerHTML = i18next.t(key);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  window.i18n = await window.electronAPI.getI18nInit();
  
  updateUI();

  const form = document.getElementById('settings-form');
  const wsPortInput = document.getElementById('wsPort');
  const modelPathInput = document.getElementById('modelPath');
  const enableSoundInput = document.getElementById('enableSound');
  const debugModeInput = document.getElementById('debugMode');
  const appVersionSpan = document.getElementById('appVersion');
  const messageDiv = document.getElementById('message');
  const selectModelPathButton = document.getElementById('selectModelPath');
  const toggleAdjustModeButton = document.getElementById('toggleAdjustMode');
  const languageSelector = document.getElementById('language-selector');

  let isAdjustModeEnabled = false;

  function showMessage(key, type, options = {}) {
    messageDiv.textContent = i18next.t(key, options);
    messageDiv.className = type;
    messageDiv.style.display = 'block';
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 5000);
  }

  try {
    const settings = await window.electronAPI.getSettings();
    wsPortInput.value = settings.wsPort;
    modelPathInput.value = settings.modelPath;
    enableSoundInput.checked = settings.enableSound;
    debugModeInput.checked = settings.debugMode;
    document.getElementById('enableMousePassthrough').checked = settings.enableMousePassthrough !== false;
    const versionInfo = await window.electronAPI.getVersion();
    appVersionSpan.textContent = versionInfo.version;
    languageSelector.value = settings.language || 'zh-CN';

    const key = isAdjustModeEnabled ? 'disableAdjustMode' : 'enableAdjustMode';
    toggleAdjustModeButton.textContent = i18next.t(key);
    toggleAdjustModeButton.setAttribute('data-i18n', key);
  } catch (error) {
    console.error('Error loading settings:', error);
    showMessage('savedError', 'error', { error: 'Failed to load settings.' });
  }

  selectModelPathButton.addEventListener('click', async () => {
    const selectedPath = await window.electronAPI.selectModelFile();
    if (selectedPath) {
      modelPathInput.value = selectedPath;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
      wsPort: wsPortInput.value,
      modelPath: modelPathInput.value,
      enableSound: enableSoundInput.checked,
      debugMode: debugModeInput.checked,
      enableMousePassthrough: document.getElementById('enableMousePassthrough').checked
    };

    try {
      const result = await window.electronAPI.saveSettings(settings);
      if (result.success) {
        showMessage('savedSuccess', 'success');
      } else {
        showMessage('savedError', 'error', { error: result.error });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showMessage('savedError', 'error', { error: error.message });
    }
  });

  toggleAdjustModeButton.addEventListener('click', async () => {
    isAdjustModeEnabled = !isAdjustModeEnabled;
    try {
      await window.electronAPI.toggleAdjustMode(isAdjustModeEnabled);
      const key = isAdjustModeEnabled ? 'disableAdjustMode' : 'enableAdjustMode';
      toggleAdjustModeButton.textContent = i18next.t(key);
      toggleAdjustModeButton.setAttribute('data-i18n', key);
    } catch (error) {
      console.error('Failed to toggle adjust mode:', error);
      isAdjustModeEnabled = !isAdjustModeEnabled; // Revert state on error
    }
  });

  window.electronAPI.onExitAdjustMode(() => {
    if (isAdjustModeEnabled) {
      toggleAdjustModeButton.click();
    }
  });

  languageSelector.addEventListener('change', async (e) => {
    const newLang = e.target.value;
    await window.electronAPI.changeLanguage(newLang);
  });

  window.electronAPI.onLanguageChanged(({ lng, resources }) => {
    window.i18n = { lng, resources };
    updateUI();
  });
});