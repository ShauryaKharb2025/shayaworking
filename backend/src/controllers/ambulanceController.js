const db = require("../data/prisma");
const Ambulance = require("../models/Ambulance");

function profile(req) {
  const { vehicleNumber, tier, equipment, crew, complianceVerified, status, driverId } = req.body;
  if (vehicleNumber !== undefined && (typeof vehicleNumber !== "string" || !vehicleNumber.trim())) return null;
  if (tier !== undefined && !["ALS", "BLS"].includes(tier)) return null;
  if (equipment !== undefined && (!Array.isArray(equipment) || equipment.some(item => typeof item !== "string"))) return null;
  if (crew !== undefined && (!Array.isArray(crew) || crew.some(member =>
    typeof member?.name !== "string" || typeof member.role !== "string"))) return null;
  if (status !== undefined && !["idle", "offline"].includes(status)) return null;
  const result = { vehicleNumber: vehicleNumber?.trim(), tier, equipment, status };
  if (crew) result.crew = crew.map(({ name, role, certified, userId }) => ({
    name, role, certified: req.user.role === "admin" && certified === true,
    ...(req.user.role === "admin" && typeof userId === "string" ? { userId } : {}),
  }));
  if (req.user.role === "admin" && typeof complianceVerified === "boolean") result.complianceVerified = complianceVerified;
  else if (tier !== undefined || equipment !== undefined || crew !== undefined) result.complianceVerified = false;
  if (["admin", "operator", "dispatcher"].includes(req.user.role) && (driverId === null || typeof driverId === "string")) result.driverId = driverId;
  return result;
}

async function createAmbulance(req, res, next) {
  try {
    const operatorId = req.user.role === "admin" ? req.body.operatorId : req.account.operatorId;
    if (!operatorId || (req.user.role !== "admin" && req.body.operatorId && req.body.operatorId !== operatorId)) {
      return res.status(403).json({ message: "Fleet membership required" });
    }
    const data = profile(req);
    if (!data?.vehicleNumber) return res.status(400).json({ message: "Invalid vehicle details" });
    if (!await db.operator.findUnique({ where: { id: operatorId } })) return res.status(404).json({ message: "Operator not found" });
    const ambulance = await db.ambulance.create({ data: { ...data, operatorId } });
    res.status(201).json({ ambulance: { ...ambulance, _id: ambulance.id } });
  } catch (error) {
    next(error);
  }
}

async function listAmbulances(req, res, next) {
  try {
    const { status, tier, operatorId } = req.query;
    const filter = {};
    if (typeof status === "string") filter.status = status;
    if (typeof tier === "string") filter.tier = tier;
    if (typeof operatorId === "string") filter.operator = operatorId;
    if (req.user.role === "driver") filter.driver = req.user.sub;
    if (req.user.role === "operator") {
      if (!req.account.operatorId || (operatorId && operatorId !== req.account.operatorId)) {
        return res.status(403).json({ message: "Fleet membership required" });
      }
      filter.operator = req.account.operatorId;
    }
    const ambulances = await Ambulance.find(filter).populate("operator", "name type verified").populate("driver", "name email phone");
    res.json({ ambulances });
  } catch (error) {
    next(error);
  }
}

async function updateAmbulance(req, res, next) {
  try {
    const current = await db.ambulance.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ message: "Ambulance not found" });
    if (req.user.role === "operator" && req.account.operatorId !== current.operatorId) {
      return res.status(403).json({ message: "Fleet membership required" });
    }
    const data = profile(req);
    if (!data) return res.status(400).json({ message: "Invalid vehicle details" });
    const updated = await db.ambulance.updateMany({
      where: { id: current.id, version: current.version, status: { in: ["idle", "offline"] } },
      data: { ...data, version: { increment: 1 } },
    });
    if (!updated.count) return res.status(409).json({ message: "Vehicle is reserved or has changed" });
    const ambulance = await Ambulance.findById(current.id).populate("operator", "name type verified").populate("driver", "name email phone");
    req.app.get("io")?.to("dispatcher").emit("case:refresh");
    res.json({ ambulance });
  } catch (error) {
    next(error);
  }
}

module.exports = { createAmbulance, listAmbulances, updateAmbulance };
