const User = require("../models/User");
const { verifyGoogleIdToken } = require("../config/googleClient");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");

/**
 * POST /api/auth/google
 * Body: { idToken, role? }
 * Frontend gets `idToken` from Google Identity Services (One Tap / Sign in with Google button),
 * then this endpoint verifies it server-side and issues our own JWT (access + refresh).
 */
async function googleLogin(req, res) {
  try {
    const { idToken, role } = req.body;
    if (!idToken) return res.status(400).json({ message: "idToken is required" });

    const payload = await verifyGoogleIdToken(idToken);
    if (!payload || !payload.email_verified) {
      return res.status(401).json({ message: "Google account email not verified" });
    }

    let user = await User.findOne({ email: payload.email });

    if (!user) {
      user = await User.create({
        name: payload.name || payload.email.split("@")[0],
        email: payload.email,
        avatar: payload.picture,
        googleId: payload.sub,
        // Role is self-declared at signup time for the pilot (patient/driver/hospital/dispatcher).
        // In production, driver/hospital/dispatcher roles should be assigned by an admin after verification.
        role: ["patient", "caregiver", "driver", "hospital", "dispatcher", "operator"].includes(role) ? role : "patient",
      });
    } else if (!user.googleId) {
      user.googleId = payload.sub;
      user.avatar = user.avatar || payload.picture;
      await user.save();
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie("jsetu_refresh", refreshToken, {
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
    console.error("[auth] google login failed:", err.message);
    return res.status(401).json({ message: "Google authentication failed" });
  }
}

/** POST /api/auth/refresh - reads httpOnly cookie, issues a new access token */
async function refresh(req, res) {
  try {
    const token = req.cookies?.jsetu_refresh;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ message: "User not found" });

    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
}

async function logout(req, res) {
  res.clearCookie("jsetu_refresh");
  return res.json({ message: "Logged out" });
}

async function me(req, res) {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ user });
}

module.exports = { googleLogin, refresh, logout, me };
