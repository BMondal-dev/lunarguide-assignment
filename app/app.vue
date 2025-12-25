<template>
    <div class="min-h-screen p-6 bg-slate-50">
        <NuxtRouteAnnouncer />
        <div style="max-width: 920px; margin: 2rem auto">
            <DirectionsForm />
        </div>
    </div>
</template>

<script setup>
import DirectionsForm from "../components/DirectionsForm.vue";
</script>

<style scoped>
/* Small layout styles for the top-level app wrapper */
.min-h-screen {
    min-height: 100vh;
}
</style>
