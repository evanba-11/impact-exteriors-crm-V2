import { describe, it, expect, vi } from "vitest";
import { validateAddress, mapsUrl } from "./addressValidation";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const AV_SUCCESS = {
  result: {
    verdict: { validationGranularity: "PREMISE", addressComplete: true },
    address: {
      formattedAddress: "123 Main St, Greeley, CO 80631, USA",
      addressComponents: [
        { componentType: "street_number", componentName: { text: "123" } },
        { componentType: "route", componentName: { text: "Main St" } },
        { componentType: "locality", componentName: { text: "Greeley" } },
        { componentType: "administrative_area_level_1", componentName: { text: "CO" } },
        { componentType: "postal_code", componentName: { text: "80631" } },
        { componentType: "country", componentName: { text: "USA" } },
      ],
    },
    geocode: { location: { latitude: 40.4233, longitude: -104.7091 }, placeId: "PLACE123" },
  },
};

const GEO_SUCCESS = {
  status: "OK",
  results: [{
    formatted_address: "123 Main St, Greeley, CO 80631, USA",
    place_id: "GEOPLACE9",
    geometry: { location: { lat: 40.42, lng: -104.7 }, location_type: "ROOFTOP" },
    address_components: [
      { types: ["street_number"], long_name: "123", short_name: "123" },
      { types: ["route"], long_name: "Main St", short_name: "Main St" },
      { types: ["locality"], long_name: "Greeley", short_name: "Greeley" },
      { types: ["administrative_area_level_1"], long_name: "Colorado", short_name: "CO" },
      { types: ["postal_code"], long_name: "80631", short_name: "80631" },
      { types: ["country"], long_name: "United States", short_name: "US" },
    ],
  }],
};

describe("mapsUrl", () => {
  it("prefers place_id", () => {
    expect(mapsUrl("ABC", 1, 2)).toContain("query_place_id=ABC");
  });
  it("falls back to lat,lng", () => {
    expect(mapsUrl(null, 1.5, -2.5)).toContain("query=1.5,-2.5");
  });
});

describe("validateAddress", () => {
  it("parses Address Validation API success with high confidence", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(AV_SUCCESS));
    const r = await validateAddress("123 Main St", { fetchImpl, apiKey: "k" });
    expect(r.source).toBe("address_validation");
    expect(r.confidence).toBe("high");
    expect(r.placeId).toBe("PLACE123");
    expect(r.city).toBe("Greeley");
    expect(r.state).toBe("CO");
    expect(r.postalCode).toBe("80631");
    expect(r.latitude).toBe(40.4233);
    expect(r.googleMapsUrl).toContain("query_place_id=PLACE123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to Geocoding when Address Validation is not ok", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 403))
      .mockResolvedValueOnce(jsonResponse(GEO_SUCCESS));
    const r = await validateAddress("123 Main St", { fetchImpl, apiKey: "k" });
    expect(r.source).toBe("geocoding");
    expect(r.confidence).toBe("high"); // ROOFTOP
    expect(r.placeId).toBe("GEOPLACE9");
    expect(r.state).toBe("CO"); // short_name
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to Geocoding when Address Validation throws", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse(GEO_SUCCESS));
    const r = await validateAddress("123 Main St", { fetchImpl, apiKey: "k" });
    expect(r.source).toBe("geocoding");
  });

  it("throws when geocoding returns ZERO_RESULTS", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 400))
      .mockResolvedValueOnce(jsonResponse({ status: "ZERO_RESULTS", results: [] }));
    await expect(validateAddress("nowhere", { fetchImpl, apiKey: "k" })).rejects.toThrow(/Address not found/);
  });

  it("requires a non-empty address", async () => {
    await expect(validateAddress("   ", { fetchImpl: vi.fn(), apiKey: "k" })).rejects.toThrow(/required/);
  });
});
