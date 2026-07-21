/**
 * Dashboard — the redesign.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar    — time range + district scope, so the page states what it's showing
 *   2. Hero KPIs      — 4 tiles that answer "how bad is it right now"
 *   3. Status strip   — 4 secondary metrics, demoted from the old 8-across row
 *   4. Operational    — map + AI/district panel; the thing operators actually watch
 *   5. Monitoring     — weather, response, alerts, incidents
 *   6. Resources      — network, deployment, infra impact
 *   7. Trend          — 7-day history
 *
 * The old layout gave all of these equal weight in one flat grid, so nothing
 * read as more urgent than anything else.
 */

import {
    card, kpi, statusPill, statRow, progressBar, statusDot, badge, severityBadge, severityTone,
    timeline, toolbar, select, iconButton, num, compact, esc, downloadFile
} from '../components.js';
import { mkChart, gaugeOptions, sparkOptions, columnOptions, PALETTE } from '../charts.js';
import { refresh, navigate } from '../router.js';
import {
    DISTRICT_RISK, districtsByRisk, STRIKE_SUMMARY, STORM_CELLS, WEATHER_NOW,
    SENSOR_HEALTH, RESOURCES, SHELTER_OCCUPANCY, INFRA_IMPACT, RESPONSE_STEPS,
    AI_FORECAST, ALERTS, INCIDENTS, INCIDENT_SUMMARY, ESCALATION_MATRIX,
    riskCounts, highRiskDistrictCount, populationUnderAlert, alertCounts, sensorCounts, elevatedDistrictCount
} from '../data/mock.js';

// All figures below are derived from the data via these selectors — the
// Dashboard no longer hardcodes counts that contradict the detail views.
const RISK = riskCounts();
const ALERT_STATS = alertCounts();
const SENSOR_STATS = sensorCounts();

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('dash-district', [
                { value: 'all', label: 'All districts' },
                ...DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name }))
            ])}
        `,
        right: `
            <span class="live-chip"><span class="live-dot"></span> Live</span>
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export snapshot')}
        `
    });
}

/* ------------------------------------------------------------ Hero KPIs */

function heroKpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Active Alerts',
                value: ALERT_STATS.active,
                icon: 'alert-triangle',
                tone: 'blue',
                context: `${ALERT_STATS.severe} severe · ${ALERT_STATS.warning} warning`
            })}
            ${kpi({
                title: 'High-Risk Districts',
                value: highRiskDistrictCount(),
                icon: 'map-pin',
                tone: 'red',
                context: `of ${DISTRICT_RISK.length} districts`
            })}
            ${kpi({
                title: 'Lightning Strikes (Today)',
                value: num(STRIKE_SUMMARY.today),
                icon: 'zap',
                tone: 'orange',
                context: `${num(STRIKE_SUMMARY.lastHour)} in the last hour`
            })}
            ${kpi({
                title: 'Population Under Alert',
                value: compact(populationUnderAlert()),
                icon: 'users',
                tone: 'yellow',
                context: `across ${elevatedDistrictCount()} districts`
            })}
            ${kpi({
                title: 'Open Incidents',
                value: INCIDENT_SUMMARY.open + INCIDENT_SUMMARY.active,
                icon: 'siren',
                tone: 'purple',
                context: `${INCIDENT_SUMMARY.open} open · ${INCIDENT_SUMMARY.active} in progress`
            })}
            ${kpi({
                title: 'Sensor Uptime',
                value: `${SENSOR_HEALTH.uptime}%`,
                icon: 'activity',
                tone: 'green',
                delta: { value: `${SENSOR_STATS.online}/${SENSOR_STATS.total} online`, direction: 'flat', sentiment: 'good' },
                context: SENSOR_STATS.offline ? `${SENSOR_STATS.offline} offline` : 'all reporting'
            })}
        </section>`;
}

/* ------------------------------------------------------------ Hero panel */

/** Compact risk breakdown — the interactive choropleth lives on the Risk Map
    page, so the Dashboard shows the distribution and links through. */
function riskOverviewCard() {
    const bands = [
        { label: 'Severe', tone: 'red', count: RISK.severe },
        { label: 'Warning', tone: 'orange', count: RISK.warning },
        { label: 'Watch', tone: 'yellow', count: RISK.watch },
        { label: 'Normal', tone: 'green', count: RISK.normal }
    ];
    const top = districtsByRisk().slice(0, 5);
    return card({
        title: 'State Risk Overview',
        subtitle: `${elevatedDistrictCount()} of ${DISTRICT_RISK.length} districts elevated`,
        actions: `<a class="link-btn" href="#/risk-map">Open risk map</a>`,
        body: `
            <div class="risk-band-grid">
                ${bands
                    .map(
                        (b) => `
                    <div class="risk-band">
                        <span class="risk-band-count text-${esc(b.tone)}">${esc(b.count)}</span>
                        <span class="risk-band-label"><span class="dot bg-${esc(b.tone)}"></span> ${esc(b.label)}</span>
                    </div>`
                    )
                    .join('')}
            </div>
            <div class="chart-caption mt-4">Highest-risk districts</div>
            <div class="mt-2">
                ${top
                    .map(
                        (d) => `
                    <div class="stat-row">
                        <span class="stat-label">${esc(d.name)}</span>
                        <span class="stat-val text-${esc(severityTone(d.level))}">${esc(d.riskScore)}/100</span>
                    </div>`
                    )
                    .join('')}
            </div>`
    });
}

/** Tracked storm cells — real movement vectors from STORM_CELLS (replaces the
    old hardcoded radar SVG, which duplicated the Lightning view and was fake). */
function stormCellsCard() {
    const rows = STORM_CELLS.map((c) => {
        const target = DISTRICT_RISK.find((d) => d.id === c.districtId);
        return `
            <div class="storm-cell-row">
                <div class="storm-cell-head">
                    <span class="storm-cell-id">${esc(c.id)}</span>
                    ${severityBadge(c.severity)}
                </div>
                <div class="storm-cell-meta">
                    <span><i data-lucide="navigation" style="transform:rotate(${c.bearing}deg)"></i> ${esc(c.speedKmh)} km/h</span>
                    <span><i data-lucide="crosshair"></i> ${esc(target ? target.name : c.districtId)}</span>
                    <span class="storm-cell-eta"><i data-lucide="clock"></i> ETA ${esc(c.etaMins)} min</span>
                </div>
            </div>`;
    }).join('');
    return card({
        title: 'Active Storm Cells',
        subtitle: `${STORM_CELLS.length} tracked`,
        actions: `<a class="link-btn" href="#/risk-map">Track</a>`,
        body: `<div class="storm-cell-list">${rows}</div>`
    });
}

/** Current escalation tier, derived from the AI severity band. */
function currentEscalation() {
    const lvl = { severe: 3, warning: 2, watch: 1, normal: 1 }[AI_FORECAST.severity] || 1;
    return ESCALATION_MATRIX.find((m) => m.level === lvl) || ESCALATION_MATRIX[0];
}

/** The AI's recommended next-best actions (the model's recommendation first). */
function recommendedActions() {
    const top = districtsByRisk()[0];
    return [
        { text: AI_FORECAST.recommendation, execute: '#/alerts' },
        { text: `Pre-position SDRF / NDRF for ${top.name}`, execute: '#/incidents' },
        { text: `Run Level ${currentEscalation().level} automated SOP`, execute: '#/alerts?tab=automation' }
    ];
}

/** AI Decision Support — gauge + verdict, an actionable recommendation list,
    and the escalation/ownership strip. */
function aiRiskCard() {
    const esc_ = currentEscalation();
    return card({
        title: 'AI Decision Support',
        subtitle: AI_FORECAST.modelVersion,
        actions: `<a class="link-btn" href="#/ai-risk">Details</a>`,
        bodyClass: 'flex-col',
        body: `
            <div class="ai-decision-top">
                <div id="dash-ai-gauge"></div>
                <div class="ai-decision-verdict">
                    ${badge(`${AI_FORECAST.riskScore}% ${AI_FORECAST.severity.toUpperCase()}`, severityTone(AI_FORECAST.severity), { solid: true })}
                    <div class="ai-decision-meta">Confidence ${AI_FORECAST.confidence}% · duration ${AI_FORECAST.durationMins}m</div>
                </div>
            </div>
            <div class="detail-group">Recommended Actions</div>
            <div class="rec-actions">
                ${recommendedActions()
                    .map(
                        (a, i) => `
                    <div class="rec-action">
                        <span class="rec-num">${i + 1}</span>
                        <span class="rec-text">${esc(a.text)}</span>
                        <span class="rec-buttons">
                            <a class="btn btn-primary btn-sm" href="${esc(a.execute)}">Execute</a>
                            <button class="btn btn-sm rec-ack">Ack</button>
                        </span>
                    </div>`
                    )
                    .join('')}
            </div>
            <div class="escalation-strip">
                <span>Escalation <strong>L${esc_.level} · ${esc(esc_.name)}</strong></span>
                <span>Owner <strong>${esc(esc_.owner)}</strong></span>
            </div>`
    });
}

function heroSection() {
    return `
        <section class="operational-section">
            ${aiRiskCard()}
            ${riskOverviewCard()}
            ${stormCellsCard()}
        </section>`;
}

/* --------------------------------------------------------- Monitoring band */

function weatherCard() {
    const w = WEATHER_NOW;
    const items = [
        { icon: 'thermometer', tone: 'orange', val: `${w.temperature}°C`, lbl: 'Temperature' },
        { icon: 'droplets', tone: 'blue', val: `${w.humidity}%`, lbl: 'Humidity' },
        { icon: 'cloud-rain', tone: 'blue', val: `${w.rainfall} mm`, lbl: 'Rainfall' },
        { icon: 'wind', tone: 'gray', val: `${w.windSpeed} km/h`, lbl: 'Wind Speed' },
        { icon: 'navigation', tone: 'gray', val: w.windDir, lbl: 'Wind Dir' },
        { icon: 'gauge', tone: 'gray', val: `${w.pressure} hPa`, lbl: 'Pressure' }
    ];
    // CAPE ≥ 2500 J/kg or a strongly negative lifted index = high convective potential.
    const unstable = w.cape >= 2500 || w.liftedIndex <= -4;
    return card({
        title: 'Weather Overview',
        subtitle: w.location,
        actions: `<a class="link-btn" href="#/weather">All stations</a>`,
        body: `
            <div class="weather-grid">
                ${items.map((it) => `
                    <div class="weather-item">
                        <i data-lucide="${esc(it.icon)}" class="text-${esc(it.tone)}"></i>
                        <div class="val">${esc(it.val)}</div>
                        <div class="lbl">${esc(it.lbl)}</div>
                    </div>`).join('')}
            </div>
            <div class="card-footer-row mt-3">
                <span>Convective potential · CAPE ${num(w.cape)} · LI ${w.liftedIndex}</span>
                ${badge(unstable ? 'High instability' : 'Stable', unstable ? 'red' : 'green', { solid: unstable })}
            </div>`
    });
}

/** Compact incident snapshot — the operational counterpart to the alerts card. */
function incidentSnapshotCard() {
    const recent = INCIDENTS.slice(0, 5);
    return card({
        title: 'Incident Snapshot',
        subtitle: `${INCIDENT_SUMMARY.open} open · avg response ${INCIDENT_SUMMARY.avgResponseMins} min`,
        actions: `<a class="link-btn" href="#/incidents">All incidents</a>`,
        body: `
            <div class="sensor-health-grid">
                ${recent.map((i) => `
                    <div class="stat-row">
                        <span class="stat-label">${esc(i.districtName)} · ${esc(i.type)}</span>
                        ${severityBadge(i.severity)}
                    </div>`).join('')}
            </div>`
    });
}

/** Icon per SOP step state. Tone comes from statusDot(), so it stays in sync. */
const STEP_ICON = { completed: 'check-circle-2', pending: 'loader', idle: 'circle-dashed' };

function responseCard() {
    return card({
        title: 'Automated Response',
        subtitle: 'SOP actions for the active event',
        actions: `<a class="link-btn" href="#/alerts?tab=automation">SOPs</a>`,
        body: `
            <ul class="checklist checklist-split">
                ${RESPONSE_STEPS.map(
                    (step) => `
                <li class="${step.state === 'idle' ? 'idle' : ''}">
                    <span class="checklist-label">
                        <i data-lucide="${esc(STEP_ICON[step.state] || 'circle')}"></i>
                        ${esc(step.label)}
                    </span>
                    ${statusDot(step.state)}
                </li>`
                ).join('')}
            </ul>`
    });
}

function alertsCard() {
    // Driven from ALERTS rather than a hardcoded copy, so this card and the
    // alerts view can never disagree about what was issued.
    const recent = ALERTS.slice(0, 4);
    return card({
        title: 'Recent Alerts',
        subtitle: 'Latest issued advisories',
        actions: `<a class="link-btn" href="#/alerts">View all</a>`,
        body: `
            ${timeline(recent)}
            <div class="card-footer-row">
                <span>Active alerts</span>
                <span class="badge bg-blue">${esc(ALERT_STATS.active)}</span>
            </div>`
    });
}

function monitoringSection() {
    return `
        <section class="section-heading">
            <h2>Operational Monitoring</h2>
            <span class="section-rule"></span>
        </section>
        <section class="operational-section">
            ${weatherCard()}
            ${responseCard()}
            ${alertsCard()}
            ${incidentSnapshotCard()}
        </section>`;
}

function sensorNetworkCard() {
    return card({
        title: 'Sensor Network Health',
        actions: `<a class="link-btn" href="#/sensor-network?tab=health">Details</a>`,
        body: `
            <div class="sensor-health-grid">
                ${statRow('Network uptime', `${SENSOR_HEALTH.uptime}%`, { tone: 'green', bold: true })}
                ${statRow('Data latency', `${SENSOR_HEALTH.latencyMs} ms`)}
                ${statRow('Offline sensors (EFM)', SENSOR_HEALTH.offlineEfm, { tone: 'red' })}
                ${statRow('Low battery (solar)', SENSOR_HEALTH.lowBattery, { tone: 'yellow' })}
                ${statRow('IMD API sync', 'Connected', { tone: 'green' })}
            </div>
            <div class="chart-caption mt-3">Latency, last 8 polls</div>
            <div id="dash-latency-chart"></div>`
    });
}

function resourceCard() {
    return card({
        title: 'Response Deployment',
        subtitle: 'SDRF, NDRF & Medical standby',
        actions: `<a class="link-btn" href="#/incidents">Mobilize</a>`,
        bodyClass: 'flex-col',
        body: `
            <div class="stat-row">
                <div class="stat-main">
                    <span class="stat-val">${num(SHELTER_OCCUPANCY.current)}</span>
                    <span class="stat-lbl">In Safe Shelters</span>
                </div>
                <div class="stat-mini">
                    <span class="mini-val">${SHELTER_OCCUPANCY.pct}%</span>
                    <span class="mini-lbl">Capacity</span>
                </div>
            </div>
            ${progressBar(SHELTER_OCCUPANCY.pct, 'blue')}
            <div class="resource-grid mt-4">
                ${RESOURCES.map(
                    (r) => `
                <div class="res-item">
                    <span class="res-lbl">${esc(r.type)}</span>
                    <div class="res-vals">
                        <strong>${esc(r.deployed)}</strong> <span class="divider">/</span> <span class="standby">${esc(r.standby)}</span>
                    </div>
                </div>`
                ).join('')}
            </div>`
    });
}

/**
 * Sectoral Impact — the platform serves several departments, so critical-infra
 * status is broken out per sector with the owning department named, rather than
 * buried in one list. Each maps to INFRA_IMPACT in order.
 */
const SECTOR_DEPT = ['Power Utilities', 'Mining Operations', 'Railways', 'Forest Department'];

function sectoralImpactSection() {
    return `
        <section class="section-heading">
            <h2>Sectoral Impact</h2>
            <span class="section-rule"></span>
        </section>
        <section class="sector-grid">
            ${INFRA_IMPACT.map(
                (item, i) => `
                <div class="card sector-card">
                    <div class="sector-top">
                        <div class="kpi-icon-wrapper bg-${esc(item.tone)}"><i data-lucide="${esc(item.icon)}"></i></div>
                        ${statusPill({
                            value: item.tone === 'green' ? 'Normal' : 'Elevated',
                            tone: item.tone === 'green' ? 'green' : 'orange'
                        })}
                    </div>
                    <div class="sector-dept">${esc(SECTOR_DEPT[i] || 'State')}</div>
                    <div class="sector-title">${esc(item.title)}</div>
                    <div class="sector-detail"><i data-lucide="map-pin"></i> ${esc(item.detail)}</div>
                </div>`
            ).join('')}
        </section>`;
}

function resourceSection() {
    return `
        <section class="section-heading">
            <h2>Resources & Infrastructure</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${sensorNetworkCard()}
            ${resourceCard()}
        </section>`;
}

/* ------------------------------------------------------------ Trend band */

function trendSection() {
    return `
        <section class="trends-section">
            ${card({
                title: '7-Day Lightning Strike Trend',
                subtitle: 'Strikes vs severe alerts issued',
                actions: `<a class="link-btn" href="#/analytics?tab=historical">Historical analytics</a>`,
                body: `<div id="dash-trend-chart"></div>`
            })}
        </section>`;
}

/* -------------------------------------------------------- Export snapshot */

/**
 * Read the KPI tiles straight from the DOM so the exported snapshot always
 * matches what is on screen — the hero values are authored as literals, so
 * scraping the rendered cards is more truthful than re-deriving them here.
 */
function collectKpis(root) {
    return [...root.querySelectorAll('.kpi-card')].map((el) => ({
        metric: el.querySelector('.kpi-title')?.textContent.trim() || '',
        value: el.querySelector('.kpi-value')?.textContent.trim() || '',
        context: el.querySelector('.kpi-context')?.textContent.trim() || null
    }));
}

function downloadJson(obj, filename) {
    downloadFile(JSON.stringify(obj, null, 2), filename, 'application/json');
}

/** Build and download a point-in-time snapshot of the dashboard. */
function exportSnapshot(root) {
    const now = new Date();
    const rangeBtn = root.querySelector('.segmented .segment.active');
    const districtSel = root.querySelector('#dash-district');
    const snapshot = {
        product: 'Access Genie ThunderShield',
        view: 'Jharkhand State Thunderstorm Command & Control Center',
        generatedAt: now.toISOString(),
        scope: {
            timeRange: rangeBtn ? rangeBtn.dataset.value : null,
            district: districtSel ? districtSel.options[districtSel.selectedIndex].text : 'All districts'
        },
        kpis: collectKpis(root),
        districtRisk: DISTRICT_RISK.map((d) => ({
            id: d.id,
            name: d.name,
            level: d.level,
            riskScore: d.riskScore,
            strikes24h: d.strikes24h,
            population: d.population
        })),
        recentAlerts: ALERTS.slice(0, 4)
    };
    // toISOString() is '2026-07-21T09:30:00.000Z'; keep it filename-safe.
    const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadJson(snapshot, `thundershield-snapshot-${stamp}.json`);
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Jharkhand State Thunderstorm Command & Control Center',
    subtitle: 'Real-time Monitoring • AI Intelligence • Automated Emergency Response',

    render() {
        return `
            ${commandBar()}
            ${heroKpis()}
            ${heroSection()}
            ${monitoringSection()}
            ${resourceSection()}
            ${sectoralImpactSection()}
            ${trendSection()}`;
    },

    mount(root) {
        mkChart('#dash-ai-gauge', gaugeOptions({
            value: AI_FORECAST.riskScore,
            color: PALETTE[severityTone(AI_FORECAST.severity)] || PALETTE.red,
            label: 'Risk score',
            height: 150
        }));

        // Acknowledge a recommended action (visual only — demo).
        root.querySelectorAll('.rec-ack').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.rec-action');
                if (row) row.classList.add('acked');
                btn.textContent = 'Acked';
                btn.disabled = true;
            });
        });

        mkChart('#dash-latency-chart', sparkOptions({
            data: SENSOR_HEALTH.latencyTrend,
            color: PALETTE.green,
            type: 'line',
            name: 'Latency (ms)',
            height: 60
        }));

        mkChart('#dash-trend-chart', columnOptions({
            series: [
                { name: 'Lightning Strikes', data: STRIKE_SUMMARY.trend7d },
                { name: 'Severe Alerts Issued', data: STRIKE_SUMMARY.alertsIssued7d }
            ],
            categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
            colors: [PALETTE.blue, PALETTE.red],
            height: 300
        }));

        // --- Command bar controls ---------------------------------------
        // Scope queries to the toolbar so the Refresh button here doesn't
        // collide with the identical one in the map card header.
        const bar = root.querySelector('.view-toolbar');
        if (bar) {
            // District scope → that district's analytics, matching the global
            // search idiom ('#/analytics?q=<term>'). 'All' stays put.
            const districtSel = bar.querySelector('#dash-district');
            if (districtSel) {
                districtSel.addEventListener('change', () => {
                    if (districtSel.value === 'all') return;
                    const d = DISTRICT_RISK.find((x) => x.id === districtSel.value);
                    navigate(`analytics?q=${encodeURIComponent(d ? d.name : districtSel.value)}`);
                });
            }

            // Refresh → re-render the view. Mock data is static, but the
            // affordance must feel live, so spin the icon for a beat first.
            const refreshBtn = bar.querySelector('[aria-label="Refresh"]');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    refreshBtn.classList.add('refreshing');
                    setTimeout(refresh, 400);
                });
            }

            // Export snapshot → download the on-screen metrics as JSON.
            const exportBtn = bar.querySelector('[aria-label="Export snapshot"]');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => exportSnapshot(root));
            }
        }
    }
};
