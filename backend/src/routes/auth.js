const router = require("express").Router();
const { googleLogin, refresh, logout, me } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

router.post("/google", googleLogin);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

module.exports = router;
