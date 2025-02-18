import { createRequire } from 'module'
const require = createRequire(import.meta.url)
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { app, BrowserWindow } from 'electron'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { SerialPort } from 'serialport'
import { svgPathProperties } from 'svg-path-properties'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  win.loadFile(join(__dirname, 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

const apiPort = 3000
const SERIAL_PORT = '/dev/tty.usbserial-1120'
const BAUD_RATE = 115200
const laserPort = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE })

laserPort.on('open', () => console.log(`✅ Connected to ${SERIAL_PORT}`))
laserPort.on('error', err => console.error('❌ Serial Port Error:', err))

const sendGCode = command => {
  console.log('🔄 Sending:', command)
  laserPort.write(command + '\n')
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const extractPathsFromSvg = svg => {
  const paths = []
 
  const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/gi
  let match
  while ((match = pathRegex.exec(svg)) !== null) {
    paths.push(match[1])
  }
 
  const rectRegex = /<rect\s+([^>]+)>/gi
  while ((match = rectRegex.exec(svg)) !== null) {
    const attrs = match[1]
    const x = parseFloat((attrs.match(/x="([^"]+)"/i) || [0, "0"])[1] || "0")
    const y = parseFloat((attrs.match(/y="([^"]+)"/i) || [0, "0"])[1] || "0")
    const width = parseFloat((attrs.match(/width="([^"]+)"/i) || [0, "0"])[1] || "0")
    const height = parseFloat((attrs.match(/height="([^"]+)"/i) || [0, "0"])[1] || "0")
    const d = `M${x},${y} L${x+width},${y} L${x+width},${y+height} L${x},${y+height} Z`
    paths.push(d)
  }

  const circleRegex = /<circle\s+([^>]+)>/gi
  while ((match = circleRegex.exec(svg)) !== null) {
    const attrs = match[1]
    const cx = parseFloat((attrs.match(/cx="([^"]+)"/i) || [0, "0"])[1] || "0")
    const cy = parseFloat((attrs.match(/cy="([^"]+)"/i) || [0, "0"])[1] || "0")
    const r = parseFloat((attrs.match(/r="([^"]+)"/i) || [0, "0"])[1] || "0")
    const d = `M${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} Z`
    paths.push(d)
  }
  return paths
}

const convertSvgToGcode = svg => {
  let viewBoxHeight = 32 
  const vbMatch = svg.match(/viewBox="([^"]+)"/i)
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/)
    if (parts.length === 4) {
      viewBoxHeight = parseFloat(parts[3])
    }
  }
  const dList = extractPathsFromSvg(svg)
  let gcodeCommands = []
  dList.forEach(d => {
    const props = new svgPathProperties(d)
    const totalLength = props.getTotalLength()
    const step = 1 
    let firstPoint = true
    for (let dist = 0; dist <= totalLength; dist += step) {
      const { x, y } = props.getPointAtLength(dist)
      const flippedY = viewBoxHeight - y
      const command = firstPoint
        ? `G0 X${x.toFixed(2)} Y${flippedY.toFixed(2)}`
        : `G1 X${x.toFixed(2)} Y${flippedY.toFixed(2)} S1000 F1000`
      gcodeCommands.push(command)
      firstPoint = false
    }
    gcodeCommands.push('G1 S0 F1000')
  })
  return gcodeCommands
}

const honoApp = new Hono()

honoApp.post('/move', async c => {
  const { x, y } = await c.req.json()
  if (typeof x !== 'number' || typeof y !== 'number')
    return c.json({ error: 'Invalid X/Y values' }, 400)
  sendGCode(`G0 X${x} Y${y}`)
  return c.json({ message: `Moved to X:${x}, Y:${y}` })
})

honoApp.post('/gcode', async c => {
  const { gcode } = await c.req.json()
  if (typeof gcode !== 'string')
    return c.json({ error: 'Invalid G-code input' }, 400)
  const commands = gcode.split('\n').map(line => line.trim()).filter(Boolean)
  for (const cmd of commands) {
    sendGCode(cmd)
    await delay(50)
  }
  return c.json({ message: `Processed ${commands.length} commands` })
})

honoApp.post('/svg', async c => {
  const { svg } = await c.req.json()
  if (typeof svg !== 'string')
    return c.json({ error: 'Invalid SVG input' }, 400)
  try {
    let commands = []
    commands.push("G21")
    commands.push("G90")
    commands.push("M4") 
    commands = commands.concat(convertSvgToGcode(svg))
    commands.push("M5") 
    for (const cmd of commands) {
      sendGCode(cmd)
      await delay(50)
    }
    return c.json({ message: `Processed ${commands.length} commands` })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Failed to process SVG' }, 500)
  }
})

serve({ fetch: honoApp.fetch, port: apiPort }, info => {
  console.log(`🚀 API running at http://localhost:${info.port}`)
})