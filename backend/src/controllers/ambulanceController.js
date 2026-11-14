const Ambulance = require("../models/Ambulance");
const Operator = require("../models/Operator");

/** POST /api/ambulances - operator portal: onboard a new ambulance */
async function createAmbulance(req, res) {
  try {
    const {
      vehicleNumber,
      operatorId,
      tier,
      equipment,
      crew,
      complianceVerified,
    } = req.body;

    const operator = await Operator.findById(operatorId);

    if (!operator) {
      return res.status(404).json({
        message: "Operator not found",
      });
    }

    const ambulance = await Ambulance.create({
      vehicleNumber,
      operator: operatorId,
      tier,
      equipment,
      crew,
      complianceVerified: !!complianceVerified,
      status: "idle",
    });

    return res.status(201).json({
      ambulance,
    });
  } catch (err) {
    console.error("[ambulance] create error:", err);

    return res.status(500).json({
      message: "Could not create ambulance",
    });
  }
}

/** GET /api/ambulances - list/filter ambulances */
async function listAmbulances(req, res) {
  try {
    const {
      operatorId,
      status,
      tier,
      mine,
    } = req.query;

    /*
     * DRIVER
     *
     * Driver can ONLY see ambulances explicitly
     * assigned to that driver.
     *
     * No automatic claiming.
     */
    if (
      mine === "true" &&
      req.user.role === "driver"
    ) {
      const ambulances = await Ambulance.find({
        driver: req.user.sub,
      })
        .populate(
          "operator",
          "name type verified"
        )
        .populate(
          "driver",
          "name email phone"
        );

      return res.json({
        ambulances,
      });
    }

    /*
     * NORMAL FLEET LISTING
     */

    const filter = {};

    if (operatorId) {
      filter.operator = operatorId;
    }

    if (status) {
      filter.status = status;
    }

    if (tier) {
      filter.tier = tier;
    }

    const ambulances = await Ambulance.find(filter)
      .populate(
        "operator",
        "name type verified"
      )
      .populate(
        "driver",
        "name email phone"
      );

    return res.json({
      ambulances,
    });
  } catch (err) {
    console.error(
      "[ambulance] list error:",
      err
    );

    return res.status(500).json({
      message: "Could not load ambulances",
    });
  }
}

/** PATCH /api/ambulances/:id */
async function updateAmbulance(req, res) {
  try {
    const ambulance =
      await Ambulance.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
        }
      )
        .populate(
          "operator",
          "name type verified"
        )
        .populate(
          "driver",
          "name email phone"
        );

    if (!ambulance) {
      return res.status(404).json({
        message: "Ambulance not found",
      });
    }

    return res.json({
      ambulance,
    });
  } catch (err) {
    console.error(
      "[ambulance] update error:",
      err
    );

    return res.status(500).json({
      message: "Could not update ambulance",
    });
  }
}

module.exports = {
  createAmbulance,
  listAmbulances,
  updateAmbulance,
};