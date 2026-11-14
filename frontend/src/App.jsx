import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
const TripTrack = lazy(() => import("./pages/TripTrack"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const DispatcherDashboard = lazy(() => import("./pages/DispatcherDashboard"));
const HospitalConsole = lazy(() => import("./pages/HospitalConsole"));
const CoverageMap = lazy(() => import("./pages/CoverageMap"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const OperatorDashboard = lazy(() => import("./pages/OperatorDashboard"));
import PatientSOS from "./pages/PatientSOS";
import { CaregiverDashboard, ClinicianDashboard } from "./components/CaseWorkflow";
import RolePreview from "./pages/RolePreview";
import "./styles/dashboard.css";
function RolePage({role,roles,children}) {
 const {user}=useAuth();
 return user?<ProtectedRoute roles={roles}><div className="sahay-legacy">{children}</div></ProtectedRoute>:<RolePreview role={role}/>;
}
const Legacy=({children})=><div className="sahay-legacy">{children}</div>;
export default function App() {
 return <AppShell><Suspense fallback={<div className="sahay-workspace" role="status">Loading workspace…</div>}><Routes>
  <Route path="/" element={<PatientSOS/>}/>
  <Route path="/patient" element={<PatientSOS/>}/>
  <Route path="/sos" element={<PatientSOS/>}/>
  <Route path="/trip/:id" element={<ProtectedRoute><PatientSOS/></ProtectedRoute>}/>
  <Route path="/trip/:id/details" element={<ProtectedRoute><Legacy><TripTrack/></Legacy></ProtectedRoute>}/>
  <Route path="/patient/history" element={<ProtectedRoute roles={["patient","caregiver"]}><Legacy><PatientDashboard/></Legacy></ProtectedRoute>}/>
  <Route path="/login" element={<Legacy><Login/></Legacy>}/>
  <Route path="/how-it-works" element={<Legacy><Home/></Legacy>}/>
  <Route path="/coverage" element={<Legacy><CoverageMap/></Legacy>}/>
  <Route path="/dispatcher" element={<RolePage role="dispatcher" roles={["dispatcher","admin"]}><DispatcherDashboard/></RolePage>}/>
  <Route path="/hospital" element={<RolePage role="hospital" roles={["hospital","admin"]}><HospitalConsole/></RolePage>}/>
  <Route path="/driver" element={<RolePage role="driver" roles={["driver"]}><DriverDashboard/></RolePage>}/>
  <Route path="/operator" element={<RolePage role="operator" roles={["operator","admin"]}><OperatorDashboard/></RolePage>}/>
  <Route path="/clinician" element={<RolePage role="clinician" roles={["clinician"]}><ClinicianDashboard/></RolePage>}/>
  <Route path="/caregiver" element={<RolePage role="caregiver" roles={["patient","caregiver"]}><CaregiverDashboard/></RolePage>}/>
  <Route path="*" element={<div className="sahay-role-placeholder sahay-card"><h1>Page not found</h1><a href="/" className="sahay-button dark">Return to Patient / SOS</a></div>}/>
 </Routes></Suspense></AppShell>;
}
