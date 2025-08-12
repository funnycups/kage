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
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),
  toggleAdjustMode: (enable) => ipcRenderer.invoke('toggle-adjust-mode', enable),
  onExitAdjustMode: (callback) => ipcRenderer.on('exit-adjust-mode', callback),
  getI18nInit: () => ipcRenderer.invoke('get-i18n-init'),
  changeLanguage: (lng) => ipcRenderer.invoke('change-language', lng),
  onLanguageChanged: (callback) => ipcRenderer.on('language-changed', (event, ...args) => callback(...args))
});