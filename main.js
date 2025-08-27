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
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import Store from 'electron-store';
import i18next from 'i18next';
import FsBackend from 'i18next-fs-backend';
import { activeWindow } from 'get-windows';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appVersion = app.getVersion();

const defaultModelPath = path.join(__dirname, 'models', 'HK416_3401', 'normal.model3.json');

const store = new Store({
  defaults: {
    wsPort: 23333,
    modelPath: defaultModelPath,
    modelBounds: { width: 400, height: 300, x: 100, y: 100 },
    enableSound: true,
    messageBoxPosition: { top: 10, left: 50 },
    debugMode: false,
    enableMousePassthrough: true
  }
});

function logDebug(...args) {
  if (store.get('debugMode')) {
    console.log(...args);
  }
}


let tray = null;
let win = null;
let settingsWin = null;
let wss = null;
let isManuallyHidden = false;
let isFullscreen = false;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

 win = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    titleBarStyle: 'hidden',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    }
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*']
      }
    });
  });
  
  win.loadFile('index.html');

  if (store.get('debugMode')) {
    win.webContents.openDevTools();
  }
  
  win.setAlwaysOnTop(true, 'screen-saver');

  win.setIgnoreMouseEvents(true, { forward: true });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

}

function createSettingsWindow() {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 600,
    height: 400,
    title: i18next.t('settingsTitle'),
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWin.loadFile('settings.html');

  settingsWin.removeMenu();

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function startWebSocketServer() {
  const port = store.get('wsPort', 23333);

  if (wss) {
    logDebug('WebSocket Server already running.');
    return;
  }

  wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    logDebug(`WebSocket Server listening on ws://localhost:${port}`);
  });

  wss.on('connection', (ws) => {
    logDebug('New WebSocket client connected.');

    ws.on('message', (message) => {
      handleWsMessage(ws, message);
    });

    ws.on('close', () => {
      logDebug('WebSocket client disconnected.');
    });
  });

  wss.on('error', (error) => {
    console.error('WebSocket Server error:', error);
    if (error.code === 'EADDRINUSE') {
      dialog.showErrorBox(
        i18next.t('startupFailed'),
        i18next.t('portInUse', { port })
      );
    }
  });
}

function stopWebSocketServer() {
  if (wss) {
    wss.close(() => {
      logDebug('WebSocket Server stopped.');
      wss = null;
    });
  }
}

function restartWebSocketServer() {
  stopWebSocketServer();
  setTimeout(startWebSocketServer, 500);
}

const apiHandlers = {};

function registerApiHandler(action, handler) {
  apiHandlers[action] = handler;
}

function sendWsResponse(ws, action, requestId, success, data = null, error = null) {
  const response = {
    action,
    requestId,
    success,
    data,
    error
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

async function handleWsMessage(ws, message) {
  let request;
  try {
    request = JSON.parse(message.toString());
  } catch (e) {
    sendWsResponse(ws, 'error', null, false, null, { code: 'INVALID_JSON', message: 'Invalid JSON format' });
    return;
  }

  const { action, params, requestId } = request;

  if (!action || !apiHandlers[action]) {
    sendWsResponse(ws, action || 'unknown', requestId, false, null, { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` });
    return;
  }

  try {
    const handler = apiHandlers[action];
    const result = await handler(params, ws);
    
    if (result !== undefined) {
      sendWsResponse(ws, action, requestId, true, result);
    }
  } catch (error) {
    logDebug(`Error handling action ${action}:`, error);
    sendWsResponse(ws, action, requestId, false, null, { code: 'HANDLER_ERROR', message: error.message });
  }
}

registerApiHandler('getVersion', () => {
  return {
    version: appVersion,
    electronVersion: process.versions.electron
  };
});

registerApiHandler('exitApp', (params, ws) => {
  app.isQuiting = true;
  setTimeout(() => app.quit(), 200);
  return { message: 'Exiting application...' };
});

registerApiHandler('restartApp', () => {
  app.relaunch();
  app.isQuiting = true;
  setTimeout(() => app.quit(), 200);
  return { message: 'Restarting application...' };
});

registerApiHandler('setModelSize', async (params) => {
  const { width, height } = params;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    throw new Error('Invalid width or height provided.');
  }

  const currentBounds = store.get('modelBounds');
  
  const newBounds = { ...currentBounds, width, height };
  
  await ipcInvokeToRenderer('api:setModelBounds', newBounds);

  store.set('modelBounds', newBounds);

  return { width, height };
});

registerApiHandler('setModelPosition', async (params) => {
  const { x, y } = params;
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('Invalid x or y coordinates provided.');
  }
  
  const currentBounds = store.get('modelBounds');

  const newBounds = { ...currentBounds, x, y };

  await ipcInvokeToRenderer('api:setModelBounds', newBounds);
  
  store.set('modelBounds', newBounds);
  return { x, y };
});

async function ipcInvokeToRenderer(channel, ...args) {
  if (!win || win.isDestroyed()) {
    throw new Error('Main window (renderer) is not available.');
  }

  return new Promise((resolve, reject) => {
    const responseChannel = `${channel}-response`;
    const errorChannel = `${channel}-error`;

    const responseHandler = (event, result) => {
      ipcMain.removeListener(errorChannel, errorHandler);
      resolve(result);
    };

    const errorHandler = (event, errorMsg) => {
      ipcMain.removeListener(responseChannel, responseHandler);
      reject(new Error(errorMsg));
    };

    ipcMain.once(responseChannel, responseHandler);
    ipcMain.once(errorChannel, errorHandler);

    win.webContents.send(channel, ...args);
    
  });
}

registerApiHandler('setModelPath', async (params) => {
  const { path } = params;
  if (!path) {
    throw new Error('Model path is required.');
  }
  
  store.set('modelPath', path);

  const result = await ipcInvokeToRenderer('api:setModelPath', path);
  return result;
});

registerApiHandler('getMotions', async () => {
  return await ipcInvokeToRenderer('api:getMotions');
});

registerApiHandler('triggerMotion', async (params) => {
  const { motionName } = params;
  if (!motionName) throw new Error('motionName is required.');
  return await ipcInvokeToRenderer('api:triggerMotion', motionName);
});

registerApiHandler('getExpressions', async () => {
  return await ipcInvokeToRenderer('api:getExpressions');
});

registerApiHandler('setExpression', async (params) => {
  const { expressionName } = params;
  if (!expressionName) throw new Error('expressionName is required.');
  return await ipcInvokeToRenderer('api:setExpression', expressionName);
});

registerApiHandler('clearExpression', async () => {
  return await ipcInvokeToRenderer('api:clearExpression');
});

registerApiHandler('showTextMessage', async (params) => {
  const { message, duration } = params;
  if (!message) throw new Error('message is required.');
  return await ipcInvokeToRenderer('api:showTextMessage', message, duration || 5000);
});

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('get-version', () => {
  return {
    version: appVersion,
    electronVersion: process.versions.electron
  };
});

ipcMain.handle('select-model-file', async () => {
  const result = await dialog.showOpenDialog(settingsWin, {
    properties: ['openFile'],
    filters: [
      { name: i18next.t('live2dModelDefinition'), extensions: ['model3.json'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    const { wsPort, modelPath, enableSound, debugMode, enableMousePassthrough } = settings;
    
    const port = parseInt(wsPort, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      throw new Error(i18next.t('wsPortError'));
    }
    
    if (!modelPath || typeof modelPath !== 'string' || !modelPath.endsWith('.model3.json')) {
      throw new Error(i18next.t('modelPathError'));
    }

    store.set('wsPort', port);
    store.set('modelPath', modelPath);
    
    const newEnableSound = !!enableSound;
    store.set('enableSound', newEnableSound);

    const newDebugMode = !!debugMode;
    store.set('debugMode', newDebugMode);
    
    const oldPassthrough = store.get('enableMousePassthrough');
    const newPassthrough = !!enableMousePassthrough;
    store.set('enableMousePassthrough', newPassthrough);

    if (store.get('wsPort') !== (wss ? wss.address().port : null)) {
      restartWebSocketServer();
    }
    
    if (win && !win.isDestroyed()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('api:setModelPath', modelPath);
      }
      
      win.webContents.send('settings-updated', {
        enableSound: newEnableSound,
        enableMousePassthrough: newPassthrough
      });

      if (oldPassthrough !== newPassthrough) {
        if (newPassthrough) {
          win.setIgnoreMouseEvents(true, { forward: true });
        }
      }
    }


    return { success: true };
  } catch (error) {
    console.error('保存设置失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('toggle-adjust-mode', (event, enable) => {
  if (!win || win.isDestroyed()) return;

  logDebug(`Toggling adjust mode: ${enable}`);

  if (enable) {
    win.setIgnoreMouseEvents(false);
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.setAlwaysOnTop(true, 'screen-saver');
    }
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
     if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.setAlwaysOnTop(false);
    }
  }

  win.webContents.send('adjust-mode-changed', enable);
});

ipcMain.on('save-messagebox-position', (event, position) => {
  if (position && typeof position.top === 'number' && typeof position.left === 'number') {
    store.set('messageBoxPosition', position);
    logDebug("Message box position saved:", position);
  }
});

ipcMain.on('save-model-bounds', (event, bounds) => {
  if (bounds) {
    store.set('modelBounds', bounds);
    logDebug("Model bounds saved:", bounds);
  }
});

ipcMain.on('request-exit-adjust-mode', () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    logDebug("Forwarding 'exit-adjust-mode' to settings window.");
    settingsWin.webContents.send('exit-adjust-mode');
  }
});

ipcMain.on('enable-mouse-interaction', () => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('disable-mouse-interaction', () => {
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
});


function createTray() {
  const iconPath = path.join(__dirname, 'tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: i18next.t('toggleWindow'),
      click: () => {
        if (win) {
          if (win.isVisible()) {
            win.hide();
            isManuallyHidden = true;
          } else {
            win.show();
            isManuallyHidden = false;
          }
        }
      }
    },
    {
      label: i18next.t('settings'),
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: i18next.t('exit'),
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Kage Live2D');
  tray.setContextMenu(buildMenu());

  i18next.on('languageChanged', () => {
    tray.setContextMenu(buildMenu());
  });

}

function startFullscreenListener() {
  const handleVisibility = (enteringFullscreen) => {
    if (!win || win.isDestroyed()) return;

    if (enteringFullscreen) {
      if (win.isVisible()) {
        win.hide();
      }
    } else {
      if (!isManuallyHidden && !win.isVisible()) {
        win.show();
      }
    }
    isFullscreen = enteringFullscreen;
  };

  setInterval(async () => {
    try {
      const currentActiveWindow = await activeWindow();
      if (!currentActiveWindow) {
        if (isFullscreen) {
           logDebug('[Fullscreen Check] No active window, exiting fullscreen mode.');
           handleVisibility(false);
        }
        return;
      }
      
      if (currentActiveWindow.owner.name.includes('Kage') || currentActiveWindow.title.includes('Kage')) {
          return;
      }

      const windowBounds = currentActiveWindow.bounds;
      const allDisplays = screen.getAllDisplays();
      let isCurrentlyFullscreen = false;

      logDebug(`[Fullscreen Check] Active Window: "${currentActiveWindow.title}"`, 'Bounds:', JSON.stringify(windowBounds));

      for (const display of allDisplays) {
        const physicalDisplayWidth = display.bounds.width * display.scaleFactor;
        const physicalDisplayHeight = display.bounds.height * display.scaleFactor;

        logDebug(`[Fullscreen Check] Comparing with Display #${display.id}:`,
                 `Physical Bounds: ${physicalDisplayWidth}x${physicalDisplayHeight}`,
                 `(Logical: ${display.bounds.width}x${display.bounds.height}, Scale: ${display.scaleFactor})`);

        const matchesThisDisplay =
          Math.abs(windowBounds.width - physicalDisplayWidth) < 20 &&
          Math.abs(windowBounds.height - physicalDisplayHeight) < 20;

        if (matchesThisDisplay) {
          isCurrentlyFullscreen = true;
          logDebug(`[Fullscreen Check] Match found with Display #${display.id}!`);
          break;
        }
      }

      if (isCurrentlyFullscreen !== isFullscreen) {
        logDebug(`[Fullscreen Check] State changed to: ${isCurrentlyFullscreen}. App: "${currentActiveWindow.title}"`);
        handleVisibility(isCurrentlyFullscreen);
      }
    } catch (error) {
      logDebug('[Fullscreen Check] Error getting active window:', error);
      if (isFullscreen) {
        handleVisibility(false);
      }
    }
  }, 2000);
}


const i18nextOptions = {
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh-CN', 'zh'],
  nonExplicitSupportedLngs: true,
  ns: ['translation'],
  defaultNS: 'translation',
  backend: {
    loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json')
  },
  debug: store.get('debugMode')
};

app.whenReady().then(async () => {
  const initialLang = store.get('language', app.getLocale());
  store.set('language', initialLang);
  i18nextOptions.lng = initialLang;

  await i18next.use(FsBackend).init(i18nextOptions);

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  createWindow();
  createTray();
  startWebSocketServer();
  startFullscreenListener();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', (e) => {
  if (!app.isQuiting) {
    if (process.platform !== 'darwin') {
    }
  } else {
    stopWebSocketServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
  }
});

app.on('browser-window-created', (event, window) => {
  window.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      window.hide();
    }
    return false;
  });
});

ipcMain.handle('get-i18n-init', () => {
  return {
    lng: i18next.language,
    resources: i18next.getResourceBundle(i18next.language, 'translation')
  };
});

ipcMain.handle('change-language', async (event, lng) => {
  if (i18next.options.supportedLngs.includes(lng)) {
    store.set('language', lng);
    await i18next.changeLanguage(lng);
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('language-changed', {
        lng,
        resources: i18next.getResourceBundle(lng, 'translation')
      });
    });
    return { success: true };
  }
  return { success: false, error: 'Unsupported language' };
});