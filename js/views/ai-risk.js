/**
 * AI Risk Intelligence.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — horizon + district scope
 *   2. KPIs          — headline risk, arrival, model accuracy, exposure
 *   3. Forecast band — 6-hour predicted risk (left) + gauge & model card (right)
 *   4. Nowcast band  — predicted vs observed backtest
 *   5. Ranking       — districts the model scores highest right now
 *
 * The gauge is the verdict, the timeline is the argument for it, and the
 * backtest is the reason to believe either — so they read in that order.
 */

import {
    card, kpi, statRow, severityBadge, severityTone, table, timeline as timelineList,
    toolbar, select, iconButton, num, compact, pct, esc, badge, downloadCsv
} from '../components.js';
import { mkChart, gaugeOptions, lineOptions, columnOptions, PALETTE } from '../charts.js';
import { refresh, navigate } from '../router.js';
import { AI_FORECAST, DISTRICT_RISK, districtsByRisk, ALERTS } from '../data/mock.js';

const { accuracy } = AI_FORECAST;

const elevatedCount = DISTRICT_RISK.filter((d) => d.level !== 'normal').length;

/**
 * Backtest rows. `observed` carries a trailing null for today — today isn't
 * over, so there is nothing to score against yet, and that day is excluded
 * from the error maths rather than counted as a zero-error hit.
 */
const backtest = accuracy.days.map((day, i) => ({
    day,
    predicted: accuracy.predicted[i],
    observed: accuracy.observed[i]
}));

const scoredDays = backtest.filter((d) => d.observed !== null && d.observed !== undefined);
const meanAbsError =
    scoredDays.reduce((sum, d) => sum + Math.abs(d.predicted - d.observed), 0) / scoredDays.length;

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('ai-district', [
                { value: 'all', label: 'All districts' },
                ...DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name }))
            ])}
        `,
        right: `
            <span class="live-chip"><span class="live-dot"></span> Model live</span>
            ${iconButton('refresh-cw', 'Re-run nowcast')}
            ${iconButton('download', 'Export forecast')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    const severeCount = DISTRICT_RISK.filter((d) => d.level === 'severe').length;
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Composite Risk Score',
                value: AI_FORECAST.riskScore,
                unit: '/100',
                icon: 'brain-circuit',
                tone: severityTone(AI_FORECAST.severity),
                delta: { value: `${AI_FORECAST.confidence}% confidence`, direction: 'flat', sentiment: 'neutral' },
                context: `${AI_FORECAST.severity} band`
            })}
            ${kpi({
                title: 'Expected Arrival',
                value: `${AI_FORECAST.etaMins} min`,
                icon: 'clock',
                tone: 'orange',
                delta: { value: `Tracking ${AI_FORECAST.direction}`, direction: 'up', sentiment: 'bad' },
                context: `${AI_FORECAST.durationMins} min expected duration`
            })}
            ${kpi({
                title: 'Nowcast Accuracy',
                value: pct(100 - meanAbsError, 1),
                icon: 'target',
                tone: 'green',
                delta: { value: `${meanAbsError.toFixed(1)} pt mean error`, direction: 'flat', sentiment: 'good' },
                context: `${scoredDays.length} scored days`
            })}
            ${kpi({
                title: 'Districts Elevated',
                value: elevatedCount,
                icon: 'map-pin',
                tone: 'yellow',
                delta: { value: `${severeCount} severe`, direction: 'up', sentiment: 'bad' },
                context: `of ${DISTRICT_RISK.length} districts`
            })}
        </section>`;
}

/* --------------------------------------------------------- Forecast band */

function timelineCard() {
    return card({
        title: '6-Hour Predicted Risk',
        subtitle: 'Risk score against model confidence, per hour',
        actions: `<a class="link-btn" href="#/risk-map">Risk map</a>`,
        body: `
            <div id="ai-timeline-chart"></div>
            <div class="chart-caption mt-3">
                Confidence decays with horizon — the +6h reading is the least trustworthy point on the curve.
            </div>`
    });
}

function gaugeCard() {
    return card({
        title: 'Current Verdict',
        subtitle: AI_FORECAST.modelVersion,
        body: `
            <div class="ai-risk-body">
                <div id="ai-risk-gauge"></div>
                <div class="gauge-verdict">
                    ${badge(`${AI_FORECAST.riskScore}% ${AI_FORECAST.severity.toUpperCase()} RISK`, severityTone(AI_FORECAST.severity))}
                </div>
                <div class="ai-risk-details">
                    ${statRow('Severity', severityBadge(AI_FORECAST.severity))}
                    ${statRow('Storm direction', esc(AI_FORECAST.direction))}
                    ${statRow('Expected duration', esc(`${AI_FORECAST.durationMins} mins`))}
                </div>
            </div>
            <div class="ai-recommendation">
                <strong>Recommended action:</strong> ${esc(AI_FORECAST.recommendation)}
            </div>`
    });
}

function modelCard() {
    return card({
        title: 'Model Metadata',
        subtitle: 'Nowcast engine provenance',
        actions: `<a class="link-btn" href="#/admin">Model settings</a>`,
        body: `
            ${statRow('Model version', `<span class="font-mono">${esc(AI_FORECAST.modelVersion)}</span>`, { bold: true })}
            ${statRow('Last trained', esc(AI_FORECAST.lastTrained))}
            ${statRow('Reported confidence', esc(`${AI_FORECAST.confidence}%`), { tone: 'green', bold: true })}
            ${statRow('Backtest mean error', esc(`${meanAbsError.toFixed(1)} pts`))}
            ${statRow('Forecast horizon', esc(`${AI_FORECAST.timeline.length} hours`))}`
    });
}

function forecastSection() {
    return `
        <section class="hero-section">
            ${timelineCard()}
            <div class="hero-right-panel">
                ${gaugeCard()}
                ${modelCard()}
            </div>
        </section>`;
}

/* ---------------------------------------------------------- Nowcast band */

function accuracyCard() {
    return card({
        title: 'Nowcast Accuracy',
        subtitle: 'Predicted risk vs observed outcome, last 7 days',
        actions: `<a class="link-btn" href="#/analytics?tab=historical">Historical analytics</a>`,
        body: `
            <div id="ai-accuracy-chart"></div>
            <div class="chart-caption mt-3">
                Today has no observed bar — the day is still in progress, so it is left unscored rather than graded early.
            </div>`
    });
}

function driftCard() {
    return card({
        title: 'Per-Day Error',
        subtitle: 'Signed drift, predicted minus observed',
        bodyClass: 'scrollable',
        body: table({
            columns: [
                { key: 'day', label: 'Day' },
                { key: 'predicted', label: 'Predicted', align: 'right', render: (r) => esc(r.predicted) },
                // num() already renders null as an em dash, which is what an
                // unscored day should look like — not a zero.
                { key: 'observed', label: 'Observed', align: 'right', render: (r) => esc(num(r.observed)) },
                {
                    key: 'drift',
                    label: 'Drift',
                    align: 'right',
                    render: (r) => {
                        if (r.observed === null || r.observed === undefined) {
                            return `<span class="text-secondary">Pending</span>`;
                        }
                        const drift = r.predicted - r.observed;
                        const tone = Math.abs(drift) <= 4 ? 'green' : Math.abs(drift) <= 8 ? 'yellow' : 'red';
                        return `<span class="text-${esc(tone)} font-semibold">${esc(drift > 0 ? `+${drift}` : drift)}</span>`;
                    }
                }
            ],
            rows: backtest
        })
    });
}

function modelAlertsCard() {
    return card({
        title: 'Model-Triggered Alerts',
        subtitle: 'Detections that crossed a nowcast threshold',
        actions: `<a class="link-btn" href="#/alerts">All alerts</a>`,
        bodyClass: 'scrollable',
        body: timelineList(ALERTS)
    });
}

function nowcastSection() {
    return `
        <section class="section-heading">
            <h2>Nowcast Performance</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${accuracyCard()}
            ${driftCard()}
            ${modelAlertsCard()}
        </section>`;
}

/* --------------------------------------------------------- District band */

function rankingSection() {
    return `
        <section class="section-heading">
            <h2>Model District Ranking</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Highest Scored Districts',
                subtitle: 'Top 10 by composite risk score',
                actions: `<a class="link-btn" href="#/analytics">District analytics</a>`,
                body: table({
                    columns: [
                        { key: 'name', label: 'District', render: (d) => `<span class="font-semibold">${esc(d.name)}</span>` },
                        { key: 'level', label: 'Level', render: (d) => severityBadge(d.level) },
                        { key: 'riskScore', label: 'Risk score', align: 'right', render: (d) => esc(d.riskScore) },
                        { key: 'strikes24h', label: 'Strikes 24h', align: 'right', render: (d) => esc(num(d.strikes24h)) },
                        { key: 'population', label: 'Population', align: 'right', render: (d) => esc(compact(d.population)) },
                        { key: 'criticalInfra', label: 'Critical infra', align: 'right', render: (d) => esc(num(d.criticalInfra)) },
                        { key: 'teamsDeployed', label: 'Teams', align: 'right', render: (d) => esc(d.teamsDeployed) }
                    ],
                    rows: districtsByRisk().slice(0, 10)
                })
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'AI Risk Intelligence',
    subtitle: 'Nowcast forecast, district scoring, and model accuracy',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${forecastSection()}
            ${nowcastSection()}
            ${rankingSection()}`;
    },

    mount(root) {
        mkChart('#ai-risk-gauge', gaugeOptions({
            value: AI_FORECAST.riskScore,
            color: PALETTE[severityTone(AI_FORECAST.severity)] || PALETTE.red,
            label: 'Risk score',
            height: 200
        }));

        mkChart('#ai-timeline-chart', {
            ...lineOptions({
                series: [
                    { name: 'Predicted risk', data: AI_FORECAST.timeline.map((t) => t.risk) },
                    { name: 'Model confidence', data: AI_FORECAST.timeline.map((t) => t.confidence) }
                ],
                categories: AI_FORECAST.timeline.map((t) => t.hour),
                colors: [PALETTE.red, PALETTE.blue],
                type: 'area',
                height: 320
            }),
            // Both series are 0-100 scores, so pinning the axis keeps the two
            // curves directly comparable instead of auto-scaling each to fit.
            yaxis: { min: 0, max: 100, tickAmount: 5 }
        });

        mkChart('#ai-accuracy-chart', {
            ...columnOptions({
                series: [
                    { name: 'Predicted', data: accuracy.predicted },
                    { name: 'Observed', data: accuracy.observed }
                ],
                categories: accuracy.days,
                colors: [PALETTE.purple, PALETTE.teal],
                height: 300
            }),
            // The trailing null in `observed` is deliberate: ApexCharts simply
            // omits today's observed bar, which is the honest rendering.
            yaxis: { min: 0, max: 100, tickAmount: 5 }
        });

        // District scope → deep-dive that district in Analytics (matches the
        // global-search idiom '#/analytics?q=<term>').
        const districtSel = root.querySelector('#ai-district');
        if (districtSel) {
            districtSel.addEventListener('change', () => {
                if (districtSel.value === 'all') return;
                const d = DISTRICT_RISK.find((x) => x.id === districtSel.value);
                navigate(`analytics?q=${encodeURIComponent(d ? d.name : districtSel.value)}`);
            });
        }

        const rerunBtn = root.querySelector('[aria-label="Re-run nowcast"]');
        if (rerunBtn) {
            rerunBtn.addEventListener('click', () => {
                rerunBtn.classList.add('refreshing');
                setTimeout(refresh, 400);
            });
        }

        // Export forecast → CSV of the district ranking the model produced.
        root.querySelector('[aria-label="Export forecast"]')?.addEventListener('click', () =>
            downloadCsv(
                districtsByRisk(),
                ['name', 'level', 'riskScore', 'strikes24h', 'population', 'criticalInfra', 'teamsDeployed'],
                'ai-district-ranking.csv'
            )
        );
    }
};
