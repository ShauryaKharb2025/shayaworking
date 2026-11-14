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
  // 1. Try browser geolocation with a strict 3s hard timeout
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Browser GPS timeout")), 3000);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            clearTimeout(timer);
            resolve(p);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
          {
            enableHighAccuracy: false, // Low accuracy is immediate on desktop/laptops
            timeout: 2500,
            maximumAge: 60000,
          }
        );
      });

      if (pos?.coords) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const address = await reverseGeocode(lat, lng);
        return { lat, lng, address };
      }
    } catch (geoErr) {
      console.warn("Browser GPS not available or timed out, trying IP fallback:", geoErr);
    }
  }

  // 2. Try fast client-side IP providers
  for (const url of ["https://freeipapi.com/api/json", "https://ipwho.is/"]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const lat = data.latitude;
        const lng = data.longitude;
        if (lat && lng) {
          const address = [
            data.cityName || data.city,
            data.regionName || data.region,
            data.countryName || data.country,
          ].filter(Boolean).join(", ");
          return { lat, lng, address: address || `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        }
      }
    } catch {}
  }

  // 3. Try Backend location API (bypasses browser adblockers and CORS)
  try {
    const res = await api.get("/location/detect");
    if (res.data?.lat && res.data?.lng) {
      return res.data;
    }
  } catch (e) {
    console.warn("Backend location API unreachable:", e);
  }

  // 4. Guaranteed fallback so UI never hangs or errors
  return {
    lat: 28.6139,
    lng: 77.2090,
    address: "New Delhi, India",
  };
}
