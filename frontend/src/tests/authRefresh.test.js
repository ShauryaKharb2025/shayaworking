// @vitest-environment jsdom
import {test,expect,vi,afterEach} from "vitest";
import axios from "axios";
import api from "../api/axios";
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();});
test("concurrent expired-token requests share one refresh and both retry",async()=>{
 localStorage.setItem("sahay_access_token","expired");
 const refresh=vi.spyOn(axios,"post").mockImplementation(async()=>{
  await new Promise(r=>setTimeout(r,10));return {data:{accessToken:"renewed"}};
 });
 const adapter=async config=>{
  if(!config._retry)throw {config,response:{status:401}};
  return {data:{ok:true},status:200,config,headers:{}};
 };
 const results=await Promise.all([api.get("/one",{adapter}),api.get("/two",{adapter})]);
 expect(refresh).toHaveBeenCalledTimes(1);
 expect(results.every(result=>result.data.ok)).toBe(true);
 expect(localStorage.getItem("sahay_access_token")).toBe("renewed");
});
