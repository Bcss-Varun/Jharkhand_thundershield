/**
 * Sensor Health — availability, latency, power, and the fix-it list.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — reporting window
 *   2. KPIs          — the four headline numbers from SENSOR_HEALTH
 *   3. Availability   — 30-day uptime, ingest latency, battery distribution
 *   4. Diagnostics    — every unit that needs a human, with a recommended action
 *
 * The diagnostics list is derived rather than stored: a unit is a problem if it
 * is not online *or* its battery is heading for one, which is the same question
 * a maintenance planner asks.
 */

import {
    card, kpi, statRow, statusDot, statusToneOf, table, progressBar,
    toolbar, segmented, iconButton, num, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, lineOptions, gaugeOptions, donutOptions, PALETTE } from '../charts.js';
import { refresh } from '../router.js';
import { SENSORS, SENSOR_HEALTH } from '../data/mock.js';

/** Below this a battery is a scheduled job, not yet a failure. */
const LOW_BATTERY = 35;

const problemSensors = SENSORS
    .filter((s) => s.status !== 'online' || s.battery < LOW_BATTERY)
    .sort((a, b) => a.battery - b.battery);

const offlineCount = SENSORS.filter((s) => s.status === 'offline').length;
const degradedCount = SENSORS.filter((s) => s.status === 'degraded').length;

const uptimeSeries = SENSOR_HEALTH.uptimeTrend30d;
const worstUptime = Math.min(...uptimeSeries);
const peakLatency = Math.max(...SENSOR_HEALTH.latencyTrend);

/**
 * ago() from components.js takes seconds; lastSeenMins is minutes, and passing
 * it through unconverted would under-report staleness by 60x.
 */
function sinceLastSeen(mins) {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ${mins % 60}m ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function levelTone(value) {
    if (value >= 60) return 'green';
    if (value >= 30) return 'yellow';
    return 'red';
}

/** The single next action a maintenance planner would take for this unit. */
function recommendation(sensor) {
    if (sensor.status === 'offline') return 'Dispatch field team — no telemetry';
    if (sensor.battery < 20) return 'Replace solar battery pack';
    if (sensor.status === 'degraded') return 'Inspect antenna and backhaul link';
    return 'Schedule battery swap at next visit';
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        right: `
            <span class="live-chip"><span class="live-dot"></span> Telemetry live</span>
            ${iconButton('refresh-cw', 'Re-poll fleet')}
            ${iconButton('download', 'Export health report')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Network Uptime',
                value: pct(SENSOR_HEALTH.uptime, 1),
                icon: 'activity',
                tone: 'green',
                delta: { value: `Low of ${pct(worstUptime, 1)} in 30d`, direction: 'flat', sentiment: 'good' },
                context: 'Rolling 30-day availability'
            })}
            ${kpi({
                title: 'Data Latency',
                value: SENSOR_HEALTH.latencyMs,
                unit: ' ms',
                icon: 'gauge',
                tone: 'teal',
                delta: { value: `Peak ${peakLatency} ms`, direction: 'flat', sentiment: 'good' },
                context: 'Ingest to fusion engine'
            })}
            ${kpi({
                title: 'Offline EFM Stations',
                value: SENSOR_HEALTH.offlineEfm,
                icon: 'wifi-off',
                tone: 'red',
                delta: { value: `${offlineCount} units offline overall`, direction: 'up', sentiment: 'bad' },
                context: 'Field visit required'
            })}
            ${kpi({
                title: 'Low Battery (Solar)',
                value: SENSOR_HEALTH.lowBattery,
                icon: 'battery-low',
                tone: 'yellow',
                delta: { value: `Below ${LOW_BATTERY}% charge`, direction: 'up', sentiment: 'bad' },
                context: 'Swap before monsoon peak'
            })}
        </section>`;
}

/* ----------------------------------------------------------- Availability */

function uptimeCard() {
    return card({
        title: 'Network Uptime',
        subtitle: 'Last 30 days',
        body: `
            <div id="health-uptime-gauge"></div>
            <div class="chart-caption mt-3">Daily availability, %</div>
            <div id="health-uptime-trend"></div>`
    });
}

function latencyCard() {
    return card({
        title: 'Ingest Latency',
        subtitle: 'Last 8 polling cycles',
        body: `
            <div id="health-latency-trend"></div>
            <div class="mt-3">
                ${statRow('Current', `${esc(SENSOR_HEALTH.latencyMs)} ms`, { bold: true, tone: 'green' })}
                ${statRow('Peak this window', `${esc(peakLatency)} ms`, { tone: 'yellow' })}
                ${statRow('IMD API sync', statusDot(SENSOR_HEALTH.imdSync))}
                ${statRow('Units reporting', `${num(SENSORS.length - offlineCount)} / ${num(SENSORS.length)}`)}
            </div>`
    });
}

function batteryCard() {
    return card({
        title: 'Battery Distribution',
        subtitle: 'Solar pack charge across the fleet',
        body: `<div id="health-battery-donut"></div>`
    });
}

function availabilitySection() {
    return `
        <section class="section-heading">
            <h2>Availability & Power</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${uptimeCard()}
            ${latencyCard()}
            ${batteryCard()}
        </section>`;
}

/* ------------------------------------------------------------ Diagnostics */

function diagnosticsTable(rows) {
    return table({
        columns: [
            { key: 'id', label: 'Sensor', render: (s) => `<span class="font-mono">${esc(s.id)}</span>` },
            { key: 'type', label: 'Type' },
            { key: 'districtName', label: 'District' },
            { key: 'status', label: 'Status', render: (s) => statusDot(s.status) },
            {
                key: 'battery',
                label: 'Battery',
                render: (s) => `${progressBar(s.battery, levelTone(s.battery))}<span class="text-xs text-secondary">${esc(s.battery)}%</span>`
            },
            {
                key: 'signal',
                label: 'Signal',
                render: (s) => `${progressBar(s.signal, levelTone(s.signal))}<span class="text-xs text-secondary">${esc(s.signal)}%</span>`
            },
            {
                key: 'latencyMs',
                label: 'Latency',
                align: 'right',
                // Offline units carry a null latency; the raw value would print "null".
                render: (s) => (s.latencyMs === null ? '<span class="text-secondary">—</span>' : `${esc(s.latencyMs)} ms`)
            },
            { key: 'lastSeenMins', label: 'Last seen', render: (s) => esc(sinceLastSeen(s.lastSeenMins)) },
            {
                key: 'id',
                label: 'Recommended action',
                render: (s) => `<span class="text-${esc(statusToneOf(s.status))}">${esc(recommendation(s))}</span>`
            }
        ],
        rows,
        empty: 'No sensors need attention in this category'
    });
}

function diagnosticsSection() {
    return `
        <section class="section-heading">
            <h2>Offline & Maintenance Diagnostics</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Units Needing Attention',
                subtitle: `${problemSensors.length} of ${SENSORS.length} sensors flagged`,
                actions: `
                    ${segmented('health-filter', [
                        { value: 'all', label: 'All' },
                        { value: 'offline', label: `Offline (${offlineCount})` },
                        { value: 'degraded', label: `Degraded (${degradedCount})` },
                        { value: 'battery', label: 'Low battery' }
                    ], 'all')}
                    <a class="link-btn" href="#/sensor-network">Full inventory</a>`,
                body: `<div id="health-diagnostics">${diagnosticsTable(problemSensors)}</div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Sensor Health',
    subtitle: 'Uptime, latency, battery, and maintenance',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${availabilitySection()}
            ${diagnosticsSection()}`;
    },

    mount(root) {
        mkChart('#health-uptime-gauge', gaugeOptions({
            value: SENSOR_HEALTH.uptime,
            color: PALETTE.green,
            label: 'Uptime',
            height: 180
        }));

        const uptimeDays = uptimeSeries.map((_, i) =>
            i === uptimeSeries.length - 1 ? 'Today' : `D-${uptimeSeries.length - 1 - i}`
        );
        mkChart('#health-uptime-trend', {
            ...lineOptions({
                series: [{ name: 'Uptime %', data: uptimeSeries }],
                categories: uptimeDays,
                colors: [PALETTE.green],
                type: 'area',
                height: 200,
                showLegend: false
            }),
            // Uptime never leaves the top of the scale, so a 0-100 axis would
            // flatten the whole series into a straight line. lineOptions has no
            // axis-range knob, so the override is merged on afterwards.
            yaxis: { min: 99, max: 100, labels: { formatter: (v) => `${v.toFixed(1)}%` } },
            xaxis: { categories: uptimeDays, tickAmount: 6 }
        });

        mkChart('#health-latency-trend', lineOptions({
            series: [{ name: 'Latency (ms)', data: SENSOR_HEALTH.latencyTrend }],
            categories: SENSOR_HEALTH.latencyTrend.map((_, i) => `P-${SENSOR_HEALTH.latencyTrend.length - 1 - i}`),
            colors: [PALETTE.teal],
            height: 190,
            showLegend: false
        }));

        const bands = [
            { label: 'Critical (<20%)', match: (s) => s.battery < 20 },
            { label: 'Low (20-39%)', match: (s) => s.battery >= 20 && s.battery < 40 },
            { label: 'Fair (40-69%)', match: (s) => s.battery >= 40 && s.battery < 70 },
            { label: 'Good (70%+)', match: (s) => s.battery >= 70 }
        ];
        mkChart('#health-battery-donut', donutOptions({
            series: bands.map((b) => SENSORS.filter(b.match).length),
            labels: bands.map((b) => b.label),
            colors: [PALETTE.red, PALETTE.orange, PALETTE.yellow, PALETTE.green],
            totalLabel: 'Sensors',
            height: 280
        }));

        const diagnosticsHost = root.querySelector('#health-diagnostics');
        const FILTERS = {
            all: () => true,
            offline: (s) => s.status === 'offline',
            degraded: (s) => s.status === 'degraded',
            battery: (s) => s.battery < LOW_BATTERY
        };

        root.querySelectorAll('#health-filter .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                if (!diagnosticsHost) return;
                diagnosticsHost.innerHTML = diagnosticsTable(problemSensors.filter(FILTERS[btn.dataset.value] || FILTERS.all));
                if (window.lucide) window.lucide.createIcons();
            });
        });

        const refreshBtn = root.querySelector('[aria-label="Re-poll fleet"]');
        refreshBtn?.addEventListener('click', () => {
            refreshBtn.classList.add('refreshing');
            setTimeout(refresh, 400);
        });

        // Export health report → CSV of the fleet's health fields.
        root.querySelector('[aria-label="Export health report"]')?.addEventListener('click', () =>
            downloadCsv(
                SENSORS,
                ['id', 'type', 'districtName', 'status', 'battery', 'signal', 'latencyMs', 'lastSeenMins', 'lastCalibrated'],
                'sensor-health-report.csv'
            )
        );
    }
};
