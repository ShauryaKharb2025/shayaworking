import { etaLabel } from "../utils/eta";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { HospitalReferrals } from "../components/CaseWorkflow";
import { connectSocket } from "../api/socket";

export default function HospitalConsole() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [hospitalName,setHospitalName]=useState("");

  // Bed availability
  const [ready, setReady] = useState(false);
  const [specialties, setSpecialties] = useState("");
  const [beds, setBeds] = useState(0);
  const [savingBeds, setSavingBeds] = useState(false);
  const [bedMessage, setBedMessage] = useState("");
  const [incomingError,setIncomingError]=useState("");

  const hospitalId = user?.hospital;

  useEffect(() => {
    if (!hospitalId) return;

    function loadIncoming() {
      return api
      .get(`/hospitals/${hospitalId}/incoming`)
      .then(({ data }) => {setTrips(data.trips);setIncomingError("");})
      .catch((err) => setIncomingError(err.response?.data?.message || "Could not load incoming cases."));
    }
    loadIncoming();

    // Load current hospital bed availability
    api
      .get("/hospitals")
      .then(({ data }) => {
        const hospital = data.hospitals?.find(
          (h) => h._id === hospitalId
        );

        if (hospital) {
          setHospitalName(hospital.name);
          setBeds(hospital.bedsAvailable ?? 0);
          setReady(hospital.receivingReady);
          setSpecialties(hospital.specialties.join(", "));
        }
      })
      .catch((err) => console.error("Failed to load hospital:", err));

    const socket = connectSocket();

    socket.emit("join:hospital", hospitalId);

    socket.on("hospital:pre_alert", loadIncoming);
    socket.on("case:refresh", loadIncoming);

  const refreshTimer = setInterval(loadIncoming, 10000);
  socket.on("connect", loadIncoming);
    return () => {
    clearInterval(refreshTimer);
    socket.off("connect", loadIncoming);
      socket.off("hospital:pre_alert", loadIncoming);
      socket.off("case:refresh", loadIncoming);
    };
  }, [hospitalId]);

  const updateBeds = async () => {
    if (!hospitalId) return;

    try {
      setSavingBeds(true);
      setBedMessage("");

      await api.patch(`/hospitals/${hospitalId}/beds`, {
        bedsAvailable: beds,
        receivingReady: ready,
        specialties: specialties.split(",").map(value => value.trim()).filter(Boolean),
      });

      setBedMessage("Bed availability updated successfully.");
    } catch (err) {
      console.error("Failed to update beds:", err);

      setBedMessage(
        err?.response?.data?.message ||
          "Failed to update bed availability."
      );
    } finally {
      setSavingBeds(false);
    }
  };

  return (
    <div className="sahay-role-workspace">
      <header className="sahay-role-heading"><p>Hospital console</p><h1>Incoming patients</h1><p>Review receiving requests, prepare the team and follow ambulance handovers.</p></header>
      {!hospitalId ? <p role="status">Your account needs a hospital link before receiving requests.</p> :
      <div className="sahay-hospital-layout">
        <div className="sahay-hospital-cases">
          <HospitalReferrals/>
          <section className="sahay-card sahay-role-card"><h2>Arrivals at your linked hospital</h2>
            {incomingError && <p role="alert">{incomingError}</p>}
            {!incomingError && !trips.length && <p>No confirmed arrivals. Review the receiving requests above.</p>}
            <div className="sahay-arrival-grid">{trips.map(trip=><article key={trip._id} className="sahay-arrival-card">
              <h3>{trip.patient?.name || "Patient name unavailable"}</h3>
              <p>{trip.status?.replaceAll("_"," ")}</p>
              <dl><div><dt>Ambulance</dt><dd>{trip.ambulance?.vehicleNumber || "Awaiting assignment"}</dd></div>
                <div><dt>{etaLabel(trip.etaSource)}</dt><dd>{trip.etaMinutes!=null ? trip.etaMinutes+" min" : "Unavailable"}</dd></div></dl>
            </article>)}</div>
          </section>
        </div>
        <aside className="sahay-card sahay-role-card sahay-capacity-card">
          <h2>Hospital availability</h2><p>{hospitalName || "Linked hospital"}</p>
          <label className="sahay-care-check"><input type="checkbox" checked={ready} onChange={event=>setReady(event.target.checked)}/>Accepting emergency arrivals</label>
          <label>Specialties<textarea value={specialties} onChange={event=>setSpecialties(event.target.value)} rows={3}/></label>
          <label htmlFor="available-beds">Available ER beds</label>
          <div className="sahay-bed-control"><button type="button" aria-label="Decrease available beds" disabled={beds<=0 || savingBeds} onClick={()=>setBeds(value=>Math.max(0,value-1))}>−</button>
            <input id="available-beds" type="number" min={0} max={100000} step={1} value={beds} onChange={event=>setBeds(event.target.value===""?"":Number(event.target.value))}/>
            <button type="button" aria-label="Increase available beds" disabled={savingBeds} onClick={()=>setBeds(value=>Number(value)+1)}>+</button></div>
          <button type="button" className="sahay-button dark" disabled={savingBeds || !Number.isSafeInteger(beds) || beds<0 || beds>100000} onClick={updateBeds}>{savingBeds?"Saving…":"Save availability"}</button>
          {bedMessage&&<p role="status">{bedMessage}</p>}
        </aside>
      </div>}
    </div>
  );
}
