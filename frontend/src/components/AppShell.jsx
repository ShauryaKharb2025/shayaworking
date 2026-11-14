import { NavLink, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Home, Headphones, Ambulance, Building2, Stethoscope, Users, ShieldCheck, Bell, UserRound, Menu, X } from "./Icons";
const roles = [
 ["/", "Patient / SOS", Home], ["/dispatcher","Dispatcher",Headphones],
 ["/driver","Driver",Ambulance], ["/hospital","Hospital",Building2],
 ["/clinician","Clinician",Stethoscope], ["/caregiver","Caregiver",Users],
 ["/operator","Fleet operator",ShieldCheck],
];
export default function AppShell({children}) {
 const {user,logout}=useAuth();
 const [open,setOpen]=useState(false),[notifications,setNotifications]=useState(false);
 const location=useLocation();
 return <div className="sahay-app">
  <header className="sahay-header">
   <button className="sahay-icon mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</button>
   <Link className="sahay-brand" to="/" aria-label="Sahay home"><img src="/sahay-mark.svg" alt="" width="48" height="48"/><strong>Sahay</strong></Link>
   <div className="sahay-tagline">National Ambulance Aggregator for India</div>
   <nav className="sahay-topnav" aria-label="Main navigation">
    <NavLink to="/" end>Home</NavLink><NavLink to="/how-it-works">How it Works</NavLink><NavLink to="/coverage">Coverage</NavLink><NavLink to="/hospital">For Hospitals</NavLink>
   </nav>
   <div className="sahay-header-actions">
    <button className="sahay-icon sahay-bell" onClick={()=>setNotifications(!notifications)} aria-label="Notifications" aria-expanded={notifications}><Bell/><i/></button>
    <Link to="/login" className="sahay-avatar" aria-label={user?"Your account":"Sign in"}><UserRound/></Link>
   </div>
   {notifications&&<div className="sahay-notification-popover"><strong>Notifications</strong><p>{user?"Case updates appear in your response timeline.":"Sign in to receive updates for your cases."}</p><button onClick={()=>setNotifications(false)}>Close</button></div>}
  </header>
  <aside className={"sahay-sidebar "+(open?"is-open":"")}>
   <nav aria-label="Role navigation">{roles.map(([path,label,Icon])=><NavLink key={path} to={path} end={path==="/"} onClick={()=>setOpen(false)} className={({isActive})=>isActive || (path==="/" && (["/patient","/sos"].includes(location.pathname)||location.pathname.startsWith("/trip/")))?"active":""}><Icon/><span>{label}</span></NavLink>)}</nav>
   <div className="sahay-sidebar-bottom"><span className="sahay-simulation-dot"/> Simulation environment<Link to="tel:112">Emergency helpline <b>112 ↗</b></Link>{user&&<button onClick={logout}>Sign out · {user.name?.split(" ")[0]}</button>}</div>
  </aside>
  {open&&<button className="sahay-scrim" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
  <main className="sahay-main">{children}</main>
 </div>
}
