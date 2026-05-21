export class MeterRenderer {
  constructor(canvas, rgb, accentColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.rgb = rgb.trim();
    this.accent = accentColor.trim();
  }

  render({ rx = -120, tx = -120 }) {
    const ctx = this.ctx;

    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    this.drawMeter({
      x: w * 0.12,
      y: h * 0.2,
      width: 26,
      height: h * 0.55,
      value: rx,
      label: "RX"
    });

    this.drawMeter({
      x: w * 0.88 - 26,
      y: h * 0.2,
      width: 26,
      height: h * 0.55,
      value: tx,
      label: "TX"
    });
  }

  drawMeter({ x, y, width, height, value, label }) {
    const ctx = this.ctx;

    const min = -120;
    const max = 0;

    const normalized = Math.max(
      0,
      Math.min(1, (value - min) / (max - min))
    );

    /*
      OUTER FRAME
    */

    ctx.strokeStyle = `rgba(${this.rgb},0.35)`;
    ctx.lineWidth = 2;

    ctx.strokeRect(x, y, width, height);

    /*
      SCALE LINES
    */

    for (let db = -120; db <= 0; db += 10) {
      const t = (db - min) / (max - min);

      const py = y + height - t * height;

      ctx.beginPath();
      ctx.moveTo(x + width, py);
      ctx.lineTo(x + width + 8, py);

      ctx.strokeStyle = `rgba(${this.rgb},0.45)`;
      ctx.lineWidth = db % 20 === 0 ? 2 : 1;
      ctx.stroke();

      if (db % 20 === 0) {
        ctx.fillStyle = `rgba(${this.rgb},0.8)`;
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        ctx.fillText(String(db), x + width + 12, py);
      }
    }

    /*
      FILLED BAR
    */

    const filledHeight = height * normalized;

    ctx.fillStyle = `rgba(${this.accent},0.85)`;

    ctx.fillRect(
      x + 3,
      y + height - filledHeight + 3,
      width - 6,
      filledHeight - 6
    );

    /*
      PEAK LINE
    */

    const peakY = y + height - filledHeight;

    ctx.beginPath();
    ctx.moveTo(x - 2, peakY);
    ctx.lineTo(x + width + 2, peakY);

    ctx.strokeStyle = `rgba(${this.rgb},1)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    /*
      LABEL
    */

    ctx.fillStyle = `rgba(${this.accent},1)`;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";

    ctx.fillText(label, x + width / 2, y - 12);

    /*
      VALUE
    */

    ctx.fillStyle = `rgba(${this.rgb},1)`;
    ctx.font = "bold 12px monospace";

    ctx.fillText(
      `${Math.round(value)}`,
      x + width / 2,
      y + height + 18
    );
  }
}
