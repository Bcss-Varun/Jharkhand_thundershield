/**
 * Historical Analytics — multi-year trends, seasonality, and hotspots.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar  — year window + metric scope
 *   2. KPIs         — the five-year picture in four numbers
 *   3. Multi-year   — annual strikes and annual casualties, side by side
 *   4. Seasonality  — the monsoon curve, which drives every staffing decision
 *   5. Hotspots     — which districts carry the load, and which way they moved
 *
 * 2026 is a part-year in the source data (Jan–Jul), so its bars sit far below
 * 2025 and read as a collapse in activity. Every chart that includes it greys
 * the partial bar and carries a caveat; a comparison against 2025 would be
 * dishonest without it.
 */

import {
    card, kpi, statRow, table, badge, toolbar, iconButton,
    num, compact, esc, downloadCsv
} from '../components.js';
import { mkChart, columnOptions, lineOptions, PALETTE } from '../charts.js';
import { refresh } from '../router.js';
import { HISTORICAL } from '../data/mock.js';

/** Last entry in `years` is the year in progress; everything before it is complete. */
const PARTIAL_YEAR = HISTORICAL.years[HISTORICAL.years.length - 1];
const COMPLETE_YEARS = HISTORICAL.years.slice(0, -1);
const COMPLETE_STRIKES = HISTORICAL.annualStrikes.slice(0, -1);
const COMPLETE_CASUALTIES = HISTORICAL.annualCasualties.slice(0, -1);

const PARTIAL_STRIKES = HISTORICAL.annualStrikes[HISTORICAL.annualStrikes.length - 1];
const PARTIAL_CASUALTIES = HISTORICAL.annualCasualties[HISTORICAL.annualCasualties.length - 1];

const PEAK_INDEX = COMPLETE_STRIKES.indexOf(Math.max(...COMPLETE_STRIKES));
const PEAK_YEAR = COMPLETE_YEARS[PEAK_INDEX];
const PEAK_STRIKES = COMPLETE_STRIKES[PEAK_INDEX];

const AVG_ANNUAL = Math.round(COMPLETE_STRIKES.reduce((a, b) => a + b, 0) / COMPLETE_STRIKES.length);
const TOTAL_CASUALTIES = COMPLETE_CASUALTIES.reduce((a, b) => a + b, 0);

const PEAK_MONTH_INDEX = HISTORICAL.monthlyAvg.indexOf(Math.max(...HISTORICAL.monthlyAvg));
const PEAK_MONTH = HISTORICAL.months[PEAK_MONTH_INDEX];
const YEAR_TOTAL_AVG = HISTORICAL.monthlyAvg.reduce((a, b) => a + b, 0);

/** Jun–Sep carries the monsoon peak; those bars get their own colour. */
const MONSOON_MONTHS = ['Jun', 'Jul', 'Aug', 'Sep'];
const MONSOON_SHARE = Math.round(
    (HISTORICAL.months.reduce((sum, m, i) => (MONSOON_MONTHS.includes(m) ? sum + HISTORICAL.monthlyAvg[i] : sum), 0) /
        YEAR_TOTAL_AVG) *
        100
);

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `${badge(`${PARTIAL_YEAR} is a part-year`, 'yellow')}`,
        right: `
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export dataset')}
        `
    });
}

/* ------------------------------------------------------------ Hero KPIs */

function heroKpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: `Peak Year Strikes (${PEAK_YEAR})`,
                value: compact(PEAK_STRIKES),
                icon: 'zap',
                tone: 'orange',
                delta: {
                    value: `${Math.round(((PEAK_STRIKES - AVG_ANNUAL) / AVG_ANNUAL) * 100)}% above 5-yr avg`,
                    direction: 'up',
                    sentiment: 'bad'
                },
                context: `${num(PEAK_STRIKES)} detections`
            })}
            ${kpi({
                title: `${PARTIAL_YEAR} Strikes To Date`,
                value: compact(PARTIAL_STRIKES),
                icon: 'calendar',
                tone: 'blue',
                delta: { value: 'Part-year — not comparable', direction: 'flat', sentiment: 'neutral' },
                context: `vs ${compact(AVG_ANNUAL)} full-year average`
            })}
            ${kpi({
                title: 'Casualties, 5 Full Years',
                value: num(TOTAL_CASUALTIES),
                icon: 'heart-pulse',
                tone: 'red',
                delta: {
                    value: `${COMPLETE_CASUALTIES[COMPLETE_CASUALTIES.length - 1]} in ${COMPLETE_YEARS[COMPLETE_YEARS.length - 1]}`,
                    direction: 'down',
                    sentiment: 'good'
                },
                context: `${PARTIAL_CASUALTIES} so far in ${PARTIAL_YEAR}`
            })}
            ${kpi({
                title: 'Peak Strike Month',
                value: PEAK_MONTH,
                icon: 'cloud-rain',
                tone: 'purple',
                delta: { value: `${MONSOON_SHARE}% of the year falls Jun–Sep`, direction: 'up', sentiment: 'bad' },
                context: `${num(HISTORICAL.monthlyAvg[PEAK_MONTH_INDEX])} avg strikes`
            })}
        </section>`;
}

/* -------------------------------------------------------- Multi-year band */

function partialYearNote() {
    return `
        <div class="ai-warning-banner">
            <i data-lucide="info"></i>
            <span>${esc(PARTIAL_YEAR)} covers Jan–Jul only. The drop is incomplete collection, not a decline in activity.</span>
        </div>`;
}

function annualStrikesCard() {
    return card({
        title: 'Annual Lightning Strikes',
        subtitle: `${HISTORICAL.years[0]}–${PARTIAL_YEAR}`,
        actions: `${iconButton('download', 'Export series')}`,
        body: `
            <div id="hist-annual-chart"></div>
            ${partialYearNote()}`
    });
}

function annualCasualtiesCard() {
    return card({
        title: 'Annual Lightning Casualties',
        subtitle: 'Confirmed fatalities, statewide',
        actions: `<a class="link-btn" href="#/incidents">Incident register</a>`,
        body: `
            <div id="hist-casualty-chart"></div>
            <div class="mt-3">
                ${statRow('5-year total', `<span class="font-semibold">${esc(num(TOTAL_CASUALTIES))}</span>`)}
                ${statRow('Best full year', `${esc(COMPLETE_YEARS[COMPLETE_CASUALTIES.indexOf(Math.min(...COMPLETE_CASUALTIES))])} · ${esc(Math.min(...COMPLETE_CASUALTIES))}`, { tone: 'green' })}
                ${statRow('Worst full year', `${esc(COMPLETE_YEARS[COMPLETE_CASUALTIES.indexOf(Math.max(...COMPLETE_CASUALTIES))])} · ${esc(Math.max(...COMPLETE_CASUALTIES))}`, { tone: 'red' })}
                ${statRow(`${PARTIAL_YEAR} to date`, `<span class="font-semibold">${esc(PARTIAL_CASUALTIES)}</span>`, { tone: 'orange' })}
            </div>`
    });
}

function multiYearSection() {
    return `
        <section class="section-heading">
            <h2>Multi-year Trend</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${annualStrikesCard()}
            ${annualCasualtiesCard()}
        </section>`;
}

/* -------------------------------------------------------- Seasonality band */

function seasonalitySection() {
    return `
        <section class="section-heading">
            <h2>Seasonality</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Monthly Strike Distribution',
                subtitle: 'Average per month across all recorded years',
                actions: `<a class="link-btn" href="#/weather">Weather archive</a>`,
                body: `
                    <div id="hist-monthly-chart"></div>
                    <div class="chart-caption mt-3">
                        Monsoon months (Jun–Sep) are highlighted — they account for ${esc(MONSOON_SHARE)}% of annual
                        strike activity, which is why deployment planning is built around them.
                    </div>`
            })}
        </section>`;
}

/* ----------------------------------------------------------- Hotspot band */

const TREND_TONE = { up: 'red', down: 'green' };

function hotspotTable() {
    return table({
        columns: [
            { key: 'name', label: 'District', render: (h) => `<span class="font-semibold">${esc(h.name)}</span>` },
            { key: 'strikes', label: 'Strikes (year)', align: 'right', render: (h) => esc(num(h.strikes)) },
            { key: 'casualties', label: 'Casualties', align: 'right', render: (h) => esc(num(h.casualties)) },
            {
                key: 'share',
                label: 'Share of top 8',
                align: 'right',
                render: (h) => {
                    const total = HISTORICAL.hotspots.reduce((s, x) => s + x.strikes, 0);
                    return esc(`${((h.strikes / total) * 100).toFixed(1)}%`);
                }
            },
            {
                key: 'trend',
                label: 'YoY',
                align: 'right',
                // Rising strike counts are bad news, so 'up' is red here.
                render: (h) => badge(h.trend === 'up' ? 'Rising' : 'Falling', TREND_TONE[h.trend] || 'gray')
            }
        ],
        rows: HISTORICAL.hotspots,
        empty: 'No hotspot data for this period'
    });
}

function hotspotSection() {
    const rising = HISTORICAL.hotspots.filter((h) => h.trend === 'up').length;
    return `
        <section class="section-heading">
            <h2>Hotspot Districts</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${card({
                title: 'Top 8 Hotspots',
                subtitle: `${rising} of ${HISTORICAL.hotspots.length} trending upward`,
                actions: `<a class="link-btn" href="#/analytics">District analytics</a>`,
                body: hotspotTable()
            })}
            ${card({
                title: 'Hotspot Strike Volume',
                subtitle: 'Current year, ranked',
                body: `<div id="hist-hotspot-chart"></div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Historical Analytics',
    subtitle: 'Multi-year trends, seasonality, and hotspots',

    render() {
        return `
            ${commandBar()}
            ${heroKpis()}
            ${multiYearSection()}
            ${seasonalitySection()}
            ${hotspotSection()}`;
    },

    mount(root) {
        // Distributed colouring is the cheapest way to mark the part-year bar
        // as "not like the others" without a second series or an annotation.
        const annual = columnOptions({
            series: [{ name: 'Strikes', data: HISTORICAL.annualStrikes }],
            categories: HISTORICAL.years,
            colors: HISTORICAL.years.map((y) => (y === PARTIAL_YEAR ? PALETTE.gray : PALETTE.blue)),
            height: 300
        });
        annual.plotOptions = { bar: { distributed: true, columnWidth: '52%', borderRadius: 4, borderRadiusApplication: 'end' } };
        annual.legend = { show: false };
        annual.yaxis = { labels: { formatter: (v) => compact(Math.round(v)) } };
        mkChart('#hist-annual-chart', annual);

        const casualties = lineOptions({
            series: [{ name: 'Casualties', data: HISTORICAL.annualCasualties }],
            categories: HISTORICAL.years,
            colors: [PALETTE.red],
            height: 300,
            showLegend: false
        });
        // Markers on: with six points the year-by-year values matter more than
        // the shape of the line, and the part-year tail needs to be legible.
        casualties.markers = { size: 4, hover: { size: 6 } };
        mkChart('#hist-casualty-chart', casualties);

        const monthly = columnOptions({
            series: [{ name: 'Avg strikes', data: HISTORICAL.monthlyAvg }],
            categories: HISTORICAL.months,
            colors: HISTORICAL.months.map((m) => (MONSOON_MONTHS.includes(m) ? PALETTE.orange : PALETTE.blue)),
            height: 320
        });
        monthly.plotOptions = { bar: { distributed: true, columnWidth: '58%', borderRadius: 4, borderRadiusApplication: 'end' } };
        monthly.legend = { show: false };
        monthly.yaxis = { labels: { formatter: (v) => compact(Math.round(v)) } };
        mkChart('#hist-monthly-chart', monthly);

        // Reversed because ApexCharts draws horizontal bars bottom-up.
        const ranked = [...HISTORICAL.hotspots].sort((a, b) => a.strikes - b.strikes);
        mkChart('#hist-hotspot-chart', columnOptions({
            series: [{ name: 'Strikes', data: ranked.map((h) => h.strikes) }],
            categories: ranked.map((h) => h.name),
            colors: [PALETTE.teal],
            horizontal: true,
            height: 340
        }));

        const refreshBtn = root.querySelector('[aria-label="Refresh"]');
        refreshBtn?.addEventListener('click', () => {
            refreshBtn.classList.add('refreshing');
            setTimeout(refresh, 400);
        });

        // Export dataset → CSV of the annual strike/casualty series.
        root.querySelector('[aria-label="Export dataset"]')?.addEventListener('click', () => {
            const rows = HISTORICAL.years.map((y, i) => ({
                year: y,
                strikes: HISTORICAL.annualStrikes[i],
                casualties: HISTORICAL.annualCasualties[i]
            }));
            downloadCsv(rows, ['year', 'strikes', 'casualties'], 'historical-strikes.csv');
        });
    }
};
