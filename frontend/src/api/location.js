import api from "./axios";

export async function reverseGeocode(lat, lng) {
  // 1. Try client-side BigDataCloud
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (res.ok) {
      const d = await res.json();
      const parts = [
        d.locality || d.city,
        d.principalSubdivision,
        d.countryName,
      ].filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
  } catch (e) {
    // Fall back to backend reverse endpoint
  }

  // 2. Try backend reverse geocode endpoint
  try {
    const res = await api.get(`/location/reverse?lat=${lat}&lng=${lng}`);
    if (res.data?.address) return res.data.address;
  } catch (e) {}

  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

export async function detectLocation() {
  if (!navigator.geolocation) throw new Error("GPS is unavailable. Enter your address or choose a pickup on the map.");
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
    });
  }).catch(() => { throw new Error("Could not obtain fresh GPS. Allow precise location, enter your address, or choose a map pin."); });
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  if (!Number.isFinite(accuracy) || accuracy > 100) {
    throw new Error("GPS accuracy is too low. Enter your full address or place the pickup pin precisely on the map.");
  }
  return { lat, lng, accuracy, address: await reverseGeocode(lat, lng) };
}
