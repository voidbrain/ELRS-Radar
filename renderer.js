// renderer.js
export class RadarRenderer {
  constructor(canvas, rgb, wedge) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.rgb = rgb.trim() || "0, 255, 0";
    this.wedge = wedge.trim() || "0, 255, 255";

    // Gather all target text nodes
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
      current:  document.getElementById("current"),
      mah:  document.getElementById("mah"),
      vbat:  document.getElementById("vbat"),

      rxRSSI: document.getElementById("rxRSSI"),
      txRSSI: document.getElementById("txRSSI"),
      linkQuality: document.getElementById("linkQuality"),

    };
    
    this.feedbackTimeout = null;
  }

  setVersion(versionText) {
    if (this.dom.version) this.dom.version.innerText = versionText;
  }

  updateTelemetry(telemetry) {
    
    if (this.dom.batteryPercent) this.dom.batteryPercent.innerText = `${telemetry.battery.batteryPercent ?? 0}%`;
    if (this.dom.current) this.dom.current.innerText = `${telemetry.battery.current ?? 0}A`;
    if (this.dom.mah) this.dom.mah.innerText = `${telemetry.battery.mah ?? 0}mAh`;
    if (this.dom.vbat) this.dom.vbat.innerText = `${telemetry.battery.vbat ?? 0}V`;

    if (this.dom.droneStatus) this.dom.droneStatus.innerText = telemetry.droneStatus ?? "";

    if (this.dom.rxRSSI) this.dom.rxRSSI.innerText = `${telemetry.metrics.rxRSSI ?? 0}dBm`;
    if (this.dom.txRSSI) this.dom.txRSSI.innerText = `${telemetry.metrics.txRSSI ?? 0}dBm`;
    if (this.dom.linkQuality) this.dom.linkQuality.innerText = `${telemetry.metrics.linkQuality ?? 0}%`;
  }

  showFeedback(message, duration = 2000) {
    if (!this.dom.feedback) return;
    
    this.dom.feedback.innerText = message;
    clearTimeout(this.feedbackTimeout);
    
    this.feedbackTimeout = setTimeout(() => {
      this.dom.feedback.innerText = "";
    }, duration);
  }

  updateDroneAge(lastDroneUpdate) {
    if (!this.dom.droneAge) return;
    if (!lastDroneUpdate) {
      this.dom.droneAge.innerText = "--";
      return;
    }

    const secondsAgo = (Date.now() - lastDroneUpdate) / 1000;
    let text = "--";

    if (secondsAgo < 1) text = "now";
    else if (secondsAgo < 60) text = `${Math.floor(secondsAgo)}s ago`;
    if (secondsAgo >= 60) {
      text = `${Math.floor(secondsAgo / 60)}m ${Math.floor(secondsAgo % 60)}s ago`;
    }

    this.dom.droneAge.innerText = text;
  }

  updateMetrics(myPos, droneTelemetry, distance, bearing, isValid) {
    // 1. Base Controller / Target LatLng Displays
    if (this.dom.controllerLat) {
      this.dom.controllerLat.innerText = myPos.lat != null ? myPos.lat.toFixed(7) : "-";
    }
    if (this.dom.controllerLng) {
      this.dom.controllerLng.innerText = myPos.lng != null ? myPos.lng.toFixed(7) : "-";
    }
    
    if (this.dom.accuracy) {
      this.dom.accuracy.innerText = `${myPos.accuracy != null ? myPos.accuracy.toFixed(0) + "mt R" : "-"}`;
    }
    if (this.dom.droneLat) {
      this.dom.droneLat.innerText = droneTelemetry.lat != null ? droneTelemetry.lat.toFixed(7) : "-";
    }
    if (this.dom.droneLng) {
      this.dom.droneLng.innerText = droneTelemetry.lng != null ? droneTelemetry.lng.toFixed(7) : "-";
    }
    if (this.dom.droneAltitude) {
      this.dom.droneAltitude.innerText = `${droneTelemetry.altitude != null ? droneTelemetry.altitude.toFixed(0) + "mt" : "-"}`;
    }
    if (this.dom.droneSats) {
      this.dom.droneSats.innerText = droneTelemetry.sats != null ? droneTelemetry.sats.toFixed(0) : "-";
    }

    // 2. Computed Distance and Direction UI values
    if (!this.dom.dist || !this.dom.bearing) return;

    if (isValid) {
      let diff = ((Math.round(bearing) - myPos.heading + 540) % 360) - 180;
      let dirText = Math.abs(diff) <= 5 ? "FRONT" : diff > 0 ? "RIGHT" : "LEFT";

      this.dom.bearing.innerText = `${dirText} ${Math.round(Math.abs(diff))}°`;
      this.dom.dist.innerText = Math.round(distance) + " m";
    } else {
      this.dom.dist.innerText = "No Drone";
      this.dom.bearing.innerText = "--";
    }
  }

  render(myPos, droneTelemetry, distance, bearing) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius = Math.min(this.canvas.width, this.canvas.height) / 2 - 5;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = `rgba(${this.rgb},0.15)`;
    this.ctx.lineWidth = 1;

    // inner circles
    for (let r = 1; r <= 3; r++) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (radius / 3) * r, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // front facing line
    this.ctx.strokeStyle = `rgba(${this.rgb},0.6)`;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx, cy - (radius - (Math.round(radius / 3))) );
    this.ctx.stroke();

    // cross lines
    this.ctx.strokeStyle = `rgba(${this.rgb},0.15)`;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - radius, cy);
    this.ctx.lineTo(cx + radius, cy);
    this.ctx.moveTo(cx, cy - radius);
    this.ctx.lineTo(cx, cy + radius);
    this.ctx.stroke();

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate((-myPos.heading * Math.PI) / 180);

    /* =========================
      CARDINAL LABELS
    ========================= */
    this.ctx.fillStyle = `rgba(${this.rgb},1)`;
    this.ctx.font = "bold 16px monospace";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    const radiusText = radius - 55;
    const cardinals = [
      { t: "N", a: 0 },
      { t: "E", a: 90 },
      { t: "S", a: 180 },
      { t: "W", a: 270 },
    ];

    cardinals.forEach((c) => {
      this.ctx.save();
      this.ctx.rotate((c.a * Math.PI) / 180);
      this.ctx.fillText(c.t, 0, -radiusText);
      this.ctx.restore();
    });

    /* =========================
     DEGREE NUMBERS (every 30°)
    ========================= */
    this.ctx.font = "10px monospace";
    for (let a = 0; a < 360; a += 30) {
      this.ctx.save();
      this.ctx.rotate((a * Math.PI) / 180);
      this.ctx.fillText(a.toString(), 0, -radius + 25);
      this.ctx.restore();
    }

    /* =========================
      TICKS (5° + 30° emphasis)
    ========================= */
    for (let a = 0; a < 360; a += 5) {
      this.ctx.beginPath();
      const isMajor = a % 30 === 0;
      const inner = isMajor ? radius - 18 : radius - 10;
      const outer = radius;

      this.ctx.strokeStyle = isMajor ? `rgba(${this.rgb},0.6)` : `rgba(${this.rgb},0.25)`;
      this.ctx.lineWidth = isMajor ? 2 : 1;

      const rad = (a * Math.PI) / 180;
      const x1 = Math.cos(rad) * inner;
      const y1 = Math.sin(rad) * inner;
      const x2 = Math.cos(rad) * outer;
      const y2 = Math.sin(rad) * outer;

      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }

    /* =========================
      DRONE TARGET WEDGE OVERLAY
    ========================= */
    if (droneTelemetry.lat != null && droneTelemetry.lng != null && isFinite(droneTelemetry.lat) && isFinite(droneTelemetry.lng)) {
      
      // Convert absolute bearing straight to radians (0° is North, 90° is East)
      const relative = (bearing - myPos.heading + 360) % 360;
      const bearingRad = (relative * Math.PI) / 180;
      
      // Map directly to Canvas angles where straight UP is -Math.PI / 2
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + bearingRad;

      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.fillStyle = `rgba(${this.wedge},0.18)`;
      this.ctx.strokeStyle = `rgba(${this.wedge},0.35)`;
      this.ctx.lineWidth = 1;

      this.ctx.arc(0, 0, radius, startAngle, endAngle, false);

      this.ctx.lineTo(0, 0);
      this.ctx.fill();
      this.ctx.stroke();
    }

    /* =========================
    REVERSE DEGREE NUMBERS (every 30°)
    ========================= */
    this.ctx.font = "10px monospace";
    this.ctx.fillStyle = `rgba(${this.wedge},1)`;
    for (let a = 360; a > 0; a -= 30) {
      this.ctx.save();
      this.ctx.rotate(-(a * Math.PI) / 180);
      this.ctx.fillText(`-${a.toString()}`, 0, -radius + 40);
      this.ctx.restore();
    }

    this.ctx.restore(); 
  }
}
