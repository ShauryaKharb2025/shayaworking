/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PatientSOS from "../pages/PatientSOS";
import RolePreview from "../pages/RolePreview";
import AppShell from "../components/AppShell";
const mocks=vi.hoisted(()=>({user:null,get:vi.fn(),post:vi.fn(),navigate:vi.fn()}));
vi.mock("../context/AuthContext",()=>({useAuth:()=>({user:mocks.user,logout:vi.fn()})}));
vi.mock("../api/axios",()=>({default:{get:mocks.get,post:mocks.post}}));
vi.mock("react-router-dom",async()=>({...await vi.importActual("react-router-dom"),useNavigate:()=>mocks.navigate}));
vi.mock("../components/JourneyMap",()=>({default:({onPickup,preview})=><div aria-label="Journey map">{preview?"Sample map":"Case map"}{onPickup&&<button onClick={()=>onPickup({lat:28.65,lng:77.15})}>Choose pickup pin</button>}</div>}));
const show=(node)=>(()=>render(<MemoryRouter>{node}</MemoryRouter>))();
beforeEach(()=>{mocks.user=null;mocks.get.mockReset();mocks.post.mockReset();mocks.navigate.mockReset();mocks.get.mockImplementation(async path=>({data:path.endsWith("/journey")?{status:"requested",events:[],highlights:[],observations:[]}: {trips:[]}}))});
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
  fireEvent.click(screen.getByRole("button",{name:/Confirm & Send SOS/}));
  expect(screen.getByRole("alert").textContent).toMatch(/Share your location/);
  expect(mocks.post).not.toHaveBeenCalled();
 });
 it("requires symptom text after selecting pickup",async()=>{
  mocks.user={id:"patient",role:"patient"};show(<PatientSOS/>);
  fireEvent.click(screen.getByRole("button",{name:"Choose pickup pin"}));
  fireEvent.click(screen.getByRole("button",{name:/Confirm & Send SOS/}));
  expect(screen.getByRole("alert").textContent).toMatch(/Describe the symptoms/);
 });
 it("submits selected coordinates, symptoms and ambulance preference to the real API",async()=>{
  mocks.user={id:"patient",role:"patient"};
  mocks.post.mockResolvedValue({data:{trip:{_id:"case-1",status:"requested"}}});show(<PatientSOS/>);
  await waitFor(()=>expect(mocks.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button",{name:"Choose pickup pin"}));
  fireEvent.change(screen.getByRole("textbox",{name:/Symptoms/}),{target:{value:"Synthetic chest pain"}});
  fireEvent.click(screen.getByRole("radio",{name:/BLS/}));
  fireEvent.click(screen.getByRole("button",{name:/Confirm & Send SOS/}));
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith("/sos",expect.objectContaining({lat:28.65,lng:77.15,symptoms:["Synthetic chest pain"],requestedAmbulanceTier:"BLS"})));
  expect(mocks.navigate).toHaveBeenCalledWith("/trip/case-1");
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
 });
});
describe("shared role workspace",()=>{
 it("provides all role navigation and toggles notifications",()=>{
  show(<AppShell><p>Workspace</p></AppShell>);
  expect(screen.getByRole("link",{name:"Sahay home"}).querySelector("img").getAttribute("src")).toBe("/sahay-header.svg");
  expect(screen.getByRole("navigation",{name:"Role navigation"}).querySelectorAll("a")).toHaveLength(7);
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
