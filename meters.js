export class MeterRenderer {
  
  constructor(canvas, rgb, wedge, accentColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.history = {
      rxMax: -120,
      rxMin: 0
    };

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.rgb = rgb.trim() || "0, 255, 0";
    this.wedge = wedge.trim() || "0, 255, 255";
    this.accentColor = accentColor.trim() || "0, 255, 255";
  }

  render({ rx = -120 }) {
    // -------------------------
    // HISTORY (fixed behavior)
    // -------------------------

    if(rx !== 0) { 
      this.history.rxMax = Math.max(this.history.rxMax, rx);
      this.history.rxMin = Math.min(this.history.rxMin, rx);
    }

    // -------------------------
    // DRAW
    // -------------------------

    this.drawMeter({
      x: 20,
      y: 20,
      width: 52,
      height: 320,
      value: rx,
      label: "RX",
      maxSeen: this.history.rxMax,
      minSeen: this.history.rxMin
    });
  }

  drawMeter({
    x,
    y,
    width,
    height,
    value,
    label,
    maxSeen,
    minSeen
  }) {
    const ctx = this.ctx;

    // clear frame
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const min = -120;
    const max = 0;

    const clamp = (v) =>
      Math.max(0, Math.min(1, (v - min) / (max - min)));

    const clampY = (py) =>
      Math.max(y, Math.min(y + height, py));

    const normalized = clamp(value);

    const filledHeight = height * normalized;
    const topY = y + height - filledHeight;

    // -------------------------
    // FRAME
    // -------------------------

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // -------------------------
    // BAR (white moving fill)
    // -------------------------

    ctx.fillStyle = `rgb(${this.rgb}`;
    ctx.fillRect(
      x + 6,
      topY,
      width - 12,
      filledHeight
    );

    // -------------------------
    // CURRENT LINE
    // -------------------------

    ctx.beginPath();
    ctx.moveTo(x - 3, topY);
    ctx.lineTo(x + width + 3, topY);
    ctx.strokeStyle = `rgb(${this.rgb}`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // -------------------------
    // MAX (GREEN M)
    // -------------------------

    const maxY = clampY(
      y + height - clamp(maxSeen) * height
    );

    ctx.beginPath();
    ctx.moveTo(x - 6, maxY);
    ctx.lineTo(x + width + 6, maxY);
    ctx.strokeStyle = `rgb(${this.wedge})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = `rgb(${this.wedge})`;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("M", x + width + 10, maxY);

    // -------------------------
    // MIN (RED L)
    // -------------------------

    const minY = clampY(
      y + height - clamp(minSeen) * height
    );

    ctx.beginPath();
    ctx.moveTo(x - 6, minY);
    ctx.lineTo(x + width + 6, minY);
    ctx.strokeStyle = `rgb(${this.accentColor})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = `rgb(${this.accentColor})`;
    ctx.font = "bold 10px monospace";
    ctx.fillText("L", x + width + 10, minY);

    // -------------------------
    // LABEL
    // -------------------------

    ctx.fillStyle = `rgb(${this.rgb}`;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, x + width / 2, y - 6);

    // -------------------------
    // LIVE VALUE (INSIDE BAR)
    // -------------------------

    ctx.fillStyle = `rgb(${this.rgb}`;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
      `${Math.round(value)}`,
      x + width / 2,
      y + height - 14
    );

    // -------------------------
    // SCALE NUMBERS ONLY (0 to -120)
    // -------------------------

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const steps = 6; // 0, -20, -40, -60, -80, -100, -120

    for (let i = 0; i <= steps; i++) {
      const v = 0 - (i * 120 / steps); // 0 → -120
      const t = (v - min) / (max - min);

      const ty = y + height - t * height;

      ctx.fillText(Math.round(v), x + width + 2, ty);
    }

    // -------------------------
    // HISTORY READOUT (INSIDE TOP)
    // -------------------------

    ctx.fillStyle = "#000";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.fillText(
      `H ${Math.round(maxSeen)}`,
      x + 8,
      y + 6 + 246
    );

    ctx.fillText(
      `L ${Math.round(minSeen)}`,
      x + 8,
      y + 20 + 246
    );

    ctx.fillText(
      `dBm`,
      x + 8,
      y + 34 + 246
    );
  }

  resetHistory() {
    this.history = {
      rxMax: -120,
      rxMin: 0
    };
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
