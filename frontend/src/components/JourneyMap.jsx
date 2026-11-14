import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "./Icons";
const valid=coordinates=>Array.isArray(coordinates)&&coordinates.length===2&&coordinates.every(Number.isFinite)&&Math.abs(coordinates[0])<=180&&Math.abs(coordinates[1])<=90&&coordinates.some(n=>n!==0);
const point=(coordinates,fallback)=>valid(coordinates)?[coordinates[1],coordinates[0]]:fallback;
function tooltip(text){const node=document.createElement("span");node.textContent=text;return node;}
function marker(className,text){return L.divIcon({className:"js-map-marker "+className,html:text,iconSize:[40,40],iconAnchor:[20,40]});}
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
  const observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(container.current);
  return ()=>{observer.disconnect();instance.remove();map.current=null};
 },[]);
 useEffect(()=>{
  if(!map.current)return;
  layers.current.clearLayers();
  const pickupPoint=point(trip?.pickupLocation?.coordinates,pickup?[pickup.lat,pickup.lng]:[28.651,77.151]);
  const vehicle=point(trip?.ambulance?.location?.coordinates,[28.634,77.177]);
  const hospital=point(trip?.hospital?.location?.coordinates,[28.567,77.21]);
  const pin=L.marker(pickupPoint,{icon:marker("pickup","●"),draggable:!trip&&!!onPickup}).addTo(layers.current).bindTooltip(tooltip(preview?"You · sample pickup":"Pickup"),{permanent:true,direction:"bottom"});
  pin.on("dragend",()=>{const p=pin.getLatLng();onPickup?.({lat:p.lat,lng:p.lng})});
  const bounds=[pickupPoint];
  if(preview || valid(trip?.ambulance?.location?.coordinates)) {
   L.marker(vehicle,{icon:marker("vehicle","✚")}).addTo(layers.current).bindTooltip(tooltip(preview?"ALS-03 · sample ambulance":trip.ambulance.vehicleNumber||"Ambulance"),{permanent:true,direction:"top"});
   bounds.push(vehicle);
  }
  if(preview || valid(trip?.hospital?.location?.coordinates)){
   L.marker(hospital,{icon:marker("hospital","H")}).addTo(layers.current).bindTooltip(tooltip(preview?"H4 – AIIMS · sample":trip.hospital.name),{permanent:true,direction:"bottom"});bounds.push(hospital);
  }
  if(preview)L.polyline([pickupPoint,[28.64,77.163],vehicle,[28.62,77.19],[28.59,77.19],hospital],{color:"#3474ed",weight:4,dashArray:"8 7"}).addTo(layers.current);
  map.current.fitBounds(L.latLngBounds(bounds).pad(.25),{maxZoom:13});
 },[trip,pickup,preview,onPickup]);
 return <section className="js-map" aria-label="Pickup, ambulance and hospital map">
  <div ref={container} className="js-map-canvas"/>
  <div className="js-map-live"><i className={offline||stale?"offline":""}/>{preview?"Preview journey":trip?stale?"GPS stale / unavailable":"Last reported position":"Choose pickup"}<span>{offline?"Tiles unavailable":"OSM basemap"}</span></div>
  {offline&&<div className="js-map-fallback"><Navigation/><strong>Map tiles unavailable</strong><span>Markers show the last known coordinates. Check your connection.</span></div>}
  <div className="js-map-caption">{preview?"Illustrative route · not live tracking":pickup?"Drag the pickup pin to adjust location":"Positions from case records · no road route estimate"}</div>
 </section>
}
