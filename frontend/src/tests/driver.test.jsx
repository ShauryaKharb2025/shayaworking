/* @vitest-environment jsdom */
import React from "react";
import {test,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import DriverDashboard from "../pages/DriverDashboard";
const mocks=vi.hoisted(()=>({get:vi.fn(),patch:vi.fn(),post:vi.fn(),socket:{emit:vi.fn(),on:vi.fn(),off:vi.fn()}}));
vi.mock("../api/axios",()=>({default:{get:mocks.get,patch:mocks.patch,post:mocks.post}}));
vi.mock("../api/socket",()=>({connectSocket:()=>mocks.socket}));
vi.mock("../components/JourneyMap",()=>({default:()=> <div>Journey map</div>}));
test("accepting a local demo pickup starts the shared nearby drive",async()=>{
 const ambulance={_id:"vehicle",vehicleNumber:"ALS-1",tier:"ALS",status:"dispatched"};
 const trip={_id:"trip",status:"offered",patient:{name:"Assigned patient"},pickupLocation:{coordinates:[77,28]},events:[]};
 mocks.get.mockResolvedValue({data:{ambulance,trip}});
 mocks.post.mockResolvedValue({data:{ok:true}});
 mocks.patch.mockResolvedValue({data:{trip:{...trip,status:"dispatched"}}});
 const watchPosition=vi.fn(()=>42),clearWatch=vi.fn();
 Object.defineProperty(navigator,"geolocation",{configurable:true,value:{watchPosition,clearWatch}});
 try {
  render(<DriverDashboard/>);
  await screen.findByText("Assigned patient");
  expect(screen.getByRole("region",{name:"Trip actions"}).compareDocumentPosition(screen.getByText("Journey map")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Continue to pickup · mock GPS"}));
  await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith("/dispatch/trip/trip/demo-drive"));
  expect(watchPosition).not.toHaveBeenCalled();
  expect(mocks.patch).not.toHaveBeenCalled();
 } finally {cleanup();}
});
