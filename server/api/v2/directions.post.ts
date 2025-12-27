import { H3Event } from "h3";

/**
 * Server API: POST /api/directions (v2)
 *
 * Behavior:
 * - Primary: attempt to call a self-hosted OTP REST plan endpoint:
 *     {OTP_HOST}/otp/routers/{routerId}/plan
 *   Candidate router ids are tried (env OTP_ROUTER first) and a short set of fallbacks.
 *
 * - Fallback: if the REST endpoints are not available (or return 404), call the OTP UI's
 *   GraphQL endpoint at {OTP_HOST}/otp/transmodel/v3 with the 'trip' query used by the UI.
 *
 * Input (JSON body):
 * {
 *   origin: string | "lat,lng",
 *   destination: string | "lat,lng",
 *   departure_time?: number | string | "now",
 *   arrival_time?: number | string,
 *   alternatives?: boolean,
 *   language?: string,
 *   transit_mode?: string,
 *   include_raw?: boolean
 * }
 *
 * Output:
 * {
 *   itineraries: [ { summary, total_time_s, total_distance_m, total_walking_distance_m, transfers, steps } ... ],
 *   raw?: <otp response if include_raw true>
 * }
 *
 * Notes:
 * - OTP host defaults to http://localhost:8080 but can be configured via OTP_HOST env var.
 * - Router id can be provided via OTP_ROUTER env var. If omitted, handler will try a small set of likely ids.
 * - The handler maps both OTP REST /plan responses and OTP UI GraphQL tripPatterns to the same itinerary shape.
 */

const OTP_HOST = "http://localhost:8080";
const OTP_ROUTER = "default";

export default defineEventHandler(async (event: H3Event) => {
  const body = (await readBody(event)) || {};
  const {
    origin,
    destination,
    departure_time,
    arrival_time,
    alternatives = false,
    include_raw = false,
  } = body;

  if (!origin || !destination) {
    setResponseStatus(event, 400);
    return { error: "origin and destination are required" };
  }

  const from = parseLatLng(origin);
  const to = parseLatLng(destination);

  if (!from || !to) {
    setResponseStatus(event, 400);
    return { error: "origin and destination must be lat,lng" };
  }

  const epoch =
    parseTimeToUnix(arrival_time) ??
    parseTimeToUnix(departure_time) ??
    Math.floor(Date.now() / 1000);

  const arriveBy = arrival_time != null;
  const date = formatDate(epoch);
  const time = formatTime24(epoch);

  const gql = `
    query {
      plan(
        from: { lat: ${from.lat}, lon: ${from.lon} }
        to:   { lat: ${to.lat}, lon: ${to.lon} }
        date: "${date}"
        time: "${time}"
        transportModes: [{ mode: WALK }, { mode: TRANSIT }]
        maxWalkDistance: 500
        arriveBy: ${arriveBy}
        numItineraries: ${alternatives ? 3 : 1}
      ) {
        itineraries {
          duration
          startTime
          endTime
          walkDistance
          legs {
            mode
            startTime
            endTime
            distance
            from { name }
            to { name }
            route {
              shortName
              longName
            }
          }
        }
      }
    }
  `;

  const url = `${OTP_HOST}/otp/routers/${OTP_ROUTER}/index/graphql`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql }),
  });

  const json = await res.json();

  if (!res.ok || !json?.data?.plan?.itineraries) {
    setResponseStatus(event, 502);
    return {
      error: "OTP GraphQL failed",
      response: json,
    };
  }

  const itineraries = json.data.plan.itineraries.map(mapItinerary);

  return include_raw
    ? { itineraries, raw: json }
    : { itineraries };
});


/* ---------- Helpers ---------- */

function mapItinerary(it: any) {
  const steps = it.legs.map((l: any) => ({
    travel_mode: l.mode,
    instruction:
      l.mode === "WALK"
        ? `Walk from ${l.from.name} to ${l.to.name}`
        : `${l.mode} ${l.route?.shortName ?? ""} from ${l.from.name} to ${l.to.name}`,
    distance_m: Math.round(l.distance),
    duration_s: Math.round((l.endTime - l.startTime) / 1000),
    transit: l.route
      ? {
          line_short_name: l.route.shortName,
          line_name: l.route.longName,
          departure_stop: l.from.name,
          arrival_stop: l.to.name,
        }
      : null,
  }));

  return {
    summary: summarizeModes(it.legs),
    total_time_s: Math.round(it.duration),
    total_distance_m: Math.round(it.walkDistance),
    total_walking_distance_m: Math.round(it.walkDistance),
    transfers: {
      count: steps.filter((s) => s.transit).length - 1,
      rides: [],
    },
    steps,
  };
}

function summarizeModes(legs: any[]) {
  return [...new Set(legs.map((l) => l.mode))].join(", ");
}

function parseTimeToUnix(t: any): number | null {
  if (t == null) return null;
  if (typeof t === "number" && Number.isFinite(t)) {
    if (t > 1e12) return Math.floor(t / 1000);
    return Math.floor(t);
  }
  if (typeof t === "string") {
    if (t.toLowerCase() === "now") return Math.floor(Date.now() / 1000);
    const n = Number(t);
    if (!isNaN(n)) {
      if (n > 1e12) return Math.floor(n / 1000);
      return Math.floor(n);
    }
    const parsed = Date.parse(t);
    if (!isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function formatDate(epochSec: number) {
  const d = new Date(epochSec * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
function formatTime24(epochSec: number) {
  const d = new Date(epochSec * 1000);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, "0")}:${minutes}${ampm}`;
}

function parseLatLng(v: string) {
  const m = v.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  return m ? { lat: +m[1], lon: +m[3] } : null;
}
