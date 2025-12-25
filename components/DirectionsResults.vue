<template>
  <section class="directions-results card" v-if="response">
    <header class="card-header">
      <h3 class="title">Itineraries</h3>
      <p class="subtitle" v-if="response.error">Error: {{ response.error }}</p>
    </header>

    <div v-if="response.itineraries && response.itineraries.length">
      <div
        v-for="(it, idx) in response.itineraries"
        :key="`itinerary-${idx}`"
        class="itinerary"
      >
        <div class="it-header">
          <strong>Itinerary {{ idx + 1 }}</strong>
          <span class="it-summary">{{ it.summary || 'No summary' }}</span>
        </div>

        <div class="it-meta">
          <span>Total time: {{ doFormatSeconds(it.total_time_s) }}</span>
          <span> • Distance: {{ it.total_distance_m ?? '-' }} m</span>
          <span> • Walking: {{ it.total_walking_distance_m ?? '-' }} m</span>
        </div>

        <div
          v-if="it.transfers && it.transfers.rides && it.transfers.rides.length"
          class="section"
        >
          <h4 class="section-title">Rides</h4>
          <ul class="list rides">
            <li v-for="(r, rIdx) in it.transfers.rides" :key="`ride-${rIdx}`">
              <strong>{{ r.line || r.line_name || 'Line' }}</strong>
              <span class="muted">({{ r.vehicle ?? '-' }})</span>
              <span class="muted"> — {{ r.departure_stop ?? '-' }} → {{ r.arrival_stop ?? '-' }}</span>
              <span class="muted"> [{{ r.departure_time ?? '-' }} → {{ r.arrival_time ?? '-' }}]</span>
              <span v-if="r.num_stops != null" class="muted"> • stops: {{ r.num_stops }}</span>
            </li>
          </ul>
        </div>

        <div
          v-if="it.transfers && it.transfers.changes && it.transfers.changes.length"
          class="section"
        >
          <h4 class="section-title">Change points</h4>
          <ul class="list changes">
            <li v-for="(c, cIdx) in it.transfers.changes" :key="`change-${cIdx}`">
              {{ c.from_line ?? '-' }} → {{ c.to_line ?? '-' }} at {{ c.station ?? '-' }}
              <span class="muted"> (arrive: {{ c.arrive_time ?? '-' }}, depart: {{ c.depart_time_next ?? '-' }})</span>
            </li>
          </ul>
        </div>

        <details class="steps" :open="false">
          <summary>Steps ({{ it.steps?.length ?? 0 }})</summary>
          <ol>
            <li
              v-for="(s, sIdx) in it.steps"
              :key="`step-${idx}-${sIdx}`"
              class="step"
            >
              <div class="step-top">
                <span class="badge">{{ s.travel_mode ?? 'UNKNOWN' }}</span>
                <span class="instr" v-html="s.instruction || ''"></span>
              </div>

              <div class="step-meta muted">
                <span>Distance: {{ s.distance_m ?? '-' }} m</span>
                <span> • Duration: {{ doFormatSeconds(s.duration_s) }}</span>
              </div>

              <div v-if="s.transit" class="step-transit">
                <em>Transit:</em>
                <span class="transit-line">{{ s.transit.line_short_name || s.transit.line_name || '-' }}</span>
                <span class="muted">• {{ s.transit.vehicle_type ?? '-' }}</span>
                <span class="muted">• {{ s.transit.departure_stop ?? '-' }} → {{ s.transit.arrival_stop ?? '-' }}</span>
                <span class="muted"> [{{ s.transit.departure_time ?? '-' }} → {{ s.transit.arrival_time ?? '-' }}]</span>
              </div>
            </li>
          </ol>
        </details>
      </div>
    </div>

    <div v-else class="no-results section">
      <p>No itineraries returned.</p>
      <pre v-if="response && response.raw">{{ pretty(response.raw ?? response) }}</pre>
    </div>

    <div v-if="includeRaw && response.raw" class="raw section">
      <h4 class="section-title">Raw API Response</h4>
      <pre>{{ pretty(response.raw) }}</pre>
    </div>
  </section>

  <section v-else class="empty">
    <p>No response to display.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Props:
 * - response: the parsed JSON returned by /api/directions
 * - includeRaw: whether to show raw API response block
 * - formatSeconds: optional function to format seconds; signature (s:number|null) => string
 */
const props = defineProps({
  response: { type: Object as () => any, required: true },
  includeRaw: { type: Boolean, default: false },
  formatSeconds: { type: Function as unknown as () => ((n: number | null) => string) }
})

/**
 * Use provided formatSeconds if available, otherwise fallback to local implementation.
 */
function localFormatSeconds(s: number | null | undefined) {
  if (s == null) return '-'
  const n = Number(s)
  if (!isFinite(n)) return '-'
  if (n < 60) return `${n}s`
  const mins = Math.round(n / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `${h} h ${rem} m` : `${h} h`
}

const doFormatSeconds = (s: number | null | undefined) => {
  if (props.formatSeconds && typeof props.formatSeconds === 'function') {
    try {
      return props.formatSeconds(s ?? null)
    } catch {
      return localFormatSeconds(s ?? null)
    }
  }
  return localFormatSeconds(s ?? null)
}

function pretty(obj: any) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}
</script>

<style scoped>
.card {
  border: 1px solid #e6e9ee;
  border-radius: 10px;
  background: #fff;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(16,24,40,0.04);
  max-width: 920px;
  margin: 1rem auto;
}

.card-header {
  margin-bottom: 0.5rem;
}

.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.subtitle {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.section {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #eef2f6;
}

.itinerary {
  padding: 0.6rem 0;
  border-bottom: 1px solid #f8fafc;
}

.it-header {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}

.it-summary {
  color: #475569;
  margin-left: 0.5rem;
}

.it-meta {
  color: #475569;
  font-size: 0.95rem;
  margin-top: 0.25rem;
}

.list {
  margin: 0.5rem 0;
  padding-left: 1.05rem;
}

.steps {
  margin-top: 0.5rem;
}

.step {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 6px;
  background: #fbfdff;
}

.step-top {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.badge {
  display: inline-block;
  padding: 0.12rem 0.36rem;
  background: #e6eef8;
  color: #0f172a;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 600;
}

.instr {
  font-size: 0.96rem;
}

.muted {
  color: #6b7280;
  font-size: 0.9rem;
}

.step-meta {
  color: #6b7280;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.step-transit {
  margin-top: 0.35rem;
  font-size: 0.9rem;
  color: #0f172a;
}

.transit-line {
  font-weight: 600;
  margin-right: 6px;
}

.raw pre,
.no-results pre {
  background: #0f172a;
  color: #e6eef8;
  padding: 0.6rem;
  border-radius: 6px;
  overflow: auto;
  max-height: 320px;
  margin-top: 0.5rem;
  font-size: 0.85rem;
}
</style>
