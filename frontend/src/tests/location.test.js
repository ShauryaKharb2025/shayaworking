import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectLocation, reverseGeocode } from "../api/location";

describe("location detection & reverse geocoding", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reverseGeocode formats address from BigDataCloud response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locality: "Connaught Place",
        principalSubdivision: "Delhi",
        countryName: "India",
      }),
    });

    const addr = await reverseGeocode(28.63, 77.21);
    expect(addr).toBe("Connaught Place, Delhi, India");
  });

  it("rejects denied GPS without substituting an IP or default location", async () => {
    global.navigator.geolocation = { getCurrentPosition: vi.fn((success,error)=>error(new Error("Denied"))) };
    global.fetch = vi.fn();
    await expect(detectLocation()).rejects.toThrow("fresh GPS");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requests fresh precise GPS and returns its accuracy", async () => {
    const getCurrentPosition = vi.fn(success=>success({coords:{latitude:28.63,longitude:77.21,accuracy:12}}));
    global.navigator.geolocation = {getCurrentPosition};
    global.fetch = vi.fn().mockResolvedValue({ok:true,json:async()=>({city:"Delhi"})});
    const result = await detectLocation();
    expect(result).toMatchObject({lat:28.63,lng:77.21,accuracy:12});
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function),expect.any(Function),{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
  it("rejects broad GPS estimates", async () => {
    global.navigator.geolocation = {getCurrentPosition:vi.fn(success=>success({coords:{latitude:28,longitude:77,accuracy:5000}}))};
    await expect(detectLocation()).rejects.toThrow("accuracy is too low");
  });
});


it("refines a coarse first location and clears the GPS watcher",async()=>{
 const clearWatch=vi.fn();
 global.navigator.geolocation={getCurrentPosition:vi.fn(success=>success({coords:{latitude:28,longitude:77,accuracy:5000}})),watchPosition:vi.fn(success=>{success({coords:{latitude:28.63,longitude:77.21,accuracy:20}});return 42;}),clearWatch};
 global.fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({city:"Delhi"})});
 expect(await detectLocation()).toMatchObject({lat:28.63,lng:77.21,accuracy:20});expect(clearWatch).toHaveBeenCalledWith(42);
});
