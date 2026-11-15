import OperationalStatus from "./OperationalStatus";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { roleHome } from "../utils/roles";
import { useAuth } from "../context/AuthContext";
import { Home, ShieldCheck, Ambulance, Building2, Bell, UserRound, Menu, X } from "./Icons";
const rolePaths = {admin:["/admin"],patient:["/"],driver:["/driver"],hospital:["/hospital"]};
const roles = [
 ["/admin","Command centre",ShieldCheck],
 ["/", "Patient / SOS", Home],
 ["/driver","Ambulance / Driver",Ambulance],
 ["/hospital","Hospital",Building2],
];
export default function AppShell({children}) {
 const {user,logout}=useAuth();
 const [open,setOpen]=useState(false),[notifications,setNotifications]=useState(false);
 const location=useLocation();
 const isLogin=location.pathname==="/login";
 useEffect(()=>{setOpen(false);setNotifications(false);},[location.pathname]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  return ()=>{document.body.style.overflow=previous;};
 },[open]);
 useEffect(()=>{
  const close=event=>{if(event.key==="Escape"){setOpen(false);setNotifications(false);}};
  document.addEventListener("keydown",close);
  return ()=>document.removeEventListener("keydown",close);
 },[]);
 return <div className={"sahay-app"+(isLogin?" sahay-auth":"")}>
  <header className="sahay-header">
   <button aria-expanded={open} aria-controls="role-navigation" className="sahay-icon mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</button>
   <Link className="sahay-brand" to="/" aria-label="Sahay home"><img className="sahay-brand-lockup" src="/sahay-header.svg" alt="" width="260" height="68"/></Link>
   <div className="sahay-tagline">National Ambulance Aggregator for India</div>
   <nav className="sahay-topnav" aria-label="Main navigation">
    <NavLink to={user?roleHome(user.role):"/"} end>Dashboard</NavLink><NavLink to="/how-it-works">How it Works</NavLink><NavLink to="/coverage">Coverage</NavLink>
   </nav>
   <div className={"sahay-header-actions"+(isLogin?" sahay-hidden":"")}>
    <button className="sahay-icon sahay-bell" onClick={()=>setNotifications(!notifications)} aria-label="Notifications" aria-expanded={notifications}><Bell/></button>
    <Link to={user?roleHome(user.role):"/login"} className="sahay-avatar" aria-label={user?"Your dashboard":"Sign in"}><UserRound/></Link>
   </div>
   {notifications&&<div className="sahay-notification-popover"><strong>Notifications</strong><p>{user?"Case updates appear in your response timeline.":"Sign in to receive updates for your cases."}</p><button onClick={()=>setNotifications(false)}>Close</button></div>}
  </header>
  <aside className={"sahay-sidebar "+(open?"is-open":"")}>
   <nav id="role-navigation" aria-label="Role navigation">{roles.filter(([path])=>!user || rolePaths[user.role]?.includes(path)).map(([path,label,Icon])=><NavLink key={path} to={path} end={path==="/"} onClick={()=>setOpen(false)} className={({isActive})=>isActive || (path==="/" && (["/patient","/sos"].includes(location.pathname)||location.pathname.startsWith("/trip/")))?"active":""}><Icon/><span>{label}</span></NavLink>)}</nav>
   <div className="sahay-sidebar-bottom"><span className="sahay-simulation-dot"/> Simulation environment<Link to="tel:112">Emergency helpline <b>112 ↗</b></Link>{user&&<button onClick={logout}>Sign out · {user.name?.split(" ")[0]}</button>}</div>
  </aside>
  {open&&<button className="sahay-scrim" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
  <main className="sahay-main" inert={open?"":undefined}>{user&&<OperationalStatus detailed={user.role==="admin"}/>} {children}</main>
 </div>
}
