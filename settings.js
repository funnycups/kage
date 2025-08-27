/*
Kage: A simple Live2D widget for your desktop.
Copyright (C) 2025 FunnyCups (https://github.com/funnycups)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

Project home: https://github.com/funnycups/kage
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