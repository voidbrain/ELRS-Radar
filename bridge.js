// bridge.js
const dgram = require("dgram");
const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const UDP_PORT = 14550; // UDP port to listen for ELRS telemetry
const WS_PORT = 8766; // websocket port for frontend communication
const HTTP_PORT = 8181; // frontend HTTP server port

const SQUIRREL_HOST = "127.0.0.1";
const SQUIRREL_PORT = 14551;

const udp = dgram.createSocket("udp4");
const udpOut = dgram.createSocket("udp4"); // used to forward raw packets to squirrel (optional)

// ------------------------
// STATE (single source of truth)
// ------------------------
const state = {
  me: null,
  drone: null,
  timestamp: 0,
};

// ------------------------
// WS SERVER
// ------------------------
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("Total clients:", clients.size);

  // send initial state
  ws.send(JSON.stringify({ type: "state", ...state }));
  console.log("Sent initial state to client:", state);

  ws.on("message", (data) => {
    // Accept JSON updates from frontend
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "debug-pos") {
        if (msg.me) state.me = msg.me;
        if (msg.drone) state.drone = msg.drone;
        state.timestamp = Date.now();
      }
    } catch (e) {
      console.warn("Invalid WS message:", data.toString());
      // ignore non-json (optional raw packets)
    }
    
    // broadcast to all clients
    console.log(`Broadcasting state to ${clients.size} clients:`, state);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "state", ...state }));
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("WS client disconnected");
  });

  ws.on("error", (err) => {
    console.error("WS error:", err.message);
    clients.delete(ws);
  });
});

// ------------------------
// BACKPACK DECODER (NEW)
// -------------------------
// This parses the raw UDP payload looking for a JSON-encoded GPS structure.
// This replaces the sliding window byte search with a proper structured lookup.
function tryParseBackpack(msg) {
  try {
    const text = msg.toString("utf8");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1) {
      return null;
    }

    const json = text.slice(start, end + 1);

    const data = JSON.parse(json);

    if (
      data &&
      data.type === "gps" &&
      typeof data.lat === "number" &&
      typeof data.lng === "number"
    ) {
      return data;
    }
  } catch (e) {}

  return null;
}

// ------------------------
// UDP INPUT (ELRS / telemetry)
// ------------------------
udp.on("message", (msg) => {
  // 1. Try to decode if it's a structured backpack JSON
  const backpack = tryParseBackpack(msg);
  
  let payload;
  if (backpack) {
    // If it's a backpack, we send the parsed version directly
    payload = JSON.stringify({ type: "backpack", ...backpack, timestamp: Date.now() });
    console.log("structured", msg, backpack)
  } else {
    // 2. Fallback to raw binary hex encoding
    payload = JSON.stringify({
      type: "udp",
      raw: msg.toString("hex"),
      length: msg.length,
      timestamp: Date.now(),
    });
    console.log("raw", msg, msg.toString("hex"))
  }

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }

  // forward to squirrel
  udpOut.send(msg, SQUIRREL_PORT, SQUIRREL_HOST, (err) => {
    if (err) console.error("SQUIRREL send error:", err);
  });
});

udp.on("listening", () => {
  const addr = udp.address();

  console.log("==================================");
  console.log("ELRS Bridge");
  console.log("==================================");
  console.log("UDP :", `${addr.address}:${addr.port}`);
  console.log("WS  :", `ws://0.0.0.0:${WS_PORT}`);
  console.log("HTTP:", `http://0.0.0.0:${HTTP_PORT}`);
  console.log("==================================");
});

udp.on("error", (err) => {
  console.error("UDP error:", err);
});

// ------------------------
// SIMPLE HTTP SERVER
// ------------------------
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.join(__dirname, reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("404");
      return;
    }

    const ext = path.extname(filePath);

    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });

    res.end(data);
  });
});

server.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on ${HTTP_PORT}`);
});

// ------------------------
// START UDP
// ------------------------
udp.bind(UDP_PORT, "0.0.0.0", () => {
  console.log("UDP listening...");
});
