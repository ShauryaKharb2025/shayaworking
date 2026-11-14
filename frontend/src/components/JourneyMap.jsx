import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "./Icons";
const valid=coordinates=>Array.isArray(coordinates)&&coordinates.length===2&&coordinates.every(Number.isFinite)&&Math.abs(coordinates[0])<=180&&Math.abs(coordinates[1])<=90&&coordinates.some(n=>n!==0);
const point=(coordinates,fallback)=>valid(coordinates)?[coordinates[1],coordinates[0]]:fallback;
function tooltip(text){const node=document.createElement("span");node.textContent=text;return node;}
function marker(className,text){return L.divIcon({className:"sahay-map-marker "+className,html:text,iconSize:[40,40],iconAnchor:[20,40]});}
export default function JourneyMap({trip,preview=false,pickup,onPickup}) {
 const container=useRef(null),map=useRef(null),layers=useRef(null);
 const [offline,setOffline]=useState(false);
 const stale=!!trip && (!trip.ambulance?.lastPingAt || Date.now()-new Date(trip.ambulance.lastPingAt).getTime()>90000);
 useEffect(()=>{
  const instance=L.map(container.current,{zoomControl:false}).setView([28.635,77.17],12);
  map.current=instance;
  let errors=0;
  const tile=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
  tile.on("tileerror",()=>{if(++errors>3)setOffline(true)});
  tile.on("tileload",()=>setOffline(false));tile.addTo(instance);
  L.control.zoom({position:"topright"}).addTo(instance);
  layers.current=L.layerGroup().addTo(instance);
  const observer=new ResizeObserver(()=>instance.invalidateSize({ animate: false, pan: false }));observer.observe(container.current);
  return ()=>{observer.disconnect();instance.stop();instance.remove();map.current=null};
 },[]);
 useEffect(()=>{
  if(!map.current)return;
  layers.current.clearLayers();
  const isRealPickup=!!pickup;
  const pickupPoint=point(trip?.pickupLocation?.coordinates,pickup?[pickup.lat,pickup.lng]:[28.651,77.151]);
  const vehicle=point(trip?.ambulance?.location?.coordinates,[28.634,77.177]);
  const hospital=point(trip?.hospital?.location?.coordinates,[28.567,77.21]);
  const pinTitle=isRealPickup?"Your pickup location":(preview?"You · sample pickup":"Pickup");
  const pin=L.marker(pickupPoint,{icon:marker("pickup","●"),draggable:!trip&&!!onPickup}).addTo(layers.current).bindTooltip(tooltip(pinTitle),{permanent:true,direction:"bottom"});
  pin.on("dragend",()=>{const p=pin.getLatLng();onPickup?.({lat:p.lat,lng:p.lng})});

  if(trip) {
   const bounds=[pickupPoint];
   if(valid(trip?.ambulance?.location?.coordinates)) {
    L.marker(vehicle,{icon:marker("vehicle","✚")}).addTo(layers.current).bindTooltip(tooltip(trip.ambulance.vehicleNumber||"Ambulance"),{permanent:true,direction:"top"});
    bounds.push(vehicle);
   }
   if(valid(trip?.hospital?.location?.coordinates)){
    L.marker(hospital,{icon:marker("hospital","H")}).addTo(layers.current).bindTooltip(tooltip(trip.hospital.name),{permanent:true,direction:"bottom"});
    bounds.push(hospital);
   }
   map.current.fitBounds(L.latLngBounds(bounds).pad(.25),{maxZoom:13, animate:false});
  } else if(isRealPickup) {
   map.current.flyTo(pickupPoint, 15, { duration: 0.8 });
  } else if(preview) {
   const bounds=[pickupPoint,vehicle,hospital];
   L.marker(vehicle,{icon:marker("vehicle","✚")}).addTo(layers.current).bindTooltip(tooltip("ALS-03 · sample ambulance"),{permanent:true,direction:"top"});
   L.marker(hospital,{icon:marker("hospital","H")}).addTo(layers.current).bindTooltip(tooltip("H4 – AIIMS · sample"),{permanent:true,direction:"bottom"});
   L.polyline([pickupPoint,[28.64,77.163],vehicle,[28.62,77.19],[28.59,77.19],hospital],{color:"#3474ed",weight:4,dashArray:"8 7"}).addTo(layers.current);
   map.current.fitBounds(L.latLngBounds(bounds).pad(.25),{maxZoom:13, animate:false});
  } else {
   map.current.setView(pickupPoint, 13);
  }
 },[trip,pickup,preview,onPickup]);
 return <section className="sahay-map" aria-label="Pickup, ambulance and hospital map">
  <div ref={container} className="sahay-map-canvas"/>
  <div className="sahay-map-live"><i className={offline||stale?"offline":""}/>{(preview&&!pickup)?"Preview journey":trip?stale?"GPS stale / unavailable":"Last reported position":"Pickup selected"}<span>{offline?"Tiles unavailable":"OSM basemap"}</span></div>
  {offline&&<div className="sahay-map-fallback"><Navigation/><strong>Map tiles unavailable</strong><span>Markers show the last known coordinates. Check your connection.</span></div>}
  <div className="sahay-map-caption">{(preview&&!pickup)?"Illustrative route · not live tracking":pickup?"Pickup location set · Drag pin to adjust":"Positions from case records · no road route estimate"}</div>
 </section>
}
