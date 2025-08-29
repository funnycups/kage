/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Kage: A simple Live2D widget for your desktop.
 *
 * Copyright (C) 2025 FunnyCups (https://github.com/funnycups)
 */
console.log("Renderer process started.");

const PIXI = require('pixi.js');
const { Live2DModel, SoundManager } = require('pixi-live2d-display/cubism4');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { ipcRenderer } = require('electron');

window.PIXI = PIXI;

const messageBox = document.getElementById('message-box');
let messageTimeoutId = null;

function showMessage(message, duration) {
  if (!messageBox) return;

  if (messageTimeoutId) {
    clearTimeout(messageTimeoutId);
    messageTimeoutId = null;
  }

  messageBox.textContent = message;
  messageBox.style.display = 'block';

  if (duration > 0) {
    messageTimeoutId = setTimeout(() => {
      messageBox.style.display = 'none';
      messageTimeoutId = null;
    }, duration);
  }
}

let app;
let currentModel = null;
let globalSettings = {
  enableSound: true,
  messageBoxPosition: { top: 10, left: 50 },
  enableMousePassthrough: true,
  modelBounds: { width: 400, height: 300, x: 100, y: 100 }
};

const modelContainer = document.getElementById('live2d-container');
let isDraggingModel = false;
let isResizingModel = false;
let dragStart = { x: 0, y: 0 };
let initialBounds = {};


async function initLive2D() {
  if (!window.Live2DCubismCore) {
    console.error("Live2D Cubism Core (live2dcubismcore.min.js) is not loaded!");
    return;
  }
  app = new PIXI.Application({
    backgroundAlpha: 0,
    autoStart: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  if (modelContainer) {
    modelContainer.appendChild(app.view);
  } else {
    console.error("live2d-container not found.");
    return;
  }

  loadModelFromSettings();
}

async function loadModelFromSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-settings');
    globalSettings = settings;
    const modelPath = settings.modelPath;

    if (!modelPath) {
      console.warn("Model path is not configured in settings.");
      return;
    }

    console.log(`Attempting to load model from configured path: ${modelPath}`);

    loadModel(modelPath);

    updateModelBounds(settings.modelBounds);

    updateMessageBoxPosition(settings.messageBoxPosition);
    
  } catch (error) {
    console.error("Failed to get settings from main process:", error);
  }
}

async function loadModel(modelUrl) {
  if (!fs.existsSync(modelUrl) || !modelUrl.endsWith('.model3.json')) {
    const errorMsg = `Model file not found or invalid: ${modelUrl}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  const fileUrl = url.pathToFileURL(modelUrl).href;
  console.log("Attempting to load model from URL:", fileUrl);

  const model = await Live2DModel.from(fileUrl);
  
  if (currentModel) {
    app.stage.removeChild(currentModel);
    currentModel.destroy();
  }

  currentModel = model;
  app.stage.addChild(model);

  const localBounds = model.getLocalBounds();
  model.pivot.set(localBounds.x + localBounds.width / 2, localBounds.y + localBounds.height / 2);

  resizeModel(model);

  model.interactive = true;

  model.on('hit', (hitAreaNames) => {
    if (!hitAreaNames.length) {
      return;
    }
    console.log(`Hit detected on: [${hitAreaNames.join(', ')}]`);

    const expressionManager = model.internalModel.motionManager.expressionManager;
    const isHeadHit = hitAreaNames.some(name => name.includes('Head'));

    if (isHeadHit && expressionManager && expressionManager.definitions.length > 0) {
      console.log("Head hit and expressions available. Triggering random expression.");
      model.expression();
      return;
    }

    const motionManager = model.internalModel.motionManager;
    const motions = motionManager.motionGroups;
    const hitAreaName = hitAreaNames[0];

    const possibleGroupNames = [
      `Tap${hitAreaName}`,
      `tap_${hitAreaName.toLowerCase()}`
    ];

    let foundMotion = false;
    for (const groupName of possibleGroupNames) {
      if (motions[groupName]) {
        console.log(`Found and playing motion group: "${groupName}"`);
        model.motion(groupName);
        foundMotion = true;
        break;
      }
    }

    if (!foundMotion && motions['Tap']) {
      console.log('Specific tap motion not found. Playing generic "Tap" motion.');
      model.motion('Tap');
    }
  });

  if (!globalSettings.enableMousePassthrough) {
    enableModelHoverInteraction(model);
  } else {
    disableModelHoverInteraction(model);
  }

  console.log("Model loaded:", modelUrl);
  
  setModelVolume(globalSettings.enableSound ? 1 : 0);

  return { success: true, modelPath: modelUrl };
}

function setModelVolume(volume) {
  console.log(`Setting global SoundManager volume and model volume to: ${volume}`);

  if (SoundManager) {
    SoundManager.volume = volume;
  }

  if (currentModel) {
    currentModel.volume = volume;
  }
}

function updateMessageBoxPosition(position) {
  if (messageBox && position) {
    messageBox.style.top = `${position.top}%`;
    messageBox.style.left = `${position.left}%`;
    globalSettings.messageBoxPosition = position;
  }
}

function updateModelBounds(bounds) {
  if (modelContainer && bounds) {
    modelContainer.style.width = `${bounds.width}px`;
    modelContainer.style.height = `${bounds.height}px`;
    modelContainer.style.left = `${bounds.x}px`;
    modelContainer.style.top = `${bounds.y}px`;
    globalSettings.modelBounds = bounds;

    if (currentModel) {
      resizeModel(currentModel);
    }
  }
}

function resizeModel(model) {
  if (!modelContainer) return;
  const bounds = modelContainer.getBoundingClientRect();

  if (app) {
    app.renderer.resize(bounds.width, bounds.height);
  }

  model.x = bounds.width / 2;
  model.y = bounds.height / 2;

  const localBounds = model.getLocalBounds();
  const modelWidth = localBounds.width;
  const modelHeight = localBounds.height;

  if (modelWidth === 0 || modelHeight === 0) return;

  const scaleX = bounds.width / modelWidth;
  const scaleY = bounds.height / modelHeight;
  const scale = Math.min(scaleX, scaleY);
  
  model.scale.set(scale);
}

initLive2D();

ipcRenderer.on('settings-updated', (event, updatedSettings) => {
  console.log("Settings updated in renderer:", updatedSettings);
  
  if (updatedSettings.enableSound !== undefined) {
    globalSettings.enableSound = updatedSettings.enableSound;
    setModelVolume(globalSettings.enableSound ? 1 : 0);
  }
  
  if (updatedSettings.messageBoxPosition !== undefined) {
    updateMessageBoxPosition(updatedSettings.messageBoxPosition);
  }

  if (updatedSettings.enableMousePassthrough !== undefined && updatedSettings.enableMousePassthrough !== globalSettings.enableMousePassthrough) {
    console.log(`Mouse passthrough mode changed to: ${updatedSettings.enableMousePassthrough}`);
    globalSettings.enableMousePassthrough = updatedSettings.enableMousePassthrough;
    if (currentModel) {
      if (!globalSettings.enableMousePassthrough) {
        enableModelHoverInteraction(currentModel);
      } else {
        disableModelHoverInteraction(currentModel);
      }
    }
  }
});

let isAdjustingMessageBox = false;
let dragOffset = { x: 0, y: 0 };

ipcRenderer.on('adjust-mode-changed', (event, isEnabled) => {
  if (isEnabled) {
    console.log("Adjust mode enabled in renderer.");

    modelContainer.classList.add('adjusting');
    
    disableModelHoverInteraction(currentModel);

    if (messageBox) {
      messageBox.classList.add('adjusting');
      if (!messageBox.textContent) messageBox.textContent = "拖动调整消息框位置";
      setupMessageBoxDragging();
    }
    
    setupModelContainerAdjustment();

  } else {
    console.log("Adjust mode disabled in renderer.");
    modelContainer.classList.remove('adjusting');

    if (!globalSettings.enableMousePassthrough) {
      enableModelHoverInteraction(currentModel);
    }

    if (messageBox) {
      messageBox.classList.remove('adjusting');
      if (messageBox.textContent === "拖动调整消息框位置") {
         messageBox.textContent = "";
         if (!messageTimeoutId) messageBox.style.display = 'none';
      }
      cleanupMessageBoxDragging();
      saveMessageBoxPosition();
    }
    
    cleanupModelContainerAdjustment();
    saveModelBounds();
  }
});

function setupMessageBoxDragging() {
  messageBox.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
}

function cleanupMessageBoxDragging() {
  messageBox.removeEventListener('mousedown', onDragStart);
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
}

function onDragStart(e) {
  if (e.button !== 0) return;
  
  isAdjustingMessageBox = true;
  
  const rect = messageBox.getBoundingClientRect();
  
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  e.stopPropagation();
  e.preventDefault();
}

function onDragMove(e) {
  if (!isAdjustingMessageBox) return;

  let newX = e.clientX - dragOffset.x;
  let newY = e.clientY - dragOffset.y;

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  const boxWidth = messageBox.offsetWidth;

  let centerPercentageX = ((newX + boxWidth / 2) / windowWidth) * 100;
  let topPercentageY = (newY / windowHeight) * 100;
  
  centerPercentageX = Math.max(0, Math.min(100, centerPercentageX));
  topPercentageY = Math.max(0, Math.min(100, topPercentageY));

  updateMessageBoxPosition({
    top: topPercentageY,
    left: centerPercentageX
  });
}

function onDragEnd() {
  isAdjustingMessageBox = false;
}

function saveMessageBoxPosition() {
  if (globalSettings.messageBoxPosition) {
    ipcRenderer.send('save-messagebox-position', globalSettings.messageBoxPosition);
  }
}

function handleIpcApiCall(channel, handler) {
  ipcRenderer.on(channel, async (event, ...args) => {
    try {
      const result = await handler(...args);
      event.sender.send(`${channel}-response`, result);
    } catch (error) {
      console.error(`Error handling IPC API call ${channel}:`, error);
      event.sender.send(`${channel}-error`, error.message);
    }
  });
}

handleIpcApiCall('api:setModelPath', async (modelPath) => {
  console.log("IPC call: setModelPath", modelPath);
  return await loadModel(modelPath);
});

function ensureModelLoaded() {
  if (!currentModel || !currentModel.internalModel) {
    throw new Error("Live2D model is not loaded or initialized.");
  }
}

handleIpcApiCall('api:getMotions', () => {
  ensureModelLoaded();
  const definitions = currentModel.internalModel.motionManager.definitions;
  const motions = Object.keys(definitions).filter(group => definitions[group] && definitions[group].length > 0);
  
  console.log("IPC call: getMotions", motions);
  return { motions };
});

handleIpcApiCall('api:getExpressions', () => {
  ensureModelLoaded();
  const expressionManager = currentModel.internalModel.motionManager.expressionManager;
  
  let expressions = [];
  if (expressionManager && expressionManager.definitions) {
     if (Array.isArray(expressionManager.definitions)) {
      expressions = expressionManager.definitions.map(e => e.Name || e.name);
     } else {
      expressions = Object.keys(expressionManager.definitions);
     }
  }
  
  console.log("IPC call: getExpressions", expressions);
  return { expressions };
});

handleIpcApiCall('api:triggerMotion', (motionName) => {
  ensureModelLoaded();
  console.log("IPC call: triggerMotion", motionName);
  
  const definitions = currentModel.internalModel.motionManager.definitions;
  if (!definitions[motionName] || definitions[motionName].length === 0) {
    throw new Error(`Motion group "${motionName}" not found or is empty.`);
  }

  setModelVolume(globalSettings.enableSound ? 1 : 0);
  currentModel.motion(motionName, 0);
  return { success: true, motion: motionName };
});

handleIpcApiCall('api:setExpression', (expressionName) => {
  ensureModelLoaded();
  console.log("IPC call: setExpression", expressionName);

  const expressionManager = currentModel.internalModel.motionManager.expressionManager;
  let exists = false;
  if (expressionManager && expressionManager.definitions) {
    if (Array.isArray(expressionManager.definitions)) {
      exists = expressionManager.definitions.some(e => (e.Name === expressionName || e.name === expressionName || e.File === expressionName));
    } else {
      exists = !!expressionManager.definitions[expressionName];
    }
  }

  if (!exists) {
    throw new Error(`Expression "${expressionName}" not found.`);
  }

  currentModel.expression(expressionName);
  return { success: true, expression: expressionName };
});

handleIpcApiCall('api:clearExpression', () => {
  ensureModelLoaded();
  console.log("IPC call: clearExpression");
  
  currentModel.expression(undefined);
  return { success: true };
});

handleIpcApiCall('api:showTextMessage', (message, duration) => {
  console.log("IPC call: showTextMessage", message, duration);
  showMessage(message, duration);
  return { success: true };
});

handleIpcApiCall('api:setModelBounds', async (bounds) => {
  console.log("IPC call: setModelBounds", bounds);
  updateModelBounds(bounds);
  return { success: true };
});

function setupModelContainerAdjustment() {
  modelContainer.addEventListener('mousemove', onModelHoverMove);
  modelContainer.addEventListener('mousedown', onModelDragStart);
  window.addEventListener('keydown', onEscPress);
}

function cleanupModelContainerAdjustment() {
  modelContainer.removeEventListener('mousemove', onModelHoverMove);
  modelContainer.removeEventListener('mousedown', onModelDragStart);
  window.removeEventListener('mousemove', onModelDragMove);
  window.removeEventListener('mouseup', onModelDragEnd);
  window.removeEventListener('keydown', onEscPress);
  modelContainer.style.cursor = '';
}

function onModelDragStart(e) {
  if (e.target.closest('#message-box')) {
    return;
  }
  
  const rect = modelContainer.getBoundingClientRect();
  const resizeHandleSize = 15;

  if (e.clientX > rect.right - resizeHandleSize && e.clientY > rect.bottom - resizeHandleSize) {
    isResizingModel = true;
  } else {
    isDraggingModel = true;
  }
  
  window.addEventListener('mousemove', onModelDragMove);
  window.addEventListener('mouseup', (e) => onModelDragEnd(e));

  dragStart = { x: e.clientX, y: e.clientY };
  initialBounds = rect;
  e.preventDefault();
  e.stopPropagation();
}

function onModelDragMove(e) {
  if (!isDraggingModel && !isResizingModel) return;

  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;

  if (isDraggingModel) {
    const newX = initialBounds.x + dx;
    const newY = initialBounds.y + dy;
    modelContainer.style.left = `${newX}px`;
    modelContainer.style.top = `${newY}px`;
  } else if (isResizingModel) {
    const newWidth = Math.max(100, initialBounds.width + dx);
    const newHeight = Math.max(100, initialBounds.height + dy);
    modelContainer.style.width = `${newWidth}px`;
    modelContainer.style.height = `${newHeight}px`;
    resizeModel(currentModel);
  }
}

function onModelDragEnd(e) {
  window.removeEventListener('mousemove', onModelDragMove);
  window.removeEventListener('mouseup', onModelDragEnd);

  isDraggingModel = false;
  isResizingModel = false;
  if (e) {
    onModelHoverMove(e);
  }
}

function saveModelBounds() {
  const rect = modelContainer.getBoundingClientRect();
  const bounds = {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
  ipcRenderer.send('save-model-bounds', bounds);
}

function onModelHoverMove(e) {
  if (!modelContainer.classList.contains('adjusting')) {
    return;
  }
  if (isDraggingModel || isResizingModel) return;

  const rect = modelContainer.getBoundingClientRect();
  const resizeHandleSize = 15;

  if (e.clientX > rect.right - resizeHandleSize && e.clientY > rect.bottom - resizeHandleSize) {
    modelContainer.style.cursor = 'se-resize';
  } else {
    modelContainer.style.cursor = 'move';
  }
}

function onEscPress(e) {
  if (e.key === 'Escape') {
    console.log("Escape key pressed, requesting exit from adjust mode.");
    ipcRenderer.send('request-exit-adjust-mode');
  }
}

function enableModelHoverInteraction(model) {
  if (!model) return;
  model.interactive = true;
  model.off('pointerover', onPointerOver).on('pointerover', onPointerOver);
  model.off('pointerout', onPointerOut).on('pointerout', onPointerOut);
}

function disableModelHoverInteraction(model) {
  if (!model) return;
  model.interactive = false;
  model.off('pointerover', onPointerOver);
  model.off('pointerout', onPointerOut);
}

function onPointerOver() {
  ipcRenderer.send('enable-mouse-interaction');
}

function onPointerOut() {
  ipcRenderer.send('disable-mouse-interaction');
}