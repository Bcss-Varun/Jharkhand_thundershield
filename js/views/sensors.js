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
    card, kpi, statRow, statusDot, statusToneOf, badge, table, progressBar,
    toolbar, select, iconButton, emptyState, num, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, donutOptions, SERIES_COLORS } from '../charts.js';
import { createMap, addSensorLayer } from '../map.js';
import { refresh } from '../router.js';
import {
    SENSORS, DISTRICT_RISK, SENSOR_TYPE_META, DATA_PARAMETERS,
    SENSOR_VENDORS, DEPARTMENTS, PROTOCOLS, CONNECTION_METHODS, AUTH_TYPES, POLLING_INTERVALS
} from '../data/mock.js';

// Demo: sensors added via the "Add New Sensor" form persist in localStorage so
// they survive a page reload. Hydrate the fleet once at module load.
const STORAGE_KEY = 'ag-added-sensors';
try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach((s) => SENSORS.push(s));
} catch (err) {
    /* ignore corrupt storage */
}

const SENSOR_TYPES = [...new Set(SENSORS.map((s) => s.type))].sort();
const STATUSES = ['online', 'degraded', 'offline'];

/** Fleet counts computed live so KPIs update the moment a sensor is added. */
function fleetStats() {
    const online = SENSORS.filter((s) => s.status === 'online').length;
    const reporting = SENSORS.filter((s) => s.latencyMs !== null);
    const avgLatency = reporting.length
        ? Math.round(reporting.reduce((sum, s) => sum + s.latencyMs, 0) / reporting.length)
        : 0;
    return { total: SENSORS.length, online, impaired: SENSORS.length - online, reporting: reporting.length, avgLatency };
}

/** Next sequential sensor ID, e.g. SEN-1065. */
function nextSensorId() {
    const max = SENSORS.reduce((m, s) => {
        const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > m ? n : m;
    }, 1000);
    return `SEN-${max + 1}`;
}

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
            ${iconButton('download', 'Export inventory')}
            <button class="btn btn-primary" id="add-sensor-toggle"><i data-lucide="plus"></i> Add sensor</button>
            <button class="btn btn-default" id="sensors-map-toggle"><i data-lucide="map"></i> Show map</button>
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    const f = fleetStats();
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Deployed Sensors',
                value: f.total,
                icon: 'cpu',
                tone: 'blue',
                delta: { value: `${SENSOR_TYPES.length} sensor types`, direction: 'flat', sentiment: 'neutral' },
                context: 'Across Jharkhand'
            })}
            ${kpi({
                title: 'Reporting Normally',
                value: f.online,
                icon: 'wifi',
                tone: 'green',
                delta: { value: pct((f.online / f.total) * 100, 1), direction: 'flat', sentiment: 'good' },
                context: 'Status online'
            })}
            ${kpi({
                title: 'Degraded or Offline',
                value: f.impaired,
                icon: 'wifi-off',
                tone: f.impaired ? 'red' : 'green',
                delta: { value: 'Needs field attention', direction: 'flat', sentiment: f.impaired ? 'bad' : 'good' },
                context: 'Excluded from data fusion'
            })}
            ${kpi({
                title: 'Mean Ingest Latency',
                value: f.avgLatency,
                unit: ' ms',
                icon: 'gauge',
                tone: 'teal',
                delta: { value: `${f.reporting} reporting`, direction: 'flat', sentiment: 'good' },
                context: 'Offline units excluded'
            })}
        </section>`;
}

/* -------------------------------------------------------- Add-sensor form */

/** A labelled text/number/date input for the wizard. */
function tf(id, label, { type = 'text', value = '', ph = '', required = false, full = false } = {}) {
    return `
        <label class="field${full ? ' field-full' : ''}"><span class="field-label">${esc(label)}${required ? ' *' : ''}</span>
            <input class="input-text" id="${id}" type="${type}"${value !== '' ? ` value="${esc(value)}"` : ''}${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
}

/** A labelled <select> for the wizard. */
function sf(id, label, options, { required = false } = {}) {
    return `
        <label class="field"><span class="field-label">${esc(label)}${required ? ' *' : ''}</span>
            <select id="${id}" class="input-select">${options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
        </label>`;
}

/** Add-sensor 3-step wizard. Hidden until the toolbar "Add sensor" button opens it. */
function addSensorModal() {
    const top = DISTRICT_RISK[0];
    return `
        <div class="modal-overlay" id="add-sensor-modal" hidden>
            <div class="modal modal-wizard" role="dialog" aria-modal="true" aria-label="Add New Sensor">
                <div class="modal-header">
                    <h2><i data-lucide="plus-circle"></i> Add New Sensor</h2>
                    <button class="btn-icon" id="ns-close" aria-label="Close"><i data-lucide="x"></i></button>
                </div>

                <div class="wizard-steps">
                    <div class="wizard-step active" data-ind="1"><span class="wizard-num">1</span> Sensor Information</div>
                    <span class="wizard-line"></span>
                    <div class="wizard-step" data-ind="2"><span class="wizard-num">2</span> Connectivity</div>
                    <span class="wizard-line"></span>
                    <div class="wizard-step" data-ind="3"><span class="wizard-num">3</span> Configuration</div>
                </div>

                <div class="modal-body">
                    <!-- Step 1: Sensor Information -->
                    <div class="wizard-panel add-sensor-form" data-step="1">
                        ${tf('ns-id', 'Sensor ID', { value: nextSensorId() })}
                        ${tf('ns-name', 'Sensor Name', { required: true, ph: 'e.g. Ranchi AWS Tower 1' })}
                        ${sf('ns-type', 'Sensor Type', SENSOR_TYPES, { required: true })}
                        ${sf('ns-vendor', 'Vendor / Manufacturer', SENSOR_VENDORS)}
                        ${tf('ns-model', 'Model Number', { ph: 'e.g. AWS-3200' })}
                        ${sf('ns-department', 'Department / Agency', DEPARTMENTS)}
                        ${sf('ns-district', 'District', DISTRICT_RISK.map((d) => d.name), { required: true })}
                        ${tf('ns-location', 'Location / Site Name', { ph: 'e.g. Collectorate Campus' })}
                        ${tf('ns-lat', 'Latitude', { type: 'number', value: (top.lat).toFixed(4) })}
                        ${tf('ns-lng', 'Longitude', { type: 'number', value: (top.lng).toFixed(4) })}
                        ${tf('ns-installed', 'Installation Date', { type: 'date', value: '2026-07-21' })}
                        ${sf('ns-status', 'Status', ['Online', 'Offline', 'Maintenance'])}
                        <label class="field field-full"><span class="field-label">Description</span>
                            <textarea class="input-text" id="ns-description" rows="2" placeholder="Brief note about this sensor…"></textarea></label>
                    </div>

                    <!-- Step 2: Connectivity -->
                    <div class="wizard-panel add-sensor-form" data-step="2" hidden>
                        ${sf('ns-protocol', 'Communication Protocol', PROTOCOLS, { required: true })}
                        ${sf('ns-connection', 'Connection Method', CONNECTION_METHODS)}
                        ${tf('ns-gateway', 'Gateway Name (optional)', { ph: 'e.g. GW-RAN-1' })}
                        ${tf('ns-host', 'IP Address / Host', { ph: 'e.g. 10.42.10.5' })}
                        ${tf('ns-port', 'Port', { type: 'number', ph: 'e.g. 1883' })}
                        ${tf('ns-endpoint', 'API Endpoint / Topic', { ph: '/api/v1/telemetry' })}
                        ${sf('ns-auth', 'Authentication Type', AUTH_TYPES)}
                        ${sf('ns-polling', 'Polling Interval', POLLING_INTERVALS)}
                    </div>

                    <!-- Step 3: Sensor Configuration -->
                    <div class="wizard-panel" data-step="3" hidden>
                        <div class="field-label mb-2">Data Parameters</div>
                        <div class="param-grid">
                            ${DATA_PARAMETERS.map((p) => `
                                <label class="param-check"><input type="checkbox" name="ns-param" value="${esc(p)}"> ${esc(p)}</label>`).join('')}
                        </div>
                        <div class="add-sensor-form mt-4">
                            ${tf('ns-unit', 'Unit of Measurement', { ph: 'e.g. kV/m' })}
                            ${tf('ns-freq', 'Sampling Frequency', { ph: 'e.g. 1 Hz' })}
                            ${tf('ns-warn', 'Warning Threshold', { type: 'number' })}
                            ${tf('ns-crit', 'Critical Threshold', { type: 'number' })}
                        </div>
                    </div>
                </div>

                <div class="modal-footer wizard-footer">
                    <span class="wizard-progress" id="ns-step-text">Step 1 of 3 — Sensor Information</span>
                    <div class="wizard-actions">
                        <button class="btn btn-default" id="ns-back" hidden><i data-lucide="arrow-left"></i> Back</button>
                        <button class="btn btn-primary" id="ns-next">Next <i data-lucide="arrow-right"></i></button>
                        <button class="btn btn-primary" id="ns-add" hidden><i data-lucide="check"></i> Add sensor</button>
                    </div>
                </div>
            </div>
        </div>`;
}

/* -------------------------------------------------------------- Placement */

/** Placement map opens as a popup from the toolbar "Show map" button (Leaflet
    must init against a visible container, so the map is created on first open). */
function mapSection() {
    return `
        <div class="modal-overlay" id="sensors-map-modal" hidden>
            <div class="modal modal-map" role="dialog" aria-modal="true" aria-label="Sensor Placement">
                <div class="modal-header">
                    <h2>Sensor Placement</h2>
                    <button class="btn-icon" id="sensors-map-close" aria-label="Close"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body map-modal-body">
                    <div id="sensors-map" class="map-view"></div>
                    <div class="map-legend">
                        <h4>Sensor Status</h4>
                        <ul>
                            <li><span class="color-box bg-green"></span> Online</li>
                            <li><span class="color-box bg-yellow"></span> Degraded</li>
                            <li><span class="color-box bg-red"></span> Offline</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;
}

function compositionCard() {
    return card({
        title: 'Fleet Composition',
        subtitle: 'Units by sensor type',
        body: `<div id="sensors-type-donut"></div>`
    });
}

function sensorDetail(s) {
    if (!s) return emptyState('Select a sensor to inspect', 'cpu');
    const dash = (v) => (v === undefined || v === null || v === '' ? '—' : v);
    const params = (s.dataParameters || []).map((p) => badge(p, 'blue')).join(' ') || '—';
    return `
        <div class="detail-head">
            <span class="font-mono">${esc(s.id)}</span>
            ${statusDot(s.status)}
        </div>

        <div class="detail-group">Information</div>
        ${statRow('Name', esc(dash(s.name)), { bold: true })}
        ${statRow('Type', esc(s.type))}
        ${statRow('Vendor', esc(dash(s.vendor)))}
        ${statRow('Model', esc(dash(s.model)))}
        ${statRow('Department', esc(dash(s.department)))}
        ${statRow('District', esc(s.districtName))}
        ${statRow('Location', esc(dash(s.location)))}
        ${statRow('Coordinates', `<span class="font-mono">${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}</span>`)}
        ${statRow('Installed', esc(dash(s.installedOn)))}

        <div class="detail-group">Connectivity</div>
        ${statRow('Protocol', s.protocol ? badge(s.protocol, 'teal') : '—')}
        ${statRow('Connection', esc(dash(s.connectionMethod)))}
        ${statRow('Host', `<span class="font-mono">${esc(dash(s.ipHost))}${s.port ? ':' + esc(s.port) : ''}</span>`)}
        ${statRow('Endpoint', `<span class="font-mono">${esc(dash(s.apiEndpoint))}</span>`)}
        ${statRow('Auth', esc(dash(s.authType)))}
        ${statRow('Polling', esc(dash(s.pollingInterval)))}

        <div class="detail-group">Configuration</div>
        <div class="detail-params">${params}</div>
        ${statRow('Unit', esc(dash(s.unit)))}
        ${statRow('Sampling', esc(dash(s.samplingFrequency)))}
        ${statRow('Warning ≥', esc(dash(s.warningThreshold)))}
        ${statRow('Critical ≥', esc(dash(s.criticalThreshold)))}

        <div class="detail-group">Health</div>
        ${statRow('Latency', s.latencyMs === null ? '<span class="text-secondary">No response</span>' : `${esc(s.latencyMs)} ms`)}
        ${statRow('Firmware', `<span class="font-mono">${esc(s.firmware)}</span>`)}
        <div class="chart-caption mt-3">Battery ${esc(s.battery)}%</div>
        ${progressBar(s.battery, levelTone(s.battery))}
        <div class="chart-caption mt-2">Signal ${esc(s.signal)}%</div>
        ${progressBar(s.signal, levelTone(s.signal))}`;
}

function detailCard() {
    return card({
        title: 'Sensor Detail',
        subtitle: 'Inspect a single unit',
        bodyClass: 'sensor-detail-scroll',
        actions: select('sensor-detail-pick', SENSORS.map((s) => ({ value: s.id, label: `${s.id} · ${s.name || s.districtName}` }))),
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
                body: `
                    <div id="sensors-table">${inventoryTable(SENSORS.slice(0, 10))}</div>
                    <div id="sensors-pagination" class="pagination"></div>`
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
            ${inventorySection()}
            ${addSensorModal()}`;
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

        // Inventory table is paginated at 10 rows/page. The map still shows the
        // full filtered set (all matching markers, not just the visible page).
        const PAGE_SIZE = 10;
        let page = 1;
        const pagHost = root.querySelector('#sensors-pagination');

        function renderInventory() {
            const rows = filteredRows();
            const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
            if (page > pages) page = pages;
            const start = (page - 1) * PAGE_SIZE;
            if (tableHost) tableHost.innerHTML = inventoryTable(rows.slice(start, start + PAGE_SIZE));
            if (countHost) countHost.textContent = String(rows.length);
            if (pagHost) {
                pagHost.innerHTML = `
                    <button class="btn btn-default" id="sensors-prev"${page <= 1 ? ' disabled' : ''}><i data-lucide="chevron-left"></i> Prev</button>
                    <span class="pagination-info">Page ${page} of ${pages} · ${rows.length} sensors</span>
                    <button class="btn btn-default" id="sensors-next"${page >= pages ? ' disabled' : ''}>Next <i data-lucide="chevron-right"></i></button>`;
                root.querySelector('#sensors-prev')?.addEventListener('click', () => { if (page > 1) { page -= 1; renderInventory(); } });
                root.querySelector('#sensors-next')?.addEventListener('click', () => { if (page < pages) { page += 1; renderInventory(); } });
            }
            if (map) {
                if (sensorLayer) map.removeLayer(sensorLayer);
                sensorLayer = addSensorLayer(map, rows);
            }
            if (window.lucide) window.lucide.createIcons();
        }

        // Changing a filter jumps back to page 1.
        [statusSelect, typeSelect].forEach((el) => el && el.addEventListener('change', () => { page = 1; renderInventory(); }));
        renderInventory();

        // "Show map" opens the placement map as a popup. Leaflet is created on
        // first open (its container must be visible to measure), and re-measured
        // each open in case the modal was hidden when it was built.
        const mapModal = root.querySelector('#sensors-map-modal');
        const openMap = () => {
            if (!mapModal) return;
            mapModal.hidden = false;
            if (!map) {
                map = createMap('sensors-map');
                if (map) sensorLayer = addSensorLayer(map, filteredRows());
            }
            if (map) setTimeout(() => map.invalidateSize(), 50);
        };
        const closeMap = () => {
            if (mapModal) mapModal.hidden = true;
        };
        root.querySelector('#sensors-map-toggle')?.addEventListener('click', openMap);
        root.querySelector('#sensors-map-close')?.addEventListener('click', closeMap);
        mapModal?.addEventListener('click', (e) => {
            if (e.target === mapModal) closeMap();
        });

        // --- Add New Sensor 3-step wizard -------------------------------
        const modal = root.querySelector('#add-sensor-modal');
        const STEP_LABELS = ['Sensor Information', 'Connectivity', 'Configuration'];
        let currentStep = 1;

        const goToStep = (n) => {
            currentStep = Math.max(1, Math.min(3, n));
            root.querySelectorAll('#add-sensor-modal .wizard-panel').forEach((p) => {
                p.hidden = Number(p.dataset.step) !== currentStep;
            });
            root.querySelectorAll('#add-sensor-modal .wizard-step').forEach((el) => {
                const i = Number(el.dataset.ind);
                el.classList.toggle('active', i === currentStep);
                el.classList.toggle('done', i < currentStep);
            });
            const stepText = root.querySelector('#ns-step-text');
            if (stepText) stepText.textContent = `Step ${currentStep} of 3 — ${STEP_LABELS[currentStep - 1]}`;
            const back = root.querySelector('#ns-back');
            const next = root.querySelector('#ns-next');
            const add = root.querySelector('#ns-add');
            if (back) back.hidden = currentStep === 1;
            if (next) next.hidden = currentStep === 3;
            if (add) add.hidden = currentStep !== 3;
            if (window.lucide) window.lucide.createIcons();
        };

        const openModal = () => { if (modal) { goToStep(1); modal.hidden = false; } };
        const closeModal = () => { if (modal) modal.hidden = true; };
        root.querySelector('#add-sensor-toggle')?.addEventListener('click', openModal);
        root.querySelector('#ns-close')?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        root.querySelector('#ns-next')?.addEventListener('click', () => goToStep(currentStep + 1));
        root.querySelector('#ns-back')?.addEventListener('click', () => goToStep(currentStep - 1));

        // Picking a type prefills the config step (unit, sampling, thresholds,
        // and the relevant data parameters) — the "smart integration" demo beat.
        const typeSel = root.querySelector('#ns-type');
        const applyTypeDefaults = () => {
            const meta = SENSOR_TYPE_META[typeSel?.value];
            if (!meta) return;
            const set = (id, v) => { const el = root.querySelector(id); if (el) el.value = v; };
            set('#ns-unit', meta.unit);
            set('#ns-freq', meta.freq);
            set('#ns-warn', meta.warn);
            set('#ns-crit', meta.crit);
            root.querySelectorAll('input[name="ns-param"]').forEach((cb) => {
                cb.checked = meta.params.includes(cb.value);
            });
        };
        typeSel?.addEventListener('change', applyTypeDefaults);
        applyTypeDefaults();

        root.querySelector('#ns-add')?.addEventListener('click', () => {
            const val = (sel) => (root.querySelector(sel)?.value || '').trim();
            const d = DISTRICT_RISK.find((x) => x.name === val('#ns-district')) || DISTRICT_RISK[0];
            const status = ({ Online: 'online', Offline: 'offline', Maintenance: 'degraded' })[val('#ns-status')] || 'online';
            const params = Array.from(root.querySelectorAll('input[name="ns-param"]:checked')).map((c) => c.value);
            const numOr = (v, def) => { const n = Number(v); return Number.isFinite(n) && v !== '' ? n : def; };
            const lat = parseFloat(val('#ns-lat'));
            const lng = parseFloat(val('#ns-lng'));
            const sensor = {
                id: val('#ns-id'),
                name: val('#ns-name') || `${val('#ns-type')} ${d.name}`,
                type: val('#ns-type'),
                vendor: val('#ns-vendor'),
                model: val('#ns-model'),
                department: val('#ns-department'),
                districtId: d.id,
                districtName: d.name,
                location: val('#ns-location'),
                lat: Number.isFinite(lat) ? lat : d.lat,
                lng: Number.isFinite(lng) ? lng : d.lng,
                status,
                description: val('#ns-description'),
                protocol: val('#ns-protocol'),
                connectionMethod: val('#ns-connection'),
                gateway: val('#ns-gateway'),
                ipHost: val('#ns-host'),
                port: val('#ns-port'),
                apiEndpoint: val('#ns-endpoint') || '/api/v1/telemetry',
                authType: val('#ns-auth'),
                pollingInterval: val('#ns-polling'),
                dataParameters: params,
                unit: val('#ns-unit'),
                samplingFrequency: val('#ns-freq'),
                warningThreshold: numOr(val('#ns-warn'), null),
                criticalThreshold: numOr(val('#ns-crit'), null),
                battery: status === 'offline' ? 0 : 100,
                signal: status === 'offline' ? 0 : 96,
                latencyMs: status === 'offline' ? null : 20,
                lastSeenMins: status === 'offline' ? 45 : 1,
                firmware: 'v3.0.0',
                installedOn: val('#ns-installed') || '2026-07-21',
                lastCalibrated: val('#ns-installed') || '2026-07-21'
            };
            SENSORS.push(sensor);
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                saved.push(sensor);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            } catch (err) {
                /* ignore storage errors */
            }
            refresh();
        });

        const detailPick = root.querySelector('#sensor-detail-pick');
        const detailHost = root.querySelector('#sensors-detail');
        if (detailPick && detailHost) {
            detailPick.addEventListener('change', () => {
                detailHost.innerHTML = sensorDetail(SENSORS.find((s) => s.id === detailPick.value));
                if (window.lucide) window.lucide.createIcons();
            });
        }

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
