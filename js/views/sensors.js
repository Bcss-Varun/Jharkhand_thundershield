/**
 * Sensors — fleet inventory.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar  — status + type filters, which drive both the table and the map
 *   2. KPIs         — fleet size, reachable, impaired, mean latency
 *   3. Placement    — map + composition donut + a single-unit detail panel
 *   4. Composition  — status breakdown and per-district coverage
 *   5. Inventory    — the full table, filtered live
 *
 * The filters are the spine of the page: one control set re-scopes the map
 * markers, the inventory table, and the visible count, so the page always
 * states a single consistent slice of the fleet.
 */

import {
    card, kpi, statRow, statusDot, statusToneOf, table, progressBar,
    toolbar, select, iconButton, emptyState, num, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, donutOptions, SERIES_COLORS } from '../charts.js';
import { createMap, addSensorLayer } from '../map.js';
import { refresh } from '../router.js';
import { SENSORS } from '../data/mock.js';

const SENSOR_TYPES = [...new Set(SENSORS.map((s) => s.type))].sort();
const STATUSES = ['online', 'degraded', 'offline'];

const onlineCount = SENSORS.filter((s) => s.status === 'online').length;
const impairedCount = SENSORS.length - onlineCount;

/** Offline units report latencyMs === null, so they are excluded, not zeroed. */
const reporting = SENSORS.filter((s) => s.latencyMs !== null);
const avgLatency = Math.round(reporting.reduce((sum, s) => sum + s.latencyMs, 0) / reporting.length);

function countBy(list, key) {
    return list.reduce((acc, item) => {
        acc[item[key]] = (acc[item[key]] || 0) + 1;
        return acc;
    }, {});
}

/** Shared scale for battery, signal, and reachability percentages. */
function levelTone(value) {
    if (value >= 60) return 'green';
    if (value >= 30) return 'yellow';
    return 'red';
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('sensor-status', [
                { value: 'all', label: 'All statuses' },
                ...STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))
            ])}
            ${select('sensor-type', [
                { value: 'all', label: 'All sensor types' },
                ...SENSOR_TYPES.map((t) => ({ value: t, label: t }))
            ])}
        `,
        right: `
            <button class="btn btn-primary" id="sensors-map-toggle"><i data-lucide="map"></i> Placement map</button>
            <span class="live-chip"><span class="live-dot"></span> Polling</span>
            ${iconButton('refresh-cw', 'Re-poll fleet')}
            ${iconButton('download', 'Export inventory')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Deployed Sensors',
                value: SENSORS.length,
                icon: 'cpu',
                tone: 'blue',
                delta: { value: `${SENSOR_TYPES.length} sensor types`, direction: 'flat', sentiment: 'neutral' },
                context: 'Across Jharkhand'
            })}
            ${kpi({
                title: 'Reporting Normally',
                value: onlineCount,
                icon: 'wifi',
                tone: 'green',
                delta: { value: pct((onlineCount / SENSORS.length) * 100, 1), direction: 'flat', sentiment: 'good' },
                context: 'Status online'
            })}
            ${kpi({
                title: 'Degraded or Offline',
                value: impairedCount,
                icon: 'wifi-off',
                tone: impairedCount ? 'red' : 'green',
                delta: { value: 'Needs field attention', direction: 'flat', sentiment: impairedCount ? 'bad' : 'good' },
                context: 'Excluded from data fusion'
            })}
            ${kpi({
                title: 'Mean Ingest Latency',
                value: avgLatency,
                unit: ' ms',
                icon: 'gauge',
                tone: 'teal',
                delta: { value: `${reporting.length} reporting`, direction: 'flat', sentiment: 'good' },
                context: 'Offline units excluded'
            })}
        </section>`;
}

/* -------------------------------------------------------------- Placement */

function mapCard() {
    return card({
        title: 'Sensor Placement',
        subtitle: `${SENSORS.length} units on the state grid`,
        className: 'map-container',
        bodyClass: 'p-0',
        actions: `<a class="link-btn" href="#/sensor-network?tab=health">Health</a>`,
        body: `
            <div id="sensors-map" class="map-view"></div>
            <div class="map-legend">
                <h4>Sensor Status</h4>
                <ul>
                    <li><span class="color-box bg-green"></span> Online</li>
                    <li><span class="color-box bg-yellow"></span> Degraded</li>
                    <li><span class="color-box bg-red"></span> Offline</li>
                </ul>
            </div>`
    });
}

/** Placement map lives in its own band, opened from the top-right toolbar
    button (Leaflet must init against a visible container). */
function mapSection() {
    return `<section id="sensors-map-wrap" hidden>${mapCard()}</section>`;
}

function compositionCard() {
    return card({
        title: 'Fleet Composition',
        subtitle: 'Units by sensor type',
        body: `<div id="sensors-type-donut"></div>`
    });
}

function sensorDetail(sensor) {
    if (!sensor) return emptyState('Select a sensor to inspect', 'cpu');
    return `
        ${statRow('Sensor ID', `<span class="font-mono">${esc(sensor.id)}</span>`, { bold: true })}
        ${statRow('Type', esc(sensor.type))}
        ${statRow('District', esc(sensor.districtName))}
        ${statRow('Status', statusDot(sensor.status), { tone: statusToneOf(sensor.status) })}
        ${statRow('Latency', sensor.latencyMs === null
            ? '<span class="text-secondary">No response</span>'
            : `${esc(sensor.latencyMs)} ms`)}
        ${statRow('Firmware', `<span class="font-mono">${esc(sensor.firmware)}</span>`)}
        ${statRow('Installed', esc(sensor.installedOn))}
        ${statRow('Last calibrated', esc(sensor.lastCalibrated))}
        <div class="chart-caption mt-3">Battery ${esc(sensor.battery)}%</div>
        ${progressBar(sensor.battery, levelTone(sensor.battery))}
        <div class="chart-caption mt-2">Signal ${esc(sensor.signal)}%</div>
        ${progressBar(sensor.signal, levelTone(sensor.signal))}`;
}

function detailCard() {
    return card({
        title: 'Sensor Detail',
        subtitle: 'Inspect a single unit',
        actions: select('sensor-detail-pick', SENSORS.map((s) => ({ value: s.id, label: `${s.id} — ${s.districtName}` }))),
        body: `<div id="sensors-detail">${sensorDetail(SENSORS[0])}</div>`
    });
}

function placementSection() {
    return `
        <section class="operational-section">
            ${compositionCard()}
            ${detailCard()}
        </section>`;
}

/* ------------------------------------------------------------ Composition */

function statusCard() {
    const counts = countBy(SENSORS, 'status');
    return card({
        title: 'Status Breakdown',
        subtitle: 'Share of fleet in each state',
        bodyClass: 'flex-col',
        body: STATUSES.map((s) => {
            const n = counts[s] || 0;
            const share = (n / SENSORS.length) * 100;
            return `
                ${statRow(
                    s.charAt(0).toUpperCase() + s.slice(1),
                    `${num(n)} <span class="text-secondary">· ${esc(pct(share, 1))}</span>`,
                    { tone: statusToneOf(s), bold: true }
                )}
                ${progressBar(share, statusToneOf(s))}`;
        }).join('')
    });
}

function coverageCard() {
    const rows = [...new Set(SENSORS.map((s) => s.districtName))]
        .map((name) => {
            const units = SENSORS.filter((s) => s.districtName === name);
            return { name, total: units.length, online: units.filter((s) => s.status === 'online').length };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    return card({
        title: 'Coverage by District',
        subtitle: 'Ten densest districts',
        actions: `<a class="link-btn" href="#/analytics">All districts</a>`,
        body: table({
            columns: [
                { key: 'name', label: 'District' },
                { key: 'total', label: 'Units', align: 'right' },
                { key: 'online', label: 'Online', align: 'right' },
                {
                    key: 'name',
                    label: 'Reachable',
                    render: (r) => progressBar((r.online / r.total) * 100, levelTone((r.online / r.total) * 100))
                }
            ],
            rows
        })
    });
}

function compositionSection() {
    return `
        <section class="section-heading">
            <h2>Fleet Composition</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${statusCard()}
            ${coverageCard()}
        </section>`;
}

/* -------------------------------------------------------------- Inventory */

function inventoryTable(rows) {
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
            { key: 'firmware', label: 'Firmware', render: (s) => `<span class="font-mono">${esc(s.firmware)}</span>` },
            { key: 'lastCalibrated', label: 'Last calibrated' }
        ],
        rows,
        empty: 'No sensors match the current filters'
    });
}

function inventorySection() {
    return `
        <section class="section-heading">
            <h2>Sensor Inventory</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'All Sensors',
                subtitle: 'Filtered by the controls above',
                actions: `<span class="status-pill"><span class="status-pill-label">Showing</span><span class="status-pill-value" id="sensors-count">${SENSORS.length}</span></span>`,
                body: `<div id="sensors-table">${inventoryTable(SENSORS)}</div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Sensors',
    subtitle: 'Inventory, placement, and calibration',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${mapSection()}
            ${placementSection()}
            ${compositionSection()}
            ${inventorySection()}`;
    },

    mount(root) {
        // The placement map is created lazily when the user opens it — a
        // Leaflet map built against a hidden container measures 0×0 and renders
        // grey, so it must init only once its container is visible.
        let map = null;
        let sensorLayer = null;

        const byType = countBy(SENSORS, 'type');
        const typeLabels = Object.keys(byType).sort();
        mkChart('#sensors-type-donut', donutOptions({
            series: typeLabels.map((t) => byType[t]),
            labels: typeLabels,
            colors: SERIES_COLORS,
            totalLabel: 'Sensors',
            height: 280
        }));

        const statusSelect = root.querySelector('#sensor-status');
        const typeSelect = root.querySelector('#sensor-type');
        const tableHost = root.querySelector('#sensors-table');
        const countHost = root.querySelector('#sensors-count');

        const filteredRows = () => {
            const status = statusSelect ? statusSelect.value : 'all';
            const type = typeSelect ? typeSelect.value : 'all';
            return SENSORS.filter(
                (s) => (status === 'all' || s.status === status) && (type === 'all' || s.type === type)
            );
        };

        // Table and map are re-scoped from the same filtered set: marker dots
        // that disagree with the rows underneath are worse than no map.
        function applyFilters() {
            const rows = filteredRows();
            if (tableHost) tableHost.innerHTML = inventoryTable(rows);
            if (countHost) countHost.textContent = String(rows.length);
            if (map) {
                if (sensorLayer) map.removeLayer(sensorLayer);
                sensorLayer = addSensorLayer(map, rows);
            }
            if (window.lucide) window.lucide.createIcons();
        }

        [statusSelect, typeSelect].forEach((el) => el && el.addEventListener('change', applyFilters));

        // Top-right "Placement map" button reveals the band, then inits/refreshes.
        const mapWrap = root.querySelector('#sensors-map-wrap');
        const mapToggle = root.querySelector('#sensors-map-toggle');
        mapToggle?.addEventListener('click', () => {
            const opening = mapWrap.hidden;
            mapWrap.hidden = !opening;
            mapToggle.innerHTML = opening ? '<i data-lucide="x"></i> Hide map' : '<i data-lucide="map"></i> Placement map';
            if (window.lucide) window.lucide.createIcons();
            if (!opening) return;
            if (!map) {
                map = createMap('sensors-map');
                if (map) sensorLayer = addSensorLayer(map, filteredRows());
            } else {
                map.invalidateSize();
            }
        });

        const detailPick = root.querySelector('#sensor-detail-pick');
        const detailHost = root.querySelector('#sensors-detail');
        if (detailPick && detailHost) {
            detailPick.addEventListener('change', () => {
                detailHost.innerHTML = sensorDetail(SENSORS.find((s) => s.id === detailPick.value));
                if (window.lucide) window.lucide.createIcons();
            });
        }

        const refreshBtn = root.querySelector('[aria-label="Re-poll fleet"]');
        refreshBtn?.addEventListener('click', () => {
            refreshBtn.classList.add('refreshing');
            setTimeout(refresh, 400);
        });

        // Export inventory → CSV of the full fleet.
        root.querySelector('[aria-label="Export inventory"]')?.addEventListener('click', () =>
            downloadCsv(
                SENSORS,
                ['id', 'type', 'districtName', 'status', 'battery', 'signal', 'latencyMs', 'firmware', 'lastCalibrated'],
                'sensor-inventory.csv'
            )
        );
    }
};
