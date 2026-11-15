import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
const TripTrack = lazy(() => import("./pages/TripTrack"));
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const HospitalConsole = lazy(() => import("./pages/HospitalConsole"));
const CoverageMap = lazy(() => import("./pages/CoverageMap"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
import PatientSOS from "./pages/PatientSOS";
import { roleHome } from "./utils/roles";
import "./styles/dashboard.css";
function RolePage({ roles, children }) {
 return <ProtectedRoute roles={roles}><div className="sahay-legacy">{children}</div></ProtectedRoute>;
}
const Legacy=({children})=><div className="sahay-legacy">{children}</div>;
export default function App() {
 const { user } = useAuth();
 const location = useLocation();
 if (!user && location.pathname !== "/login") return <Navigate to="/login" replace />;

 return <AppShell><Suspense fallback={<div className="sahay-workspace" role="status">Loading workspace…</div>}><Routes>
  <Route path="/" element={<Navigate to={user ? roleHome(user.role) : "/login"} replace />}/>
  <Route path="/patient" element={<ProtectedRoute roles={["patient"]}><PatientSOS/></ProtectedRoute>}/>
  <Route path="/sos" element={<ProtectedRoute roles={["patient"]}><PatientSOS/></ProtectedRoute>}/>
  <Route path="/trip/:id" element={<ProtectedRoute><PatientSOS/></ProtectedRoute>}/>
  <Route path="/trip/:id/details" element={<ProtectedRoute><Legacy><TripTrack/></Legacy></ProtectedRoute>}/>
  <Route path="/patient/history" element={<ProtectedRoute roles={["patient"]}><Legacy><PatientDashboard/></Legacy></ProtectedRoute>}/>
  <Route path="/login" element={user ? <Navigate to={roleHome(user.role)} replace /> : <Legacy><Login/></Legacy>}/>
  <Route path="/how-it-works" element={<Legacy><Home/></Legacy>}/>
  <Route path="/coverage" element={<Legacy><CoverageMap/></Legacy>}/>
  <Route path="/hospital" element={<RolePage role="hospital" roles={["hospital"]}><HospitalConsole/></RolePage>}/>
  <Route path="/driver" element={<RolePage role="driver" roles={["driver"]}><DriverDashboard/></RolePage>}/>
  <Route path="*" element={<div className="sahay-role-placeholder sahay-card"><h1>Page not found</h1><a href="/" className="sahay-button dark">Return to Patient / SOS</a></div>}/>
 </Routes></Suspense></AppShell>;
}
