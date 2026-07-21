/**
 * Lightning Monitoring.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — scope + live state
 *   2. KPIs          — today's count, the last hour, and how dangerous it is
 *   3. Hero          — strike map, the rolling feed, and the local radar scope
 *   4. Analytics     — 24h shape, 7-day trend, district split, CG/IC mix
 *
 * The feed and the radar answer "what just happened"; the analytics band
 * answers "is it getting worse". They are kept apart so an operator watching
 * the feed never has to scroll past a chart to see the next strike.
 */

import {
    card, kpi, statusPill, statRow, badge, table, toolbar, select,
    iconButton, num, pct, ago, esc, downloadCsv
} from '../components.js';
import { mkChart, columnOptions, donutOptions, PALETTE } from '../charts.js';
import { createMap, addStrikeLayer, addStormCellLayer, bindLayerToggles } from '../map.js';
import { refresh } from '../router.js';
import { STRIKES, STRIKE_SUMMARY, STORM_CELLS, DISTRICT_RISK, districtsByRisk } from '../data/mock.js';

const feed = STRIKES.slice(0, 14);
const latest = STRIKES[0];
const focus = districtsByRisk()[0];
const cgCount = STRIKES.filter((s) => s.type === 'CG').length;
const icCount = STRIKES.length - cgCount;
const topDistricts = districtsByRisk().slice(0, 8);

// trend7d ends on today, so the entry before it is the like-for-like baseline.
const yesterday = STRIKE_SUMMARY.trend7d[STRIKE_SUMMARY.trend7d.length - 2];
const dayOverDay = Math.round(((STRIKE_SUMMARY.today - yesterday) / yesterday) * 100);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
const HOURS = STRIKE_SUMMARY.hourly.map((_, h) => `${String(h).padStart(2, '0')}:00`);

/** Age bands, shared by the feed colouring and the radar legend. */
function ageTone(secondsAgo) {
    if (secondsAgo < 300) return 'red';
    if (secondsAgo < 900) return 'orange';
    if (secondsAgo < 1800) return 'yellow';
    return 'blue';
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            <button class="btn btn-primary" id="lightning-map-toggle"><i data-lucide="map"></i> Strike map</button>
            ${select('lightning-district', [
                { value: 'all', label: 'All districts' },
                ...DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name }))
            ])}
            ${select('lightning-type', [
                { value: 'all', label: 'All strike types' },
                { value: 'CG', label: 'Cloud-to-Ground only' },
                { value: 'IC', label: 'Intra-Cloud only' }
            ])}
        `,
        right: `
            ${statusPill({ label: 'Last strike', value: ago(latest.secondsAgo), tone: 'red', icon: 'zap' })}
            <span class="live-chip"><span class="live-dot"></span> Live</span>
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export feed')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Strikes Today',
                value: num(STRIKE_SUMMARY.today),
                icon: 'zap',
                tone: 'orange',
                delta: { value: `+${dayOverDay}% vs yesterday`, direction: 'up', sentiment: 'bad' },
                context: `${num(yesterday)} yesterday`
            })}
            ${kpi({
                title: 'Strikes Last Hour',
                value: num(STRIKE_SUMMARY.lastHour),
                icon: 'activity',
                tone: 'red',
                delta: {
                    value: `${pct((STRIKE_SUMMARY.lastHour / STRIKE_SUMMARY.today) * 100)} of today`,
                    direction: 'up',
                    sentiment: 'bad'
                },
                context: 'Rolling 60 minutes'
            })}
            ${kpi({
                title: 'Cloud-to-Ground Share',
                value: pct(STRIKE_SUMMARY.cgShare * 100),
                icon: 'cloud-lightning',
                tone: 'purple',
                delta: {
                    value: `${pct((1 - STRIKE_SUMMARY.cgShare) * 100)} intra-cloud`,
                    direction: 'flat',
                    sentiment: 'neutral'
                },
                context: 'CG strikes carry the ground risk'
            })}
            ${kpi({
                title: 'Peak Current',
                value: `${STRIKE_SUMMARY.peakCurrentMax} kA`,
                icon: 'gauge',
                tone: 'red',
                delta: { value: 'Negative return stroke', direction: 'flat', sentiment: 'bad' },
                context: 'Strongest strike recorded today'
            })}
        </section>`;
}

/* ------------------------------------------------------------ Hero band */

function mapCard() {
    return card({
        title: 'Live Strike Map',
        subtitle: `${STRIKES.length} strikes plotted · ${STORM_CELLS.length} cells tracked`,
        className: 'map-container',
        bodyClass: 'p-0',
        actions: `<a class="link-btn" href="#/risk-map">State map</a>`,
        body: `
            <div id="lightning-map" class="map-view"></div>

            <div class="map-legend">
                <h4>Strike Age</h4>
                <ul>
                    <li><span class="color-box bg-red"></span> Under 5 min</li>
                    <li><span class="color-box bg-orange"></span> 5–15 min</li>
                    <li><span class="color-box bg-yellow"></span> 15–30 min</li>
                    <li><span class="color-box bg-blue"></span> Over 30 min</li>
                </ul>
            </div>

            <div class="map-status-indicator">
                <div class="status-item"><span class="badge bg-red">${esc(num(cgCount))}</span> Cloud-to-Ground</div>
                <div class="status-item"><span class="badge bg-blue">${esc(num(icCount))}</span> Intra-Cloud</div>
                <div class="status-item"><span class="badge bg-purple">${esc(STORM_CELLS.length)}</span> Storm Cells</div>
            </div>

            <div class="map-layers">
                <h4>Layers</h4>
                <label><input type="checkbox" data-layer="strikes" checked> Lightning Strikes</label>
                <label><input type="checkbox" data-layer="cells" checked> Storm Cells</label>
            </div>`
    });
}

/** Feed table for a set of strikes — re-rendered when the filters change. */
function feedTable(strikes) {
    return table({
        columns: [
            {
                key: 'secondsAgo',
                label: 'When',
                render: (s) =>
                    `<span class="font-semibold text-${esc(ageTone(s.secondsAgo))}">${esc(ago(s.secondsAgo))}</span>`
            },
            { key: 'districtName', label: 'District' },
            { key: 'type', label: 'Type', render: (s) => badge(s.type, s.type === 'CG' ? 'red' : 'blue') },
            { key: 'peakCurrent', label: 'Peak', align: 'right', render: (s) => `${esc(s.peakCurrent)} kA` }
        ],
        rows: strikes,
        empty: 'No strikes match the current filter'
    });
}

function feedCard() {
    return card({
        title: 'Live Strike Feed',
        subtitle: 'Newest first',
        actions: `<a class="link-btn" href="#/analytics?tab=historical">History</a>`,
        body: `
            <div class="scrollable" id="lightning-feed-body">${feedTable(feed)}</div>
            <div class="chart-caption mt-3">
                Cloud-to-ground strikes are the ones that injure; intra-cloud is tracked as a storm-intensity signal.
            </div>`
    });
}

/**
 * Local radar scope for the worst-hit district. Strikes are projected from the
 * district centroid onto the 70px scope radius; RADAR_SPAN_DEG is tuned so the
 * mock strike scatter fills the scope instead of clustering at the centre.
 */
const RADAR_SPAN_DEG = 0.6;

function radarPlots(local) {
    const clamp = (v) => Math.max(-70, Math.min(70, v));
    return local
        .map((s) => {
            const x = (80 + clamp(((s.lng - focus.lng) / RADAR_SPAN_DEG) * 70)).toFixed(1);
            const y = (80 - clamp(((s.lat - focus.lat) / RADAR_SPAN_DEG) * 70)).toFixed(1);
            const color = PALETTE[ageTone(s.secondsAgo)];
            // Only the freshest strikes pulse — everything pulsing reads as noise.
            const pulse =
                s.secondsAgo < 300
                    ? `<circle cx="${x}" cy="${y}" r="7" stroke="${color}" stroke-width="0.5" fill="none" opacity="0.6">
                           <animate attributeName="r" values="3.5;9;3.5" dur="2s" repeatCount="indefinite" />
                       </circle>`
                    : '';
            return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}" />${pulse}`;
        })
        .join('');
}

function radarCard() {
    const local = STRIKES.filter((s) => s.districtId === focus.id);
    return card({
        title: 'Local Radar Scope',
        subtitle: focus.name,
        actions: `<a class="link-btn" href="#/risk-map">State map</a>`,
        body: `
            <div class="operational-split-grid">
                <div class="radar-column">
                    <div class="radar-wrapper">
                        <svg viewBox="0 0 160 160" class="radar-svg">
                            <circle cx="80" cy="80" r="70" stroke="var(--border-color)" stroke-width="0.5" fill="none" stroke-dasharray="2, 2" />
                            <circle cx="80" cy="80" r="50" stroke="var(--border-color)" stroke-width="0.5" fill="none" stroke-dasharray="2, 2" />
                            <circle cx="80" cy="80" r="30" stroke="var(--border-color)" stroke-width="0.5" fill="none" stroke-dasharray="2, 2" />
                            <circle cx="80" cy="80" r="10" stroke="var(--border-color)" stroke-width="0.5" fill="none" stroke-dasharray="2, 2" />
                            <line x1="10" y1="80" x2="150" y2="80" stroke="var(--border-color)" stroke-width="0.5" stroke-dasharray="2, 2" />
                            <line x1="80" y1="10" x2="80" y2="150" stroke="var(--border-color)" stroke-width="0.5" stroke-dasharray="2, 2" />
                            ${radarPlots(local.slice(0, 8))}
                            <line x1="80" y1="80" x2="149" y2="40" stroke="var(--primary-blue)" stroke-width="1.5" opacity="0.7">
                                <animateTransform attributeName="transform" type="rotate" from="0 80 80" to="360 80 80" dur="4s" repeatCount="indefinite" />
                            </line>
                        </svg>
                    </div>
                    <div class="radar-legend">
                        <span><span class="dot bg-red"></span> &lt;5m</span>
                        <span><span class="dot bg-orange"></span> 5-15m</span>
                        <span><span class="dot bg-yellow"></span> 15-30m</span>
                        <span><span class="dot bg-blue"></span> &gt;30m</span>
                    </div>
                </div>
                <div class="metrics-column">
                    ${statRow('Last strike', esc(ago(latest.secondsAgo)), { bold: true, tone: 'red' })}
                    ${statRow('Location', esc(latest.districtName), { bold: true })}
                    ${statRow('Peak current', `${esc(latest.peakCurrent)} kA`)}
                    ${statRow('Strike type', latest.type === 'CG' ? 'Cloud-to-Ground' : 'Intra-Cloud')}
                    ${statRow(`${focus.name} (24h)`, esc(num(focus.strikes24h)))}
                    ${statRow('On scope', esc(num(local.length)))}
                </div>
            </div>`
    });
}

/** The strike map lives in its own band, hidden until the toolbar button
    opens it — Leaflet must init against a visible container. */
function mapSection() {
    return `<section id="lightning-map-wrap" hidden>${mapCard()}</section>`;
}

function heroSection() {
    return `
        <section class="operational-section">
            ${feedCard()}
            ${radarCard()}
        </section>`;
}

/* ------------------------------------------------------- Analytics band */

function analyticsSection() {
    return `
        <section class="section-heading">
            <h2>Strike Analytics</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Strike Activity — Last 24 Hours',
                subtitle: 'Hourly detections, statewide',
                actions: `<a class="link-btn" href="#/analytics?tab=historical">Historical analytics</a>`,
                body: `<div id="lightning-hourly-chart"></div>`
            })}
        </section>
        <section class="resource-section">
            ${card({
                title: '7-Day Trend',
                subtitle: 'Strikes vs severe alerts issued',
                body: `<div id="lightning-trend-chart"></div>`
            })}
            ${card({
                title: 'Strikes by District',
                subtitle: 'Top 8 over 24 hours',
                actions: `<a class="link-btn" href="#/analytics">All districts</a>`,
                body: `<div id="lightning-district-chart"></div>`
            })}
            ${card({
                title: 'Strike Composition',
                subtitle: `${num(STRIKES.length)} strikes sampled`,
                body: `<div id="lightning-type-chart"></div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Lightning Monitoring',
    subtitle: 'Live strike detection, radar tracking, and strike analytics',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${mapSection()}
            ${heroSection()}
            ${analyticsSection()}`;
    },

    mount(root) {
        // Map is created lazily when the toolbar button opens its band.
        let map = null;
        let layers = null;

        mkChart('#lightning-hourly-chart', columnOptions({
            series: [{ name: 'Strikes', data: STRIKE_SUMMARY.hourly }],
            categories: HOURS,
            colors: [PALETTE.orange],
            height: 280
        }));

        mkChart('#lightning-trend-chart', columnOptions({
            series: [
                { name: 'Lightning Strikes', data: STRIKE_SUMMARY.trend7d },
                { name: 'Severe Alerts Issued', data: STRIKE_SUMMARY.alertsIssued7d }
            ],
            categories: DAYS,
            colors: [PALETTE.blue, PALETTE.red],
            height: 280
        }));

        mkChart('#lightning-district-chart', columnOptions({
            series: [{ name: 'Strikes (24h)', data: topDistricts.map((d) => d.strikes24h) }],
            categories: topDistricts.map((d) => d.name),
            colors: [PALETTE.purple],
            horizontal: true,
            height: 280
        }));

        mkChart('#lightning-type-chart', donutOptions({
            series: [cgCount, icCount],
            labels: ['Cloud-to-Ground', 'Intra-Cloud'],
            colors: [PALETTE.red, PALETTE.blue],
            totalLabel: 'Strikes',
            height: 280
        }));

        // District + strike-type filters drive the feed and the map markers.
        const districtSel = root.querySelector('#lightning-district');
        const typeSel = root.querySelector('#lightning-type');
        const feedBody = root.querySelector('#lightning-feed-body');

        const filteredStrikes = () => {
            const dv = districtSel ? districtSel.value : 'all';
            const tv = typeSel ? typeSel.value : 'all';
            return STRIKES.filter(
                (s) => (dv === 'all' || s.districtId === dv) && (tv === 'all' || s.type === tv)
            );
        };

        const applyFilters = () => {
            const filtered = filteredStrikes();
            if (feedBody) feedBody.innerHTML = feedTable(filtered.slice(0, 14));
            if (map && layers) {
                map.removeLayer(layers.strikes);
                layers.strikes = addStrikeLayer(map, filtered.slice(0, 120));
                // Respect the layer toggle if the user had strikes turned off.
                const toggle = root.querySelector('[data-layer="strikes"]');
                if (toggle && !toggle.checked) map.removeLayer(layers.strikes);
            }
            if (window.lucide) window.lucide.createIcons();
        };

        if (districtSel) districtSel.addEventListener('change', applyFilters);
        if (typeSel) typeSel.addEventListener('change', applyFilters);

        // Strike-map button reveals the band, then inits/refreshes the map.
        const mapWrap = root.querySelector('#lightning-map-wrap');
        const mapToggle = root.querySelector('#lightning-map-toggle');
        mapToggle?.addEventListener('click', () => {
            const opening = mapWrap.hidden;
            mapWrap.hidden = !opening;
            mapToggle.innerHTML = opening ? '<i data-lucide="x"></i> Hide map' : '<i data-lucide="map"></i> Strike map';
            if (window.lucide) window.lucide.createIcons();
            if (!opening) return;
            if (!map) {
                map = createMap('lightning-map');
                if (map) {
                    layers = {
                        strikes: addStrikeLayer(map, filteredStrikes().slice(0, 120)),
                        cells: addStormCellLayer(map, STORM_CELLS)
                    };
                    bindLayerToggles(map, root, layers);
                }
            } else {
                map.invalidateSize();
            }
        });

        const refreshBtn = root.querySelector('[aria-label="Refresh"]');
        refreshBtn?.addEventListener('click', () => {
            refreshBtn.classList.add('refreshing');
            setTimeout(refresh, 400);
        });

        // Export feed → CSV of the recent strikes.
        root.querySelector('[aria-label="Export feed"]')?.addEventListener('click', () =>
            downloadCsv(STRIKES.slice(0, 120), ['id', 'districtName', 'type', 'peakCurrent', 'secondsAgo'], 'strike-feed.csv')
        );
    }
};
