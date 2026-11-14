import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function FleetMap({center={lat:28.635,lng:77.17},zoom=12,markers=[],ambulances=[],trips=[],zones=[]}) {
 const ref=useRef(null),map=useRef(null),layer=useRef(null);
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const m=L.map(ref.current,{zoomControl:false}).setView([center.lat,center.lng],zoom);map.current=m;
  let errors=0;
  const tiles=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
  tiles.on("tileerror",()=>{if(++errors>3)setOffline(true)});tiles.on("tileload",()=>setOffline(false));
  L.control.zoom({position:"topright"}).addTo(m);layer.current=L.layerGroup().addTo(m);
  const observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(ref.current);
  return()=>{observer.disconnect();m.remove()};
 },[]);
 useEffect(()=>{
  if(!layer.current)return;layer.current.clearLayers();
  const all=[...markers,...ambulances.map(a=>({lng:a.location?.coordinates?.[0],lat:a.location?.coordinates?.[1],title:a.vehicleNumber,status:a.status})),...trips.map(t=>({lng:t.pickupLocation?.coordinates?.[0],lat:t.pickupLocation?.coordinates?.[1],title:"Pickup · "+(t.patient?.name||"Incident"),status:"patient"}))];
  const bounds=[];
  for(const pin of all){
   if(!Number.isFinite(Number(pin.lat))||!Number.isFinite(Number(pin.lng)))continue;
   const p=[Number(pin.lat),Number(pin.lng)];bounds.push(p);
   const text=document.createElement("span");text.textContent=pin.title||pin.label||"Location";
   L.circleMarker(p,{radius:9,color:"#fff",weight:3,fillColor:pin.status==="patient"?"#d5233c":"#244c80",fillOpacity:1}).addTo(layer.current).bindTooltip(text);
  }
  for(const zone of zones){
   const c=zone.center?.coordinates;if(!Array.isArray(c)||!c.every(Number.isFinite))continue;
   const p=[c[1],c[0]];bounds.push(p);
   const label=document.createElement("span");label.textContent=zone.name+" · "+zone.status.replaceAll("_"," ");
   L.circle(p,{radius:zone.radiusKm*1000,color:zone.status==="live"?"#28a35f":"#c59542",weight:2,fillOpacity:.12}).addTo(layer.current).bindTooltip(label);
  }
  if(bounds.length)map.current.fitBounds(L.latLngBounds(bounds).pad(.15),{maxZoom:13});
 },[markers,ambulances,trips,zones]);
 return <div className="js-map" style={{height:"100%",minHeight:400}}><div className="js-map-canvas" ref={ref}/><div className="js-map-live"><i className={offline?"offline":""}/>{offline?"Basemap offline · positions retained":"OpenStreetMap · last reported positions"}</div>{offline&&<div className="js-map-caption">Map tiles unavailable. Last reported coordinates are retained.</div>}</div>;
}
