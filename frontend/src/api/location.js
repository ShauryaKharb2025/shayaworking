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
  let position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
    });
  }).catch(() => { throw new Error("Could not obtain fresh GPS. Allow precise location, enter your address, or choose a map pin."); });
  const precise = value => Number.isFinite(value?.coords?.accuracy) && value.coords.accuracy >= 0 && value.coords.accuracy <= 100 &&
    Number.isFinite(value.coords.latitude) && Math.abs(value.coords.latitude)<=90 && Number.isFinite(value.coords.longitude) && Math.abs(value.coords.longitude)<=180;
  // Desktop browsers often deliver a coarse first fix before a precise GPS fix.
  if (!precise(position) && navigator.geolocation.watchPosition) {
    position = await new Promise((resolve,reject) => {
      let watch,finished=false;
      const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(watch!==undefined)navigator.geolocation.clearWatch(watch);error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(new Error("GPS accuracy is too low. Place the pickup pin precisely on the map.")),20000);
      watch=navigator.geolocation.watchPosition(value=>{if(precise(value))finish(null,value);},()=>finish(new Error("Could not refine GPS. Allow precise location or select a pickup pin.")),{enableHighAccuracy:true,maximumAge:0,timeout:20000});
      if(finished)navigator.geolocation.clearWatch(watch);
    });
  }
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  if (!precise(position)) {
    throw new Error("GPS accuracy is too low. Enter your full address or place the pickup pin precisely on the map.");
  }
  return { lat, lng, accuracy, address: await reverseGeocode(lat, lng) };
}
