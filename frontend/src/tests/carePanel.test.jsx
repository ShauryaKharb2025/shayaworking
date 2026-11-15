/* @vitest-environment jsdom */
import React from "react";
import {test,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
const mocks=vi.hoisted(()=>({patch:vi.fn(),load:vi.fn()}));
vi.mock("../context/AuthContext",()=>({useAuth:()=>({user:{role:"hospital"}})}));
vi.mock("../api/axios",()=>({default:{patch:mocks.patch}}));
vi.mock("../hooks/useCaseResource",()=>({useCaseResource:()=>({load:mocks.load,error:"",data:{
 status:"en_route_hospital",details:{preparation:{revision:2,treatmentRoom:"Earlier room"}},changes:[],observations:[],
 acknowledgement:"confirmed",etaMinutes:4,etaDestination:"hospital",
}})}));
import CaseCarePanel from "../components/CaseCarePanel";
test("hospital edits only its section and retains the draft on a stale-save conflict",async()=>{
 mocks.patch.mockRejectedValue({response:{data:{message:"This section changed. Reload it before saving."}}});
 try{
  render(<CaseCarePanel caseId="case"/>);
  expect(screen.getAllByRole("button",{name:"Edit"})).toHaveLength(1);
  for(const label of ["Emergency entrance","Receiving desk","Assigned receiving nurse","Recorded urgency","Nurse availability","Unresolved staffing needs"]){
   expect(screen.queryByText(label,{exact:true})).toBeNull();
  }
  fireEvent.click(screen.getByRole("button",{name:"Edit"}));
  fireEvent.change(screen.getByLabelText("Allotted treatment room"),{target:{value:"Room 12"}});
  fireEvent.click(screen.getByRole("button",{name:"Save section"}));
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("section changed"));
  expect(screen.getByLabelText("Allotted treatment room").value).toBe("Room 12");
  expect(mocks.patch).toHaveBeenCalledWith("/cases/case/care-details",expect.objectContaining({
   section:"preparation",revision:2,values:expect.objectContaining({treatmentRoom:"Room 12"}),
  }));
 }finally{cleanup();}
});
