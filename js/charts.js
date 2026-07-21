/**
 * ApexCharts theming + factory helpers.
 *
 * Every chart goes through mkChart() so it gets registered with the router's
 * teardown list. Without that, navigating away leaves the chart instance and
 * its resize listener alive, and re-entering the view stacks a second one on
 * the same element.
 */

import { track } from './router.js';

export const PALETTE = {
    blue: '#1E5EFF',
    orange: '#FF8A00',
    green: '#22C55E',
    yellow: '#F59E0B',
    red: '#EF4444',
    purple: '#7C3AED',
    teal: '#0D9488',
    gray: '#94A3B8'
};

export const SERIES_COLORS = [PALETTE.blue, PALETTE.orange, PALETTE.teal, PALETTE.purple, PALETTE.green, PALETTE.yellow];

/**
 * ApexCharts takes plain JS values, so it cannot consume the CSS custom
 * properties the rest of the UI themes from. Resolve them at render time
 * instead — otherwise every chart keeps its light-mode axis and label colours
 * against a dark panel.
 */
function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function isDark() {
    return document.documentElement.dataset.theme === 'dark';
}

/** Theme-resolved chart colours. Recomputed per chart, so a theme switch
 *  followed by a re-render picks up the new palette. */
export function chartTheme() {
    return {
        text: cssVar('--text-secondary', '#6B7280'),
        heading: cssVar('--text-dark', '#111827'),
        grid: cssVar('--border-color', '#EEF1F5'),
        track: cssVar('--bg-subtle', '#F1F4F8'),
        surface: cssVar('--surface', '#FFFFFF'),
        mode: isDark() ? 'dark' : 'light'
    };
}

function baseOptions() {
    const t = chartTheme();
    return {
        chart: {
            fontFamily: "'Inter', sans-serif",
            toolbar: { show: false },
            animations: { enabled: true, easing: 'easeinout', speed: 400 },
            parentHeightOffset: 0,
            background: 'transparent'
        },
        theme: { mode: t.mode },
        grid: {
            borderColor: t.grid,
            strokeDashArray: 4,
            padding: { left: 8, right: 8, top: 0, bottom: 0 }
        },
        dataLabels: { enabled: false },
        tooltip: {
            style: { fontSize: '12px' },
            theme: t.mode
        },
        legend: {
            fontSize: '12px',
            labels: { colors: t.text },
            markers: { width: 8, height: 8, radius: 4 },
            itemMargin: { horizontal: 8 }
        },
        xaxis: {
            axisBorder: { show: false },
            axisTicks: { show: false },
            labels: { style: { colors: t.text, fontSize: '11px' } }
        },
        yaxis: {
            labels: { style: { colors: t.text, fontSize: '11px' } }
        }
    };
}

/** Deep-merge options over the base theme. Arrays replace rather than merge. */
function merge(base, override) {
    const out = { ...base };
    Object.keys(override || {}).forEach((k) => {
        const bv = base[k];
        const ov = override[k];
        if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
            out[k] = merge(bv, ov);
        } else {
            out[k] = ov;
        }
    });
    return out;
}

/**
 * Create + render a themed chart into `selector`, and register it for
 * teardown on navigation. Returns the instance, or null if the element is
 * missing (a view can render conditionally).
 */
export function mkChart(selector, options) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return null;
    const chart = new ApexCharts(el, merge(baseOptions(), options));
    chart.render();
    return track(chart);
}

/* --------------------------------------------------------------- Presets */

/** Radial gauge for a 0-100 score. */
export function gaugeOptions({ value, color, label = '', size = '65%', height = 220 }) {
    const t = chartTheme();
    return {
        series: [value],
        chart: { type: 'radialBar', height, sparkline: { enabled: true } },
        plotOptions: {
            radialBar: {
                startAngle: -135,
                endAngle: 135,
                hollow: { size },
                track: { background: t.track, strokeWidth: '100%' },
                dataLabels: {
                    name: { show: Boolean(label), fontSize: '11px', color: t.text, offsetY: 22 },
                    value: {
                        offsetY: label ? -8 : 6,
                        fontSize: '32px',
                        fontWeight: 700,
                        color: t.heading,
                        formatter: (v) => `${v}%`
                    }
                }
            }
        },
        labels: label ? [label] : [],
        fill: { type: 'solid', colors: [color] },
        stroke: { lineCap: 'round' }
    };
}

/** Half-circle gauge for an absolute reading (kV/m, etc). */
export function halfGaugeOptions({ value, max, color, unit, height = 190 }) {
    const t = chartTheme();
    return {
        series: [Math.round((value / max) * 100)],
        chart: { type: 'radialBar', height, sparkline: { enabled: true } },
        plotOptions: {
            radialBar: {
                startAngle: -90,
                endAngle: 90,
                hollow: { size: '62%' },
                track: { background: t.track, strokeWidth: '97%', margin: 5 },
                dataLabels: {
                    name: { show: true, fontSize: '11px', color: t.text, offsetY: 26 },
                    value: {
                        offsetY: -6,
                        fontSize: '30px',
                        fontWeight: 700,
                        color: t.heading,
                        formatter: () => String(value)
                    }
                }
            }
        },
        labels: [unit],
        fill: { type: 'solid', colors: [color] },
        stroke: { lineCap: 'round' }
    };
}

/** Inline sparkline. */
export function sparkOptions({ data, color, type = 'area', height = 60, name = '' }) {
    return {
        series: [{ name, data }],
        chart: { type, height, sparkline: { enabled: true } },
        stroke: { curve: 'smooth', width: 2 },
        colors: [color],
        fill:
            type === 'area'
                ? {
                      type: 'gradient',
                      gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] }
                  }
                : { opacity: 1 },
        tooltip: {
            fixed: { enabled: false },
            x: { show: false },
            y: { title: { formatter: () => `${name}: ` } },
            marker: { show: false }
        }
    };
}

/** Grouped/stacked column chart. */
export function columnOptions({ series, categories, colors = SERIES_COLORS, height = 300, stacked = false, horizontal = false }) {
    return {
        series,
        chart: { type: 'bar', height, stacked },
        plotOptions: { bar: { horizontal, columnWidth: '55%', borderRadius: 4, borderRadiusApplication: 'end' } },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: { categories },
        colors,
        fill: { opacity: 1 },
        legend: { position: 'top', horizontalAlign: 'right' }
    };
}

/** Multi-series line/area chart. */
export function lineOptions({ series, categories, colors = SERIES_COLORS, height = 280, type = 'line', showLegend = true }) {
    return {
        series,
        chart: { type, height },
        stroke: { curve: 'smooth', width: 2.5 },
        xaxis: { categories },
        colors,
        fill:
            type === 'area'
                ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 100] } }
                : { opacity: 1 },
        legend: { show: showLegend, position: 'top', horizontalAlign: 'right' },
        markers: { size: 0, hover: { size: 5 } }
    };
}

/** Donut chart. */
export function donutOptions({ series, labels, colors = SERIES_COLORS, height = 260, totalLabel = 'Total' }) {
    const t = chartTheme();
    return {
        series,
        labels,
        chart: { type: 'donut', height },
        colors,
        // Slice separators match the card surface, not a fixed white.
        stroke: { width: 2, colors: [t.surface] },
        plotOptions: {
            pie: {
                donut: {
                    size: '68%',
                    labels: {
                        show: true,
                        name: { fontSize: '12px', color: t.text },
                        value: { fontSize: '24px', fontWeight: 700, color: t.heading },
                        total: {
                            show: true,
                            label: totalLabel,
                            fontSize: '11px',
                            color: t.text,
                            formatter: (w) => w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString('en-IN')
                        }
                    }
                }
            }
        },
        legend: { position: 'bottom', horizontalAlign: 'center' }
    };
}

/** Heatmap — used for strike density by hour/day. */
export function heatmapOptions({ series, colors, height = 300 }) {
    const t = chartTheme();
    return {
        series,
        chart: { type: 'heatmap', height },
        plotOptions: {
            heatmap: {
                radius: 3,
                enableShades: false,
                colorScale: {
                    ranges: colors
                }
            }
        },
        stroke: { width: 2, colors: [t.surface] },
        legend: { position: 'bottom' }
    };
}
