// math.js
export function toRad(x) {
  return (x * Math.PI) / 180;
}

export function hav(a, b, c, d) {
  const R = 6371000;
  const dLat = toRad(c - a);
  const dLng = toRad(d - b);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function bear(a, b, c, d) {
  const dLng = toRad(d - b);
  const y = Math.sin(dLng) * Math.cos(toRad(c));
  const x =
    Math.cos(toRad(a)) * Math.sin(toRad(c)) -
    Math.sin(toRad(a)) * Math.cos(toRad(c)) * Math.cos(dLng);

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
