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

  it("detectLocation falls back to IP geolocation when browser geolocation fails", async () => {
    // navigator.geolocation throws/fails
    global.navigator.geolocation = {
      getCurrentPosition: vi.fn((_success, error) => error(new Error("Denied"))),
    };

    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes("ipwho.is")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            latitude: 28.552,
            longitude: 77.554,
            city: "Dadri",
            region: "Uttar Pradesh",
            country: "India",
          }),
        };
      }
      return { ok: false };
    });

    const result = await detectLocation();
    expect(result.lat).toBe(28.552);
    expect(result.lng).toBe(77.554);
    expect(result.address).toBe("Dadri, Uttar Pradesh, India");
  });
});
