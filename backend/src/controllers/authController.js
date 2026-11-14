const User = require("../models/User");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");

/**
 * POST /api/auth/login
 * Body: { email, role, name }
 * Directly signs in or creates account without external OAuth dependency,
 * then issues access JWT and sets refresh cookie.
 */
async function login(req, res) {
  try {
    const { email, role, name } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.create({
        name: name || cleanEmail.split("@")[0],
        email: cleanEmail,
        role: role || "patient",
        isActive: true,
      });
    } else if (role && user.role !== role) {
      // Allow demo / role switching if user requests a specific role
      user.role = role;
      await user.save();
    }

    if (!user.isActive) {
      return res.status(401).json({ message: "Account is inactive" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie("sahay_refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        hospital: user.hospital,
        operator: user.operator,
      },
    });
  } catch (err) {
    console.error("[auth] login failed:", err.message);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

/** POST /api/auth/refresh - reads httpOnly cookie, issues a new access token */
async function refresh(req, res) {
  try {
    const token = req.cookies?.sahay_refresh;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ message: "User not found" });

    if (!user.isActive) return res.status(401).json({ message: "Account is inactive" });
    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
}

async function logout(req, res) {
  res.clearCookie("sahay_refresh");
  return res.json({ message: "Logged out" });
}

async function me(req, res) {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ user });
}

module.exports = { login, refresh, logout, me };
