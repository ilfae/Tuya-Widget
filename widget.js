// Глобальные переменные
let devices = []
let currentDevice = null
let isOnline = false
let accessToken = ''
let refreshToken = ''
let baseUrl = 'https://px1.tuyaeu.com/homeassistant/'
let proxyUrl = ''
let refreshInterval = null

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function () {
  initializeWidget()
})

// Очистка при закрытии
window.addEventListener('beforeunload', function () {
  stopAutoRefresh()
})

function initializeWidget() {
  // Проверяем сохраненные данные авторизации
  checkSavedAuth()

  // Настраиваем обработчики событий
  setupEventListeners()

  // Настраиваем обработчики событий от трея
  setupTrayEventListeners()

  // Показываем секцию выбора устройства по умолчанию
  showDeviceSection()
}

function setupEventListeners() {
  // Обработчики слайдеров
  document.getElementById('hueSlider').addEventListener('input', function () {
    updateColorFromHue(this.value)
  })

  document.getElementById('brightnessSlider').addEventListener('input', function () {
    updateBrightness(this.value)
  })

  // Обработчик выбора устройства
  document.getElementById('deviceSelect').addEventListener('change', function () {
    selectDevice(this.value)
  })

  // Обработчик Enter для пароля
  document.getElementById('password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      doLogin()
    }
  })
}

function setupTrayEventListeners() {
  // Слушаем события от трея
  window.addEventListener('device-selected', (event) => {
    const device = event.detail
    if (device) {
      // Находим устройство в локальном списке
      const localDevice = devices.find(d => d.id === device.id)
      if (localDevice) {
        selectDevice(device.id)
        showSuccess(`Устройство "${device.name || device.id}" выбрано`)
      }
    }
  })

  window.addEventListener('control-device', (event) => {
    const action = event.detail
    if (action && currentDevice) {
      switch (action) {
        case 'turnOn':
          turnDeviceOn()
          break
        case 'turnOff':
          turnDeviceOff()
          break
      }
    }
  })
}

function checkSavedAuth() {
  const savedAuth = localStorage.getItem('tuya_auth')
  const savedDevices = localStorage.getItem('tuya_devices')

  if (savedAuth && savedDevices) {
    try {
      const authData = JSON.parse(savedAuth)
      const devicesData = JSON.parse(savedDevices)

      // Восстанавливаем данные авторизации
      accessToken = authData.access_token
      refreshToken = authData.refresh_token
      isOnline = true
      baseUrl = authData.baseUrl
      proxyUrl = authData.proxyUrl

      // Загружаем устройства
      devices = devicesData.filter(device => device.dev_type === 'light')
      populateDeviceList()

      // Синхронизируем устройства с main процессом для трея
      if (window.electronAPI && window.electronAPI.setDevices) {
        window.electronAPI.setDevices(devices)
      }

      if (devices.length > 0) {
        showSuccess('Устройства загружены')
      }

      // Запускаем автоматическое обновление токена
      startAutoRefresh()
    } catch (error) {
      console.error('Ошибка загрузки сохраненных данных:', error)
      localStorage.removeItem('tuya_auth')
      localStorage.removeItem('tuya_devices')

      // Синхронизируем пустой список устройств с треем
      if (window.electronAPI && window.electronAPI.setDevices) {
        window.electronAPI.setDevices([])
      }
    }
  } else {
    // Синхронизируем пустой список устройств с треем
    if (window.electronAPI && window.electronAPI.setDevices) {
      window.electronAPI.setDevices([])
    }
  }
}

function populateDeviceList() {
  const select = document.getElementById('deviceSelect')
  select.innerHTML = '<option value="">Выберите устройство</option>'

  devices.forEach(device => {
    const option = document.createElement('option')
    option.value = device.id
    option.textContent = device.name || device.id
    select.appendChild(option)
  })

  // Синхронизируем устройства с main процессом для трея
  if (window.electronAPI && window.electronAPI.setDevices) {
    window.electronAPI.setDevices(devices)
  }
}

function selectDevice(deviceId) {
  if (!deviceId) {
    currentDevice = null
    hideControlSection()

    // Синхронизируем с main процессом
    if (window.electronAPI && window.electronAPI.setCurrentDevice) {
      window.electronAPI.setCurrentDevice(null)
    }
    return
  }

  currentDevice = devices.find(d => d.id === deviceId)
  if (currentDevice) {
    updateDeviceInfo()
    showControlSection()

    // Синхронизируем с main процессом
    if (window.electronAPI && window.electronAPI.setCurrentDevice) {
      window.electronAPI.setCurrentDevice(currentDevice)
    }

    // Показываем уведомление о выборе устройства
    showSuccess(`Устройство "${currentDevice.name || currentDevice.id}" выбрано`)
  }
}

function updateDeviceInfo() {
  if (!currentDevice) return

  // Обновляем имя устройства
  document.getElementById('deviceName').textContent = currentDevice.name || currentDevice.id

  // Обновляем индикатор статуса
  const statusIndicator = document.getElementById('statusIndicator')
  const isOn = currentDevice.data && currentDevice.data.state
  statusIndicator.className = 'status-indicator' + (isOn ? ' online' : '')

  // Обновляем яркость
  const brightness = currentDevice.data && currentDevice.data.brightness
  if (brightness) {
    const displayValue = brightness === 0 ? '0% (выключено)' : brightness + '%'
    document.getElementById('deviceBrightness').textContent = displayValue
  } else {
    document.getElementById('deviceBrightness').textContent = '-'
  }

  // Обновляем трей при изменении состояния устройства
  if (window.electronAPI && window.electronAPI.updateDeviceState && currentDevice.data) {
    window.electronAPI.updateDeviceState(currentDevice.id, currentDevice.data.state ? 1 : 0)
  }
}

function updateColorFromHue(hue) {
  const color = hslToHex(hue, 100, 50)
  document.getElementById('colorValue').textContent = color

  if (currentDevice) {
    setDeviceColor(hue, 100, getBrightness())
  }
}

function updateBrightness(brightness) {
  // Преобразуем 0-90 в 10-100 для отображения
  const actualBrightness = brightness === 0 ? 0 : Math.round((brightness / 90) * 90 + 10)
  const displayValue = brightness === 0 ? '0% (выключено)' : actualBrightness + '%'
  document.getElementById('brightnessValue').textContent = displayValue

  if (currentDevice) {
    setDeviceBrightness(actualBrightness)
  }
}

function getBrightness() {
  return parseInt(document.getElementById('brightnessSlider').value)
}

function setDeviceColor(hue, saturation, brightness) {
  if (!currentDevice) return

  const colorData = {
    hue: hue,
    saturation: saturation / 100,
    brightness: brightness
  }

  if (isOnline) {
    controlDeviceOnline('colorSet', 'color', colorData)
  } else {
    controlDeviceOffline('colorSet', colorData)
  }

  // Показываем уведомление о изменении цвета
  const color = hslToHex(hue, saturation, brightness)
  showSuccess(`Цвет "${currentDevice.name || currentDevice.id}" изменен на ${color}`)
}

function setDeviceBrightness(brightness) {
  if (!currentDevice) return

  if (brightness === 0) {
    // Если яркость 0, выключаем устройство
    if (isOnline) {
      controlDeviceOnline('turnOnOff', 'value', 0)
    } else {
      controlDeviceOffline('turnOnOff', 0)
    }
  } else {
    // Если яркость больше 0, включаем устройство и устанавливаем яркость
    // Преобразуем 10-100 в 0-90 для отправки на устройство
    const deviceBrightness = Math.round(((brightness - 10) / 90) * 90)
    if (isOnline) {
      controlDeviceOnline('turnOnOff', 'value', 1)
      controlDeviceOnline('brightnessSet', 'value', deviceBrightness)
    } else {
      controlDeviceOffline('turnOnOff', 1)
      controlDeviceOffline('brightnessSet', deviceBrightness)
    }
  }

  // Показываем уведомление о изменении яркости
  if (brightness === 0) {
    showSuccess(`Выключаем "${currentDevice.name || currentDevice.id}"`)
  } else {
    showSuccess(`Яркость "${currentDevice.name || currentDevice.id}" установлена на ${brightness}%`)
  }
}

// Быстрые действия
function quickAction(action) {
  if (!currentDevice) {
    showError('Выберите устройство')
    return
  }

  switch (action) {
    case 'on':
      if (isOnline) {
        controlDeviceOnline('turnOnOff', 'value', 1)
      } else {
        controlDeviceOffline('turnOnOff', 1)
      }
      showSuccess(`Включаем "${currentDevice.name || currentDevice.id}"`)
      break
    case 'off':
      if (isOnline) {
        controlDeviceOnline('turnOnOff', 'value', 0)
      } else {
        controlDeviceOffline('turnOnOff', 0)
      }
      showSuccess(`Выключаем "${currentDevice.name || currentDevice.id}"`)
      break
    case 'bright':
      document.getElementById('brightnessSlider').value = 100
      updateBrightness(100)
      break
    case 'dim':
      document.getElementById('brightnessSlider').value = 30
      updateBrightness(30)
      break
  }
}

async function controlDeviceOnline(action, valueName, value) {
  try {
    const response = await fetch(proxyUrl + baseUrl + 'skill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        header: {
          name: action,
          namespace: 'control',
          payloadVersion: 1
        },
        payload: {
          accessToken: accessToken,
          devId: currentDevice.id,
          [valueName]: value
        }
      })
    })

    const data = await response.json()

    if (data.header && data.header.code === 'SUCCESS') {
      updateDeviceInfo()

      // Обновляем состояние устройства в трее
      if (action === 'turnOnOff' && window.electronAPI && window.electronAPI.updateDeviceState) {
        window.electronAPI.updateDeviceState(currentDevice.id, value === 1)
      }
    } else {
      showError('Ошибка выполнения команды')
    }
  } catch (error) {
    console.error('Ошибка управления устройством:', error)
    showError('Ошибка сети')
  }
}

function controlDeviceOffline(action, value) {
  // В офлайн режиме обновляем локальные данные
  if (currentDevice) {
    if (!currentDevice.data) currentDevice.data = {}

    switch (action) {
      case 'turnOnOff':
        currentDevice.data.state = value === 1
        break
      case 'brightnessSet':
        currentDevice.data.brightness = value
        break
      case 'colorSet':
        currentDevice.data.color = value
        break
    }

    updateDeviceInfo()

    // Обновляем состояние устройства в трее
    if (action === 'turnOnOff' && window.electronAPI && window.electronAPI.updateDeviceState) {
      window.electronAPI.updateDeviceState(currentDevice.id, value === 1)
    }
  }
}

// Функции авторизации
function toggleAuth() {
  const authSection = document.getElementById('authSection')
  const isVisible = authSection.style.display !== 'none'

  if (isVisible) {
    hideAuthSection()
  } else {
    showAuthSection()
  }
}

function showAuthSection() {
  document.getElementById('authSection').style.display = 'block'
  hideDeviceSection()
  hideControlSection()
}

function hideAuthSection() {
  document.getElementById('authSection').style.display = 'none'
  showDeviceSection()
}

function showDeviceSection() {
  document.querySelector('.device-section').style.display = 'block'
}

function hideDeviceSection() {
  document.querySelector('.device-section').style.display = 'none'
}

function showControlSection() {
  document.getElementById('controlSection').style.display = 'block'
}

function hideControlSection() {
  document.getElementById('controlSection').style.display = 'none'
}

async function doLogin() {
  const username = document.getElementById('username').value
  const password = document.getElementById('password').value
  const region = document.getElementById('region').value
  const platform = document.getElementById('platform').value
  const saveAuth = document.getElementById('saveAuth').checked

  if (!username || !password) {
    showLoginError('Введите логин и пароль')
    return
  }

  showLoading(true)

  try {
    const loginResult = await login(username, password, region, platform)

    if (loginResult.success) {
      accessToken = loginResult.access_token
      refreshToken = loginResult.refresh_token
      isOnline = true

      // Обновляем URL в зависимости от региона
      updateBaseUrl(region)

      // Загружаем устройства онлайн
      const deviceResult = await getDeviceList()
      if (deviceResult.success) {
        devices = deviceResult.devices.filter(device => device.dev_type === 'light')
        populateDeviceList()

        // Синхронизируем устройства с main процессом для трея
        if (window.electronAPI && window.electronAPI.setDevices) {
          window.electronAPI.setDevices(devices)
        }

        // Сбрасываем текущее устройство при новом входе
        currentDevice = null
        if (window.electronAPI && window.electronAPI.setCurrentDevice) {
          window.electronAPI.setCurrentDevice(null)
        }
        hideControlSection()

        // Сохраняем данные авторизации и устройства только если отмечен чекбокс
        if (saveAuth) {
          saveAuthData(username, password, region, platform)
          saveDevicesData(devices)
        }

        // Запускаем автоматическое обновление токена
        startAutoRefresh()

        showSuccess('Авторизация успешна')
        hideAuthSection()
      } else {
        showLoginError('Не удалось загрузить устройства')
      }
    } else {
      showLoginError('Ошибка авторизации')
    }
  } catch (error) {
    console.error('Ошибка авторизации:', error)
    showLoginError('Ошибка сети')
  }

  showLoading(false)
}

async function login(username, password, region, platform) {
  let url = baseUrl + 'auth.do'

  if (region === '1') {
    url = baseUrl.replace('eu', 'us') + 'auth.do'
  } else if (region === '86') {
    url = baseUrl.replace('eu', 'cn') + 'auth.do'
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  }

  const data = {
    userName: username,
    password: password,
    countryCode: region,
    bizType: platform,
    from: 'tuya'
  }

  const response = await fetch(proxyUrl + url, {
    method: 'POST',
    headers: headers,
    body: new URLSearchParams(data)
  })

  const result = await response.json()

  if (result.access_token) {
    return {
      success: true,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in
    }
  } else {
    return { success: false }
  }
}

async function getDeviceList() {
  const url = baseUrl + 'skill'
  const headers = {
    'Content-Type': 'application/json'
  }

  const data = {
    header: {
      name: 'Discovery',
      namespace: 'discovery',
      payloadVersion: 1
    },
    payload: {
      accessToken: accessToken
    }
  }

  const response = await fetch(proxyUrl + url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(data)
  })

  const result = await response.json()

  if (result.payload && result.payload.devices) {
    return {
      success: true,
      devices: result.payload.devices
    }
  } else {
    return { success: false }
  }
}

function updateBaseUrl(region) {
  if (region === '1') {
    baseUrl = baseUrl.replace('eu', 'us')
  } else if (region === '86') {
    baseUrl = baseUrl.replace('eu', 'cn')
    proxyUrl = 'https://cors-anywhere.herokuapp.com/'
  }
}

// Функции для работы с refresh token
async function refreshAccessToken() {
  if (!refreshToken) {
    console.error('Нет refresh token')
    return false
  }

  try {
    const url = baseUrl + 'access.do'
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      rand: Math.random()
    })

    const response = await fetch(proxyUrl + url + '?' + params.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()

    if (result.access_token) {
      accessToken = result.access_token
      refreshToken = result.refresh_token

      // Обновляем сохраненные данные
      const savedAuth = localStorage.getItem('tuya_auth')
      if (savedAuth) {
        const authData = JSON.parse(savedAuth)
        authData.access_token = accessToken
        authData.refresh_token = refreshToken
        localStorage.setItem('tuya_auth', JSON.stringify(authData))
      }

      console.log('Токен обновлен успешно')
      return true
    } else {
      console.error('Ошибка обновления токена:', result)
      return false
    }
  } catch (error) {
    console.error('Ошибка обновления токена:', error)
    return false
  }
}

function startAutoRefresh() {
  // Останавливаем предыдущий интервал если есть
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }

  // Запускаем обновление каждые 2 минуты (120000 мс)
  refreshInterval = setInterval(async () => {
    if (isOnline && refreshToken) {
      console.log('Автоматическое обновление токена...')
      await refreshAccessToken()
    }
  }, 120000)
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function saveAuthData(username, password, region, platform) {
  const authData = {
    username: username,
    password: password,
    region: region,
    platform: platform,
    access_token: accessToken,
    refresh_token: refreshToken,
    baseUrl: baseUrl,
    proxyUrl: proxyUrl
  }
  localStorage.setItem('tuya_auth', JSON.stringify(authData))
}

function saveDevicesData(devices) {
  localStorage.setItem('tuya_devices', JSON.stringify(devices))

  // Синхронизируем устройства с main процессом для трея
  if (window.electronAPI && window.electronAPI.setDevices) {
    window.electronAPI.setDevices(devices)
  }
}

// Функции импорта/экспорта
function importAuth() {
  const username = document.getElementById('username').value
  const password = document.getElementById('password').value
  const region = document.getElementById('region').value
  const platform = document.getElementById('platform').value

  if (!username || !password) {
    showLoginError('Введите логин и пароль для импорта авторизации')
    return
  }

  // Сохраняем данные авторизации без попытки входа
  saveAuthData(username, password, region, platform)

  // Синхронизируем устройства с main процессом для трея (пустой массив)
  if (window.electronAPI && window.electronAPI.setDevices) {
    window.electronAPI.setDevices([])
  }

  // Сбрасываем текущее устройство
  currentDevice = null
  if (window.electronAPI && window.electronAPI.setCurrentDevice) {
    window.electronAPI.setCurrentDevice(null)
  }
  hideControlSection()

  showSuccess('Данные авторизации сохранены')
}

function refreshDevices() {
  const savedAuth = localStorage.getItem('tuya_auth')
  if (savedAuth) {
    try {
      const authData = JSON.parse(savedAuth)

      // Восстанавливаем данные авторизации
      accessToken = authData.access_token
      refreshToken = authData.refresh_token
      isOnline = true
      baseUrl = authData.baseUrl
      proxyUrl = authData.proxyUrl

      // Обновляем токен через refresh token
      refreshAccessToken().then(success => {
        if (success) {
          // Обновляем устройства
          getDeviceList().then(result => {
            if (result.success) {
              devices = result.devices.filter(device => device.dev_type === 'light')
              populateDeviceList()
              saveDevicesData(devices)

              // Синхронизируем устройства с main процессом для трея
              if (window.electronAPI && window.electronAPI.setDevices) {
                window.electronAPI.setDevices(devices)
              }

              // Восстанавливаем текущее устройство, если оно было
              if (currentDevice && !devices.find(d => d.id === currentDevice.id)) {
                currentDevice = null
                if (window.electronAPI && window.electronAPI.setCurrentDevice) {
                  window.electronAPI.setCurrentDevice(null)
                }
                hideControlSection()
              }

              showSuccess('Устройства обновлены')
            } else {
              showError('Не удалось обновить устройства')
            }
          })
        } else {
          showError('Не удалось обновить токен авторизации')
        }
      })
    } catch (error) {
      console.error('Ошибка обновления устройств:', error)
      showError('Ошибка обновления устройств')
    }
  } else {
    showError('Нет сохраненных данных авторизации')
  }
}

function showLoginError(message) {
  const errorDiv = document.getElementById('loginFailed')
  errorDiv.textContent = message
  errorDiv.style.display = 'block'
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none'
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage')
  errorDiv.textContent = message
  errorDiv.style.display = 'block'

  setTimeout(() => {
    errorDiv.style.display = 'none'
  }, 5000)
}

function showSuccess(message) {
  const successDiv = document.getElementById('successMessage')
  successDiv.textContent = message
  successDiv.style.display = 'block'

  setTimeout(() => {
    successDiv.style.display = 'none'
  }, 3000)
}

// Утилиты для работы с цветом
function hslToHex(h, s, l) {
  h /= 360
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h * 6) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0

  if (0 <= h && h < 1 / 6) {
    r = c; g = x; b = 0
  } else if (1 / 6 <= h && h < 2 / 6) {
    r = x; g = c; b = 0
  } else if (2 / 6 <= h && h < 3 / 6) {
    r = 0; g = c; b = x
  } else if (3 / 6 <= h && h < 4 / 6) {
    r = 0; g = x; b = c
  } else if (4 / 6 <= h && h < 5 / 6) {
    r = x; g = 0; b = c
  } else if (5 / 6 <= h && h <= 1) {
    r = c; g = 0; b = x
  }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0')
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0')
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0')

  return `#${rHex}${gHex}${bHex}`
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

// Функции для кнопок включения/выключения
function turnDeviceOn() {
  if (!currentDevice) {
    showError('Выберите устройство')
    return
  }

  if (isOnline) {
    controlDeviceOnline('turnOnOff', 'value', 1)
  } else {
    controlDeviceOffline('turnOnOff', 1)
  }

  showSuccess(`Включаем "${currentDevice.name || currentDevice.id}"`)
}

function turnDeviceOff() {
  if (!currentDevice) {
    showError('Выберите устройство')
    return
  }

  if (isOnline) {
    controlDeviceOnline('turnOnOff', 'value', 0)
  } else {
    controlDeviceOffline('turnOnOff', 0)
  }

  showSuccess(`Выключаем "${currentDevice.name || currentDevice.id}"`)
}

// Делаем функции глобально доступными
window.setBrightness = updateBrightness
window.turnDeviceOn = turnDeviceOn
window.turnDeviceOff = turnDeviceOff 