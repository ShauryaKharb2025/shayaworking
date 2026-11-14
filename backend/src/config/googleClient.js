const { OAuth2Client } = require("google-auth-library");

// 👉 ADD YOUR OWN: GOOGLE_CLIENT_ID in backend/.env
// This must match the client ID used by the frontend's Google Sign-In button.
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  // payload contains: sub, email, name, picture, email_verified
  return payload;
}

module.exports = { verifyGoogleIdToken };
