// radar.js 
const canvas = document.getElementById("radarCanvas");
const ctx = canvas.getContext("2d");

const distEl = document.getElementById("dist");
const bearingEl = document.getElementById("bearingDisplay");
const feedbackEl = document.getElementById("feedbackEl");
const droneLatEl = document.getElementById("droneLat");
const droneLngEl = document.getElementById("droneLng");
const controllerLatEl = document.getElementById("controllerLat");
const controllerLngEl = document.getElementById("controllerLng");
const versionEl = document.getElementById("version");
const enableCompassBtn = document.getElementById("enableCompass");

const styles = getComputedStyle(document.documentElement);
const rgb = styles.getPropertyValue("--radar-line");
const wedge = styles.getPropertyValue("--radar-wedge");

let compassEnabled = false;
let lastDroneUpdate = 0;

let myPos = {
  lat: null,
  lng: null,
  heading: 0,
};

let dronePos = {
  lat: null,
  lng: null,
};

let distance = 0;
let bearing = 0;

/* =========================
  WEBSOCKET (RAW BINARY)
========================= */

const ws = new WebSocket("ws://localhost:8766");
ws.binaryType = "arraybuffer";

// ws.onmessage = (e) => {
//   if (typeof e.data === "string") {
//     try {
//       // Handle JSON test messages
//       const data = JSON.parse(e.data);
//       myPos.lat = data.me.lat;
//       myPos.lng = data.me.lng;
//       myPos.heading = data.me.heading;
//       dronePos.lat = data.drone.lat;
//       dronePos.lng = data.drone.lng;

//       updateCalculations();
//     } catch (err) {
//       console.error("Invalid JSON message:", err.message);
//     }
//   } else if (e.data instanceof ArrayBuffer) {
//     const bytes = new Uint8Array(e.data);
//     parseCRSF(bytes);
//   }
// };

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    console.log(data)
    // ------------------------
    // STATE SYNC
    // ------------------------
    if (data.type === "state") {
      if (data.me) {
        myPos.lat = data.me.lat;
        myPos.lng = data.me.lng;

        if (typeof data.me.heading === "number") {
          myPos.heading = data.me.heading;
        }
      }

      if (data.drone) {
        dronePos.lat = data.drone.lat;
        dronePos.lng = data.drone.lng;
      }

      updateCalculations();
      return;
    }

    // ------------------------
    // BACKPACK GPS
    // ------------------------
    if (data.type === "backpack") {
      if (
        typeof data.lat === "number" &&
        typeof data.lng === "number"
      ) {
        dronePos.lat = data.lat;
        dronePos.lng = data.lng;

        droneLatEl.innerText = data.lat.toFixed(7);
        droneLngEl.innerText = data.lng.toFixed(7);

        if (typeof data.alt === "number") {
          dronePos.altitude = data.alt;
        }

        lastDroneUpdate = Date.now();

        console.log("✔ BACKPACK GPS:", data.lat, data.lng);

        updateCalculations();
      }

      return;
    }
  } catch (err) {
    console.error("WS parse error:", err.message);
  }
};

/* =========================
  GPS (PHONE POSITION)
========================= */

startGPS();

function startGPS() {
  if (!navigator.geolocation) {
    feedbackEl.innerText = "GPS not supported";
    setTimeout(() => {
      feedbackEl.innerText = "";
    }, 2000);
    return;
  } else {
    if (enableCompassBtn.style.display !== "none") {
      enableCompassBtn.style.display = "none";
    }
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      myPos.lat = pos.coords.latitude;
      myPos.lng = pos.coords.longitude;
      controllerLatEl.innerText = myPos.lat.toFixed(7);
      controllerLngEl.innerText = myPos.lng.toFixed(7);

      updateCalculations();
    },
    (err) => {
      console.error(err);
      feedbackEl.innerText = "GPS denied";
      setTimeout(() => {
        feedbackEl.innerText = "";
      }, 2000);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000,
    },
  );
}

/* =========================
  COMPASS
========================= */

document
  .getElementById("enableCompass")
  .addEventListener("click", startCompass);

function startCompass() {
  console.log("Enabling compass...");
  if (compassEnabled) return;

  feedbackEl.innerText = "Compass Active";
  setTimeout(() => {
    feedbackEl.innerText = "";
  }, 2000);

  if ("ondeviceorientationabsolute" in window) {
    window.addEventListener("deviceorientationabsolute", onCompass, true);
  } else {
    window.addEventListener("deviceorientation", onCompass, true);
  }

  enableCompassBtn.style.display = "none";

  compassEnabled = true;
}

function onCompass(e) {
  if (e.alpha == null) return;

  const h = (e.alpha + 360) % 360;

  let delta = h - myPos.heading;

  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  myPos.heading += delta * 0.15;
  myPos.heading = (myPos.heading + 360) % 360;

  updateCalculations();
}

/* =========================
  CRSF ENTRY POINT
========================= */

function parseCRSF(bytes) {
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x24 || // $
    bytes[1] !== 0x58 || // X
    bytes[2] !== 0x3c // <
  ) {
    return;
  }
  decodeCRSF(bytes.slice(3));
}

function updateDroneAgeUI() {
  if (!lastDroneUpdate) {
    document.getElementById("lastDroneUpdate").innerText = "--";
    return;
  }

  const secondsAgo = (Date.now() - lastDroneUpdate) / 1000;

  let text = "--";
  if (secondsAgo < 1) text = "now";
  else if (secondsAgo < 10) text = `${secondsAgo.toFixed(1)}s ago`;
  else if (secondsAgo >= 10) text = `${Math.floor(secondsAgo)}s ago`;
  if (secondsAgo >= 60)
    text = `${Math.floor(secondsAgo / 60)}m ${Math.floor(secondsAgo % 60)}s ago`;

  document.getElementById("lastDroneUpdate").innerText = text;
}

function decodeCRSF(buf) {
  // must contain backpack header
  if (buf.length < 20 || buf[0] !== 0x00) {
    return;
  }

  // find best-aligned GPS window
  for (let i = 0; i < buf.length - 12; i++) {
    const view = new DataView(
      buf.buffer,
      buf.byteOffset + i,
      buf.byteLength - i,
    );

    try {
      const latRaw = view.getInt32(0, false);
      const lngRaw = view.getInt32(4, false);

      const lat = latRaw / 1e7;
      const lng = lngRaw / 1e7;

      // sanity filter
      // TODO: refactor to a proper JSON decode
      if (lat > 40 && lat < 50 && lng > 10 && lng < 15) {
        dronePos.lat = lat;
        dronePos.lng = lng;
        droneLatEl.innerText = lat.toFixed(7);
        droneLngEl.innerText = lng.toFixed(7);
        lastDroneUpdate = Date.now();

        // optional altitude (if exists)
        if (view.byteLength > 10) {
          dronePos.altitude = view.getInt16(8, false);
        }

        console.log("✔ GPS LOCK:", lat, lng);

        updateCalculations();
        return;
      }
    } catch (e) {}
  }
}

/* =========================
  GPS DECODER (SAFE)
========================= */

function decodeGPS(buf) {
  try {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    if (view.byteLength < 10) return;

    const latRaw = view.getInt32(3, false);
    const lngRaw = view.getInt32(7, false);

    const lat = latRaw / 1e7;
    const lng = lngRaw / 1e7;

    if (
      !isFinite(lat) ||
      !isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return;
    }

    dronePos.lat = lat;
    dronePos.lng = lng;
    droneLatEl.innerText = lat.toFixed(7);
    droneLngEl.innerText = lng.toFixed(7);
    lastDroneUpdate = Date.now();

    // optional extra fields (only if present)
    if (view.byteLength >= 12) {
      dronePos.sats = view.getUint8(11);
    }
    updateCalculations();
  } catch (e) {
    console.log("GPS decode error:", e.message);
  }
}

/* =========================
   CALCULATIONS
========================= */

function updateCalculations() {
  if (
    myPos.lat != null &&
    myPos.lng != null &&
    dronePos.lat != null &&
    dronePos.lng != null && 
    isFinite(myPos.lat) &&
    isFinite(myPos.lng) &&
    isFinite(dronePos.lat) &&
    isFinite(dronePos.lng)
  ) {
    distance = hav(myPos.lat, myPos.lng, dronePos.lat, dronePos.lng);

    bearing = bear(myPos.lat, myPos.lng, dronePos.lat, dronePos.lng);

    let diff = ((Math.round(bearing) - myPos.heading + 540) % 360) - 180;

    let dirText = "FRONT";
    if (Math.abs(diff) > 5) {
      dirText = diff > 0 ? "RIGHT" : "LEFT";
    }

    bearingEl.innerText = `${dirText} ${Math.round(Math.abs(diff))}°`;

    distEl.innerText = Math.round(distance) + " m";
  } else {
    distEl.innerText = "No Drone";
    bearingEl.innerText = "--";
  }
}

/* =========================
   RENDER (UNCHANGED LOGIC)
========================= */

function render() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) / 2 - 5;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = `rgba(${rgb},0.15)`;
  ctx.lineWidth = 1;

  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (radius / 3) * r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = `rgba(${rgb},0.6)`;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - radius);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${rgb},0.1)`;
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-myPos.heading * Math.PI) / 180);

/* =========================
    CARDINAL LABELS
========================= */

  ctx.fillStyle = `rgba(${rgb},1)`;
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const radiusText = radius - 40;

  const cardinals = [
    { t: "N", a: 0 },
    { t: "E", a: 90 },
    { t: "S", a: 180 },
    { t: "W", a: 270 },
  ];

  cardinals.forEach((c) => {
    ctx.save();
    ctx.rotate((c.a * Math.PI) / 180);
    ctx.fillText(c.t, 0, -radiusText);
    ctx.restore();
  });

  /* =========================
   DEGREE NUMBERS (every 30°)
========================= */

  ctx.font = "10px monospace";

  for (let a = 0; a < 360; a += 30) {
    ctx.save();
    ctx.rotate((a * Math.PI) / 180);
    ctx.fillText(a.toString(), 0, -radius + 25);
    ctx.restore();
  }

/* =========================
    TICKS (5° + 30° emphasis)
========================= */

  for (let a = 0; a < 360; a += 5) {
    ctx.beginPath();

    const isMajor = a % 30 === 0;

    const inner = isMajor ? radius - 18 : radius - 10;
    const outer = radius;

    const major = `rgba(${rgb},0.6)`;
    const minor = `rgba(${rgb},0.25)`;
    ctx.strokeStyle = isMajor ? major : minor;

    ctx.lineWidth = isMajor ? 2 : 1;

    const rad = (a * Math.PI) / 180;

    const x1 = Math.cos(rad) * inner;
    const y1 = Math.sin(rad) * inner;

    const x2 = Math.cos(rad) * outer;
    const y2 = Math.sin(rad) * outer;

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();

  // =========================
  // DRONE WEDGE + MARKER
  // =========================
  if (isFinite(dronePos.lat) && isFinite(dronePos.lng)) {
    const rel = ((bearing - myPos.heading + 540) % 360) - 180;

    // convert "0 = front (up)" into canvas radians
    const angle = ((rel - 90) * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);

    // =========================
    // WEDGE (front → drone)
    // =========================
    ctx.beginPath();
    ctx.moveTo(0, 0);

    ctx.fillStyle = `rgba(${wedge},0.18)`;
    ctx.strokeStyle = `rgba(${wedge},0.35)`;
    ctx.lineWidth = 1;

    ctx.arc(
      0,
      0,
      radius,
      -Math.PI / 2, // FRONT (up)
      angle,
      rel < 0,
    );

    ctx.closePath();
    ctx.fill();

    // =========================
    // MARKER LINE
    // =========================
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    ctx.beginPath();
    // ctx.strokeStyle = "#AB1C1C";
    ctx.strokeStyle = `rgba(${wedge}, 0.5)`;
    ctx.lineWidth = 3;

    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
    ctx.stroke();

    // =========================
    // DOT
    // =========================
    ctx.beginPath();
    ctx.fillStyle = `rgba(${wedge}, 0.8)`;
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.fillStyle = `rgba(${rgb},0.8)`;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
}

/* =========================
    MATH
========================= */

function toRad(x) {
  return (x * Math.PI) / 180;
}

function hav(a, b, c, d) {
  const R = 6371000;

  const dLat = toRad(c - a);
  const dLng = toRad(d - b);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bear(a, b, c, d) {
  const dLng = toRad(d - b);

  const y = Math.sin(dLng) * Math.cos(toRad(c));

  const x =
    Math.cos(toRad(a)) * Math.sin(toRad(c)) -
    Math.sin(toRad(a)) * Math.cos(toRad(c)) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

setInterval(updateDroneAgeUI, 200);
versionEl.innerText = "v1.0.0";

function loop() {
  render();
  requestAnimationFrame(loop);
}

loop();
