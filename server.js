import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { SerialPort } from 'serialport';

const app = new Hono();
const port = 3000;
const SERIAL_PORT = "/dev/tty.usbserial-120"; 
const BAUD_RATE = 115200; 

const laserPort = new SerialPort({path: SERIAL_PORT, baudRate: BAUD_RATE});

laserPort.on("open", () => console.log(`Connected to ${SERIAL_PORT}`));
laserPort.on("error", err => console.error("Serial Port Error:", err));

const sendGCode = (command) => {
    console.log("Sending:", command);
    laserPort.write(command + "\n");
};

app.post('/move', async (c) => {
    const { x, y } = await c.req.json();
    if (typeof x !== 'number' || typeof y !== 'number') {
        return c.json({ error: "Invalid X/Y values" }, 400);
    }

    const gcode = `G0 X${x} Y${y}`;
    sendGCode(gcode);
    return c.json({ message: `Moved to X:${x}, Y:${y}` });
});

serve(app, (_server) => {
    console.log(`API running at http://localhost:${port}`);
});