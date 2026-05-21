export class MeterRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    /*
      PERSISTENT PEAKS
    */

    this.history = {
      rxMax: -120,
      rxMin: 0,
      txMax: -120,
      txMin: 0
    };
  }

  render({ rx = -120, tx = -120 }) {
    const ctx = this.ctx;

    const w = this.canvas.width;
    const h = this.canvas.height;

    /*
      UPDATE HISTORY
    */

    this.history.rxMax = Math.max(this.history.rxMax, rx);
    this.history.rxMin = Math.min(this.history.rxMin, rx);

    this.history.txMax = Math.max(this.history.txMax, tx);
    this.history.txMin = Math.min(this.history.txMin, tx);

    this.drawMeter({
      x: 10,
      y: 20,
      width: 30,
      height: 50,
      value: rx,
      label: "RX",
      maxSeen: this.history.rxMax,
      minSeen: this.history.rxMin
    });

    this.drawMeter({
      x: 80,
      y: 20,
      width: 30,
      height: 50,
      value: tx,
      label: "TX",
      maxSeen: this.history.txMax,
      minSeen: this.history.txMin
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

    const min = -120;
    const max = 0;

    const clamp = (v) =>
      Math.max(0, Math.min(1, (v - min) / (max - min)));

    const normalized = clamp(value);

    /*
      FRAME
    */

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;

    ctx.strokeRect(x, y, width, height);

    /*
      SCALE
    */

    for (let db = -120; db <= 0; db += 10) {
      const t = clamp(db);

      const py = y + height - t * height;

      ctx.beginPath();

      ctx.moveTo(x + width, py);

      ctx.lineTo(
        x + width + (db % 20 === 0 ? 12 : 6),
        py
      );

      ctx.strokeStyle = "#666";
      ctx.lineWidth = db % 20 === 0 ? 2 : 1;

      ctx.stroke();

      if (db % 20 === 0) {
        ctx.fillStyle = "#aaa";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        ctx.fillText(
          String(db),
          x + width + 16,
          py
        );
      }
    }

    /*
      FILLED BAR
    */

    const filledHeight = Math.max(
      0,
      height * normalized
    );

    /*
      WHITE BODY
    */

    ctx.fillStyle = "#fff";

    ctx.fillRect(
      x + 4,
      y + height - filledHeight + 4,
      width - 8,
      Math.max(0, filledHeight - 8)
    );

    /*
      CURRENT VALUE LINE
    */

    const currentY = y + height - filledHeight;

    ctx.beginPath();
    ctx.moveTo(x - 3, currentY);
    ctx.lineTo(x + width + 3, currentY);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;

    ctx.stroke();

    /*
      MAX HOLD MARKER
      brightest line
    */

    const maxY =
      y + height - clamp(maxSeen) * height;

    ctx.beginPath();
    ctx.moveTo(x - 5, maxY);
    ctx.lineTo(x + width + 5, maxY);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;

    ctx.stroke();

    /*
      MIN HOLD MARKER
      dim dashed line
    */

    const minY =
      y + height - clamp(minSeen) * height;

    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x - 5, minY);
    ctx.lineTo(x + width + 5, minY);

    ctx.strokeStyle = "#777";
    ctx.lineWidth = 1;

    ctx.stroke();

    ctx.setLineDash([]);

    /*
      LABEL
    */

    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";

    ctx.fillText(
      label,
      x + width / 2,
      y - 14
    );

    /*
      LIVE VALUE
    */

    ctx.font = "bold 13px monospace";

    ctx.fillText(
      `${Math.round(value)}`,
      x + width / 2,
      y + height + 20
    );

    /*
      PEAK / FLOOR READOUTS
    */

    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";

    ctx.fillText(
      `H ${Math.round(maxSeen)}`,
      x + width / 2,
      y + height + 36
    );

    ctx.fillText(
      `L ${Math.round(minSeen)}`,
      x + width / 2,
      y + height + 50
    );
  }

  resetHistory() {
    this.history = {
      rxMax: -120,
      rxMin: 0,
      txMax: -120,
      txMin: 0
    };
  }
}
