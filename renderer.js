// renderer.js
export class RadarRenderer {
  constructor(canvas, rgb, wedge) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.rgb = rgb.trim() || "0, 255, 0";
    this.wedge = wedge.trim() || "0, 255, 255";

    this.dom = {
      dist: document.getElementById("dist"),
      bearing: document.getElementById("bearingDisplay"),
      feedback: document.getElementById("feedbackEl"),
      droneLat: document.getElementById("droneLat"),
      droneLng: document.getElementById("droneLng"),
      droneAltitude: document.getElementById("droneAltitude"),
      droneSats: document.getElementById("droneSats"),
      controllerLat: document.getElementById("controllerLat"),
      controllerLng: document.getElementById("controllerLng"),
      accuracy: document.getElementById("accuracy"),
      version: document.getElementById("version"),
      droneAge: document.getElementById("lastDroneUpdate"),
      droneStatus: document.getElementById("droneStatus"),

      batteryPercent: document.getElementById("batteryPercent"),
      current: document.getElementById("current"),
      mah: document.getElementById("mah"),
      vbat: document.getElementById("vbat"),

      rxRSSI: document.getElementById("rxRSSI"),
      txRSSI: document.getElementById("txRSSI"),
      linkQuality: document.getElementById("linkQuality"),
    };

    this.feedbackTimeout = null;
  }

  setVersion(v) {
    if (this.dom.version) this.dom.version.innerText = v;
  }

  updateTelemetry(t) {
    if (this.dom.batteryPercent)
      this.dom.batteryPercent.innerText = `${t.battery.batteryPercent ?? 0}%`;
    if (this.dom.current)
      this.dom.current.innerText = `${t.battery.current ?? 0}A`;
    if (this.dom.mah)
      this.dom.mah.innerText = `${t.battery.mah ?? 0}mAh`;
    if (this.dom.vbat)
      this.dom.vbat.innerText = `${t.battery.vbat ?? 0}V`;

    if (this.dom.droneStatus)
      this.dom.droneStatus.innerText = t.droneStatus ?? "";

    if (this.dom.rxRSSI)
      this.dom.rxRSSI.innerText = `${t.metrics.rxRSSI ?? 0}dBm`;
    if (this.dom.txRSSI)
      this.dom.txRSSI.innerText = `${t.metrics.txRSSI ?? 0}dBm`;
    if (this.dom.linkQuality)
      this.dom.linkQuality.innerText = `${t.metrics.linkQuality ?? 0}%`;
  }

  showFeedback(msg, d = 2000) {
    if (!this.dom.feedback) return;
    this.dom.feedback.innerText = msg;
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => {
      this.dom.feedback.innerText = "";
    }, d);
  }

  updateDroneAge(last) {
    if (!this.dom.droneAge) return;

    if (!last) {
      this.dom.droneAge.innerText = "--";
      return;
    }

    const s = (Date.now() - last) / 1000;
    let t = "--";

    if (s < 1) t = "now";
    else if (s < 60) t = `${Math.floor(s)}s ago`;
    else t = `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s ago`;

    this.dom.droneAge.innerText = t;
  }

  updateMetrics(myPos, droneTelemetry, distance, bearing, isValid) {
    if (this.dom.controllerLat)
      this.dom.controllerLat.innerText =
        myPos.lat != null ? myPos.lat.toFixed(7) : "-";

    if (this.dom.controllerLng)
      this.dom.controllerLng.innerText =
        myPos.lng != null ? myPos.lng.toFixed(7) : "-";

    if (this.dom.accuracy)
      this.dom.accuracy.innerText =
        myPos.accuracy != null ? `${myPos.accuracy.toFixed(0)}m` : "-";

    if (this.dom.droneLat)
      this.dom.droneLat.innerText =
        droneTelemetry.lat != null ? droneTelemetry.lat.toFixed(7) : "-";

    if (this.dom.droneLng)
      this.dom.droneLng.innerText =
        droneTelemetry.lng != null ? droneTelemetry.lng.toFixed(7) : "-";

    if (this.dom.droneAltitude)
      this.dom.droneAltitude.innerText =
        droneTelemetry.altitude != null
          ? `${droneTelemetry.altitude.toFixed(0)}m`
          : "-";

    if (this.dom.droneSats)
      this.dom.droneSats.innerText =
        droneTelemetry.sats != null ? droneTelemetry.sats : "-";

    if (!this.dom.dist || !this.dom.bearing) return;

    if (isValid) {
      const diff =
        ((Math.round(bearing) - myPos.heading + 540) % 360) - 180;

      const dir =
        Math.abs(diff) <= 5 ? "FRONT" : diff > 0 ? "RIGHT" : "LEFT";

      this.dom.bearing.innerText = `${dir} ${Math.round(Math.abs(diff))}°`;
      this.dom.dist.innerText = `${Math.round(distance)} m`;
    } else {
      this.dom.dist.innerText = "No Drone";
      this.dom.bearing.innerText = "--";
    }
  }

  render(myPos, droneTelemetry, distance, bearing) {
    const ctx = this.ctx;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius =
      Math.min(this.canvas.width, this.canvas.height) / 2 - 5;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    /* =========================
       STATIC GRID (NO ROTATION HERE)
    ========================= */

    ctx.strokeStyle = `rgba(${this.rgb},0.15)`;
    ctx.lineWidth = 1;

    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (radius / 3) * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    /* =========================
       ROTATE WORLD BY HEADING
    ========================= */

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-myPos.heading * Math.PI) / 180);

    /* =========================
       COMPASS LABELS
    ========================= */

    ctx.fillStyle = `rgba(${this.rgb},1)`;
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const radiusText = radius - 55;

    const cardinals = [
      { t: "N", a: 0 },
      { t: "E", a: 90 },
      { t: "S", a: 180 },
      { t: "W", a: 270 },
    ];

    for (const c of cardinals) {
      ctx.save();
      ctx.rotate((c.a * Math.PI) / 180);
      ctx.fillText(c.t, 0, -radiusText);
      ctx.restore();
    }

    ctx.font = "10px monospace";

    for (let a = 0; a < 360; a += 30) {
      ctx.save();
      ctx.rotate((a * Math.PI) / 180);
      ctx.fillText(String(a), 0, -radius + 25);
      ctx.restore();
    }

    // *** inverted numbered circle
    ctx.fillStyle = `rgba(${this.wedge},1)`;
    for (let a = 0; a < 360; a += 30) {
      ctx.save();
      ctx.rotate(-(a * Math.PI) / 180);
      ctx.fillText((a===0 ? "" : "-") + String(a), 0, -radius + 38);
      ctx.restore();
    }

    /* =========================
       TICKS
    ========================= */

    for (let a = 0; a < 360; a += 5) {
      const isMajor = a % 30 === 0;
      const inner = isMajor ? radius - 18 : radius - 10;
      const outer = radius;

      ctx.strokeStyle = isMajor
        ? `rgba(${this.rgb},0.6)`
        : `rgba(${this.rgb},0.25)`;

      ctx.lineWidth = isMajor ? 2 : 1;

      const rad = (a * Math.PI) / 180;

      ctx.beginPath();
      ctx.moveTo(Math.cos(rad) * inner, Math.sin(rad) * inner);
      ctx.lineTo(Math.cos(rad) * outer, Math.sin(rad) * outer);
      ctx.stroke();
    }

    /* =========================
       DRONE WEDGE (FIXED)
    ========================= */

    if (
      droneTelemetry.lat != null &&
      droneTelemetry.lng != null
    ) {
      const relative = (bearing * Math.PI) / 180;

      const start = -Math.PI / 2;
      const end = start + relative;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.fillStyle = `rgba(${this.wedge},0.18)`;
      ctx.strokeStyle = `rgba(${this.wedge},0.35)`;

      ctx.arc(0, 0, radius, start, end);
      ctx.lineTo(0, 0);

      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}
