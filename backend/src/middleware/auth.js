const { verifyAccessToken } = require("../utils/jwt");

/** Requires a valid Bearer JWT. Attaches decoded payload to req.user. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing access token" });

  try {
    req.user = verifyAccessToken(token);
    const account = await require("../data/prisma").user.findUnique({ where: { id: req.user.sub } });
    if (!account?.isActive || account.role !== req.user.role) {
      return res.status(401).json({ message: "Account authorization has changed" });
    }
    req.account = account;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired access token" });
  }
}

/** Restrict a route to specific roles, e.g. requireRole("dispatcher", "admin") */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient role for this action" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
