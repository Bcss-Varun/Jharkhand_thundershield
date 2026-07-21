/**
 * Weather Monitoring.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — station scope + network state
 *   2. KPIs          — the four readings that decide whether storms fire today
 *   3. Conditions    — full current observation, convective indices, network health
 *   4. Trends        — 24h of temperature, humidity, pressure, wind
 *   5. Stations      — every AWS row, online or not
 *
 * CAPE / CIN / lifted index get their own card rather than being buried in the
 * observation grid: they are the thunderstorm-forecasting numbers, and an
 * operator reads them as a verdict ("strong instability, weak cap") rather than
 * as raw values.
 */

import {
    card, kpi, statusPill, statRow, statusDot, badge, table, progressBar, toolbar,
    select, iconButton, num, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, lineOptions, halfGaugeOptions, columnOptions, PALETTE } from '../charts.js';
import { refresh } from '../router.js';
import { WEATHER_NOW, WEATHER_STATIONS, WEATHER_TREND, THRESHOLDS } from '../data/mock.js';

const onlineStations = WEATHER_STATIONS.filter((s) => s.status === 'online');
const onlinePct = Math.round((onlineStations.length / WEATHER_STATIONS.length) * 100);
const windiest = WEATHER_STATIONS.reduce((a, b) => (b.windSpeed > a.windSpeed ? b : a));
const wettest = WEATHER_STATIONS.reduce((a, b) => (b.rainfall > a.rainfall ? b : a));
const gustAdvisory = THRESHOLDS.find((t) => t.name === 'Wind Gust Advisory');

/**
 * Standard convective classifications. CAPE is the fuel, CIN is the lid, and
 * the lifted index is the net result — reporting any one alone is misleading.
 */
function capeVerdict(cape) {
    if (cape >= 4000) return { label: 'Extreme instability', tone: 'red' };
    if (cape >= 2500) return { label: 'Strong instability', tone: 'orange' };
    if (cape >= 1000) return { label: 'Moderate instability', tone: 'yellow' };
    return { label: 'Weak instability', tone: 'green' };
}

function cinVerdict(cin) {
    const cap = Math.abs(cin);
    if (cap >= 100) return { label: 'Strong cap — convection suppressed', tone: 'green' };
    if (cap >= 50) return { label: 'Moderate cap', tone: 'yellow' };
    return { label: 'Weak cap — storms initiate easily', tone: 'red' };
}

function liftedIndexVerdict(li) {
    if (li <= -6) return { label: 'Severe potential', tone: 'red' };
    if (li <= -3) return { label: 'Thunderstorms likely', tone: 'orange' };
    if (li < 0) return { label: 'Marginally unstable', tone: 'yellow' };
    return { label: 'Stable', tone: 'green' };
}

const cape = capeVerdict(WEATHER_NOW.cape);
const cin = cinVerdict(WEATHER_NOW.cin);
const li = liftedIndexVerdict(WEATHER_NOW.liftedIndex);

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('weather-station', [
                { value: 'all', label: `Primary · ${WEATHER_NOW.location}` },
                ...WEATHER_STATIONS.map((s) => ({ value: s.id, label: `${s.id} · ${s.districtName}` }))
            ])}
        `,
        right: `
            ${statusPill({
                label: 'Stations online',
                value: `${onlineStations.length} / ${WEATHER_STATIONS.length}`,
                tone: onlinePct === 100 ? 'green' : 'yellow',
                icon: 'radio'
            })}
            ${statusPill({ label: 'IMD sync', value: 'Connected', tone: 'green', icon: 'cloud' })}
            <span class="live-chip"><span class="live-dot"></span> Live</span>
            ${iconButton('refresh-cw', 'Refresh')}
            ${iconButton('download', 'Export observations')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Temperature',
                value: WEATHER_NOW.temperature,
                unit: '°C',
                icon: 'thermometer',
                tone: 'orange',
                delta: { value: `Dew point ${WEATHER_NOW.dewPoint}°C`, direction: 'flat', sentiment: 'neutral' },
                context: `${WEATHER_NOW.location} · ${WEATHER_NOW.stationId}`
            })}
            ${kpi({
                title: 'Relative Humidity',
                value: WEATHER_NOW.humidity,
                unit: '%',
                icon: 'droplets',
                tone: 'blue',
                delta: { value: 'Moisture-rich boundary layer', direction: 'up', sentiment: 'bad' },
                context: `${WEATHER_NOW.rainfall} mm rainfall today`
            })}
            ${kpi({
                title: 'Wind Speed',
                value: WEATHER_NOW.windSpeed,
                unit: 'km/h',
                icon: 'wind',
                tone: 'yellow',
                delta: { value: `From ${WEATHER_NOW.windDir}`, direction: 'flat', sentiment: 'neutral' },
                context: `Advisory at ${gustAdvisory.value} ${gustAdvisory.unit}`
            })}
            ${kpi({
                title: 'CAPE',
                value: num(WEATHER_NOW.cape),
                unit: 'J/kg',
                icon: 'flame',
                tone: cape.tone,
                delta: { value: cape.label, direction: 'up', sentiment: 'bad' },
                context: `Lifted index ${WEATHER_NOW.liftedIndex}`
            })}
        </section>`;
}

/* ------------------------------------------------------- Conditions band */

/** Observation grid for one reading (WEATHER_NOW or a station row). Station
    rows lack dew point / visibility / UV, so those show '—'. */
function conditionsBody(r) {
    const u = (v, unit = '') => (v === undefined || v === null ? '—' : `${v}${unit}`);
    const items = [
        { icon: 'thermometer', tone: 'orange', val: u(r.temperature, '°C'), lbl: 'Temperature' },
        { icon: 'droplet', tone: 'blue', val: u(r.dewPoint, '°C'), lbl: 'Dew Point' },
        { icon: 'droplets', tone: 'blue', val: u(r.humidity, '%'), lbl: 'Humidity' },
        { icon: 'cloud-rain', tone: 'blue', val: u(r.rainfall, ' mm'), lbl: 'Rainfall' },
        { icon: 'wind', tone: 'gray', val: u(r.windSpeed, ' km/h'), lbl: 'Wind Speed' },
        { icon: 'navigation', tone: 'gray', val: u(r.windDir), lbl: 'Wind Direction' },
        { icon: 'gauge', tone: 'gray', val: u(r.pressure, ' hPa'), lbl: 'Pressure' },
        { icon: 'eye', tone: 'yellow', val: u(r.visibility, ' km'), lbl: 'Visibility' },
        { icon: 'sun', tone: 'orange', val: u(r.uvIndex), lbl: 'UV Index' }
    ];
    const loc = r.location ? `${r.location} · ${r.stationId}` : `${r.districtName} · ${r.id}`;
    return `
        <div class="chart-caption mb-2">${esc(loc)}</div>
        <div class="weather-grid">
            ${items
                .map(
                    (w) => `
                <div class="weather-item">
                    <i data-lucide="${esc(w.icon)}" class="text-${esc(w.tone)}"></i>
                    <div class="val">${esc(w.val)}</div>
                    <div class="lbl">${esc(w.lbl)}</div>
                </div>`
                )
                .join('')}
        </div>`;
}

function currentConditionsCard() {
    return card({
        title: 'Current Conditions',
        subtitle: 'Selected station',
        actions: `<a class="link-btn" href="#/sensor-network">Station detail</a>`,
        body: `<div id="weather-conditions">${conditionsBody(WEATHER_NOW)}</div>`
    });
}

function convectiveCard() {
    return card({
        title: 'Convective Indices',
        subtitle: 'Thunderstorm potential',
        actions: `<a class="link-btn" href="#/ai-risk">AI forecast</a>`,
        body: `
            <div class="operational-split-grid">
                <div class="gauge-column">
                    <div id="weather-cape-gauge"></div>
                    <div class="gauge-verdict">
                        <span class="badge bg-${esc(cape.tone)} font-semibold">${esc(num(WEATHER_NOW.cape))} J/kg CAPE</span>
                    </div>
                </div>
                <div class="metrics-column">
                    ${statRow('CAPE', badge(cape.label, cape.tone), { bold: true })}
                    ${statRow('CIN', `${esc(WEATHER_NOW.cin)} J/kg`, { bold: true, tone: cin.tone })}
                    ${statRow('Lifted Index', esc(WEATHER_NOW.liftedIndex), { bold: true, tone: li.tone })}
                    ${statRow('Verdict', badge(li.label, li.tone))}
                </div>
            </div>
            <div class="chart-caption mt-3">
                ${esc(cape.label)} (${esc(num(WEATHER_NOW.cape))} J/kg) against ${esc(WEATHER_NOW.cin)} J/kg of inhibition —
                ${esc(cin.label.toLowerCase())}. That combination is what drives the lifted index to ${esc(WEATHER_NOW.liftedIndex)}.
            </div>`
    });
}

function networkCard() {
    const avg = (key) => Math.round(WEATHER_STATIONS.reduce((sum, s) => sum + s[key], 0) / WEATHER_STATIONS.length);
    return card({
        title: 'AWS Network',
        subtitle: `${WEATHER_STATIONS.length} automatic weather stations`,
        actions: `<a class="link-btn" href="#/sensor-network?tab=health">Health</a>`,
        bodyClass: 'flex-col',
        body: `
            <div class="stat-row">
                <div class="stat-main">
                    <span class="stat-val">${esc(onlineStations.length)} / ${esc(WEATHER_STATIONS.length)}</span>
                    <span class="stat-lbl">Stations Reporting</span>
                </div>
                <div class="stat-mini">
                    <span class="mini-val">${esc(pct(onlinePct))}</span>
                    <span class="mini-lbl">Coverage</span>
                </div>
            </div>
            ${progressBar(onlinePct, onlinePct === 100 ? 'green' : 'yellow')}
            <div class="sensor-health-grid mt-4">
                ${statRow('Mean temperature', `${esc(avg('temperature'))}°C`)}
                ${statRow('Mean humidity', `${esc(avg('humidity'))}%`)}
                ${statRow('Mean pressure', `${esc(avg('pressure'))} hPa`)}
                ${statRow('Strongest wind', `${esc(windiest.windSpeed)} km/h · ${esc(windiest.districtName)}`, {
                    tone: windiest.windSpeed >= gustAdvisory.value ? 'red' : 'yellow',
                    bold: true
                })}
                ${statRow('Heaviest rainfall', `${esc(wettest.rainfall)} mm · ${esc(wettest.districtName)}`, { tone: 'blue' })}
            </div>`
    });
}

function conditionsSection() {
    return `
        <section class="operational-section">
            ${currentConditionsCard()}
            ${convectiveCard()}
            ${networkCard()}
        </section>`;
}

/* ----------------------------------------------------------- Trends band */

function trendsSection() {
    return `
        <section class="section-heading">
            <h2>24-Hour Trends</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${card({ title: 'Temperature', subtitle: '°C', body: `<div id="weather-temp-chart"></div>` })}
            ${card({ title: 'Relative Humidity', subtitle: '%', body: `<div id="weather-humidity-chart"></div>` })}
            ${card({ title: 'Barometric Pressure', subtitle: 'hPa', body: `<div id="weather-pressure-chart"></div>` })}
            ${card({ title: 'Wind Speed', subtitle: 'km/h', body: `<div id="weather-wind-chart"></div>` })}
        </section>`;
}

/* -------------------------------------------------------- By-station band */

function byStationSection() {
    return `
        <section class="section-heading">
            <h2>Rainfall &amp; Wind by Station</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Rainfall & Wind — AWS Network',
                subtitle: `${WEATHER_STATIONS.length} stations`,
                body: `<div id="weather-station-chart"></div>`
            })}
        </section>`;
}

/* --------------------------------------------------------- Stations band */

function stationsSection() {
    return `
        <section class="section-heading">
            <h2>Station Observations</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'AWS Station Readings',
                subtitle: 'Latest observation per station',
                actions: `<a class="link-btn" href="#/sensor-network">Sensor registry</a>`,
                body: table({
                    columns: [
                        { key: 'id', label: 'Station', render: (s) => `<strong>${esc(s.id)}</strong>` },
                        { key: 'districtName', label: 'District' },
                        { key: 'temperature', label: 'Temp', align: 'right', render: (s) => `${esc(s.temperature)}°C` },
                        { key: 'humidity', label: 'Humidity', align: 'right', render: (s) => `${esc(s.humidity)}%` },
                        { key: 'rainfall', label: 'Rainfall', align: 'right', render: (s) => `${esc(s.rainfall)} mm` },
                        {
                            key: 'windSpeed',
                            label: 'Wind',
                            align: 'right',
                            render: (s) =>
                                `<span class="${s.windSpeed >= gustAdvisory.value ? 'font-semibold text-red' : ''}">${esc(s.windSpeed)} km/h ${esc(s.windDir)}</span>`
                        },
                        { key: 'pressure', label: 'Pressure', align: 'right', render: (s) => `${esc(s.pressure)} hPa` },
                        { key: 'status', label: 'Status', render: (s) => statusDot(s.status) }
                    ],
                    rows: WEATHER_STATIONS,
                    empty: 'No stations reporting'
                })
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Weather Monitoring',
    subtitle: 'AWS station network, current conditions, and 24-hour trends',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${conditionsSection()}
            ${trendsSection()}
            ${byStationSection()}
            ${stationsSection()}`;
    },

    mount(root) {
        // 4000 J/kg is the top of the conventional CAPE scale, so the gauge
        // reads as "how close to extreme", not as a share of an arbitrary max.
        mkChart('#weather-cape-gauge', halfGaugeOptions({
            value: WEATHER_NOW.cape,
            max: 4000,
            color: PALETTE[cape.tone],
            unit: 'J/kg'
        }));

        const trend = (selector, key, name, color, type = 'area') =>
            mkChart(selector, lineOptions({
                series: [{ name, data: WEATHER_TREND[key] }],
                categories: WEATHER_TREND.hours,
                colors: [color],
                type,
                showLegend: false,
                height: 240
            }));

        trend('#weather-temp-chart', 'temperature', 'Temperature (°C)', PALETTE.orange);
        trend('#weather-humidity-chart', 'humidity', 'Humidity (%)', PALETTE.blue);
        trend('#weather-pressure-chart', 'pressure', 'Pressure (hPa)', PALETTE.purple, 'line');
        trend('#weather-wind-chart', 'windSpeed', 'Wind Speed (km/h)', PALETTE.teal);

        mkChart('#weather-station-chart', columnOptions({
            series: [
                { name: 'Rainfall (mm)', data: WEATHER_STATIONS.map((s) => s.rainfall) },
                { name: 'Wind (km/h)', data: WEATHER_STATIONS.map((s) => s.windSpeed) }
            ],
            categories: WEATHER_STATIONS.map((s) => s.districtName),
            colors: [PALETTE.blue, PALETTE.teal],
            height: 300
        }));

        // Station selector → re-render the Current Conditions grid.
        const stationSel = root.querySelector('#weather-station');
        const condEl = root.querySelector('#weather-conditions');
        if (stationSel && condEl) {
            stationSel.addEventListener('change', () => {
                const reading =
                    stationSel.value === 'all'
                        ? WEATHER_NOW
                        : WEATHER_STATIONS.find((s) => s.id === stationSel.value) || WEATHER_NOW;
                condEl.innerHTML = conditionsBody(reading);
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

        // Export observations → CSV of the station table.
        root.querySelector('[aria-label="Export observations"]')?.addEventListener('click', () =>
            downloadCsv(
                WEATHER_STATIONS,
                ['id', 'districtName', 'temperature', 'humidity', 'rainfall', 'windSpeed', 'windDir', 'pressure', 'status'],
                'aws-observations.csv'
            )
        );
    }
};
