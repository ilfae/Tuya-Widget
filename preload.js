const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getStoredData: (key) => ipcRenderer.invoke('get-stored-data', key),
  setStoredData: (key, value) => ipcRenderer.invoke('set-stored-data', key, value),
  deleteStoredData: (key) => ipcRenderer.invoke('delete-stored-data', key),
  
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  minimizeWidget: () => ipcRenderer.invoke('minimize-widget'),
  closeWidget: () => ipcRenderer.invoke('close-widget'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  
  getDevices: () => ipcRenderer.invoke('get-devices'),
  setDevices: (devices) => ipcRenderer.invoke('set-devices', devices),
  setCurrentDevice: (device) => ipcRenderer.invoke('set-current-device', device),
  controlDevice: (action) => ipcRenderer.invoke('control-device', action),
  updateDeviceState: (deviceId, state) => ipcRenderer.invoke('update-device-state', deviceId, state),
  
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development'
})

// Обработчики событий для устройств
ipcRenderer.on('device-selected', (event, device) => {
  window.dispatchEvent(new CustomEvent('device-selected', { detail: device }))
})

ipcRenderer.on('control-device', (event, action) => {
  window.dispatchEvent(new CustomEvent('control-device', { detail: action }))
}) 