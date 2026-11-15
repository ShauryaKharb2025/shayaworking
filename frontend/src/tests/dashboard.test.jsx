/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PatientSOS from "../pages/PatientSOS";
import RolePreview from "../pages/RolePreview";
import AppShell from "../components/AppShell";
const mocks=vi.hoisted(()=>({user:null,get:vi.fn(),post:vi.fn(),patch:vi.fn(),navigate:vi.fn()}));
vi.mock("../context/AuthContext",()=>({useAuth:()=>({user:mocks.user,logout:vi.fn()})}));
vi.mock("../api/axios",()=>({default:{get:mocks.get,post:mocks.post,patch:mocks.patch}}));
vi.mock("react-router-dom",async()=>({...await vi.importActual("react-router-dom"),useNavigate:()=>mocks.navigate}));
vi.mock("../components/JourneyMap",()=>({default:({onPickup,preview})=><div aria-label="Journey map">{preview?"Sample map":"Case map"}{onPickup&&<button onClick={()=>onPickup({lat:28.65,lng:77.15})}>Choose pickup pin</button>}</div>}));
const show=(node)=>(()=>render(<MemoryRouter>{node}</MemoryRouter>))();
beforeEach(()=>{mocks.user=null;mocks.get.mockReset();mocks.post.mockReset();mocks.patch.mockReset();mocks.navigate.mockReset();mocks.get.mockImplementation(async path=>({data:path.endsWith("/journey")?{status:"requested",events:[],highlights:[],observations:[]}: {trips:[]}}))});
afterEach(cleanup);
describe("SOS dashboard",()=>{
 it("labels anonymous sample data and redirects booking to sign-in without posting",()=>{
  show(<PatientSOS/>);
  expect(screen.getByText("Interactive design preview")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Incident Details"})).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Response Timeline"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:/Confirm & Send SOS/}));
  expect(mocks.navigate).toHaveBeenCalledWith("/login");
  expect(mocks.post).not.toHaveBeenCalled();
 });
 it("requires a selected pickup before submitting a signed-in request",async()=>{
  mocks.user={id:"patient",role:"patient"};show(<PatientSOS/>);
  await waitFor(()=>expect(mocks.get).toHaveBeenCalled());
  expect(screen.getByRole("button",{name:/Confirm & Send SOS/}).disabled).toBe(true);
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(true);
  expect(mocks.post).not.toHaveBeenCalled();
 });
 it("requires confirmation before unlocking condition selection",async()=>{
  mocks.user={id:"patient",role:"patient"};show(<PatientSOS/>);
  fireEvent.click(screen.getByRole("button",{name:"Choose pickup pin"}));
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Confirm location"}));
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(false);
  expect(screen.getByRole("button",{name:/Confirm & Send SOS/}).disabled).toBe(true);
 });
 it("submits selected coordinates, symptoms and ambulance preference to the real API",async()=>{
  mocks.user={id:"patient",role:"patient"};
  mocks.post.mockResolvedValue({data:{trip:{_id:"case-1",status:"requested"}}});show(<PatientSOS/>);
  await waitFor(()=>expect(mocks.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button",{name:"Choose pickup pin"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm location"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Critical Condition"}),{target:{value:"cardiac-arrest"}});
  fireEvent.change(screen.getByRole("textbox",{name:/Symptoms/}),{target:{value:"Synthetic chest pain"}});
  fireEvent.click(screen.getByRole("radio",{name:/BLS/}));
  fireEvent.click(screen.getByRole("button",{name:/Confirm & Send SOS/}));
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith("/sos",expect.objectContaining({lat:28.65,lng:77.15,symptoms:["Cardiac Arrest / Acute Coronary Syndrome","Synthetic chest pain"],requestedAmbulanceTier:"BLS"})));
  await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith("/trip/case-1"),{timeout:4000});
 });
 it("invalidates confirmation and condition when the address changes",async()=>{
  mocks.user={id:"patient",role:"patient"};show(<PatientSOS/>);
  fireEvent.click(screen.getByRole("button",{name:"Choose pickup pin"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm location"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Critical Condition"}),{target:{value:"stroke"}});
  fireEvent.change(screen.getByRole("textbox",{name:"Pickup address"}),{target:{value:"Another address"}});
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(true);
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).value).toBe("");
  expect(screen.getByRole("button",{name:/Confirm & Send SOS/}).disabled).toBe(true);
 });
 it("resolves typed locations before confirmation and cancels an active case before reset",async()=>{
  mocks.user={id:"patient",role:"patient"};
  const trip={_id:"active",status:"requested",events:[]};
  let cancelled=false;
  mocks.get.mockImplementation(async path=>({data:path==="/sos"?{trips:cancelled?[]:[trip]}:path==="/sos/active"?{trip}:path.endsWith("/journey")?{status:"requested",events:[],highlights:[],observations:[]}:
    path==="/location/search"?{results:[{lat:28.65,lng:77.15,address:"Confirmed landmark"}]}:{}}));
  mocks.patch.mockImplementation(async()=>{cancelled=true;return{data:{}}});
  show(<PatientSOS/>);
  fireEvent.click(await screen.findByRole("button",{name:"Cancel current & start new request"}));
  await waitFor(()=>expect(mocks.patch).toHaveBeenCalledWith("/dispatch/trip/active/status",{status:"cancelled"}));
  await screen.findByRole("button",{name:"Confirm location"});
  fireEvent.change(screen.getByRole("textbox",{name:"Pickup address"}),{target:{value:"Landmark"}});
  fireEvent.click(screen.getByRole("button",{name:"Confirm location"}));
  fireEvent.click(await screen.findByRole("button",{name:"Confirmed landmark"}));
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Confirm location"}));
  expect(screen.getByRole("combobox",{name:"Critical Condition"}).disabled).toBe(false);
  expect(screen.getByRole("textbox",{name:/Symptoms/}).value).toBe("");
 });
 it("shows the confirmed hospital journey on the patient dashboard",async()=>{
  mocks.user={id:"patient",role:"patient"};
  const trip={_id:"transport",status:"en_route_hospital",hospital:{name:"Receiving Hospital",location:{coordinates:[77.2,28.2]}},ambulance:{vehicleNumber:"ALS-1"},events:[]};
  mocks.get.mockImplementation(async path=>({data:path==="/sos"?{trips:[trip]}:path.endsWith("/journey")?{status:trip.status,events:[],highlights:[],observations:[]}:{trip}}));
  show(<PatientSOS/>);
  expect(await screen.findByRole("heading",{name:"Your ambulance is travelling to hospital"})).toBeTruthy();
  expect(screen.getByRole("region",{name:"Hospital transport"}).textContent).toContain("Receiving Hospital");
 });
 it("shows a non-emergency service limitation instead of creating a booking",()=>{
  show(<PatientSOS/>);fireEvent.click(screen.getByRole("button",{name:/Medicine \/ Medical Help/}));
  expect(screen.getByText(/Medicine delivery and consultations are not available/)).toBeTruthy();
  expect(screen.getByRole("button",{name:/Confirm & Send SOS/}).disabled).toBe(true);
 });
 it("does not substitute preview data when an authenticated API request fails",async()=>{
  mocks.user={id:"patient",role:"patient"};mocks.get.mockRejectedValue(new Error("offline"));show(<PatientSOS/>);
  await screen.findByRole("alert");
  expect(screen.queryByText("SH-CARD-001")).toBeNull();
  expect(screen.getByText("No active case")).toBeTruthy();
  expect(screen.queryByText(/Pre-Fetched Standby Network/)).toBeNull();
 });
 it("allows a patient to cancel an active ambulance request",async()=>{
  window.confirm = () => true;
  mocks.user = { id: "patient", role: "patient" };
  mocks.get.mockImplementation(async (path) => {
    if (path === "/sos") {
      return { data: { trips: [{ _id: "case-99", status: "requested", patientId: "patient" }] } };
    }
    if (path === "/sos/case-99") {
      return { data: { trip: { _id: "case-99", status: "requested", patientId: "patient", events: [] } } };
    }
    if (path.endsWith("/journey")) {
      return { data: { status: "requested", events: [], highlights: [], observations: [] } };
    }
    return { data: {} };
  });
  mocks.patch.mockResolvedValue({ data: { trip: { _id: "case-99", status: "cancelled" } } });
  show(<PatientSOS/>);
  const cancelBtns = await screen.findAllByRole("button", { name: "Cancel current & start new request" });
  expect(cancelBtns.length).toBeGreaterThan(0);
  fireEvent.click(cancelBtns[0]);
  await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/dispatch/trip/case-99/status", { status: "cancelled" }));
 });
});
describe("shared role workspace",()=>{
 it("closes the role drawer on Escape and restores page scrolling",()=>{
  show(<AppShell><p>Workspace</p></AppShell>);
  const menu=screen.getByRole("button",{name:"Toggle navigation"});
  fireEvent.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document,{key:"Escape"});
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  expect(document.body.style.overflow).not.toBe("hidden");
 });
 it("provides all role navigation and toggles notifications",()=>{
  show(<AppShell><p>Workspace</p></AppShell>);
  expect(screen.getByRole("link",{name:"Sahay home"}).querySelector("img").getAttribute("src")).toBe("/sahay-header.svg");
  expect(screen.getByRole("navigation",{name:"Role navigation"}).querySelectorAll("a")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button",{name:"Notifications"}));
  expect(screen.getByText("Sign in to receive updates for your cases.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Close"}));
  expect(screen.queryByText("Sign in to receive updates for your cases.")).toBeNull();
 });
 it("labels unsupported clinical entry and prevents saving",()=>{
  show(<RolePreview role="clinician"/>);
  expect(screen.getByRole("status").textContent).toMatch(/not implemented/);
  expect(screen.getByRole("button",{name:/Save milestone/}).disabled).toBe(true);
 });
 it("exposes sample case details without writing operational records",()=>{
  show(<RolePreview role="dispatcher"/>);
  fireEvent.click(screen.getByRole("button",{name:"Inspect sample case"}));
  expect(screen.getByRole("status").textContent).toMatch(/offers and hospital acceptance are separate/);
  expect(mocks.post).not.toHaveBeenCalled();
 });
});
