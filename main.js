const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const path = require('path')
const Store = require('electron-store')

// Инициализация хранилища
const store = new Store()

let mainWindow = null
let devices = []
let currentDevice = null

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  mainWindow = new BrowserWindow({
    width: 320,
    height: 480,
    x: width - 340,
    y: 100,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('renderer/index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    const savedPosition = store.get('windowPosition')
    if (savedPosition) {
      mainWindow.setPosition(savedPosition.x, savedPosition.y)
    }
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('moved', () => {
    const position = mainWindow.getPosition()
    store.set('windowPosition', { x: position[0], y: position[1] })
  })

  if (process.env.NODE_ENV !== 'development') {
    mainWindow.setMenu(null)
  }

  mainWindow.setMovable(true)
}

app.whenReady().then(() => {
  createWindow()

  try {
    const savedDevices = store.get('tuya_devices')
    if (savedDevices && Array.isArray(savedDevices)) {
      devices = savedDevices.filter(device => device.dev_type === 'light')
      const savedCurrentDevice = store.get('tuya_current_device')
      if (savedCurrentDevice && devices.find(d => d.id === savedCurrentDevice.id)) {
        currentDevice = savedCurrentDevice
      }
    }
  } catch (error) {
    // Игнорируем ошибки
  }

  globalShortcut.register('Alt+W', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
      }
    }
  })

  globalShortcut.register('Alt+Q', () => {
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

app.on('before-quit', () => {
  app.isQuiting = true
  if (currentDevice) {
    store.set('tuya_current_device', currentDevice)
  }
  if (devices.length > 0) {
    store.set('tuya_devices', devices)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// IPC обработчики
ipcMain.handle('get-stored-data', (event, key) => {
  return store.get(key)
})

ipcMain.handle('set-stored-data', (event, key, value) => {
  store.set(key, value)
  return true
})

ipcMain.handle('delete-stored-data', (event, key) => {
  store.delete(key)
  return true
})

ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow) {
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(!isAlwaysOnTop)
    return !isAlwaysOnTop
  }
  return false
})

ipcMain.handle('minimize-widget', () => {
  if (mainWindow) {
    mainWindow.minimize()
  }
})

ipcMain.handle('close-widget', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
})

ipcMain.handle('quit-app', () => {
  app.quit()
  return true
})

ipcMain.handle('get-devices', () => {
  return devices
})

ipcMain.handle('set-devices', (event, newDevices) => {
  devices = newDevices || []
  store.set('tuya_devices', devices)
  return true
})

ipcMain.handle('set-current-device', (event, device) => {
  currentDevice = device
  if (device) {
    store.set('tuya_current_device', device)
  } else {
    store.delete('tuya_current_device')
  }
  return true
})

ipcMain.handle('control-device', (event, action) => {
  if (mainWindow && currentDevice) {
    mainWindow.webContents.send('control-device', action)
    return true
  }
  return false
})

ipcMain.handle('update-device-state', (event, deviceId, state) => {
  const device = devices.find(d => d.id === deviceId)
  if (device) {
    if (!device.data) device.data = {}
    device.data.state = state
    store.set('tuya_devices', devices)
  }
  return true
}) 