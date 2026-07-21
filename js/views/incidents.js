/**
 * Incident Management.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar  — status + district filters, both wired to the register
 *   2. KPIs         — open, in response, resolved, average response time
 *   3. Caseload     — status mix, type mix, impact totals, triage queue
 *   4. Register     — the full 28-row incident table
 *
 * The register is last because it is the detail view: the bands above answer
 * "what is the shape of the caseload", the table answers "which one".
 */

import {
    card, kpi, statRow, severityBadge, statusDot, statusToneOf, table,
    toolbar, segmented, select, iconButton, num, compact, esc, downloadCsv
} from '../components.js';
import { mkChart, donutOptions, columnOptions, PALETTE } from '../charts.js';
import { INCIDENTS, INCIDENT_SUMMARY, DISTRICT_RISK, districtById } from '../data/mock.js';
import { createMap, addIncidentLayer } from '../map.js';

/* Incidents carry no coordinates. Place each at its district centroid with a
   deterministic jitter (from the index, so points don't move on re-render and
   don't stack on the centroid). */
const incidentPoints = INCIDENTS.map((i, idx) => {
    const d = districtById(i.districtId);
    const jx = (((idx * 37) % 100) / 100 - 0.5) * 0.3;
    const jy = (((idx * 53) % 100) / 100 - 0.5) * 0.3;
    return { ...i, lat: (d ? d.lat : 23.6) + jy, lng: (d ? d.lng : 85.3) + jx };
});

/** Workflow order, so the status mix reads open -> closed rather than alphabetically. */
const STATUS_ORDER = ['open', 'assigned', 'in-progress', 'resolved', 'closed'];

const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: INCIDENTS.filter((i) => i.status === status).length
})).filter((s) => s.count > 0);

const typeCounts = [...new Set(INCIDENTS.map((i) => i.type))]
    .map((type) => ({ type, count: INCIDENTS.filter((i) => i.type === type).length }))
    .sort((a, b) => b.count - a.count);

const totals = INCIDENTS.reduce(
    (acc, i) => ({
        casualties: acc.casualties + i.casualties,
        injured: acc.injured + i.injured,
        damage: acc.damage + i.damageEstimate,
        unassigned: acc.unassigned + (i.assignedTo ? 0 : 1)
    }),
    { casualties: 0, injured: 0, damage: 0, unassigned: 0 }
);

/** Unresolved cases, worst severity first — this is what a duty officer picks from. */
const SEVERITY_RANK = { severe: 3, warning: 2, watch: 1 };
const triageQueue = INCIDENTS
    .filter((i) => !['resolved', 'closed'].includes(i.status))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${segmented('inc-status', [
                { value: 'all', label: 'All' },
                ...STATUS_ORDER.map((s) => ({ value: s, label: s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) }))
            ], 'all')}
            ${select('inc-district', [
                { value: 'all', label: 'All districts' },
                ...DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name }))
            ])}
        `,
        right: `
            <span class="live-chip"><span class="live-dot"></span> Live feed</span>
            ${iconButton('download', 'Export register')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Open Incidents',
                value: INCIDENT_SUMMARY.open,
                icon: 'siren',
                tone: 'red',
                delta: { value: `${totals.unassigned} unassigned`, direction: 'up', sentiment: 'bad' },
                context: `of ${INCIDENTS.length} logged`
            })}
            ${kpi({
                title: 'In Response',
                value: INCIDENT_SUMMARY.active,
                icon: 'users',
                tone: 'orange',
                delta: { value: 'Teams engaged', direction: 'flat', sentiment: 'neutral' },
                context: 'Assigned or in progress'
            })}
            ${kpi({
                title: 'Resolved (24h)',
                value: INCIDENT_SUMMARY.resolved24h,
                icon: 'check-circle-2',
                tone: 'green',
                delta: { value: 'Cleared today', direction: 'up', sentiment: 'good' },
                context: 'Resolved or closed'
            })}
            ${kpi({
                title: 'Avg Response Time',
                value: `${INCIDENT_SUMMARY.avgResponseMins} min`,
                icon: 'timer',
                tone: 'blue',
                delta: { value: `${INCIDENT_SUMMARY.casualtiesYtd} casualties YTD`, direction: 'flat', sentiment: 'bad' },
                context: 'Dispatch to on-scene'
            })}
        </section>`;
}

/* --------------------------------------------------------- Caseload band */

function statusMixCard() {
    return card({
        title: 'Caseload by Status',
        subtitle: 'Where every open case sits in the workflow',
        body: `<div id="inc-status-chart"></div>`
    });
}

function typeMixCard() {
    return card({
        title: 'Incidents by Type',
        subtitle: 'Reported categories across the register',
        body: `<div id="inc-type-chart"></div>`
    });
}

function impactCard() {
    return card({
        title: 'Impact Summary',
        subtitle: 'Aggregated across all logged incidents',
        actions: `<a class="link-btn" href="#/reports">Damage report</a>`,
        body: `
            ${statRow('Casualties (logged)', esc(num(totals.casualties)), { tone: 'red', bold: true })}
            ${statRow('Casualties YTD', esc(num(INCIDENT_SUMMARY.casualtiesYtd)), { tone: 'red' })}
            ${statRow('Injured', esc(num(totals.injured)), { tone: 'orange' })}
            ${statRow('Damage estimate', esc(`₹${num(totals.damage)}`), { bold: true })}
            ${statRow('Awaiting assignment', esc(num(totals.unassigned)), { tone: totals.unassigned ? 'yellow' : 'green' })}
            ${statRow('Districts affected', esc(num(new Set(INCIDENTS.map((i) => i.districtId)).size)))}`
    });
}

function triageCard() {
    return card({
        title: 'Triage Queue',
        subtitle: 'Unresolved cases, worst first',
        actions: `<a class="link-btn" href="#/alerts?tab=automation">Response SOPs</a>`,
        bodyClass: 'scrollable',
        body: table({
            columns: [
                { key: 'id', label: 'Incident', render: (r) => `<span class="font-mono">${esc(r.id)}</span>` },
                { key: 'severity', label: 'Severity', render: (r) => severityBadge(r.severity) },
                { key: 'districtName', label: 'District' },
                {
                    key: 'assignedTo',
                    label: 'Owner',
                    render: (r) => (r.assignedTo ? esc(r.assignedTo) : `<span class="text-secondary">Unassigned</span>`)
                }
            ],
            rows: triageQueue,
            empty: 'No unresolved incidents'
        })
    });
}

function caseloadSection() {
    return `
        <section class="section-heading">
            <h2>Caseload Breakdown</h2>
            <span class="section-rule"></span>
        </section>
        <section class="operational-section">
            ${statusMixCard()}
            ${typeMixCard()}
            ${impactCard()}
            ${triageCard()}
        </section>`;
}

/* -------------------------------------------------------- Geographic band */

/** Detail panel for one incident — updated on map-marker or row click. */
function incidentDetail(i) {
    if (!i) return `<div class="chart-caption">Select an incident on the map or in the register.</div>`;
    return `
        <div class="detail-head">
            <span class="font-mono">${esc(i.id)}</span>
            ${severityBadge(i.severity)}
        </div>
        ${statRow('Type', esc(i.type), { bold: true })}
        ${statRow('District', esc(i.districtName))}
        ${statRow('Status', statusDot(i.status))}
        ${statRow('Reported', esc(i.reportedAt))}
        ${statRow('Casualties', esc(num(i.casualties)), { tone: i.casualties ? 'red' : undefined })}
        ${statRow('Injured', esc(num(i.injured)), { tone: i.injured ? 'orange' : undefined })}
        ${statRow('Damage estimate', esc(`₹${num(i.damageEstimate)}`))}
        ${statRow('Assigned to', i.assignedTo ? esc(i.assignedTo) : '<span class="text-secondary">Unassigned</span>')}`;
}

function geoSection() {
    return `
        <section class="section-heading">
            <h2>Incident Map</h2>
            <span class="section-rule"></span>
        </section>
        <section class="hero-section">
            ${card({
                title: 'Where Incidents Are',
                subtitle: `${INCIDENTS.length} incidents · coloured by severity`,
                className: 'map-container',
                bodyClass: 'p-0',
                body: `
                    <div id="inc-map" class="map-view"></div>
                    <div class="map-legend">
                        <h4>Severity</h4>
                        <ul>
                            <li><span class="color-box bg-red"></span> Severe</li>
                            <li><span class="color-box bg-orange"></span> Warning</li>
                            <li><span class="color-box bg-yellow"></span> Watch</li>
                        </ul>
                    </div>`
            })}
            <div class="hero-right-panel">
                ${card({
                    title: 'Incident Detail',
                    subtitle: 'Click a marker or a register row',
                    body: `<div id="inc-detail">${incidentDetail(triageQueue[0])}</div>`
                })}
            </div>
        </section>`;
}

/* --------------------------------------------------------- Register band */

function registerSection() {
    return `
        <section class="section-heading">
            <h2>Incident Register</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'All Incidents',
                subtitle: `${INCIDENTS.length} records · filtered by the controls above`,
                actions: `<span class="chart-caption" id="inc-count">${esc(INCIDENTS.length)} shown</span>`,
                body: table({
                    className: 'incident-register',
                    columns: [
                        { key: 'id', label: 'ID', render: (r) => `<span class="font-mono">${esc(r.id)}</span>` },
                        { key: 'type', label: 'Type' },
                        { key: 'districtName', label: 'District' },
                        { key: 'severity', label: 'Severity', render: (r) => severityBadge(r.severity) },
                        { key: 'status', label: 'Status', render: (r) => statusDot(r.status) },
                        { key: 'reportedAt', label: 'Reported' },
                        {
                            key: 'casualties',
                            label: 'Casualties',
                            align: 'right',
                            render: (r) => (r.casualties ? `<span class="text-red font-semibold">${esc(num(r.casualties))}</span>` : esc(num(r.casualties)))
                        },
                        { key: 'injured', label: 'Injured', align: 'right', render: (r) => esc(num(r.injured)) },
                        {
                            key: 'assignedTo',
                            label: 'Assigned to',
                            render: (r) => (r.assignedTo ? esc(r.assignedTo) : `<span class="text-secondary">Unassigned</span>`)
                        },
                        { key: 'damageEstimate', label: 'Damage', align: 'right', render: (r) => esc(`₹${compact(r.damageEstimate)}`) }
                    ],
                    rows: INCIDENTS
                })
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Incident Management',
    subtitle: 'Report, assign, and resolve field incidents',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${caseloadSection()}
            ${geoSection()}
            ${registerSection()}`;
    },

    mount(root) {
        mkChart('#inc-status-chart', donutOptions({
            series: statusCounts.map((s) => s.count),
            labels: statusCounts.map((s) => s.status.replace(/-/g, ' ')),
            // Reuse the status tone map so a donut slice and its table chip agree on colour.
            colors: statusCounts.map((s) => PALETTE[statusToneOf(s.status)]),
            height: 280,
            totalLabel: 'Incidents'
        }));

        mkChart('#inc-type-chart', columnOptions({
            series: [{ name: 'Incidents', data: typeCounts.map((t) => t.count) }],
            categories: typeCounts.map((t) => t.type),
            colors: [PALETTE.blue],
            height: 280,
            horizontal: true
        }));

        /* Register filtering.
           table() gives no hook for per-row attributes, but it emits rows in the
           same order as the array it was handed — so row i is INCIDENTS[i], and
           the filter can work off the source objects instead of scraping cells. */
        const bodyRows = Array.from(root.querySelectorAll('.incident-register tbody tr'));
        const countEl = root.querySelector('#inc-count');
        const statusControl = root.querySelector('#inc-status');
        const districtSelect = root.querySelector('#inc-district');

        function applyFilters() {
            const activeStatus = statusControl?.querySelector('.segment.active')?.dataset.value || 'all';
            const activeDistrict = districtSelect?.value || 'all';
            let shown = 0;
            bodyRows.forEach((tr, i) => {
                const incident = INCIDENTS[i];
                const match =
                    (activeStatus === 'all' || incident.status === activeStatus) &&
                    (activeDistrict === 'all' || incident.districtId === activeDistrict);
                tr.hidden = !match;
                if (match) shown += 1;
            });
            if (countEl) countEl.textContent = `${shown} shown`;
        }

        root.querySelectorAll('.segmented .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                applyFilters();
            });
        });
        districtSelect?.addEventListener('change', applyFilters);

        // --- Incident map + drill-down detail ---------------------------
        const detailEl = root.querySelector('#inc-detail');
        const showDetail = (incident) => {
            if (detailEl) {
                detailEl.innerHTML = incidentDetail(incident);
                if (window.lucide) window.lucide.createIcons();
            }
        };
        const map = createMap('inc-map');
        if (map) addIncidentLayer(map, incidentPoints, { onClick: showDetail });

        // Clicking a register row loads it into the detail panel too.
        bodyRows.forEach((tr, i) => {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', () => showDetail(INCIDENTS[i]));
        });

        // --- Export register → CSV --------------------------------------
        root.querySelector('[aria-label="Export register"]')?.addEventListener('click', () =>
            downloadCsv(
                INCIDENTS,
                ['id', 'type', 'districtName', 'severity', 'status', 'reportedAt', 'casualties', 'injured', 'assignedTo', 'damageEstimate'],
                'incident-register.csv'
            )
        );
    }
};
