// radar.js
import { hav, bear } from "./math.js";
import { RadarRenderer } from "./renderer.js";

const canvas = document.getElementById("radarCanvas");
const enableCompassBtn = document.getElementById("enableCompass");

const styles = getComputedStyle(document.documentElement);
const rgb = styles.getPropertyValue("--radar-line").trim() || "0, 255, 0";
const wedge = styles.getPropertyValue("--radar-wedge").trim() || "0, 255, 255";

/* ========================================
   STATE DEFINITIONS
======================================== */
let compassEnabled = false;
let lastDroneUpdate = 0;
let lastCompassUpdate = performance.now();
let lastCompassUpdatetext = "";

let myPos = { lat: null, lng: null, heading: 0 };
let dronePos = { lat: null, lng: null };
let distance = 0;
let bearing = 0;

// Initialize Renderer with options payload
const renderer = new RadarRenderer(canvas, rgb, wedge);
renderer.setVersion("v1.2.19");

/* ========================================
  WEBSOCKET (RAW BINARY DATA SOCKET)
======================================== */
const ws = new WebSocket("ws://localhost:8766");
ws.binaryType = "arraybuffer";

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);

    if (data.type === "state") {
      if (data.me) {
        myPos.lat = data.me.lat;
        myPos.lng = data.me.lng;
      }
      if (data.drone) {
        dronePos.lat = data.drone.lat;
        dronePos.lng = data.drone.lng;
      }
      updateCalculations();
      return;
    }

    if (data.type === "telemetry") {
      if (typeof data.gps.lat === "number" && typeof data.gps.lng === "number") {
        dronePos.lat = data.gps.lat;
        dronePos.lng = data.gps.lng;

        if (typeof data.alt === "number") dronePos.altitude = data.alt;

        lastDroneUpdate = Date.now();
        updateCalculations();
      }
      return;
    }
  } catch (err) {
    console.error("WS parse error:", err.message);
  }
};

/* ========================================
  GPS (OPERATOR HARDWARE DEVICE POSITION)
======================================== */
startGPS();

function startGPS() {
  if (!navigator.geolocation) {
    renderer.showFeedback("GPS not supported");
    return;
  } else {
    if (window.DeviceOrientationEvent || "AbsoluteOrientationSensor" in window) {
      enableCompassBtn.style.display = "inline-block";
    }
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      myPos.lat = pos.coords.latitude;
      myPos.lng = pos.coords.longitude;
      updateCalculations();
    },
    (err) => {
      console.error(err);
      renderer.showFeedback("GPS denied");
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
  );
}

/* ========================================
  COMPASS & ORIENTATION SENSORS
======================================== */
enableCompassBtn.addEventListener("click", startCompass);

function startCompass() {
  console.log("Initializing Hardware Compass...");
  if (compassEnabled) return;

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") initAbsoluteListener();
        else renderer.showFeedback("Permission denied");
      })
      .catch(console.error);
  } else {
    initAbsoluteListener();
  }
}

function initAbsoluteListener() {
  if ("ondeviceorientationabsolute" in window) {
    window.addEventListener("deviceorientationabsolute", onAbsoluteCompass, true);
    renderer.showFeedback("Absolute Compass Active");
  } else if ("ondeviceorientation" in window) {
    window.addEventListener("deviceorientation", onAbsoluteCompass, true);
    renderer.showFeedback("Relative Fallback Active");
  } else {
    renderer.showFeedback("Compass Hardware Missing");
  }

  enableCompassBtn.style.display = "none";
  compassEnabled = true;
}

function onAbsoluteCompass(e) {
  // 1. If it's an iOS device, it provides the true compass heading natively
  if (e.webkitCompassHeading != null) {
    myPos.heading = e.webkitCompassHeading;
    trackCompassTiming(performance.now());
    return;
  }

  // 2. If it's an Android/Chrome device using the absolute sensor
  if (e.alpha !== null) {
    myPos.heading = (360 - e.alpha) % 360;
    trackCompassTiming(performance.now());
  }
}


function trackCompassTiming(now) {
  lastCompassUpdatetext = `${(now - lastCompassUpdate).toFixed(1)} ms`;
  lastCompassUpdate = now;

  renderer.updateCompassRate(lastCompassUpdatetext);
  updateCalculations();
}

/* ========================================
   ORCHESTRATION TIMERS & RENDER LOOPS
======================================== */
function updateCalculations() {
  const isValid = (
    myPos.lat != null && myPos.lng != null &&
    dronePos.lat != null && dronePos.lng != null &&
    isFinite(myPos.lat) && isFinite(myPos.lng) &&
    isFinite(dronePos.lat) && isFinite(dronePos.lng)
  );

  if (isValid) {
    distance = hav(myPos.lat, myPos.lng, dronePos.lat, dronePos.lng);
    bearing = bear(myPos.lat, myPos.lng, dronePos.lat, dronePos.lng);
  }

  renderer.updateMetrics(myPos, dronePos, distance, bearing, isValid);
}

setInterval(() => {
  renderer.updateDroneAge(lastDroneUpdate);
}, 200);

function loop() {
  renderer.render(myPos, dronePos, distance, bearing);
  requestAnimationFrame(loop);
}

loop();
