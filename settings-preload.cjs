/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Kage: A simple Live2D widget for your desktop.
 *
 * Copyright (C) 2025 FunnyCups (https://github.com/funnycups)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),
  toggleAdjustMode: (enable) => ipcRenderer.invoke('toggle-adjust-mode', enable),
  onExitAdjustMode: (callback) => ipcRenderer.on('exit-adjust-mode', callback),
  getI18nInit: () => ipcRenderer.invoke('get-i18n-init'),
  changeLanguage: (lng) => ipcRenderer.invoke('change-language', lng),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, ...args) => callback(...args))
  ,checkForUpdates: () => ipcRenderer.invoke('manual-check-updates')
});
