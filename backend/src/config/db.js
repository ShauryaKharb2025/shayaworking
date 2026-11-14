const prisma = require("../data/prisma");
async function connectDB() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; see backend/.env.example");
  await prisma.$connect();
  console.log("[db] Connected to PostgreSQL");
}
module.exports = connectDB;
