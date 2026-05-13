const dgram = require("dgram");

const udp = dgram.createSocket("udp4");

const TARGET_IP = "127.0.0.1";
const TARGET_PORT = 14550;

/* =========================
   FAKE GPS
========================= */

let lat = 45.6267000;
let lon = 12.2274000;

function makePacket() {

  lat += 0.000002;

  const latRaw = Math.round(lat * 1e7);
  const lonRaw = Math.round(lon * 1e7);

  const buf = Buffer.alloc(28);

  // Backpack wrapper
  buf[0] = 0x24; // $
  buf[1] = 0x58; // X
  buf[2] = 0x3c; // <

  // fake payload
  buf[3] = 0x00;
  buf[4] = 0x11;
  buf[5] = 0x00;
  buf[6] = 0x13;
  buf[7] = 0x00;
  buf[8] = 0xea;
  buf[9] = 0x11;

  // GPS
  buf.writeInt32BE(latRaw, 10);
  buf.writeInt32BE(lonRaw, 14);

  // altitude
  buf.writeUInt16BE(12, 18);

  // sats
  buf[20] = 8;

  // speed
  buf.writeUInt16BE(0, 21);

  // fake crc
  buf[27] = 0xcc;

  return buf;
}

/* =========================
   LOOP
========================= */

setInterval(() => {

  const pkt = makePacket();

  console.log(pkt.toString("hex"));

  udp.send(
    pkt,
    TARGET_PORT,
    TARGET_IP
  );

}, 200);
