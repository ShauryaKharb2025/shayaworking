export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (res.ok) {
      const d = await res.json();
      const parts = [
        d.locality || d.city || d.localityInfo?.administrative?.find(a => a.adminLevel >= 6)?.name,
        d.principalSubdivision,
        d.countryName
      ].filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
  } catch (e) {
    console.warn("Reverse geocode failed:", e);
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export async function detectLocation() {
  // 1. Try browser geolocation first
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 6000,
          enableHighAccuracy: true,
          maximumAge: 60000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const address = await reverseGeocode(lat, lng);
      return { lat, lng, address };
    } catch (geoErr) {
      console.warn("Browser geolocation failed, attempting IP fallback:", geoErr);
    }
  }

  // 2. Fallback to IP geolocation (handles cases where GPS/browser permission is unavailable)
  try {
    const res = await fetch("https://ipwho.is/");
    const data = await res.json();
    if (data && data.success && data.latitude && data.longitude) {
      const address = [data.city, data.region, data.country].filter(Boolean).join(", ");
      return {
        lat: data.latitude,
        lng: data.longitude,
        address: address || `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`,
      };
    }
  } catch (ipErr) {
    console.warn("IP geolocation failed:", ipErr);
  }

  throw new Error("Could not detect location. Please type your address or drag the map pin.");
}
