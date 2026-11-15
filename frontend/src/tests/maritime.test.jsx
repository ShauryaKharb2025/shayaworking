/* @vitest-environment jsdom */
import React from "react";
import {test,expect,vi,beforeEach,afterEach} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
const state=vi.hoisted(()=>({connection:{status:"disabled"},rows:[],post:vi.fn(),load:vi.fn()}));
vi.mock("../hooks/useCaseResource",()=>({useCaseResource:path=>({data:path==="/maritime/status"?state.connection:{incidents:state.rows},load:state.load,error:""})}));
vi.mock("../api/axios",()=>({default:{post:state.post}}));
import MaritimeAdvisories from "../components/MaritimeAdvisories";
beforeEach(()=>{state.connection={status:"disabled"};state.rows=[];state.post.mockReset();state.load.mockReset();});afterEach(cleanup);
const row=()=>({id:"incident",caseAlias:"case_example",category:"STALE_AMBULANCE_GPS",status:"admin_review_required",createdAt:new Date().toISOString(),trip:{status:"en_route",version:7},evidence:[{id:"evidence",type:"rescue:detected",at:new Date().toISOString()}],audit:[],jobs:[{id:"job",kind:"recovery",status:"done",attempts:1,advisory:{id:"advisory",source:"mock_maritime",reviewStatus:"pending",response:{severity:"high",summary:"Synthetic GPS is stale",rootCauseHypothesis:"Cause unknown",uncertainty:"Local fixture, not live AI",playbook:"FLAG_GPS_COMMUNICATION_FAILURE",evidenceRefs:["evidence"]}}}]});
test("disabled connectivity is explicit and adds no fake advisory",()=>{render(<MaritimeAdvisories/>);expect(screen.getByText(/Maritime is disabled/)).toBeTruthy();expect(screen.getByText("No active RESCUE incidents.")).toBeTruthy();expect(screen.queryByText("Approve validated recovery")).toBeNull();});
test("evidence, mock source and Admin review use the current backend case version",async()=>{
 state.connection={status:"healthy",source:"mock_maritime"};state.rows=[row()];state.post.mockResolvedValue({data:{ok:true}});render(<MaritimeAdvisories/>);
 expect(screen.getAllByText(/mock_maritime/).length).toBeGreaterThan(0);expect(screen.getByText(/Evidence evidence/)).toBeTruthy();
 fireEvent.click(screen.getByText("Approve validated recovery"));await waitFor(()=>expect(state.post).toHaveBeenCalledWith("/maritime/incidents/incident/review",{advisoryId:"advisory",expectedVersion:7,decision:"approve"}));expect(state.load).toHaveBeenCalled();
});
test("closed recovery stays in history with disabled approval and an explanation",()=>{const closed=row();closed.status="resolved";state.rows=[closed];render(<MaritimeAdvisories/>);expect(screen.queryByText("Approve validated recovery")).toBeNull();fireEvent.click(screen.getByRole("checkbox"));expect(screen.getByText("Approve validated recovery").disabled).toBe(true);expect(screen.getByText(/retained for audit only/)).toBeTruthy();});
test("stale-state review errors are shown and refresh current state",async()=>{state.rows=[row()];state.post.mockRejectedValue({response:{data:{message:"Case changed. Refresh and review the current state."}}});render(<MaritimeAdvisories/>);fireEvent.click(screen.getByText("Approve validated recovery"));expect(await screen.findByRole("alert")).toHaveProperty("textContent","Case changed. Refresh and review the current state.");expect(state.load).toHaveBeenCalled();});
test("post-incident review is labelled as acknowledgement rather than a new recovery",()=>{const completed=row();completed.status="resolved";completed.jobs[0].kind="post_incident";completed.jobs[0].advisory.response.playbook="GENERATE_INCIDENT_SUMMARY";state.rows=[completed];render(<MaritimeAdvisories/>);fireEvent.click(screen.getByRole("checkbox"));expect(screen.getByText("Acknowledge final analysis").disabled).toBe(false);expect(screen.queryByText("Approve validated recovery")).toBeNull();});
