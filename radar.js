import { hav, bear } from "./math.js";
import { RadarRenderer } from "./renderer.js";

const canvas = document.getElementById("radarCanvas");
const enableCompassBtn = document.getElementById("enableCompass");
const showMoreBtn = document.getElementById("showMore");
const showLessBtn = document.getElementById("showLess");
const moreSection = document.getElementById("more");

const styles = getComputedStyle(document.documentElement);
const textColor = styles.getPropertyValue("--radar-line").trim() || "0, 255, 0";
const wedgeColor = styles.getPropertyValue("--radar-wedge").trim() || "0, 255, 255";
const accentColor = styles.getPropertyValue("--accentColor").trim() || "0, 255, 255";

/* ========================================
   STATE
======================================== */

const HEADING_ALPHA = 0.5;

let compassEnabled = false;
let lastDroneUpdate = 0; 

let myPos = { lat: null, lng: null, heading: null };

let droneTelemetry = { lat: null, lng: null, altitude: null, sats: null };
let distance = 0;
let bearing = 0;

let metrics = { rxRSSI: 0, txRSSI: 0, linkQuality: 0 };
let droneStatus = null;
let battery = { vbat: 0, current: 0, mah: 0, batteryPercent: 0 };

let compassStartTime = null;
const COMPASS_GRACE_MS = 2000;

let initSamples = [];
const INIT_SAMPLE_SIZE = 5;
let headingLocked = false;

const renderer = new RadarRenderer(canvas, textColor, wedgeColor, accentColor);
renderer.setVersion("v1.2.52");

/* ========================================
   WEBSOCKET
======================================== */

const ws = new WebSocket("ws://localhost:8766");
ws.binaryType = "arraybuffer";

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.protocol === "gps") {
      if (typeof data.controller.lat === "number") {
        myPos.lat = data.controller.lat;
        myPos.lng = data.controller.lng;
      }

      if (typeof data.controller.heading === "number") {
          myPos.heading = data.controller.heading;
        }

      if (typeof data.drone.lat === "number") {
        droneTelemetry.lat = data.drone.lat;
        droneTelemetry.lng = data.drone.lng;
        droneTelemetry.altitude = data.drone.altitude ?? droneTelemetry.altitude;
        droneTelemetry.sats = data.drone.sats ?? droneTelemetry.sats;
      }

      updateCalculations();
      return;
    }

    if (data.protocol === "metrics") {
      metrics = {
        rxRSSI: data.rxRSSI ?? 0,
        txRSSI: data.txRSSI ?? 0,
        linkQuality: data.linkQuality ?? 0
      };
    }

    if (data.protocol === "status") {
      droneStatus = data.flightMode ?? "";
    }

    if (data.protocol === "battery") {
      battery = {
        vbat: data.vbat ?? 0,
        current: data.current ?? 0,
        mah: data.mah ?? 0,
        batteryPercent: data.batteryPercent ?? 0
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

  const hasCompassSupported =
  ("DeviceOrientationEvent" in window) ||
  ("AbsoluteOrientationSensor" in window);

  enableCompassBtn.classList.toggle("hidden", hasCompassSupported);

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
   COMPASS ROUTER
======================================== */

enableCompassBtn.addEventListener("click", startCompass);

function startCompass() {
  if (compassEnabled) return;
  enableCompassBtn.classList.add("hidden");
  compassStartTime = Date.now();

  if ('AbsoluteOrientationSensor' in window) {
    Promise.all([
      navigator.permissions.query({ name: "accelerometer" }),
      navigator.permissions.query({ name: "gyroscope" }),
      navigator.permissions.query({ name: "magnetometer" })
    ])
    .then((results) => {
      if (results.every((result) => result.state === "granted" || result.state === "prompt")) {
        initQuaternionCompass();
      } else {
        fallbackToLegacyCompass();
      }
    })
    .catch(() => {
      fallbackToLegacyCompass();
    });
  } else {
    fallbackToLegacyCompass();
  }
}

function fallbackToLegacyCompass() {
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") initLegacyCompass();
        else renderer.showFeedback("Permission denied");
      })
      .catch(console.error);
  } else {
    initLegacyCompass();
  }
}

/* ========================================
   COMPASS INITIALIZERS & HANDLERS
======================================== */

function initQuaternionCompass() {
  try {
    const sensor = new AbsoluteOrientationSensor({
      frequency: 60,
      referenceFrame: "device"
    });

    sensor.addEventListener("reading", () => {
      const q = sensor.quaternion;

      if (!q) return;

      const [x, y, z, w] = q;

      // yaw from quaternion
      const siny_cosp = 2 * (w * z + x * y);
      const cosy_cosp = 1 - 2 * (y * y + z * z);

      let yaw = Math.atan2(siny_cosp, cosy_cosp);

      // radians -> degrees
      let heading = (-yaw * 180) / Math.PI;

      // normalize
      heading = (heading + 360) % 360;

      // compensate current screen rotation
      const screenAngle =
        screen.orientation?.angle ??
        window.orientation ??
        0;

      heading = (heading + screenAngle) % 360;

      applyHeading(heading);
    });

    sensor.addEventListener("error", (e) => {
      console.error("Sensor error:", e.error);

      if (e.error.name === "NotAllowedError") {
        fallbackToLegacyCompass();
      }
    });

    sensor.start();

    setCompassUIActive();
  } catch (err) {
    console.error(err);
    fallbackToLegacyCompass();
  }
}

function initLegacyCompass() {
  if ("ondeviceorientationabsolute" in window) {
    window.addEventListener("deviceorientationabsolute", onLegacyCompass, true);
    setCompassUIActive();
  } else {
    window.addEventListener("deviceorientation", onLegacyCompass, true);
    setCompassUIActive();
  }
}

function onLegacyCompass(e) {
  let hardwareHeading = null;

  if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
    hardwareHeading = e.webkitCompassHeading;
  }
  else if (e.alpha != null && !isNaN(e.alpha)) {
    hardwareHeading = (360 - e.alpha) % 360;
  }

  if (hardwareHeading != null) {
    applyHeading(hardwareHeading);
  }
}

function applyHeading(hardwareHeading) {

  // 1. HARD GRACE PERIOD (do nothing at all)
  if (Date.now() - compassStartTime < COMPASS_GRACE_MS) {
    return;
  }

  // 2. INITIAL LOCK PHASE (after grace)
  if (!headingLocked) {

    initSamples.push(hardwareHeading);

    if (initSamples.length < INIT_SAMPLE_SIZE) return;

    // reject unstable rotation before locking
    let maxDelta = 0;

    for (let i = 1; i < initSamples.length; i++) {
      const d = Math.abs(
        ((initSamples[i] - initSamples[i - 1] + 540) % 360) - 180
      );
      maxDelta = Math.max(maxDelta, d);
    }

    if (maxDelta > 8) {
      initSamples.shift(); // keep waiting for stability
      return;
    }

    // compute stable heading lock
    let sx = 0, sy = 0;

    for (const a of initSamples) {
      const r = a * Math.PI / 180;
      sx += Math.cos(r);
      sy += Math.sin(r);
    }

    myPos.heading =
      (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;

    headingLocked = true;
    initSamples = [];

    return;
  }

  // 3. NORMAL SMOOTHING
  const diff =
    ((hardwareHeading - myPos.heading + 540) % 360) - 180;

  myPos.heading =
    (myPos.heading + diff * HEADING_ALPHA + 360) % 360;
}

function setCompassUIActive() {
  compassEnabled = true;
  enableCompassBtn.style.display = "none";
  renderer.showFeedback(`Compass Active`);
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
   HTML `MORE` SECTION VISIBILITY
======================================== */

showMoreBtn.addEventListener("click", toggleSection);
showLessBtn.addEventListener("click", toggleSection);

function toggleSection() {
  moreSection.classList.toggle("hidden");
  showMoreBtn.classList.toggle("hidden");
  showLessBtn.classList.toggle("hidden");
};

/* ========================================
   RENDER LOOP
======================================== */

setInterval(() => {
  renderer.updateDroneAge(lastDroneUpdate);
}, 1000);

function loop() {
  renderer.render(myPos, droneTelemetry, bearing);
  requestAnimationFrame(loop);
}

loop();
