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
      controllerLat: document.getElementById("controllerLat"),
      controllerLng: document.getElementById("controllerLng"),
      version: document.getElementById("version"),
      compassRate: document.getElementById("compassRateDisplay"),
      droneAge: document.getElementById("lastDroneUpdate")
    };
    
    this.feedbackTimeout = null;
  }

  setVersion(versionText) {
    if (this.dom.version) this.dom.version.innerText = versionText;
  }

  showFeedback(message, duration = 2000) {
    if (!this.dom.feedback) return;
    
    this.dom.feedback.innerText = message;
    clearTimeout(this.feedbackTimeout);
    
    this.feedbackTimeout = setTimeout(() => {
      this.dom.feedback.innerText = "";
    }, duration);
  }

  updateCompassRate(deltaText) {
    if (this.dom.compassRate) {
      this.dom.compassRate.innerText = `Compass Delta: ${deltaText}`;
    }
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
    else if (secondsAgo < 10) text = `${secondsAgo.toFixed(1)}s ago`;
    else if (secondsAgo >= 10) text = `${Math.floor(secondsAgo)}s ago`;
    if (secondsAgo >= 60) {
      text = `${Math.floor(secondsAgo / 60)}m ${Math.floor(secondsAgo % 60)}s ago`;
    }

    this.dom.droneAge.innerText = text;
  }

  updateMetrics(myPos, dronePos, distance, bearing, isValid) {
    // 1. Base Controller / Target LatLng Displays
    if (this.dom.controllerLat) {
      this.dom.controllerLat.innerText = myPos.lat != null ? myPos.lat.toFixed(7) : "-";
    }
    if (this.dom.controllerLng) {
      this.dom.controllerLng.innerText = myPos.lng != null ? myPos.lng.toFixed(7) : "-";
    }
    if (this.dom.droneLat) {
      this.dom.droneLat.innerText = dronePos.lat != null ? dronePos.lat.toFixed(7) : "-";
    }
    if (this.dom.droneLng) {
      this.dom.droneLng.innerText = dronePos.lng != null ? dronePos.lng.toFixed(7) : "-";
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

  render(myPos, dronePos, distance, bearing) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const radius = Math.min(this.canvas.width, this.canvas.height) / 2 - 5;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = `rgba(${this.rgb},0.15)`;
    this.ctx.lineWidth = 1;

    for (let r = 1; r <= 3; r++) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, (radius / 3) * r, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = `rgba(${this.rgb},0.6)`;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy);
    this.ctx.lineTo(cx, cy - radius);
    this.ctx.stroke();

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

    const radiusText = radius - 40;
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

    this.ctx.restore();

    /* =========================
      DRONE TARGET WEDGE OVERLAY
    ========================= */
    if (dronePos.lat != null && dronePos.lng != null && isFinite(dronePos.lat) && isFinite(dronePos.lng)) {
      const rel = ((bearing - myPos.heading + 540) % 360) - 180;
      const angle = ((rel - 90) * Math.PI) / 180;

      this.ctx.save();
      this.ctx.translate(cx, cy);

      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.fillStyle = `rgba(${this.wedge},0.18)`;
      this.ctx.strokeStyle = `rgba(${this.wedge},0.35)`;
      this.ctx.lineWidth = 1;
      this.ctx.arc(0, 0, radius, -Math.PI / 2, angle, rel < 0);
      this.ctx.closePath();
      this.ctx.fill();

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      this.ctx.beginPath();
      this.ctx.strokeStyle = `rgba(${this.wedge}, 0.5)`;
      this.ctx.lineWidth = 3;
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(${this.wedge}, 0.8)`;
      this.ctx.arc(x, y, 6, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    this.ctx.fillStyle = `rgba(${this.rgb},0.8)`;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
