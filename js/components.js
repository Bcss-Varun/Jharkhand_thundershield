/**
 * Shared render helpers. Every view builds markup from these so card, table,
 * badge, and stat styling stay in one place.
 *
 * All helpers return HTML strings. Anything interpolating mock data runs
 * through esc() — the data is fake today, but these views are meant to be
 * wired to a real API later, and unescaped innerHTML would become an
 * injection vector the moment they are.
 */

import { queryParams } from './router.js';

export function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------- Formatting */

export function num(n) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('en-IN');
}

/** 1240000 -> "1.2M". For KPI values where width is tight. */
export function compact(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
    if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
}

export function pct(n, digits = 0) {
    return `${Number(n).toFixed(digits)}%`;
}

/** 3742 -> "1h 2m ago" */
export function ago(seconds) {
    if (seconds < 60) return `${seconds} sec ago`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/* ------------------------------------------------------------------ Cards */

/**
 * card({ title, actions, body, className, bodyClass, subtitle })
 * `actions` is raw HTML for the header right slot; `body` is raw HTML.
 */
export function card({ title, subtitle, actions = '', body = '', className = '', bodyClass = '' }) {
    return `
        <div class="card ${className}">
            ${title ? `
            <div class="card-header">
                <div class="card-heading">
                    <h2 class="card-title">${esc(title)}</h2>
                    ${subtitle ? `<span class="card-subtitle">${esc(subtitle)}</span>` : ''}
                </div>
                ${actions ? `<div class="card-actions">${actions}</div>` : ''}
            </div>` : ''}
            <div class="card-body ${bodyClass}">${body}</div>
        </div>`;
}

export function iconButton(icon, label = '') {
    return `<button class="btn-icon" title="${esc(label)}" aria-label="${esc(label)}"><i data-lucide="${esc(icon)}"></i></button>`;
}

export function button(label, { icon, variant = 'default', attrs = '' } = {}) {
    return `<button class="btn btn-${esc(variant)}" ${attrs}>${icon ? `<i data-lucide="${esc(icon)}"></i>` : ''}${esc(label)}</button>`;
}

/* -------------------------------------------------------------------- KPI */

/**
 * Hero KPI tile. `delta` is { value, direction, label } where direction is
 * 'up' | 'down' | 'flat', and `tone` says whether that direction is good or
 * bad — an 8% rise in strikes is bad, an 8% rise in uptime is good, so the
 * colour cannot be derived from the arrow alone.
 */
/** When a caller states no sentiment, assume the plain reading of the arrow. */
const DIRECTION_SENTIMENT = { up: 'good', down: 'bad', flat: 'neutral' };

export function kpi({ title, value, unit = '', icon, tone = 'blue', delta, context }) {
    const arrow = delta ? { up: 'trending-up', down: 'trending-down', flat: 'minus' }[delta.direction] : null;
    // Colour tracks `sentiment`, not the arrow. Strikes rising is bad, uptime
    // rising is good — both are direction 'up', so the arrow cannot decide.
    const sentiment = delta ? delta.sentiment || DIRECTION_SENTIMENT[delta.direction] || 'neutral' : null;
    return `
        <div class="kpi-card kpi-${esc(tone)}">
            <div class="kpi-icon-wrapper bg-${esc(tone)}"><i data-lucide="${esc(icon)}"></i></div>
            <div class="kpi-content">
                <div class="kpi-title">${esc(title)}</div>
                <div class="kpi-value">${esc(value)}${unit ? `<span class="kpi-unit">${esc(unit)}</span>` : ''}</div>
                <div class="kpi-trend-row">
                    ${delta ? `
                    <span class="kpi-trend ${esc(sentiment)}">
                        <i data-lucide="${esc(arrow)}"></i> ${esc(delta.value)}
                    </span>` : ''}
                    ${context ? `<span class="kpi-context">${esc(context)}</span>` : ''}
                </div>
            </div>
        </div>`;
}

/** Compact metric for the secondary status strip. */
export function statusPill({ label, value, tone = 'neutral', icon }) {
    return `
        <div class="status-pill">
            ${icon ? `<i data-lucide="${esc(icon)}" class="text-${esc(tone)}"></i>` : ''}
            ${label ? `<span class="status-pill-label">${esc(label)}</span>` : ''}
            <span class="status-pill-value text-${esc(tone)}">${esc(value)}</span>
        </div>`;
}

/* ------------------------------------------------------------------ Stats */

export function statRow(label, value, { tone, bold } = {}) {
    const cls = [tone ? `text-${tone}` : '', bold ? 'font-semibold' : ''].filter(Boolean).join(' ');
    return `
        <div class="stat-row">
            <span class="stat-label">${esc(label)}</span>
            <span class="stat-val ${cls}">${value}</span>
        </div>`;
}

/**
 * Soft tint badge — the default. Pass `solid: true` for the saturated
 * white-on-colour fill, which the redesign reserves for true severity.
 */
export function badge(label, tone = 'blue', { solid = false } = {}) {
    const cls = solid ? `bg-${esc(tone)}` : `tint-${esc(tone)}`;
    return `<span class="badge ${cls}">${esc(label)}</span>`;
}

const SEVERITY_TONE = { severe: 'red', warning: 'orange', watch: 'yellow', normal: 'green', info: 'green' };

export function severityBadge(severity) {
    const tone = SEVERITY_TONE[severity] || 'blue';
    const label = severity.charAt(0).toUpperCase() + severity.slice(1);
    // Only a genuine 'severe' gets the loud solid fill; everything else tints.
    return badge(label, tone, { solid: severity === 'severe' });
}

export function severityTone(severity) {
    return SEVERITY_TONE[severity] || 'blue';
}

const STATUS_TONE = {
    online: 'green', active: 'green', connected: 'green', ready: 'green', resolved: 'green', closed: 'green', success: 'green',
    completed: 'green',
    degraded: 'yellow', partial: 'yellow', pending: 'yellow', generating: 'yellow', 'in-progress': 'yellow', assigned: 'blue',
    offline: 'red', failed: 'red', open: 'red',
    idle: 'gray', inactive: 'gray'
};

export function statusDot(status) {
    const tone = STATUS_TONE[status] || 'gray';
    const label = status.replace(/-/g, ' ');
    return `<span class="status-chip"><span class="dot bg-${esc(tone)}"></span>${esc(label.charAt(0).toUpperCase() + label.slice(1))}</span>`;
}

export function statusToneOf(status) {
    return STATUS_TONE[status] || 'gray';
}

/* ------------------------------------------------------------------ Table */

/**
 * table({ columns, rows })
 * columns: [{ key, label, align, render(row) }]
 * `render` returns raw HTML and is responsible for its own escaping;
 * without it the raw value is escaped for you.
 */
export function table({ columns, rows, className = '', empty = 'No records found' }) {
    if (!rows.length) {
        return `<div class="table-empty">${esc(empty)}</div>`;
    }
    const head = columns
        .map((c) => `<th class="align-${esc(c.align || 'left')}">${esc(c.label)}</th>`)
        .join('');
    const body = rows
        .map((row) => {
            const cells = columns
                .map((c) => {
                    const content = c.render ? c.render(row) : esc(row[c.key]);
                    return `<td class="align-${esc(c.align || 'left')}">${content}</td>`;
                })
                .join('');
            return `<tr>${cells}</tr>`;
        })
        .join('');
    return `<table class="data-table ${className}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* --------------------------------------------------------------- Progress */

export function progressBar(percent, tone = 'blue') {
    const clamped = Math.max(0, Math.min(100, percent));
    return `
        <div class="progress-bar-container" role="progressbar" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar bg-${esc(tone)}" style="width: ${clamped}%;"></div>
        </div>`;
}

/* -------------------------------------------------------------- Timeline */

export function timeline(items) {
    const rows = items
        .map(
            (it) => `
        <div class="timeline-item">
            <div class="timeline-icon bg-${esc(severityTone(it.severity))}"><i data-lucide="${esc(it.icon)}"></i></div>
            <div class="timeline-content">
                <div class="timeline-header">
                    ${severityBadge(it.severity)}
                    <span class="timeline-time">${esc(it.time)}</span>
                </div>
                <div class="timeline-title">${esc(it.title)}</div>
                <div class="timeline-desc">${esc(it.desc)}</div>
            </div>
        </div>`
        )
        .join('');
    return `<div class="timeline">${rows}</div>`;
}

/* ----------------------------------------------------------------- States */

export function emptyState(message, icon = 'inbox') {
    return `<div class="empty-state"><i data-lucide="${esc(icon)}"></i><p>${esc(message)}</p></div>`;
}

/* ------------------------------------------------------------- Page parts */

/** Toolbar strip above a section's content: filters left, actions right. */
export function toolbar({ left = '', right = '' }) {
    return `<div class="view-toolbar"><div class="toolbar-left">${left}</div><div class="toolbar-right">${right}</div></div>`;
}

export function select(id, options, { label } = {}) {
    const opts = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    return `
        <label class="field">
            ${label ? `<span class="field-label">${esc(label)}</span>` : ''}
            <select id="${esc(id)}" class="input-select">${opts}</select>
        </label>`;
}

export function segmented(id, options, activeValue) {
    const btns = options
        .map(
            (o) =>
                `<button class="segment ${o.value === activeValue ? 'active' : ''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`
        )
        .join('');
    return `<div class="segmented" id="${esc(id)}">${btns}</div>`;
}

/**
 * Module-level tab bar (underline style). `items` is [{ value, label, icon? }].
 * Pair with panels marked `data-tab-panel="<value>"` and wire with bindTabs().
 */
export function tabs(id, items, activeValue) {
    const btns = items
        .map(
            (t) =>
                `<button class="tab ${t.value === activeValue ? 'active' : ''}" role="tab" data-tab="${esc(t.value)}">${
                    t.icon ? `<i data-lucide="${esc(t.icon)}"></i>` : ''
                }${esc(t.label)}</button>`
        )
        .join('');
    return `<div class="tabs" id="${esc(id)}" role="tablist">${btns}</div>`;
}

/**
 * Wire a tabs() bar to its panels. Shows the panel whose
 * `data-tab-panel` matches the clicked tab, hides the rest.
 */
export function bindTabs(root, tabsId, onChange) {
    const bar = root.querySelector(`#${tabsId}`);
    if (!bar) return;
    const panels = root.querySelectorAll('[data-tab-panel]');
    bar.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.tab;
            bar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
            panels.forEach((p) => {
                p.hidden = p.dataset.tabPanel !== val;
            });
            if (window.lucide) window.lucide.createIcons();
            if (onChange) onChange(val);
        });
    });
}

/** Section divider with a title and a trailing rule; used between bands. */
export function sectionHeader(title, actions = '') {
    return `<div class="section-heading"><h2>${esc(title)}</h2><span class="section-rule"></span>${actions}</div>`;
}

/**
 * Compose existing view modules into one tabbed view. `items` is
 * [{ value, label, icon?, view }] where `view` is a view module (render/mount).
 * Panels mount lazily the first time their tab is shown, so charts and maps
 * measure a visible (non-zero) container. A `?tab=<value>` in the hash opens
 * that tab on load — deep links like '#/analytics?tab=historical' work.
 */
export function makeTabbedView({ title, subtitle, tabsId, items }) {
    const initial = () => {
        const q = queryParams().tab;
        return items.some((t) => t.value === q) ? q : items[0].value;
    };
    return {
        title,
        subtitle,
        render() {
            const active = initial();
            const bar = tabs(
                tabsId,
                items.map((t) => ({ value: t.value, label: t.label, icon: t.icon })),
                active
            );
            const panels = items
                .map(
                    (t) =>
                        `<div data-tab-panel="${esc(t.value)}"${t.value === active ? '' : ' hidden'}>${t.view.render()}</div>`
                )
                .join('');
            return bar + panels;
        },
        mount(root) {
            const mounted = new Set();
            const mountPanel = (val) => {
                if (mounted.has(val)) return;
                const item = items.find((t) => t.value === val);
                const panel = root.querySelector(`[data-tab-panel="${val}"]`);
                if (item && item.view.mount && panel) {
                    try {
                        item.view.mount(panel);
                    } catch (err) {
                        console.error('tab mount failed:', val, err);
                    }
                }
                mounted.add(val);
            };
            mountPanel(initial());
            bindTabs(root, tabsId, mountPanel);
        }
    };
}

/* ---------------------------------------------------------- File download */

/** Trigger a client-side download of `content` as `filename`. */
export function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * Download `rows` as a CSV using the given column keys. Array-valued cells are
 * joined with '; '. Used by every view's Export button.
 */
export function downloadCsv(rows, columns, filename) {
    const cell = (v) => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.join(',')]
        .concat(rows.map((r) => columns.map((c) => cell(r[c])).join(',')))
        .join('\n');
    downloadFile(csv, filename, 'text/csv');
}

/** Standard time-range control used across time-scoped views. */
export const TIME_RANGES = [
    { value: '1h', label: '1H' },
    { value: '6h', label: '6H' },
    { value: '24h', label: '24H' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' }
];
