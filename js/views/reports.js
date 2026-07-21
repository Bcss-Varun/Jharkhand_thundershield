/**
 * Reports — the report library, its schedule, and export actions.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar  — type filter + format scope
 *   2. KPIs         — how many definitions exist and how many are ready
 *   3. Library      — the report table (left) with breakdown panels (right)
 *   4. Cadence      — format/type mix, so gaps in coverage are visible
 *
 * Generate/download are simulated: there is no export service behind this
 * build, so the buttons acknowledge the click and the card says so plainly
 * rather than implying a file was produced.
 */

import {
    card, kpi, statRow, statusDot, statusToneOf, table, progressBar, badge,
    toolbar, segmented, select, iconButton, button, esc
} from '../components.js';
import { mkChart, donutOptions, columnOptions, PALETTE, SERIES_COLORS } from '../charts.js';
import { refresh } from '../router.js';
import { REPORTS } from '../data/mock.js';

/** What each report type contains — drives the preview panel. Descriptive
    (documentation of the deliverable), not fabricated data. */
const REPORT_CONTENTS = {
    Daily: ['24-hour strike totals & hourly profile', 'District risk snapshot', 'Alerts issued in the period', 'Open incident summary'],
    Weekly: ['7-day strike & alert trend', 'District risk-level changes', 'Sensor uptime & offline log', 'Response SLA summary'],
    Monthly: ['Full incident register & casualties', 'Alert delivery compliance', 'Resource deployment record', 'Threshold breach log'],
    Seasonal: ['Multi-year strike analysis', 'Monsoon seasonality curve', 'Hotspot district ranking', 'Casualty trend analysis']
};

const READY = REPORTS.filter((r) => r.status === 'ready');
const GENERATING = REPORTS.filter((r) => r.status === 'generating');
const MANUAL = REPORTS.filter((r) => r.schedule === 'Manual');
const SCHEDULED = REPORTS.filter((r) => r.schedule !== 'Manual');
const SCHEDULED_PCT = Math.round((SCHEDULED.length / REPORTS.length) * 100);

/** Distinct values, in first-seen order, so filter chips match the data. */
function distinct(key) {
    return [...new Set(REPORTS.map((r) => r[key]))];
}

const TYPES = distinct('type');
const FORMATS = distinct('format');

function countBy(key) {
    return distinct(key).map((value) => ({ value, count: REPORTS.filter((r) => r[key] === value).length }));
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${segmented('rpt-type', [{ value: 'all', label: 'All' }, ...TYPES.map((t) => ({ value: t, label: t }))], 'all')}
            ${select('rpt-format', [{ value: 'all', label: 'All formats' }, ...FORMATS.map((f) => ({ value: f, label: f }))], {
                label: 'Format'
            })}
        `,
        right: `
            ${iconButton('refresh-cw', 'Refresh')}
        `
    });
}

/* ------------------------------------------------------------ Hero KPIs */

function heroKpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Report Definitions',
                value: REPORTS.length,
                icon: 'file-text',
                tone: 'blue',
                delta: { value: `${TYPES.length} types`, direction: 'flat', sentiment: 'neutral' },
                context: `${FORMATS.join(' · ')}`
            })}
            ${kpi({
                title: 'Ready to Download',
                value: READY.length,
                icon: 'check-circle-2',
                tone: 'green',
                delta: { value: `${Math.round((READY.length / REPORTS.length) * 100)}% of library`, direction: 'up', sentiment: 'good' },
                context: 'Last run completed'
            })}
            ${kpi({
                title: 'Currently Generating',
                value: GENERATING.length,
                icon: 'loader',
                tone: 'yellow',
                delta: { value: GENERATING.length ? 'In progress' : 'Queue clear', direction: 'flat', sentiment: 'neutral' },
                context: GENERATING.length ? GENERATING[0].name : 'Nothing queued'
            })}
            ${kpi({
                title: 'On a Schedule',
                value: `${SCHEDULED.length} / ${REPORTS.length}`,
                icon: 'calendar-clock',
                tone: 'purple',
                delta: { value: `${MANUAL.length} manual only`, direction: 'flat', sentiment: 'neutral' },
                context: `${SCHEDULED_PCT}% automated`
            })}
        </section>`;
}

/* --------------------------------------------------------- Library table */

function libraryTable() {
    return table({
        columns: [
            {
                key: 'name',
                label: 'Report',
                render: (r) => `
                    <span class="font-semibold" data-type="${esc(r.type)}" data-format="${esc(r.format)}">${esc(r.name)}</span>
                    <div class="text-xs text-secondary">${esc(r.id)}</div>`
            },
            { key: 'type', label: 'Type', render: (r) => badge(r.type, 'blue') },
            { key: 'format', label: 'Format', render: (r) => badge(r.format, r.format === 'PDF' ? 'red' : 'green') },
            {
                key: 'schedule',
                label: 'Schedule',
                render: (r) =>
                    r.schedule === 'Manual'
                        ? `<span class="text-secondary">Manual</span>`
                        : `<span class="text-dark">${esc(r.schedule)}</span>`
            },
            { key: 'lastRun', label: 'Last run', render: (r) => `<span class="font-mono text-xs">${esc(r.lastRun)}</span>` },
            {
                key: 'status',
                label: 'Status',
                render: (r) => `<span data-status-cell="${esc(r.id)}">${statusDot(r.status)}</span>`
            },
            {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) => `
                    ${button('Generate', { icon: 'play', attrs: `data-act="generate" data-id="${esc(r.id)}"` })}
                    ${button('Download', {
                        icon: 'download',
                        attrs: `data-act="download" data-id="${esc(r.id)}" ${r.status === 'ready' ? '' : 'disabled'}`
                    })}`
            }
        ],
        rows: REPORTS,
        empty: 'No reports match this filter'
    });
}

function libraryCard() {
    return card({
        title: 'Report Library',
        subtitle: 'Definitions, schedules, and last run status',
        body: `
            <div id="rpt-library">${libraryTable()}</div>
            <div class="chart-caption mt-3">
                Generate and download are simulated in this build — no file is written and nothing is emailed.
            </div>`
    });
}

/** Preview of a report's metadata and contents — updated on row click. */
function reportPreview(r) {
    const contents = REPORT_CONTENTS[r.type] || ['Summary tables', 'Trend charts', 'Appendix'];
    return `
        <div class="detail-head">
            <span class="font-mono">${esc(r.id)}</span>
            ${badge(r.format, r.format === 'PDF' ? 'red' : 'green')}
        </div>
        <div class="font-semibold">${esc(r.name)}</div>
        <div class="mt-3">
            ${statRow('Type', badge(r.type, 'blue'))}
            ${statRow('Schedule', esc(r.schedule))}
            ${statRow('Last run', `<span class="font-mono">${esc(r.lastRun)}</span>`)}
            ${statRow('Status', statusDot(r.status))}
        </div>
        <div class="chart-caption mt-3">Contents</div>
        <ul class="report-contents">
            ${contents.map((c) => `<li><i data-lucide="check"></i> ${esc(c)}</li>`).join('')}
        </ul>`;
}

function previewCard() {
    return card({
        title: 'Report Preview',
        subtitle: 'Click a report in the library',
        body: `<div id="rpt-preview">${reportPreview(REPORTS[0])}</div>`
    });
}

/* ------------------------------------------------------- Breakdown panels */

function typeBreakdownCard() {
    return card({
        title: 'By Report Type',
        subtitle: 'Share of the library',
        body: `<div id="rpt-type-chart"></div>`
    });
}

function deliveryCard() {
    const readyPct = Math.round((READY.length / REPORTS.length) * 100);
    return card({
        title: 'Scheduled vs Manual',
        subtitle: 'How much of the library runs itself',
        bodyClass: 'flex-col',
        body: `
            ${statRow('Scheduled', `<span class="font-semibold">${esc(SCHEDULED.length)}</span>`, { tone: 'green' })}
            ${progressBar(SCHEDULED_PCT, 'green')}
            <div class="mt-3">
                ${statRow('Manual only', `<span class="font-semibold">${esc(MANUAL.length)}</span>`, { tone: 'orange' })}
            </div>
            ${progressBar(100 - SCHEDULED_PCT, 'orange')}
            <div class="mt-4">
                ${statRow('Ready for download', `${esc(READY.length)} of ${esc(REPORTS.length)}`, { tone: statusToneOf('ready') })}
                ${statRow('Generating now', esc(GENERATING.length), { tone: statusToneOf('generating') })}
                ${statRow('Output formats', esc(FORMATS.join(', ')))}
                ${statRow('Completion rate', `<span class="font-semibold">${esc(readyPct)}%</span>`)}
            </div>`
    });
}

function librarySection() {
    return `
        <section class="section-heading">
            <h2>Report Library</h2>
            <span class="section-rule"></span>
        </section>
        <section class="hero-section">
            ${libraryCard()}
            <div class="hero-right-panel">
                ${previewCard()}
                ${typeBreakdownCard()}
                ${deliveryCard()}
            </div>
        </section>`;
}

/* ---------------------------------------------------------- Cadence band */

function cadenceSection() {
    return `
        <section class="section-heading">
            <h2>Output Cadence</h2>
            <span class="section-rule"></span>
        </section>
        <section class="trends-section">
            ${card({
                title: 'Reports by Format and Type',
                subtitle: 'What the library actually produces',
                actions: `<a class="link-btn" href="#/admin">Audit log</a>`,
                body: `<div id="rpt-format-chart"></div>`
            })}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Reports',
    subtitle: 'Templates, scheduling, exports, and audit trail',

    render() {
        return `
            ${commandBar()}
            ${heroKpis()}
            ${librarySection()}
            ${cadenceSection()}`;
    },

    mount(root) {
        const typeCounts = countBy('type');
        mkChart('#rpt-type-chart', donutOptions({
            series: typeCounts.map((t) => t.count),
            labels: typeCounts.map((t) => t.value),
            colors: SERIES_COLORS,
            height: 240,
            totalLabel: 'Reports'
        }));

        // One series per format so the stack reads as "of the N weekly
        // reports, how many are Excel" — the question a scheduler asks.
        mkChart('#rpt-format-chart', columnOptions({
            series: FORMATS.map((f) => ({
                name: f,
                data: TYPES.map((t) => REPORTS.filter((r) => r.type === t && r.format === f).length)
            })),
            categories: TYPES,
            colors: [PALETTE.red, PALETTE.green],
            stacked: true,
            height: 280
        }));

        const library = root.querySelector('#rpt-library');
        const formatSel = root.querySelector('#rpt-format');
        const state = { type: 'all', format: 'all' };

        function applyFilters() {
            library.querySelectorAll('tbody tr').forEach((tr) => {
                const cell = tr.querySelector('[data-type]');
                if (!cell) return;
                const typeOk = state.type === 'all' || cell.dataset.type === state.type;
                const formatOk = state.format === 'all' || cell.dataset.format === state.format;
                tr.hidden = !(typeOk && formatOk);
            });
        }

        root.querySelectorAll('#rpt-type .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                state.type = btn.dataset.value;
                applyFilters();
            });
        });

        if (formatSel) {
            formatSel.addEventListener('change', () => {
                state.format = formatSel.value;
                applyFilters();
            });
        }

        // Refresh → re-render the view.
        const refreshBtn = root.querySelector('[aria-label="Refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('refreshing');
                setTimeout(refresh, 400);
            });
        }

        // Clicking a library row (not an action button) loads its preview.
        const previewEl = root.querySelector('#rpt-preview');
        const rows = Array.from(library.querySelectorAll('tbody tr'));
        rows.forEach((tr, i) => {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (evt) => {
                if (evt.target.closest('[data-act]')) return; // let action buttons run
                if (previewEl) {
                    previewEl.innerHTML = reportPreview(REPORTS[i]);
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        });

        // Simulated run: flip the row to 'generating' and back so the control
        // is not dead, without pretending a document was produced.
        library.addEventListener('click', (evt) => {
            const btn = evt.target.closest('[data-act]');
            if (!btn) return;
            const id = btn.dataset.id;

            if (btn.dataset.act === 'generate') {
                const cell = library.querySelector(`[data-status-cell="${id}"]`);
                if (!cell) return;
                cell.innerHTML = statusDot('generating');
                setTimeout(() => {
                    cell.innerHTML = statusDot('ready');
                }, 1400);
                return;
            }

            const original = btn.innerHTML;
            btn.innerHTML = 'Simulated — no file';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }, 1600);
        });
    }
};
