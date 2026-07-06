/**
 * Address validation / canonicalization. Server-only.
 *
 * Primary: Google Address Validation API (addressvalidation.googleapis.com).
 * Fallback: Google Geocoding API (maps.googleapis.com/maps/api/geocode).
 * Both are keyed by the server-side `google_maps_api_key` secret.
 *
 * The browser-side Maps JS key (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) is a SEPARATE
 * referrer-restricted key and is never used here.
 */
import { requireSecret } from "../secrets";

export interface ValidatedAddress {
  formattedAddress: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  /** high | medium | low — drives the inline UI warning. */
  confidence: "high" | "medium" | "low";
  verdict: string;
  /** Which Google API produced this result. */
  source: "address_validation" | "geocoding";
  raw: unknown;
}

export function mapsUrl(placeId: string | null, lat: number | null, lng: number | null): string {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeId)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=`;
}

// Used by tests and callers that may inject a fetch implementation.
type FetchLike = typeof fetch;

function pickComponent(components: any[], type: string, useShort = false): string | null {
  const c = components.find((x) => (x.types || []).includes(type) || (x.componentType === type));
  if (!c) return null;
  return useShort ? c.short_name ?? c.shortText ?? null : c.long_name ?? c.componentName?.text ?? null;
}

/** Parse Address Validation API response into our canonical shape. */
function fromAddressValidation(data: any): ValidatedAddress {
  const result = data.result || {};
  const address = result.address || {};
  const geocode = result.geocode || {};
  const verdict = result.verdict || {};
  const comps: any[] = address.addressComponents || [];

  const get = (type: string) => {
    const c = comps.find((x) => x.componentType === type);
    return c?.componentName?.text ?? null;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ") || null;

  const lat = geocode.location?.latitude ?? null;
  const lng = geocode.location?.longitude ?? null;
  const placeId = geocode.placeId ?? null;

  // Confidence: granularity + completeness drive the verdict.
  const granularity = verdict.validationGranularity || verdict.geocodeGranularity || "OTHER";
  const complete = verdict.addressComplete === true;
  let confidence: ValidatedAddress["confidence"] = "low";
  if ((granularity === "PREMISE" || granularity === "SUB_PREMISE") && complete) confidence = "high";
  else if (granularity === "PREMISE" || granularity === "ROUTE") confidence = "medium";

  return {
    formattedAddress: address.formattedAddress || "",
    addressLine1: line1,
    addressLine2: get("subpremise"),
    city: get("locality") || get("postal_town"),
    state: get("administrative_area_level_1"),
    postalCode: get("postal_code"),
    country: get("country"),
    placeId,
    latitude: lat,
    longitude: lng,
    googleMapsUrl: mapsUrl(placeId, lat, lng),
    confidence,
    verdict: granularity,
    source: "address_validation",
    raw: data,
  };
}

/** Parse Geocoding API response into our canonical shape. */
function fromGeocoding(data: any): ValidatedAddress {
  const r = (data.results || [])[0] || {};
  const comps: any[] = r.address_components || [];
  const streetNumber = pickComponent(comps, "street_number");
  const route = pickComponent(comps, "route");
  const line1 = [streetNumber, route].filter(Boolean).join(" ") || null;
  const lat = r.geometry?.location?.lat ?? null;
  const lng = r.geometry?.location?.lng ?? null;
  const placeId = r.place_id ?? null;

  // location_type ROOFTOP => high confidence; RANGE_INTERPOLATED => medium; else low.
  const lt = r.geometry?.location_type || "";
  const confidence: ValidatedAddress["confidence"] =
    lt === "ROOFTOP" ? "high" : lt === "RANGE_INTERPOLATED" ? "medium" : "low";

  return {
    formattedAddress: r.formatted_address || "",
    addressLine1: line1,
    addressLine2: pickComponent(comps, "subpremise"),
    city: pickComponent(comps, "locality") || pickComponent(comps, "postal_town"),
    state: pickComponent(comps, "administrative_area_level_1", true),
    postalCode: pickComponent(comps, "postal_code"),
    country: pickComponent(comps, "country"),
    placeId,
    latitude: lat,
    longitude: lng,
    googleMapsUrl: mapsUrl(placeId, lat, lng),
    confidence,
    verdict: lt || "UNKNOWN",
    source: "geocoding",
    raw: data,
  };
}

/**
 * Validate a free-text address. Tries Address Validation first; on a non-OK response
 * or empty result falls back to Geocoding. Throws if both fail or no result is found.
 */
export async function validateAddress(
  address: string,
  deps: { fetchImpl?: FetchLike; apiKey?: string } = {},
): Promise<ValidatedAddress> {
  const trimmed = (address || "").trim();
  if (!trimmed) throw new Error("address is required");
  const doFetch = deps.fetchImpl || fetch;
  const apiKey = deps.apiKey || (await requireSecret("mapsApiKey"));

  // 1) Address Validation API
  try {
    const res = await doFetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: { addressLines: [trimmed] } }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.result) return fromAddressValidation(data);
    }
  } catch {
    // fall through to geocoding
  }

  // 2) Geocoding API fallback
  const geoRes = await doFetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&key=${encodeURIComponent(apiKey)}`,
  );
  if (!geoRes.ok) {
    throw new Error(`Geocoding request failed: ${geoRes.status}`);
  }
  const geoData = await geoRes.json();
  if (geoData.status !== "OK" || !(geoData.results || []).length) {
    throw new Error(`Address not found (geocoding status: ${geoData.status || "UNKNOWN"})`);
  }
  return fromGeocoding(geoData);
}
