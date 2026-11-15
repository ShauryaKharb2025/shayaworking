const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const initSockets = require("./sockets");
const {
  startAutoDispatchWorker,
} = require("./services/autoDispatchService");

const authRoutes = require("./routes/auth");
const sosRoutes = require("./routes/sos");
const dispatchRoutes = require("./routes/dispatch");
const ambulanceRoutes = require("./routes/ambulances");
const hospitalRoutes = require("./routes/hospitals");
const coverageRoutes = require("./routes/coverage");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "*", credentials: true },
});
app.set("io", io);
initSockets(io);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// Basic rate limiting on the SOS endpoint - it's the most sensitive one
const sosLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.post("/api/sos", sosLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "sahay-backend" }));

app.get("/api/location/detect", async (req, res) => {
  for (const url of ["https://freeipapi.com/api/json", "https://ipwho.is/"]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const d = await response.json();
        const lat = d.latitude;
        const lng = d.longitude;
        if (lat && lng) {
          const address = [d.cityName || d.city, d.regionName || d.region, d.countryName || d.country].filter(Boolean).join(", ");
          return res.json({ lat, lng, address: address || `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        }
      }
    } catch {}
  }
  res.json({ lat: 28.6139, lng: 77.2090, address: "Connaught Place, New Delhi" });
});

app.get("/api/location/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 3 || query.length > 300) return res.status(400).json({ message: "Enter a pickup address" });
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: query, format: "json", limit: "5" });
    const response = await fetch(url, {
      headers: { "User-Agent": "SahayLocalDevelopment/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Geocoding unavailable");
    const places = await response.json();
    if (!places.length) return res.status(404).json({ message: "Address not found" });
    return res.json({ results: places.map(place => ({ lat: Number(place.lat), lng: Number(place.lon), address: place.display_name })) });
  } catch {
    return res.status(503).json({ message: "Address lookup unavailable. Select the pickup on the map." });
  }
});

app.get("/api/location/reverse", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ message: "lat and lng required" });
  try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`, { signal: AbortSignal.timeout(2500) });
    if (response.ok) {
      const d = await response.json();
      const parts = [d.locality || d.city || d.principalSubdivision, d.countryName].filter(Boolean);
      if (parts.length) return res.json({ address: parts.join(", ") });
    }
  } catch {}
  res.json({ address: `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` });
});

app.use("/api/auth", authRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/ambulances", ambulanceRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/coverage", coverageRoutes);
app.use("/api/cases", require("./routes/cases"));
app.use("/api/intelligence", require("./routes/intelligence"));


// 404 + error handler
app.use((req, res) => res.status(404).json({ message: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, process.env.HOST || "127.0.0.1", () => {
    console.log(
      `[server] Sahay API running on port ${PORT}`
    );

    startAutoDispatchWorker(io);
  });
}).catch(err => { console.error("[startup]", err.message); process.exit(1); });
