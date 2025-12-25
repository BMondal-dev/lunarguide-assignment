<template>
    <section class="directions card">
        <header class="card-header">
            <h2 class="title">Public Transit Directions</h2>
            <p class="subtitle">
                Enter origin and destination to get transit itineraries.
            </p>
        </header>

        <form class="directions-form" @submit.prevent="onSubmit" novalidate>
            <div class="row">
                <label class="label">
                    Origin
                    <input
                        v-model="form.origin"
                        type="text"
                        placeholder="Address or lat,lng"
                        required
                        class="input"
                    />
                </label>

                <label class="label">
                    Destination
                    <input
                        v-model="form.destination"
                        type="text"
                        placeholder="Address or lat,lng"
                        required
                        class="input"
                    />
                </label>
            </div>

            <div class="row">
                <label class="label">
                    Departure time
                    <input
                        v-model="form.departure_time"
                        type="text"
                        placeholder='e.g. "now" or ISO / epoch seconds (optional)'
                        class="input"
                    />
                </label>

                <label class="label">
                    Arrival time
                    <input
                        v-model="form.arrival_time"
                        type="text"
                        placeholder="ISO / epoch seconds (optional)"
                        class="input"
                    />
                </label>
            </div>

            <div class="row options">
                <label class="checkbox">
                    <input type="checkbox" v-model="form.alternatives" />
                    <span>Allow alternatives</span>
                </label>

                <label class="checkbox">
                    <input type="checkbox" v-model="form.include_raw" />
                    <span>Include raw response</span>
                </label>

                <label class="label small">
                    Transit mode (optional)
                    <input
                        v-model="form.transit_mode"
                        type="text"
                        placeholder="e.g. bus|subway|train|tram|rail"
                        class="input"
                    />
                </label>
            </div>

            <div class="actions">
                <button class="btn primary" :disabled="loading">
                    {{ loading ? "Searching..." : "Get Directions" }}
                </button>
                <button
                    type="button"
                    class="btn"
                    @click="reset"
                    :disabled="loading"
                >
                    Reset
                </button>
            </div>

            <div v-if="error" class="error">{{ error }}</div>
        </form>

        <DirectionsResults
            v-if="response"
            :response="response"
            :include-raw="form.include_raw"
            :format-seconds="formatSeconds"
        />
    </section>
</template>

<script lang="ts" setup>
// DirectionsForm.vue
// Modular, composable form + results display for the server-side directions API.
// Uses plain HTML elements so it works with Nuxt UI wrappers or native styling.
// Emits no external events; it fetches /api/directions (server endpoint already implemented).

import { reactive, ref } from "vue";

/**
 * State for the form
 */
const form = reactive({
    origin: "",
    destination: "",
    departure_time: "now",
    arrival_time: "",
    alternatives: false,
    include_raw: false,
    transit_mode: "",
});

const loading = ref(false);
const error = ref<string | null>(null);
const response = ref<any | null>(null);

function formatSeconds(s: number | null) {
    if (s == null) return "-";
    const sec = Number(s);
    if (!isFinite(sec)) return "-";
    if (sec < 60) return `${sec} s`;
    const mins = Math.round(sec / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${h} h ${rem} m`;
}

/**
 * Submit handler - posts to the Nuxt server endpoint /api/directions
 */
async function onSubmit() {
    error.value = null;
    response.value = null;

    if (!form.origin || !form.destination) {
        error.value = "Origin and destination are required.";
        return;
    }

    const body: any = {
        origin: form.origin,
        destination: form.destination,
        alternatives: form.alternatives,
        include_raw: form.include_raw,
    };
    if (form.departure_time) body.departure_time = form.departure_time;
    if (form.arrival_time) body.arrival_time = form.arrival_time;
    if (form.transit_mode) body.transit_mode = form.transit_mode;

    loading.value = true;
    try {
        const res = await fetch("/api/directions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
            error.value = json?.error || `Request failed (${res.status})`;
            response.value = json;
            return;
        }
        response.value = json;
    } catch (err: any) {
        error.value = String(err);
    } finally {
        loading.value = false;
    }
}

function reset() {
    form.origin = "";
    form.destination = "";
    form.departure_time = "now";
    form.arrival_time = "";
    form.alternatives = false;
    form.include_raw = false;
    form.transit_mode = "";
    response.value = null;
    error.value = null;
}

import DirectionsResults from "./DirectionsResults.vue";
</script>

<style scoped>
.card {
    border: 1px solid #e6e9ee;
    border-radius: 10px;
    background: #fff;
    padding: 1rem;
    box-shadow: 0 1px 3px rgba(16, 24, 40, 0.04);
    max-width: 920px;
    margin: 1rem auto;
}

.card-header {
    margin-bottom: 0.75rem;
}

.title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
}

.subtitle {
    margin: 0.25rem 0 0;
    color: #64748b;
    font-size: 0.95rem;
}

.directions-form {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.5rem;
}

.row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.label {
    flex: 1 1 300px;
    display: flex;
    flex-direction: column;
    font-size: 0.95rem;
}

.input {
    margin-top: 0.35rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.95rem;
}

.options {
    align-items: center;
}

.checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-right: 1rem;
    font-size: 0.95rem;
}

.small {
    flex: 0 0 260px;
}

.actions {
    margin-top: 0.5rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.btn {
    padding: 0.5rem 0.9rem;
    border-radius: 6px;
    border: 1px solid transparent;
    background: #f1f5f9;
    cursor: pointer;
}

.btn.primary {
    background: #0ea5e9;
    color: white;
    border-color: #0891b2;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.error {
    color: #b91c1c;
    margin-top: 0.5rem;
}

/* Results */
.results {
    margin-top: 1rem;
    border-top: 1px dashed #e6e9ee;
    padding-top: 1rem;
}

.results-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.05rem;
}

.itinerary {
    padding: 0.6rem 0;
    border-bottom: 1px solid #f1f5f9;
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
    color: #667085;
    font-size: 0.95rem;
    margin-top: 0.25rem;
}

.rides,
.changes {
    margin: 0.5rem 0;
    padding-left: 1.1rem;
}

.steps {
    margin-top: 0.5rem;
}

.step {
    margin: 0.5rem 0;
    padding: 0.4rem;
    border-radius: 6px;
    background: #fafafa;
}

.step-top {
    display: flex;
    gap: 0.6rem;
    align-items: center;
}

.badge {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    background: #e6eef8;
    color: #0f172a;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
}

.instr {
    font-size: 0.95rem;
}

.step-meta {
    color: #666;
    font-size: 0.85rem;
    margin-top: 0.25rem;
}

.step-transit {
    margin-top: 0.35rem;
    font-size: 0.9rem;
    color: #0f172a;
}

.no-results {
    color: #475569;
}

.raw pre {
    background: #0f172a;
    color: #e6eef8;
    padding: 0.6rem;
    border-radius: 6px;
    overflow: auto;
    max-height: 280px;
}
</style>
