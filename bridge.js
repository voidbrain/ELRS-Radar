// bridge.js
// Robust ELRS telemetry bridge optimized for custom embedded ELRS Backpack packets
const dgram = require("dgram");
const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const UDP_PORT = 14550;
const WS_PORT = 8766;
const HTTP_PORT = 8181;

const SQUIRREL_HOST = "127.0.0.1";
const SQUIRREL_PORT = 14551;

const udp = dgram.createSocket("udp4");
const udpOut = dgram.createSocket("udp4");

const LOG_DIR = path.join(__dirname, "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

/* ========================================
   STATE
======================================== */

let lastFlightFlags = null;

const state = {
  me: null,
  drone: null,
  timestamp: 0,
};

/* ========================================
   WS SERVER
======================================== */

const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("WS client connected. Total clients:", clients.size);

  ws.send(JSON.stringify({ type: "state", ...state }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "debug-pos") {
        if (msg.me) state.me = msg.me;
        if (msg.drone) state.drone = msg.drone;
        state.timestamp = Date.now();
        broadcast({ type: "state", ...state });
      }
    } catch (e) {
      console.warn("Invalid WS JSON");
    }
  });

  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

/* ========================================
   LOGGING & HELPERS
======================================== */

function logPacket(msg, payload) {
  const line = JSON.stringify({
    ts: Date.now(),
    hex: msg.toString("hex"),
    len: msg.length,
    payload
  });

  fs.appendFile(path.join(LOG_DIR, "packets.ndjson"), line + "\n", () => {});
}

function isValidGPS(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/* ========================================
   TELEMETRY DECODER
======================================== */

function decodeMSPGPS(msg) {
  if (msg.length < 8) return null;

  try {
    const hex = msg.toString("hex");
    const syncIdx = hex.indexOf("24583c"); // Target "$X<" sync boundary

    if (syncIdx === -1) return null;

    const byteOffset = syncIdx / 2;
    const functionId = msg.readUInt16LE(byteOffset + 4);
    const payloadLen = msg.readUInt16LE(byteOffset + 6);
    const payloadStart = byteOffset + 8;

    if (functionId !== 17) return null;

    // --- CASE A: 28-Byte GPS Packet Frame ---
    if (payloadLen === 19 && msg.readUInt8(payloadStart + 1) === 0x11) {
      const lat = msg.readInt32BE(payloadStart + 3) / 1e7;
      const lng = msg.readInt32BE(payloadStart + 7) / 1e7;
      const altitudeRaw = msg.readUInt16BE(payloadStart + 15);
      const sats = msg.readUInt8(payloadStart + 17);
      const altitude = altitudeRaw > 1000 ? altitudeRaw - 1000 : altitudeRaw;

      if (isValidGPS(lat, lng)) {
        return {
          protocol: "gps",
          type: "drone",
          lat,
          lng,
          altitude: altitude >= 0 ? altitude : 0,
          sats: sats || 0
        };
      }
    }

    // --- CASE B: 23-Byte Link Status Frame ---
    if (payloadLen === 14 && msg.readUInt8(payloadStart + 1) === 0x0C) {
      const rxRSSI = msg.readInt8(payloadStart + 3); // Uplink dBm
      const txRSSI = msg.readInt8(payloadStart + 4); // Downlink dBm
      const linkQuality = msg.readUInt8(payloadStart + 5); // LQ %

      return {
        protocol: "metrics",
        type: "drone",
        rxRSSI,
        txRSSI,
        linkQuality
      };
    }

    // Ensure this variable is initialized in your global or outer scope 
// so its state persists across consecutive message evaluations:
// let lastFlightFlags = null;

// --- CASE C: Flight Controller Status / Mode Frame ---
if (payloadLen >= 10 && msg.readUInt8(payloadStart + 2) === 0x1E) {

  const flightModeFlags = msg.readUInt32LE(payloadStart + 6);

  // --- INIT ---
  if (lastFlightFlags === null) {
    lastFlightFlags = flightModeFlags;
  }

  // --- BIT DIFF DETECTION ---
  const changed = flightModeFlags ^ lastFlightFlags;

  if (changed !== 0) {
    console.log("\n==================== FLIGHT FLAGS CHANGE ====================");

    for (let i = 0; i < 32; i++) {
      if (changed & (1 << i)) {
        const oldVal = (lastFlightFlags & (1 << i)) !== 0;
        const newVal = (flightModeFlags & (1 << i)) !== 0;

        console.log(`BIT ${i}: ${oldVal} → ${newVal}`);
      }
    }

    console.log("BIN:", flightModeFlags.toString(2).padStart(32, "0"));
    console.log("TIME:", new Date().toISOString());
    console.log("===========================================================\n");

    lastFlightFlags = flightModeFlags;
  }

  // --- INTERPRETATION (DO NOT TRUST BIT 0 AS TRUE ARM STATE) ---
  const isAngle   = (flightModeFlags & (1 << 1)) !== 0;
  const isHorizon = (flightModeFlags & (1 << 2)) !== 0;
  const isRTH     = (flightModeFlags & (1 << 13)) !== 0;

  // Treat bit0 as "arm switch / request", NOT real motor state
  const armSwitch = (flightModeFlags & (1 << 0)) !== 0;

  let modeText = "ACRO";
  if (isRTH) modeText = "RTH";
  else if (isAngle) modeText = "ANGLE";
  else if (isHorizon) modeText = "HORIZON";

  // Use your requested armSwitch heuristic override 
  const isArmed = armSwitch; 

  return {
    protocol: "status",
    type: "drone",
    isArmed,
    flightMode: modeText,
    rawStatus: `${isArmed ? "ARMED" : "DISARMED"} [${modeText}]`
  };
}


    // --- CASE D: 21-Byte Battery Sensor Frame ---
    if (payloadLen === 12 && msg.readUInt8(payloadStart + 2) === 0x08) {
      // Read fields natively as Big Endian per standard CRSF specifications
      const rawVoltage = msg.readUInt16BE(payloadStart + 3); 
      const rawCurrent = msg.readUInt16BE(payloadStart + 5);
      const capacity = (msg.readUInt8(payloadStart + 7) << 16) | msg.readUInt16BE(payloadStart + 8);
      const remainingPct = msg.readUInt8(payloadStart + 10);

      return {
        protocol: "battery",
        type: "drone",
        vbat: rawVoltage / 10, // CRSF sends battery data scaled in 0.1V units
        current: rawCurrent / 10, // scaled in 0.1A units
        mah: capacity,
        batteryPercent: remainingPct
      };
    }
  } catch (e) {
    // Suppress glitches
  }
  return null;
}

/* ========================================
   MAIN TELEMETRY PIPELINE
======================================== */

function processPacket(msg, rinfo = {}) {
  const telemetry = decodeMSPGPS(msg);
  logPacket(msg, {
    telemetry,
    from: `${rinfo.address || "replay"}:${rinfo.port || 0}`
  });

  if (!telemetry) return;

  broadcast({
    type: telemetry.protocol,
    data: telemetry,
    timestamp: Date.now()
  });

  udpOut.send(msg, SQUIRREL_PORT, SQUIRREL_HOST);
}

/* ========================================
   UDP CONNECTION SERVICE
======================================== */

udp.on("message", (msg, rinfo) => {
  processPacket(msg, rinfo);
});

udp.on("error", (err) => {
  console.error("UDP loop crash error:", err);
});

/* ========================================
   HTTP FILE SERVICE
======================================== */

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.join(__dirname, reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

/* ========================================
   REPLAY MODE / START CONTEXT
======================================== */

async function replay(file) {
  console.log("INITIALIZING HISTORIC REPLAY STREAM:", file);
  if (!fs.existsSync(file)) {
    console.error("File does not exist:", file);
    process.exit(1);
  }

  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  let lastPacketTime = null;

  for (const line of lines) {
    if (!line) continue;
    const pkt = JSON.parse(line);
    const msg = Buffer.from(pkt.hex, "hex");

    if (lastPacketTime !== null) {
      const delay = pkt.ts - lastPacketTime;
      const safeDelay = Math.max(1, Math.min(delay, 2000)); // Protect step transitions
      await new Promise((r) => setTimeout(r, safeDelay));
    }

    lastPacketTime = pkt.ts;
    processPacket(msg);
  }
  console.log("LOG HISTORY PLAYBACK FINISHED SUCCESSFULLY");
}

if (process.argv[2] === "--replay") {
  replay(process.argv[3]);
} else {
  // Bind standard port sharing layout settings natively
  udp.bind({
    port: UDP_PORT,
    address: "0.0.0.0",
    exclusive: false
  }, () => {
    console.log(`UDP Server monitoring telemetry port: ${UDP_PORT}`);
  });
}

server.listen(HTTP_PORT, () => {
  console.log(`Web application rendering layer open on: http://localhost:${HTTP_PORT}`);
});
