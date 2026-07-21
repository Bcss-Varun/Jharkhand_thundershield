/**
 * District Analytics — 24-district comparison and drill-down.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar  — level filter, rank metric, drill-down selector
 *   2. KPIs         — statewide roll-up of the comparison below
 *   3. Ranking      — ranked bar of the chosen metric + drill-down panel
 *   4. Comparison   — the full 24-row exposure table
 *
 * The global header search lands here as '#/district-analytics?q=<term>', so
 * `q` pre-filters the table and pre-selects the drill-down rather than being
 * silently dropped.
 */

import {
    card, kpi, statusPill, statRow, severityBadge, severityTone, table, progressBar,
    toolbar, segmented, select, iconButton, badge, num, compact, esc
} from '../components.js';
import { mkChart, columnOptions, PALETTE } from '../charts.js';
import { queryParams } from '../router.js';
import { DISTRICT_RISK, RISK_LEVELS, districtById, districtsByRisk } from '../data/mock.js';

const ELEVATED = DISTRICT_RISK.filter((d) => d.level !== 'normal');
const SEVERE_COUNT = DISTRICT_RISK.filter((d) => d.level === 'severe').length;
const TOTAL_STRIKES = DISTRICT_RISK.reduce((sum, d) => sum + d.strikes24h, 0);
const EXPOSED_POP = ELEVATED.reduce((sum, d) => sum + d.population, 0);
const TOTAL_TEAMS = DISTRICT_RISK.reduce((sum, d) => sum + d.teamsDeployed, 0);
const TOTAL_SHELTERS = DISTRICT_RISK.reduce((sum, d) => sum + d.sheltersOpen, 0);

/** Metrics the ranking chart can be re-pointed at. */
const METRICS = [
    { value: 'riskScore', label: 'Risk score' },
    { value: 'strikes24h', label: 'Strikes (24h)' },
    { value: 'population', label: 'Population' },
    { value: 'criticalInfra', label: 'Critical infrastructure' }
];

const LEVEL_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'severe', label: 'Severe' },
    { value: 'warning', label: 'Warning' },
    { value: 'watch', label: 'Watch' },
    { value: 'normal', label: 'Normal' }
];

function matches(d, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.id.includes(q);
}

/* ----------------------------------------------------------- Command bar */

function commandBar(query) {
    return toolbar({
        left: `
            ${segmented('da-level', LEVEL_FILTERS, 'all')}
            ${select('da-metric', METRICS, { label: 'Rank by' })}
            ${select('da-district', DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name })), { label: 'Drill down' })}
        `,
        right: `
            ${query ? badge(`Search: ${query}`, 'blue') : ''}
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export comparison')}
        `
    });
}

/* ------------------------------------------------------------ Hero KPIs */

function heroKpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Districts Elevated',
                value: ELEVATED.length,
                icon: 'map-pin',
                tone: 'red',
                delta: { value: `${SEVERE_COUNT} at severe`, direction: 'up', sentiment: 'bad' },
                context: `of ${DISTRICT_RISK.length} monitored`
            })}
            ${kpi({
                title: 'Strikes (24h, statewide)',
                value: compact(TOTAL_STRIKES),
                icon: 'zap',
                tone: 'orange',
                delta: {
                    value: `${compact(ELEVATED.reduce((s, d) => s + d.strikes24h, 0))} in elevated districts`,
                    direction: 'up',
                    sentiment: 'bad'
                },
                context: `${num(TOTAL_STRIKES)} total`
            })}
            ${kpi({
                title: 'Population Exposed',
                value: compact(EXPOSED_POP),
                icon: 'users',
                tone: 'yellow',
                delta: { value: 'in elevated districts', direction: 'flat', sentiment: 'neutral' },
                context: `${num(EXPOSED_POP)} people`
            })}
            ${kpi({
                title: 'Response Deployed',
                value: TOTAL_TEAMS,
                unit: ' teams',
                icon: 'shield',
                tone: 'green',
                delta: { value: `${TOTAL_SHELTERS} shelters open`, direction: 'up', sentiment: 'good' },
                context: 'SDRF/NDRF across the state'
            })}
        </section>`;
}

/* --------------------------------------------------------- Ranking band */

function rankCard() {
    return card({
        title: 'District Ranking',
        subtitle: 'Top 12 districts',
        actions: `<a class="link-btn" href="#/risk-map">Risk map</a>`,
        body: `<div id="da-rank-chart"></div>`
    });
}

/** Drill-down body for one district. Re-rendered whenever the selection moves. */
function drillBody(d) {
    const tone = severityTone(d.level);
    return `
        <div class="metrics-column">
            ${statusPill({ label: 'Current level', value: RISK_LEVELS[d.level].label, tone, icon: 'activity' })}
            ${statRow('Risk score', `<span class="font-semibold text-${esc(tone)}">${esc(d.riskScore)}</span>`)}
        </div>
        ${progressBar(d.riskScore, tone)}
        <div class="resource-grid mt-4">
            <div class="res-item">
                <span class="res-lbl">Population</span>
                <div class="res-vals"><strong>${esc(compact(d.population))}</strong></div>
            </div>
            <div class="res-item">
                <span class="res-lbl">Area</span>
                <div class="res-vals"><strong>${esc(num(d.area))}</strong> <span class="standby">km²</span></div>
            </div>
            <div class="res-item">
                <span class="res-lbl">Schools</span>
                <div class="res-vals"><strong>${esc(num(d.schools))}</strong></div>
            </div>
            <div class="res-item">
                <span class="res-lbl">Hospitals</span>
                <div class="res-vals"><strong>${esc(num(d.hospitals))}</strong></div>
            </div>
            <div class="res-item">
                <span class="res-lbl">Power stations</span>
                <div class="res-vals"><strong>${esc(num(d.powerStations))}</strong></div>
            </div>
            <div class="res-item">
                <span class="res-lbl">Critical infra</span>
                <div class="res-vals"><strong>${esc(num(d.criticalInfra))}</strong></div>
            </div>
        </div>
        <div class="mt-4">
            ${statRow('Strikes (last 24h)', `<span class="font-semibold">${esc(num(d.strikes24h))}</span>`)}
            ${statRow('Response teams deployed', esc(d.teamsDeployed), { tone: d.teamsDeployed ? 'green' : 'gray' })}
            ${statRow('Shelters open', esc(d.sheltersOpen), { tone: d.sheltersOpen ? 'blue' : 'gray' })}
            ${statRow('Strikes per 1,000 people', esc((d.strikes24h / (d.population / 1000)).toFixed(2)))}
        </div>`;
}

function drillCard(d) {
    return card({
        title: d.name,
        subtitle: `${RISK_LEVELS[d.level].label} · risk score ${d.riskScore}`,
        actions: severityBadge(d.level),
        bodyClass: 'flex-col',
        body: drillBody(d)
    });
}

function rankingSection(selected) {
    return `
        <section class="section-heading">
            <h2>Ranking &amp; Drill-down</h2>
            <span class="section-rule"></span>
        </section>
        <section class="hero-section">
            ${rankCard()}
            <div class="hero-right-panel" id="da-drill">
                ${drillCard(selected)}
            </div>
        </section>`;
}

/* ------------------------------------------------------ Comparison table */

const COLUMNS = [
    {
        key: 'name',
        label: 'District',
        sortVal: (d) => d.name,
        render: (d) => `<span class="font-semibold" data-district="${esc(d.id)}">${esc(d.name)}</span>`
    },
    { key: 'level', label: 'Level', sortVal: (d) => RISK_LEVELS[d.level].rank, render: (d) => severityBadge(d.level) },
    {
        key: 'riskScore',
        label: 'Risk',
        align: 'right',
        sortVal: (d) => d.riskScore,
        render: (d) => `<span class="font-semibold text-${esc(severityTone(d.level))}">${esc(d.riskScore)}</span>`
    },
    { key: 'strikes24h', label: 'Strikes 24h', align: 'right', sortVal: (d) => d.strikes24h, render: (d) => esc(num(d.strikes24h)) },
    { key: 'population', label: 'Population', align: 'right', sortVal: (d) => d.population, render: (d) => esc(compact(d.population)) },
    { key: 'schools', label: 'Schools', align: 'right', sortVal: (d) => d.schools, render: (d) => esc(num(d.schools)) },
    { key: 'hospitals', label: 'Hospitals', align: 'right', sortVal: (d) => d.hospitals, render: (d) => esc(num(d.hospitals)) },
    { key: 'criticalInfra', label: 'Critical infra', align: 'right', sortVal: (d) => d.criticalInfra, render: (d) => esc(num(d.criticalInfra)) },
    {
        key: 'teamsDeployed',
        label: 'Teams',
        align: 'right',
        sortVal: (d) => d.teamsDeployed,
        render: (d) =>
            d.teamsDeployed ? `<span class="text-green font-semibold">${esc(d.teamsDeployed)}</span>` : '<span class="text-gray">—</span>'
    },
    {
        key: 'sheltersOpen',
        label: 'Shelters',
        align: 'right',
        sortVal: (d) => d.sheltersOpen,
        render: (d) =>
            d.sheltersOpen ? `<span class="text-blue font-semibold">${esc(d.sheltersOpen)}</span>` : '<span class="text-gray">—</span>'
    }
];

function comparisonSection() {
    return `
        <section class="section-heading">
            <h2>District Comparison</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Exposure & Response by District',
                subtitle: 'Click a column header to sort, a row to drill down',
                actions: `${iconButton('download', 'Export table')}`,
                body: `<div id="da-table"></div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'District Analytics',
    subtitle: 'Compare districts by risk, exposure, and vulnerability',

    render() {
        const q = queryParams().q || '';
        // A search that names a district should open on that district, not on
        // the statewide leader — otherwise the query looks ignored.
        const selected = DISTRICT_RISK.find((d) => matches(d, q)) || districtsByRisk()[0];
        return `
            ${commandBar(q)}
            ${heroKpis()}
            ${rankingSection(selected)}
            ${comparisonSection()}`;
    },

    mount(root) {
        const q = queryParams().q || '';
        const state = { level: 'all', metric: 'riskScore', query: q, sort: 'riskScore', dir: 'desc' };

        const tableHost = root.querySelector('#da-table');
        const drillHost = root.querySelector('#da-drill');
        const metricSel = root.querySelector('#da-metric');
        const districtSel = root.querySelector('#da-district');

        function rankedData(metric) {
            // Reversed because ApexCharts draws horizontal bars bottom-up.
            const top = [...DISTRICT_RISK].sort((a, b) => b[metric] - a[metric]).slice(0, 12).reverse();
            return { labels: top.map((d) => d.name), values: top.map((d) => d[metric]) };
        }

        function sortedRows() {
            const col = COLUMNS.find((c) => c.key === state.sort) || COLUMNS[2];
            return DISTRICT_RISK
                .filter((d) => state.level === 'all' || d.level === state.level)
                .filter((d) => matches(d, state.query))
                .sort((a, b) => {
                    const av = col.sortVal(a);
                    const bv = col.sortVal(b);
                    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
                    return state.dir === 'desc' ? -cmp : cmp;
                });
        }

        function showDistrict(id) {
            const d = districtById(id);
            if (!d) return;
            drillHost.innerHTML = drillCard(d);
            if (districtSel) districtSel.value = id;
            if (window.lucide) window.lucide.createIcons();
        }

        function drawTable() {
            tableHost.innerHTML = table({
                columns: COLUMNS,
                rows: sortedRows(),
                empty: state.query ? `No district matches "${state.query}"` : 'No districts in this risk band'
            });
            // Header cells are rebuilt with the body, so listeners are re-bound
            // on every draw rather than once at mount.
            tableHost.querySelectorAll('th').forEach((th, i) => {
                const col = COLUMNS[i];
                if (!col || !col.sortVal) return;
                th.classList.add('th-sortable');
                th.addEventListener('click', () => {
                    if (state.sort === col.key) {
                        state.dir = state.dir === 'desc' ? 'asc' : 'desc';
                    } else {
                        state.sort = col.key;
                        state.dir = typeof col.sortVal(DISTRICT_RISK[0]) === 'string' ? 'asc' : 'desc';
                    }
                    drawTable();
                });
            });
            tableHost.querySelectorAll('tbody tr').forEach((tr) => {
                const cell = tr.querySelector('[data-district]');
                if (cell) tr.addEventListener('click', () => showDistrict(cell.dataset.district));
            });
        }

        const rankChart = mkChart('#da-rank-chart', columnOptions({
            series: [{ name: 'Risk score', data: rankedData('riskScore').values }],
            categories: rankedData('riskScore').labels,
            colors: [PALETTE.blue],
            horizontal: true,
            height: 460
        }));

        if (metricSel) {
            metricSel.addEventListener('change', () => {
                state.metric = metricSel.value;
                const { labels, values } = rankedData(state.metric);
                const label = (METRICS.find((m) => m.value === state.metric) || METRICS[0]).label;
                if (rankChart) {
                    rankChart.updateOptions({ series: [{ name: label, data: values }], xaxis: { categories: labels } });
                }
            });
        }

        if (districtSel) {
            districtSel.addEventListener('change', () => showDistrict(districtSel.value));
        }

        root.querySelectorAll('#da-level .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                state.level = btn.dataset.value;
                drawTable();
            });
        });

        drawTable();

        // Keep the selector in step with the district render() already opened on.
        const preselect = DISTRICT_RISK.find((d) => matches(d, q)) || districtsByRisk()[0];
        if (districtSel) districtSel.value = preselect.id;
    }
};
