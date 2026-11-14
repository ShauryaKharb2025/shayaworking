"""
JeevanSetu Triage Engine - separate Flask AI/ML microservice.

This is intentionally kept separate from the Express backend (per the pitch deck's
"Triage Engine" box in the Platform Core) so it can be swapped, scaled, or replaced
with a real trained model / hosted LLM without touching the Node.js API.

Current implementation: a transparent, auditable RULE-BASED classifier
(keyword -> urgency tier + equipment need). This is a reasonable, explainable
starting point for a hackathon/pilot and deliberately avoids inventing clinical
claims. Swap `classify_symptoms()` for a real model when you have labeled data.
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# --- Rule table -------------------------------------------------------------
# 👉 This is the place to plug in a real ML model. Replace classify_symptoms()
# with, e.g., a scikit-learn pipeline loaded from disk, or a call to a hosted
# model using AI_MODEL_API_KEY / AI_MODEL_ENDPOINT from ai-service/.env
CRITICAL_KEYWORDS = {
    "not breathing", "no pulse", "unconscious", "cardiac arrest", "severe bleeding",
    "chest pain", "stroke symptoms", "seizure", "choking",
}
HIGH_KEYWORDS = {
    "difficulty breathing", "heavy bleeding", "high fever with confusion",
    "severe burn", "suspected fracture with deformity", "allergic reaction",
}
MEDIUM_KEYWORDS = {
    "fracture", "moderate bleeding", "high fever", "persistent vomiting", "fainting",
}
# anything else -> "low"

EQUIPMENT_MAP = {
    "not breathing": ["oxygen", "ventilator", "defibrillator"],
    "cardiac arrest": ["defibrillator", "oxygen"],
    "chest pain": ["defibrillator", "oxygen", "ECG"],
    "severe bleeding": ["trauma kit", "IV fluids"],
    "heavy bleeding": ["trauma kit", "IV fluids"],
    "difficulty breathing": ["oxygen", "nebulizer"],
    "seizure": ["oxygen", "IV fluids"],
    "suspected fracture with deformity": ["splint", "trauma kit"],
    "fracture": ["splint"],
    "allergic reaction": ["epinephrine", "oxygen"],
}


def classify_symptoms(symptoms):
    """
    symptoms: list[str] of free-text or keyword symptom phrases from the caller/IVR.
    Returns urgency tier, suggested equipment, and a suggested ambulance tier
    (BLS = Basic Life Support, ALS = Advanced Life Support).
    """
    text = " ".join(s.lower().strip() for s in symptoms)

    urgency = "low"
    matched_keywords = []

    for kw in CRITICAL_KEYWORDS:
        if kw in text:
            urgency = "critical"
            matched_keywords.append(kw)
    if urgency != "critical":
        for kw in HIGH_KEYWORDS:
            if kw in text:
                urgency = "high"
                matched_keywords.append(kw)
    if urgency == "low":
        for kw in MEDIUM_KEYWORDS:
            if kw in text:
                urgency = "medium"
                matched_keywords.append(kw)

    equipment = set()
    for kw in matched_keywords:
        equipment.update(EQUIPMENT_MAP.get(kw, []))
    if not equipment and urgency in ("critical", "high"):
        equipment.update(["oxygen", "trauma kit"])

    ambulance_tier = "ALS" if urgency in ("critical", "high") else "BLS"

    notes = (
        f"Matched keywords: {', '.join(matched_keywords)}."
        if matched_keywords
        else "No high-risk keywords matched; defaulting to low urgency. "
        "This is a rule-based heuristic, not a clinical diagnosis."
    )

    return {
        "urgency_tier": urgency,
        "suggested_equipment": sorted(equipment) or ["oxygen"],
        "suggested_ambulance_tier": ambulance_tier,
        "notes": notes,
    }


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "jeevansetu-ai-triage"})


@app.route("/triage", methods=["POST"])
def triage():
    payload = request.get_json(silent=True) or {}
    symptoms = payload.get("symptoms", [])
    if not isinstance(symptoms, list) or not symptoms:
        return jsonify({"error": "symptoms must be a non-empty list of strings"}), 400

    result = classify_symptoms(symptoms)
    return jsonify(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
