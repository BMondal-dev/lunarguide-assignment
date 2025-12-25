import { H3Event } from "h3";

/**
 * Server API: POST /api/directions
 *
 * Accepts JSON body:
 * {
 *   origin: string | "lat,lng",
 *   destination: string | "lat,lng",
 *   departure_time?: number | string | "now",
 *   arrival_time?: number | string,
 *   alternatives?: boolean,
 *   language?: string,
 *   transit_mode?: string (e.g. "bus|subway|train|tram|rail"),
 *   include_raw?: boolean
 * }
 *
 * Returns:
 * {
 *   itineraries: [ { summary, total_time_s, total_distance_m, total_walking_distance_m, transfers, steps } ... ],
 *   raw?: <google response if include_raw true>
 * }
 *
 * Notes:
 * - This handler uses the Google Directions API. Set GOOGLE_MAPS_API_KEY in the environment.
 * - departure_time / arrival_time may be provided as epoch seconds, ISO string, or numeric string.
 */

export default defineEventHandler(async (event: H3Event) => {
  const body = (await readBody(event)) || {};
  const {
    origin,
    destination,
    departure_time,
    arrival_time,
    alternatives = false,
    language = "en",
    transit_mode,
    include_raw = false,
  } = body;

  if (!origin || !destination) {
    setResponseStatus(event, 400);
    return { error: "origin and destination are required" };
  }

  const config = useRuntimeConfig();
  const apiKey = config.googleMapsApiKey || "";
  if (!apiKey) {
    setResponseStatus(event, 500);
    return {
      error:
        "Missing Google Maps API key. Set GOOGLE_MAPS_API_KEY in environment.",
    };
  }

  const params = new URLSearchParams();
  params.set("origin", String(origin));
  params.set("destination", String(destination));
  params.set("mode", "transit");
  params.set("key", apiKey);
  params.set("language", language);
  if (alternatives) params.set("alternatives", "true");
  if (transit_mode) params.set("transit_mode", String(transit_mode));

  // Google expects departure_time or arrival_time as seconds since epoch or the string 'now'
  if (departure_time) {
    const ts = parseTimeToUnix(departure_time);
    params.set("departure_time", ts ? String(ts) : "now");
  } else if (arrival_time) {
    const ts = parseTimeToUnix(arrival_time);
    if (ts) params.set("arrival_time", String(ts));
  } else {
    // default to now for transit requests
    params.set("departure_time", "now");
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err: any) {
    setResponseStatus(event, 502);
    return {
      error: "Failed to fetch directions from Google",
      details: String(err),
    };
  }

  if (!res.ok) {
    setResponseStatus(event, 502);
    return {
      error: "Failed to fetch directions from Google",
      status: res.status,
      statusText: res.statusText,
    };
  }

  const data = await res.json().catch((e) => {
    setResponseStatus(event, 502);
    return {
      error: "Failed to parse response from Google",
      details: String(e),
    };
  });

  if (!data || data.status !== "OK") {
    // pass along Google's status and message for easier debugging
    setResponseStatus(event, 400);
    return {
      error: "Google Directions API did not return routes",
      google_status: data?.status ?? "NO_RESPONSE",
      details: data?.error_message ?? null,
      raw: data,
    };
  }

  const itineraries = (data.routes || []).map((route: any) => {
    const legs = route.legs || [];
    // For point-to-point requests typically a single leg; if multiple, combine them
    const combinedLeg = combineLegs(legs);

    const steps = (combinedLeg.steps || []).map((step: any, idx: number) => {
      const travel_mode =
        step.travel_mode || (step.transit_details ? "TRANSIT" : "UNKNOWN");
      return {
        travel_mode,
        instruction: step.html_instructions || null,
        distance_m: step.distance?.value ?? null,
        duration_s: step.duration?.value ?? null,
        start_location: step.start_location ?? null,
        end_location: step.end_location ?? null,
        transit: step.transit_details
          ? sanitizeTransitDetails(step.transit_details)
          : null,
      };
    });

    // Compute aggregated info: total walking distance, transfer points, total time/distance already in combinedLeg
    let total_walk_m = 0;
    const transitRides: any[] = [];
    steps.forEach((s: any) => {
      if (s.travel_mode === "WALKING" && typeof s.distance_m === "number")
        total_walk_m += s.distance_m;
      if (s.transit) {
        transitRides.push(s.transit);
      }
    });

    // Build transfer points (where one transit ride ends and another begins)
    const transfers = buildTransfersFromRides(transitRides);

    return {
      summary: route.summary || null,
      total_time_s: combinedLeg.duration?.value ?? null,
      total_distance_m: combinedLeg.distance?.value ?? null,
      total_walking_distance_m: total_walk_m,
      transfers,
      steps,
    };
  });

  const response: any = { itineraries };
  if (include_raw) response.raw = data;

  return response;
});

/* Helpers */

function parseTimeToUnix(t: any): number | null {
  if (t == null) return null;
  if (typeof t === "number" && Number.isFinite(t)) {
    // assume seconds if reasonably small, otherwise ms
    if (t > 1e12) return Math.floor(t / 1000); // milliseconds -> seconds
    return Math.floor(t);
  }
  if (typeof t === "string") {
    if (t.toLowerCase() === "now") return Math.floor(Date.now() / 1000);
    // try numeric string
    const n = Number(t);
    if (!isNaN(n)) {
      if (n > 1e12) return Math.floor(n / 1000);
      return Math.floor(n);
    }
    // try ISO parse
    const parsed = Date.parse(t);
    if (!isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function sanitizeTransitDetails(details: any) {
  if (!details) return null;
  const line = details.line || {};
  const vehicle = line.vehicle || {};
  return {
    line_short_name: line.short_name ?? null,
    line_name: line.name ?? null,
    vehicle_type: vehicle.type ?? null,
    num_stops: details.num_stops ?? null,
    departure_stop: details.departure_stop?.name ?? null,
    arrival_stop: details.arrival_stop?.name ?? null,
    departure_time: details.departure_time?.text ?? null,
    arrival_time: details.arrival_time?.text ?? null,
    stop_sequence: extractStopSequence(details),
  };
}

function extractStopSequence(details: any) {
  // Google transit_details may include a `headsign` and a `line` with agencies.
  // There is no standardized full stop list in the directions response, so return minimal info.
  return {
    headsign: details.headsign ?? null,
    headway: details.headway ?? null,
  };
}

function buildTransfersFromRides(rides: any[]) {
  // Each ride represents a contiguous transit segment.
  // Transfers occur between consecutive rides.
  const transfers: any[] = [];
  for (let i = 0; i < rides.length; i++) {
    const ride = rides[i];
    transfers.push({
      ride_index: i,
      line: ride.line_short_name ?? ride.line_name ?? null,
      vehicle: ride.vehicle_type ?? null,
      departure_stop: ride.departure_stop ?? null,
      arrival_stop: ride.arrival_stop ?? null,
      departure_time: ride.departure_time ?? null,
      arrival_time: ride.arrival_time ?? null,
      num_stops: ride.num_stops ?? null,
    });
  }
  // Also compute explicit transfer points between rides (where a passenger would change)
  const change_points: any[] = [];
  for (let i = 0; i < rides.length - 1; i++) {
    const current = rides[i];
    const next = rides[i + 1];
    change_points.push({
      from_line: current.line_short_name ?? current.line_name ?? null,
      to_line: next.line_short_name ?? next.line_name ?? null,
      station: current.arrival_stop ?? null,
      arrive_time: current.arrival_time ?? null,
      depart_time_next: next.departure_time ?? null,
      estimated_walk_distance_m: null, // not directly available from Google per-ride info
    });
  }

  return { rides: transfers, changes: change_points };
}

function combineLegs(legs: any[]) {
  if (!legs || legs.length === 0) {
    return { steps: [], duration: { value: 0 }, distance: { value: 0 } };
  }
  if (legs.length === 1) return legs[0];

  // Combine legs into a single aggregate leg
  const combined: any = {
    steps: [],
    duration: { value: 0 },
    distance: { value: 0 },
  };
  for (const leg of legs) {
    if (Array.isArray(leg.steps)) combined.steps.push(...leg.steps);
    if (leg.duration?.value) combined.duration.value += leg.duration.value;
    if (leg.distance?.value) combined.distance.value += leg.distance.value;
  }
  return combined;
}
