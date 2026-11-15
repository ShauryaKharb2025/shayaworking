import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "./Icons";
const valid=coordinates=>Array.isArray(coordinates)&&coordinates.length===2&&coordinates.every(Number.isFinite)&&Math.abs(coordinates[0])<=180&&Math.abs(coordinates[1])<=90&&coordinates.some(n=>n!==0);
const point=(coordinates,fallback)=>valid(coordinates)?[coordinates[1],coordinates[0]]:fallback;
function tooltip(text){const node=document.createElement("span");node.textContent=text;return node;}
function marker(className,text){return L.divIcon({className:"sahay-map-marker "+className,html:text,iconSize:[40,40],iconAnchor:[20,40]});}
export default function JourneyMap({trip,preview=false,pickup,onPickup}) {
 const container=useRef(null),map=useRef(null),layers=useRef(null),vehicleMarker=useRef(null),motion=useRef(null),viewKey=useRef(null);
 const [offline,setOffline]=useState(false);
 const [roadRoute,setRoadRoute]=useState(null),[routeError,setRouteError]=useState("");
 const destination = trip?.hospital || trip?.proposedHospital;
 const routeStart = trip?.ambulance?.location?.coordinates;
 const transport = ["picked_up","en_route_hospital","arrived_hospital"].includes(trip?.status);
 const demo = trip?.events?.findLast(event=>event.type===(transport ? "journey:demo_hospital_drive_started" : "journey:demo_drive_started"));
 const routeEnd = transport ? destination?.location?.coordinates : trip?.pickupLocation?.coordinates;
 const routeKey = !demo && valid(routeStart) && valid(routeEnd) ? [...routeStart,...routeEnd].join(",") : "";
 useEffect(() => {
  setRoadRoute(null);setRouteError("");
  if (!routeKey) return;
  const controller = new AbortController();
  const timer = setTimeout(async () => {
   try {
    const [lng,lat,endLng,endLat] = routeKey.split(",");
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${endLng},${endLat}?overview=full&geometries=geojson`, {signal:controller.signal});
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!data.routes?.[0]?.geometry?.coordinates?.length) throw new Error();
    setRoadRoute(data.routes[0].geometry.coordinates.map(([x,y])=>[y,x]));
   } catch { if (!controller.signal.aborted) setRouteError("Road route unavailable"); }
  }, 500);
  return () => { clearTimeout(timer);controller.abort(); };
 }, [routeKey]);

 const trackingActive=["dispatched","en_route","en_route_hospital"].includes(trip?.status);
 const trackingLabel=trip?.status==="arrived_pickup"?"Ambulance at pickup":trip?.status==="picked_up"?"Patient pickup confirmed":["arrived_hospital","handed_off"].includes(trip?.status)?"Hospital arrival recorded":demo && trackingActive?"Mock ambulance moving":"Last reported position";
 const stale=trackingActive && (!trip.ambulance?.lastPingAt || Date.now()-new Date(trip.ambulance.lastPingAt).getTime()>90000);
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
  return ()=>{observer.disconnect();cancelAnimationFrame(motion.current);vehicleMarker.current=null;viewKey.current=null;instance.stop();instance.remove();map.current=null};
 },[]);
 useEffect(()=>{
  if(!map.current)return;
  layers.current.clearLayers();
  if (!trip || !valid(trip.ambulance?.location?.coordinates)) {
    cancelAnimationFrame(motion.current);
    vehicleMarker.current?.remove();vehicleMarker.current=null;
  }
  const isRealPickup=!!pickup;
  const nextViewKey = trip ? "trip:" + (trip._id || trip.id) + ":" + (trip.ambulance?._id || trip.ambulance?.id || "") + ":" + (transport ? "hospital" : "pickup")
    : pickup ? "pickup:" + pickup.lat + "," + pickup.lng : preview ? "preview" : "empty";
  const initializeView = viewKey.current !== nextViewKey;
  viewKey.current = nextViewKey;
  const pickupPoint=point(trip?.pickupLocation?.coordinates,pickup?[pickup.lat,pickup.lng]:[28.651,77.151]);
  const vehicle=point(trip?.ambulance?.location?.coordinates,[28.634,77.177]);
  const hospital=point(destination?.location?.coordinates,[28.567,77.21]);
  const pinTitle=isRealPickup?"Your pickup location":(preview?"You · sample pickup":"Pickup");
  const pickupReached = ["arrived_pickup","picked_up","en_route_hospital","arrived_hospital","handed_off"].includes(trip?.status);
  if (!pickupReached) {
  const pin=L.marker(pickupPoint,{icon:marker("pickup","●"),draggable:!trip&&!!onPickup}).addTo(layers.current).bindTooltip(tooltip(pinTitle),{permanent:true,direction:"bottom"});
   pin.on("dragend",()=>{const p=pin.getLatLng();onPickup?.({lat:p.lat,lng:p.lng})});
  }
  if (!trip && onPickup) map.current.off("click").on("click", event => onPickup({lat:event.latlng.lat,lng:event.latlng.lng}));
  const routePoints = demo?.payload?.coordinates?.map(([lng,lat])=>[lat,lng]) || roadRoute;
  const routeLine = routePoints ? L.polyline(routePoints,{color:"#3474ed",weight:5}).addTo(layers.current) : null;

  if(trip) {
   const bounds=pickupReached ? [] : [pickupPoint];
   if(valid(trip?.ambulance?.location?.coordinates)) {
    if (!vehicleMarker.current) {
      vehicleMarker.current = L.marker(vehicle,{icon:marker("vehicle","🚑")}).addTo(map.current).bindTooltip(tooltip(trip.ambulance.vehicleNumber||"Ambulance"),{permanent:true,direction:"top"});
    }
    vehicleMarker.current.setTooltipContent(tooltip(trip.ambulance.vehicleNumber||"Ambulance"));
    cancelAnimationFrame(motion.current);
    const from=vehicleMarker.current.getLatLng(), started=performance.now();
    const move=now=>{
      const activeDemo = demo && ["en_route","en_route_hospital"].includes(trip.status);
      const progress=Math.min(1,(now-started)/2500);
      let position=[from.lat+(vehicle[0]-from.lat)*progress,from.lng+(vehicle[1]-from.lng)*progress];
      if (demo && routePoints?.length > 1) {
        const elapsed = Math.max(0,Math.min(1,(Date.now()-new Date(demo.at).getTime())/demo.payload.durationMs));
        const fraction = activeDemo ? elapsed : 1;
        const offset = fraction * (routePoints.length-1);
        const index = Math.min(Math.floor(offset),routePoints.length-2);
        position = routePoints[index].map((value,axis)=>value+(routePoints[index+1][axis]-value)*(offset-index));
        routeLine?.setLatLngs(fraction >= 1 ? [] : [position,...routePoints.slice(index+1)]);
      } else if (routePoints?.length > 1) {
        let nearest=0,distance=Infinity;
        for(let index=0;index<routePoints.length;index++){
          const delta=(routePoints[index][0]-position[0])**2+(routePoints[index][1]-position[1])**2;
          if(delta<distance){distance=delta;nearest=index;}
        }
        routeLine?.setLatLngs([position,...routePoints.slice(nearest+1)]);
      }
      vehicleMarker.current?.setLatLng(position);
      if(activeDemo || progress<1)motion.current=requestAnimationFrame(move);
    };
    motion.current=requestAnimationFrame(move);
    bounds.push(vehicle);
   }
   if(valid(destination?.location?.coordinates)){
    L.marker(hospital,{icon:marker("hospital","H")}).addTo(layers.current).bindTooltip(tooltip(destination.name + (trip.hospital ? "" : " · request pending")),{permanent:true,direction:"bottom"});
    bounds.push(hospital);
   }
   if (initializeView && bounds.length) map.current.fitBounds(L.latLngBounds(bounds).pad(.25),{maxZoom:13, animate:false});
  } else if(isRealPickup) {
   if (initializeView) map.current.flyTo(pickupPoint, 15, { duration: 0.8 });
  } else if(preview) {
   const bounds=[pickupPoint,vehicle,hospital];
   L.marker(vehicle,{icon:marker("vehicle","🚑")}).addTo(layers.current).bindTooltip(tooltip("ALS-03 · sample ambulance"),{permanent:true,direction:"top"});
   L.marker(hospital,{icon:marker("hospital","H")}).addTo(layers.current).bindTooltip(tooltip("H4 – AIIMS · sample"),{permanent:true,direction:"bottom"});
   L.polyline([pickupPoint,[28.64,77.163],vehicle,[28.62,77.19],[28.59,77.19],hospital],{color:"#3474ed",weight:4,dashArray:"8 7"}).addTo(layers.current);
   if (initializeView && bounds.length) map.current.fitBounds(L.latLngBounds(bounds).pad(.25),{maxZoom:13, animate:false});
  } else {
   if (initializeView) map.current.setView(pickupPoint, 13);
  }
 },[trip,pickup,preview,onPickup,roadRoute]);
 return <section className="sahay-map" aria-label="Pickup, ambulance and hospital map">
  <div ref={container} className="sahay-map-canvas"/>
  {trip && <button type="button" className="sahay-button sahay-map-route-button" onClick={()=>{
    const coordinates = demo?.payload?.coordinates?.map(([lng,lat])=>[lat,lng]) || roadRoute ||
      [point(routeStart,null),point(routeEnd,null)].filter(Boolean);
    if(coordinates.length)map.current?.fitBounds(L.latLngBounds(coordinates).pad(.2),{maxZoom:16});
  }}>{transport ? "Show hospital route" : "Show pickup route"}</button> }
  <div className="sahay-map-live"><i className={offline||stale?"offline":""}/>{(preview&&!pickup)?"Preview journey":trip?stale?"GPS stale / unavailable":trackingLabel:"Pickup selected"}<span>{offline?"Tiles unavailable":"OSM basemap"}</span></div>
  {offline&&<div className="sahay-map-fallback"><Navigation/><strong>Map tiles unavailable</strong><span>Markers show the last known coordinates. Check your connection.</span></div>}
  <div className="sahay-map-caption">{demo && (demo.payload.road ? "Simulated drive on road route · " : "Simulated direct path · ")}{trip && !demo && (routeError || (roadRoute ? (transport ? "Road route to hospital · " : "Road route to pickup · ") : "Loading road route… "))}{(preview&&!pickup)?"Illustrative route · not live tracking":pickup?"Pickup location set · Drag pin to adjust":"Positions from case records"}</div>
 </section>
}
