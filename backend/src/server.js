require("dotenv").config();
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
app.use("/api/sos", sosLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "jeevansetu-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/ambulances", ambulanceRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/coverage", coverageRoutes);

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
      `[server] JeevanSetu API running on port ${PORT}`
    );

    startAutoDispatchWorker(io);
  });
}).catch(err => { console.error("[startup]", err.message); process.exit(1); });
