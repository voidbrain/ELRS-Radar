const bridge = new WebSocket("ws://localhost:8766");

const map = L.map("map").setView([45.5265723,12.1322606], 22);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 24,         // Allows the map view to go up to zoom level 22
    maxNativeZoom: 19    // Tells Leaflet that OSM tiles stop existing after level 19
}).addTo(map);

let myHeading = 0;

const myPos = {
  lat: 45.5265723,
  lng: 12.132260,
};

const dronePos = {
  lat: 45.5265723,
  lng: 12.1322606,
};

const meIcon = L.divIcon({
  className: "",
  html: `<div id="meArrow" class="me-icon"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const meMarker = L.marker([myPos.lat, myPos.lng], {
  draggable: true,
  icon: meIcon,
}).addTo(map);

const droneIcon = L.divIcon({
  className: "",
  html: `<div class="drone-icon"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const droneMarker = L.marker([dronePos.lat, dronePos.lng], {
  draggable: true,
  icon: droneIcon,
}).addTo(map);

const headingSlider = document.getElementById("headingSlider");
const headingValue = document.getElementById("headingValue");
const debugTable = document.getElementById("debugTable");

headingSlider.addEventListener("input", () => {
  myHeading = Number(headingSlider.value);

  headingValue.innerText = `${myHeading}°`;

  document.getElementById("meArrow").style.transform = `rotate(${myHeading}deg)`;

  sendBridgeUpdate();
});

meMarker.on("dragend", () => {
  appendDebugRow();
  sendBridgeUpdate();
});



droneMarker.on("dragend", () => {
  appendDebugRow();
  sendBridgeUpdate();
});

function toRad(v) {
  return (v * Math.PI) / 180;
}

function toDeg(v) {
  return (v * 180) / Math.PI;
}

function distanceMeters(a, b) {
  const R = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const dLon = toRad(b.lng - a.lng);

  const y = Math.sin(dLon) * Math.cos(lat2);

  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function relativeBearing(target, heading) {
  return ((target - heading + 540) % 360) - 180;
}

function appendDebugRow() {
  const me = meMarker.getLatLng();
  const drone = droneMarker.getLatLng();

  const my = {
    lat: me.lat,
    lng: me.lng,
  };

  const dr = {
    lat: drone.lat,
    lng: drone.lng,
  };

  const dist = distanceMeters(my, dr);
  const bear = bearing(my, dr);
  const rel = relativeBearing(bear, myHeading);

  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>${my.lat.toFixed(6)}, ${my.lng.toFixed(6)}</td>
    <td>${dr.lat.toFixed(6)}, ${dr.lng.toFixed(6)}</td>
    <td>${dist.toFixed(1)}m</td>
    <td>${bear.toFixed(1)}°</td>
    <td>${rel.toFixed(1)}°</td>
  `;

  debugTable.prepend(tr);
}

function sendBridgeUpdate() {
  const me = meMarker.getLatLng();
  const drone = droneMarker.getLatLng();

  bridge.send(
    JSON.stringify({
      type: "debug-pos",
      me: {
        lat: me.lat,
        lng: me.lng,
        heading: myHeading,
      },
      drone: {
        lat: drone.lat,
        lng: drone.lng,
      },
    })
  );
}
