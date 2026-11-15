/* @vitest-environment jsdom */
import React from "react";
import {test,expect,vi} from "vitest";
import {render,cleanup} from "@testing-library/react";
const state=vi.hoisted(()=>({fitBounds:vi.fn(),setView:vi.fn(),flyTo:vi.fn(),setLatLng:vi.fn(),setLatLngs:vi.fn()}));
vi.mock("leaflet",()=>{
 const chain=()=>{const value={clearLayers:vi.fn(),addTo:()=>value,bindTooltip:()=>value,setTooltipContent:()=>value,on:()=>value,getLatLng:()=>({lat:28,lng:77}),setLatLngs:state.setLatLngs,setLatLng:state.setLatLng,remove:vi.fn()};return value};
 return {default:{
  map:()=>{const value={setView:(...args)=>{state.setView(...args);return value},fitBounds:state.fitBounds,flyTo:state.flyTo,invalidateSize:vi.fn(),stop:vi.fn(),remove:vi.fn(),off:()=>value,on:()=>value};return value},
  tileLayer:()=>chain(),control:{zoom:()=>chain()},layerGroup:()=>({...chain(),clearLayers:vi.fn()}),
  circleMarker:()=>chain(),circle:()=>chain(),divIcon:vi.fn(),marker:()=>chain(),polyline:()=>chain(),latLngBounds:()=>({pad:()=>({})}),
 }};
});
import JourneyMap from "../components/JourneyMap";

test("an interrupted mock GPS holds the last reported position instead of animating to the destination",()=>{
 vi.clearAllMocks();let frame;
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("requestAnimationFrame",vi.fn(callback=>{frame=callback;return 1}));vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const at=new Date(Date.now()-30000).toISOString();
 const trip={_id:"interrupted",status:"en_route",pickupLocation:{coordinates:[78,29]},ambulance:{location:{coordinates:[77,28]},lastPingAt:at},events:[{type:"journey:demo_drive_started",at,payload:{coordinates:[[77,28],[78,29]],durationMs:60000}},{type:"simulation:gps_interrupted",at:new Date().toISOString(),payload:{until:new Date(Date.now()+60000).toISOString()}}]};
 try{render(<JourneyMap trip={trip}/>);frame(performance.now()+3000);expect(state.setLatLng).toHaveBeenLastCalledWith([28,77]);}
 finally{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();}
});
test("GPS updates move the marker without resetting user zoom or pan",()=>{
 let frame;
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("requestAnimationFrame",vi.fn(callback=>{frame=callback;return 1}));
 vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const trip={_id:"case",status:"en_route",pickupLocation:{coordinates:[77.01,28.01]},ambulance:{_id:"vehicle",vehicleNumber:"ALS-1",location:{coordinates:[77,28]},lastPingAt:new Date().toISOString()},events:[]};
 try{
  const {rerender}=render(<JourneyMap trip={trip}/>);
  expect(state.fitBounds).toHaveBeenCalledTimes(1);
  const initialViews=state.setView.mock.calls.length;
  rerender(<JourneyMap trip={{...trip,ambulance:{...trip.ambulance,location:{coordinates:[77.005,28.005]}}}}/>);
  frame(performance.now()+3000);
  expect(state.setLatLng).toHaveBeenLastCalledWith([28.005,77.005]);
  expect(state.fitBounds).toHaveBeenCalledTimes(1);
  expect(state.setView).toHaveBeenCalledTimes(initialViews);
  expect(state.flyTo).not.toHaveBeenCalled();
 } finally{cleanup();vi.unstubAllGlobals();}
});



test("demo animation erases the travelled route behind the moving ambulance",()=>{
 vi.clearAllMocks();
 let frame;
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("requestAnimationFrame",vi.fn(callback=>{frame=callback;return 1}));
 vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const coordinates=[[77,28],[77.01,28.01],[77.02,28.02],[77.03,28.03]];
 const trip={_id:"demo",status:"en_route",pickupLocation:{coordinates:coordinates[3]},ambulance:{_id:"vehicle",location:{coordinates:coordinates[0]}},events:[{type:"journey:demo_drive_started",at:new Date(Date.now()-30000).toISOString(),payload:{coordinates,durationMs:60000}}]};
 try {
  render(<JourneyMap trip={trip}/>);
  frame(performance.now()+100);
  const remaining=state.setLatLngs.mock.calls.at(-1)[0];
  expect(remaining.length).toBe(3);
  expect(remaining.at(-1)).toEqual([28.03,77.03]);
  expect(state.setLatLng.mock.calls.at(-1)[0][0]).toBeGreaterThan(28.01);
  expect(state.fitBounds).toHaveBeenCalledTimes(1);
 }finally{cleanup();vi.unstubAllGlobals();}
});


test("completed handoff keeps the ambulance at the hospital destination",()=>{
 vi.clearAllMocks();let frame;
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 vi.stubGlobal("requestAnimationFrame",vi.fn(callback=>{frame=callback;return 1}));
 vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const trip={_id:"completed",status:"handed_off",pickupLocation:{coordinates:[77,28]},hospital:{name:"Receiving hospital",location:{coordinates:[78,29]}},ambulance:{location:{coordinates:[78,29]}},events:[{type:"journey:demo_hospital_drive_started",at:new Date().toISOString(),payload:{coordinates:[[77,28],[78,29]],durationMs:60000}}]};
 try{render(<JourneyMap trip={trip}/>);frame(performance.now()+3000);expect(state.setLatLng).toHaveBeenLastCalledWith([29,78]);}
 finally{cleanup();vi.unstubAllGlobals();}
});


test("fleet position refreshes preserve administrator zoom",async()=>{
 vi.clearAllMocks();vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 const {default:FleetMap}=await import("../components/FleetMap");
 const fleet=[{vehicleNumber:"ALS-1",location:{coordinates:[77,28]}}];
 try{const {rerender}=render(<FleetMap ambulances={fleet}/>);rerender(<FleetMap ambulances={[{...fleet[0],location:{coordinates:[77.01,28.01]}}]}/>);expect(state.fitBounds).toHaveBeenCalledTimes(1);}
 finally{cleanup();vi.unstubAllGlobals();}
});
