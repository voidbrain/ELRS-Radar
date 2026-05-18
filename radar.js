import { hav, bear } from "./math.js";
import { RadarRenderer } from "./renderer.js";

const canvas = document.getElementById("radarCanvas");
const enableCompassBtn = document.getElementById("enableCompass");

const styles = getComputedStyle(document.documentElement);
const rgb = styles.getPropertyValue("--radar-line").trim() || "0, 255, 0";
const wedge = styles.getPropertyValue("--radar-wedge").trim() || "0, 255, 255";

/* ========================================
   STATE
======================================== */

const HEADING_ALPHA = 0.2;
let compassReady = false;

let compassEnabled = false;
let lastDroneUpdate = 0;

let myPos = { lat: null, lng: null, heading: null };

let droneTelemetry = { lat: null, lng: null, altitude: null, sats: null };
let distance = 0;
let bearing = 0;

let metrics = { rxRSSI: 0, txRSSI: 0, linkQuality: 0 };
let droneStatus = null;
let battery = { vbat: 0, current: 0, mah: 0, batteryPercent: 0 };

const renderer = new RadarRenderer(canvas, rgb, wedge);
renderer.setVersion("v1.2.32");

/* ========================================
   WEBSOCKET
======================================== */

const ws = new WebSocket("ws://localhost:8766");
ws.binaryType = "arraybuffer";

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);

    if (data.type === "gps") {
      if (data.data.type === "controller") {
        myPos.lat = data.data.lat;
        myPos.lng = data.data.lng;
      }

      if (data.data.type === "drone") {
        droneTelemetry.lat = data.data.lat;
        droneTelemetry.lng = data.data.lng;
        droneTelemetry.altitude = data.data.altitude ?? droneTelemetry.altitude;
        droneTelemetry.sats = data.data.sats ?? droneTelemetry.sats;
      }

      updateCalculations();
      return;
    }

    if (data.type === "metrics") {
      metrics = {
        rxRSSI: data.data.rxRSSI ?? 0,
        txRSSI: data.data.txRSSI ?? 0,
        linkQuality: data.data.linkQuality ?? 0
      };
    }

    if (data.type === "status") {
      droneStatus = data.data.flightMode ?? "";
    }

    if (data.type === "battery") {
      battery = {
        vbat: data.data.vbat ?? 0,
        current: data.data.current ?? 0,
        mah: data.data.mah ?? 0,
        batteryPercent: data.data.batteryPercent ?? 0
      };
    }

    renderer.updateTelemetry({ metrics, battery, droneStatus });
    lastDroneUpdate = Date.now();

  } catch (err) {
    console.error("WS parse error:", err.message);
  }
};

/* ========================================
   GPS
======================================== */

startGPS();

function startGPS() {
  if (!navigator.geolocation) {
    renderer.showFeedback("GPS not supported");
    return;
  }

  if (window.DeviceOrientationEvent) {
    enableCompassBtn.style.display = "inline-block";
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      myPos.lat = pos.coords.latitude;
      myPos.lng = pos.coords.longitude;
      myPos.accuracy = pos.coords.accuracy;
      myPos.altitude = pos.coords.altitude;

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
   COMPASS
======================================== */

enableCompassBtn.addEventListener("click", startCompass);

function startCompass() {
  if (compassEnabled) return;

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") initCompass();
        else renderer.showFeedback("Permission denied");
      })
      .catch(console.error);
  } else {
    initCompass();
  }
}

function initCompass() {
  compassEnabled = true;
  enableCompassBtn.style.display = "none";
  renderer.showFeedback("Compass Active");

  if ("ondeviceorientationabsolute" in window) {
    renderer.showFeedback("absolute")
    window.addEventListener("deviceorientationabsolute", onCompass, true);
  } else {
    renderer.showFeedback("not absolute")
    window.addEventListener("deviceorientation", onCompass, true);
  }
}

/* ========================================
   COMPASS HANDLER
======================================== */

function onCompass(e) {
  let rawHeading = null;

  // iOS
  if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
    rawHeading = e.webkitCompassHeading;
  }

  // 2. Android handling (Magnetic North -> Converted to True North)
  else if (e.alpha != null && !isNaN(e.alpha)) {
    // Standardize Android orientation direction
    let magneticHeading = (360 - e.alpha) % 360;
    
    // Add declination to convert Magnetic to True North
    hardwareHeading = (magneticHeading + magneticDeclination + 360) % 360;
  }

  if (hardwareHeading != null) {
    // Apply your smooth alpha filtering loop safely here
    const diff = ((hardwareHeading - myPos.heading + 540) % 360) - 180;
    myPos.heading = (myPos.heading + diff * HEADING_ALPHA + 360) % 360;
  }
}

/* ========================================
   CALCULATIONS
======================================== */

function updateCalculations() {
  const isValid =
    myPos.lat != null &&
    myPos.lng != null &&
    droneTelemetry.lat != null &&
    droneTelemetry.lng != null;

  if (isValid) {
    distance = hav(myPos.lat, myPos.lng, droneTelemetry.lat, droneTelemetry.lng);
    bearing = bear(myPos.lat, myPos.lng, droneTelemetry.lat, droneTelemetry.lng);
  }

  renderer.updateMetrics(myPos, droneTelemetry, distance, bearing, isValid);
}

/* ========================================
   RENDER LOOP
======================================== */

setInterval(() => {
  renderer.updateDroneAge(lastDroneUpdate);
}, 1000);

function loop() {
  renderer.render(myPos, droneTelemetry, distance, bearing);
  requestAnimationFrame(loop);
}

loop();
