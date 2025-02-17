import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { app, BrowserWindow } = require('electron')
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile(join(__dirname, 'index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { SerialPort } from 'serialport'
const honoApp = new Hono()
const apiPort = 3000
const SERIAL_PORT = "/dev/tty.usbserial-120"
const BAUD_RATE = 115200

const laserPort = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE })

laserPort.on("open", () => console.log(`✅ Connected to ${SERIAL_PORT}`))
laserPort.on("error", err => console.error("❌ Serial Port Error:", err))

const sendGCode = command => {
  console.log("🔄 Sending:", command)
  laserPort.write(command + "\n")
}

honoApp.post('/move', async c => {
  const { x, y } = await c.req.json()
  if (typeof x !== 'number' || typeof y !== 'number') {
    return c.json({ error: "Invalid X/Y values" }, 400)
  }
  const gcode = `G0 X${x} Y${y}`
  sendGCode(gcode)
  return c.json({ message: `Moved to X:${x}, Y:${y}` })
})

serve({ fetch: honoApp.fetch, port: apiPort }, info => {
  console.log(`🚀 API running at http://localhost:${info.port}`)
})