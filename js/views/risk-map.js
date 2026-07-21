/**
 * State Risk Map.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — scope + layer state, so the page says what it is showing
 *   2. KPIs          — how much of the state is elevated right now
 *   3. Hero          — full-height choropleth + the selected district's detail
 *   4. Ranking       — every district ordered by risk, plus tracked storm cells
 *
 * The map owns this page. Everything to its right is a readout of whatever the
 * operator last clicked, which is why the detail panel is re-rendered from a
 * single function used by both render() and the layer's click handler.
 */

import {
    card, kpi, statusPill, statRow, severityBadge, severityTone, table, progressBar,
    toolbar, select, iconButton, num, compact, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, donutOptions } from '../charts.js';
import { createMap, addDistrictRiskLayer, addStrikeLayer, addStormCellLayer, bindLayerToggles } from '../map.js';
import { refresh } from '../router.js';
import { DISTRICT_RISK, districtsByRisk, districtById, RISK_LEVELS, STRIKES, STORM_CELLS } from '../data/mock.js';

const ranked = districtsByRisk();
const rankedRows = ranked.map((d, i) => ({ ...d, rank: i + 1 }));
const topDistrict = ranked[0];
const elevated = DISTRICT_RISK.filter((d) => d.level !== 'normal');
const severeCount = DISTRICT_RISK.filter((d) => d.level === 'severe').length;
const statePopulation = DISTRICT_RISK.reduce((sum, d) => sum + d.population, 0);
const exposedPopulation = elevated.reduce((sum, d) => sum + d.population, 0);
const strikes24h = DISTRICT_RISK.reduce((sum, d) => sum + d.strikes24h, 0);

/** Risk bands ordered most-severe-first, with their live district counts. */
const distribution = Object.entries(RISK_LEVELS)
    .sort((a, b) => b[1].rank - a[1].rank)
    .map(([level, meta]) => ({
        level,
        label: meta.label,
        color: meta.color,
        count: DISTRICT_RISK.filter((d) => d.level === level).length
    }));

/** Storm-cell bearings arrive as degrees; operators read compass points. */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function compassOf(bearing) {
    return COMPASS[Math.round(bearing / 22.5) % 16];
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('risk-district', [
                { value: 'all', label: 'All districts' },
                ...ranked.map((d) => ({ value: d.id, label: d.name }))
            ])}
        `,
        right: `
            ${statusPill({ label: 'Elevated', value: `${elevated.length} / ${DISTRICT_RISK.length}`, tone: 'orange', icon: 'map-pin' })}
            ${statusPill({ label: 'Storm cells', value: STORM_CELLS.length, tone: 'purple', icon: 'cloud-lightning' })}
            <span class="live-chip"><span class="live-dot"></span> Live</span>
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export map')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Districts Elevated',
                value: `${elevated.length} / ${DISTRICT_RISK.length}`,
                icon: 'map-pin',
                tone: 'red',
                delta: { value: `${severeCount} severe`, direction: 'up', sentiment: 'bad' },
                context: 'Above normal risk band'
            })}
            ${kpi({
                title: 'Highest Risk Score',
                value: topDistrict.riskScore,
                unit: '/100',
                icon: 'gauge',
                tone: severityTone(topDistrict.level),
                delta: { value: RISK_LEVELS[topDistrict.level].label, direction: 'flat', sentiment: 'bad' },
                context: topDistrict.name
            })}
            ${kpi({
                title: 'Strikes (24h)',
                value: compact(strikes24h),
                icon: 'zap',
                tone: 'orange',
                delta: { value: `${compact(topDistrict.strikes24h)} in ${topDistrict.name}`, direction: 'up', sentiment: 'bad' },
                context: 'Statewide, all districts'
            })}
            ${kpi({
                title: 'Population Exposed',
                value: compact(exposedPopulation),
                icon: 'users',
                tone: 'yellow',
                delta: {
                    value: `${pct((exposedPopulation / statePopulation) * 100)} of state`,
                    direction: 'up',
                    sentiment: 'bad'
                },
                context: `In ${elevated.length} elevated districts`
            })}
        </section>`;
}

/* ------------------------------------------------------------ Hero band */

function mapCard() {
    return card({
        title: 'District Risk Choropleth',
        subtitle: `${elevated.length} districts elevated · ${STORM_CELLS.length} cells tracked`,
        className: 'map-container',
        bodyClass: 'p-0',
        actions: `<a class="link-btn" href="#/analytics">Analytics</a>`,
        body: `
            <div id="risk-map" class="map-view"></div>

            <div class="map-legend">
                <h4>Risk Level</h4>
                <ul>
                    ${distribution
                        .map((b) => `<li><span class="color-box bg-${esc(severityTone(b.level))}"></span> ${esc(b.label)}</li>`)
                        .join('')}
                </ul>
            </div>

            <div class="map-status-indicator">
                ${distribution
                    .map(
                        (b) =>
                            `<div class="status-item"><span class="badge bg-${esc(severityTone(b.level))}">${esc(b.count)}</span> ${esc(b.label)}</div>`
                    )
                    .join('')}
            </div>

            <div class="map-layers">
                <h4>Layers</h4>
                <label><input type="checkbox" data-layer="districts" checked> District Risk</label>
                <label><input type="checkbox" data-layer="strikes" checked> Lightning Strikes</label>
                <label><input type="checkbox" data-layer="cells" checked> Storm Cells</label>
            </div>`
    });
}

/** Body of the selection panel. Reused verbatim when a district is clicked. */
function districtDetail(d) {
    const tone = severityTone(d.level);
    return `
        <div class="district-risk-info">
            <div class="district-name">${esc(d.name)}</div>
            <div class="mt-2">${severityBadge(d.level)}</div>
            <div class="chart-caption mt-3">Risk score ${esc(d.riskScore)}/100</div>
            ${progressBar(d.riskScore, tone)}
            <div class="mt-4">
                ${statRow('Strikes (24h)', esc(num(d.strikes24h)), { bold: true, tone })}
                ${statRow('Population', esc(num(d.population)))}
                ${statRow('Area', `${esc(num(d.area))} km²`)}
                ${statRow('Schools exposed', esc(num(d.schools)))}
                ${statRow('Hospitals', esc(num(d.hospitals)))}
                ${statRow('Critical infrastructure', esc(num(d.criticalInfra)))}
                ${statRow('Power stations', esc(num(d.powerStations)))}
                ${statRow('Teams deployed', esc(d.teamsDeployed), { tone: d.teamsDeployed ? 'green' : 'gray' })}
                ${statRow('Shelters open', esc(d.sheltersOpen), { tone: d.sheltersOpen ? 'green' : 'gray' })}
            </div>
        </div>`;
}

function selectionCard() {
    return card({
        title: 'District Detail',
        subtitle: 'Click a district on the map',
        actions: `<a class="link-btn" href="#/analytics">Analytics</a>`,
        body: `<div id="risk-district-panel">${districtDetail(topDistrict)}</div>`
    });
}

function distributionCard() {
    return card({
        title: 'Risk Distribution',
        subtitle: `${DISTRICT_RISK.length} districts`,
        body: `<div id="risk-distribution-chart"></div>`
    });
}

function heroSection() {
    return `
        <section class="hero-section">
            ${mapCard()}
            <div class="hero-right-panel">
                ${selectionCard()}
                ${distributionCard()}
            </div>
        </section>`;
}

/* -------------------------------------------------------- Ranking band */

function rankingCard() {
    return card({
        title: 'District Risk Ranking',
        subtitle: 'Most dangerous first',
        actions: `<a class="link-btn" href="#/analytics">Compare districts</a>`,
        body: `
            <div class="scrollable">
                ${table({
                    columns: [
                        { key: 'rank', label: '#' },
                        { key: 'name', label: 'District', render: (r) => `<strong>${esc(r.name)}</strong>` },
                        { key: 'level', label: 'Level', render: (r) => severityBadge(r.level) },
                        {
                            key: 'riskScore',
                            label: 'Risk',
                            align: 'right',
                            render: (r) => `<span class="font-semibold text-${esc(severityTone(r.level))}">${esc(r.riskScore)}</span>`
                        },
                        { key: 'strikes24h', label: 'Strikes 24h', align: 'right', render: (r) => esc(num(r.strikes24h)) },
                        { key: 'population', label: 'Population', align: 'right', render: (r) => esc(compact(r.population)) },
                        { key: 'teamsDeployed', label: 'Teams', align: 'right', render: (r) => esc(r.teamsDeployed) },
                        { key: 'sheltersOpen', label: 'Shelters', align: 'right', render: (r) => esc(r.sheltersOpen) }
                    ],
                    rows: rankedRows,
                    empty: 'No district risk data'
                })}
            </div>`
    });
}

function stormCellCard() {
    return card({
        title: 'Tracked Storm Cells',
        subtitle: 'Movement vectors and arrival estimates',
        actions: `<a class="link-btn" href="#/lightning">Radar</a>`,
        body: `
            ${table({
                columns: [
                    { key: 'id', label: 'Cell', render: (c) => `<strong>${esc(c.id)}</strong>` },
                    { key: 'severity', label: 'Severity', render: (c) => severityBadge(c.severity) },
                    {
                        key: 'districtId',
                        label: 'Over',
                        render: (c) => esc(districtById(c.districtId) ? districtById(c.districtId).name : c.districtId)
                    },
                    { key: 'radiusKm', label: 'Radius', align: 'right', render: (c) => `${esc(c.radiusKm)} km` },
                    { key: 'bearing', label: 'Heading', align: 'right', render: (c) => `${esc(compassOf(c.bearing))} ${esc(c.bearing)}°` },
                    { key: 'speedKmh', label: 'Speed', align: 'right', render: (c) => `${esc(c.speedKmh)} km/h` },
                    {
                        key: 'etaMins',
                        label: 'ETA',
                        align: 'right',
                        render: (c) =>
                            `<span class="font-semibold text-${esc(c.etaMins < 20 ? 'red' : c.etaMins < 45 ? 'orange' : 'yellow')}">${esc(c.etaMins)} min</span>`
                    }
                ],
                rows: STORM_CELLS,
                empty: 'No storm cells tracked'
            })}
            <div class="chart-caption mt-3">
                Vectors project each cell half an hour forward along its bearing.
            </div>`
    });
}

function rankingSection() {
    return `
        <section class="section-heading">
            <h2>Risk Ranking &amp; Storm Tracking</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${rankingCard()}
            ${stormCellCard()}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'State Risk Map',
    subtitle: 'District-level risk, storm cells, and strike overlays',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${heroSection()}
            ${rankingSection()}`;
    },

    mount(root) {
        const panel = root.querySelector('#risk-district-panel');
        const showDistrict = (d) => {
            if (panel) panel.innerHTML = districtDetail(d);
            if (window.lucide) window.lucide.createIcons();
        };

        const map = createMap('risk-map');
        if (map) {
            const layers = {
                // Hover highlights the district and fills the side panel; click
                // does the same (and works on touch, where there is no hover).
                districts: addDistrictRiskLayer(map, DISTRICT_RISK, {
                    onHover: showDistrict,
                    onClick: showDistrict
                }),
                strikes: addStrikeLayer(map, STRIKES.slice(0, 90)),
                cells: addStormCellLayer(map, STORM_CELLS)
            };
            bindLayerToggles(map, root, layers);
        }

        mkChart('#risk-distribution-chart', donutOptions({
            series: distribution.map((b) => b.count),
            labels: distribution.map((b) => b.label),
            colors: distribution.map((b) => b.color),
            totalLabel: 'Districts',
            height: 250
        }));

        const districtSelect = root.querySelector('#risk-district');
        if (districtSelect && panel) {
            districtSelect.addEventListener('change', () => {
                const d = districtById(districtSelect.value);
                panel.innerHTML = districtDetail(d || topDistrict);
                if (window.lucide) window.lucide.createIcons();
            });
        }

        const refreshBtn = root.querySelector('[aria-label="Refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('refreshing');
                setTimeout(refresh, 400);
            });
        }

        // Export map → CSV of the district risk ranking.
        root.querySelector('[aria-label="Export map"]')?.addEventListener('click', () =>
            downloadCsv(
                rankedRows,
                ['rank', 'name', 'level', 'riskScore', 'strikes24h', 'population', 'teamsDeployed', 'sheltersOpen'],
                'district-risk-ranking.csv'
            )
        );
    }
};
