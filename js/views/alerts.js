/**
 * Alerts & Notifications.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — time range + channel scope
 *   2. KPIs          — dispatched, delivered, failed, addressable reach
 *   3. Dispatch band — per-channel delivery (left) + compose & recent feed (right)
 *   4. Audience band — recipient groups and message templates
 *
 * Delivery comes before composition on purpose: an operator about to send
 * should see which channels are actually landing before choosing one.
 */

import {
    card, kpi, statRow, badge, severityBadge, statusDot, table, progressBar,
    timeline, toolbar, select, button, iconButton, num, compact, pct, esc, downloadCsv
} from '../components.js';
import { mkChart, columnOptions, PALETTE } from '../charts.js';
import { refresh } from '../router.js';
import { ALERTS, ALERT_CHANNELS, RECIPIENT_GROUPS, ALERT_TEMPLATES, DISTRICT_RISK } from '../data/mock.js';

const CHANNEL_NAME = new Map(ALERT_CHANNELS.map((c) => [c.id, c.name]));

const totals = ALERT_CHANNELS.reduce(
    (acc, c) => ({
        sent: acc.sent + c.sent,
        delivered: acc.delivered + c.delivered,
        failed: acc.failed + c.failed
    }),
    { sent: 0, delivered: 0, failed: 0 }
);

/** Guarded because an idle channel (Public Address) has sent nothing at all. */
function deliveryRate(channel) {
    return channel.sent ? (channel.delivered / channel.sent) * 100 : 0;
}

const overallRate = totals.sent ? (totals.delivered / totals.sent) * 100 : 0;
const totalReach = RECIPIENT_GROUPS.reduce((sum, g) => sum + g.count, 0);

function channelBadges(ids) {
    return ids.map((id) => badge(CHANNEL_NAME.get(id) || id, 'gray')).join(' ');
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${select('alert-channel-filter', [
                { value: 'all', label: 'All channels' },
                ...ALERT_CHANNELS.map((c) => ({ value: c.id, label: c.name }))
            ])}
        `,
        right: `
            <span class="live-chip"><span class="live-dot"></span> Dispatching</span>
            ${iconButton('refresh-cw', 'Refresh delivery stats')}
            ${iconButton('download', 'Export delivery log')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Messages Dispatched',
                value: compact(totals.sent),
                icon: 'send',
                tone: 'blue',
                delta: { value: `${ALERT_CHANNELS.filter((c) => c.status === 'active').length} channels active`, direction: 'up', sentiment: 'good' },
                context: `across ${ALERT_CHANNELS.length} channels`
            })}
            ${kpi({
                title: 'Delivery Rate',
                value: pct(overallRate, 1),
                icon: 'check-circle-2',
                tone: 'green',
                delta: { value: `${compact(totals.delivered)} delivered`, direction: 'up', sentiment: 'good' },
                context: 'confirmed by gateway'
            })}
            ${kpi({
                title: 'Failed Deliveries',
                value: compact(totals.failed),
                icon: 'alert-octagon',
                tone: 'red',
                delta: { value: pct((totals.failed / totals.sent) * 100, 1), direction: 'up', sentiment: 'bad' },
                context: 'queued for retry'
            })}
            ${kpi({
                title: 'Addressable Reach',
                value: compact(totalReach),
                icon: 'users',
                tone: 'purple',
                delta: { value: `${RECIPIENT_GROUPS.length} groups`, direction: 'flat', sentiment: 'neutral' },
                context: 'subscribed recipients'
            })}
        </section>`;
}

/* --------------------------------------------------------- Dispatch band */

function channelsCard() {
    return card({
        title: 'Delivery Channels',
        subtitle: 'Gateway throughput and failure rate',
        actions: `<a class="link-btn" href="#/admin">Channel settings</a>`,
        body: `
            ${table({
                columns: [
                    {
                        key: 'name',
                        label: 'Channel',
                        render: (c) => `
                            <span class="channel-cell" data-channel="${esc(c.id)}">
                                <i data-lucide="${esc(c.icon)}"></i>
                                <span class="font-semibold">${esc(c.name)}</span>
                            </span>`
                    },
                    { key: 'status', label: 'Status', render: (c) => statusDot(c.status) },
                    { key: 'sent', label: 'Sent', align: 'right', render: (c) => esc(num(c.sent)) },
                    { key: 'delivered', label: 'Delivered', align: 'right', render: (c) => esc(num(c.delivered)) },
                    {
                        key: 'failed',
                        label: 'Failed',
                        align: 'right',
                        render: (c) => (c.failed ? `<span class="text-red">${esc(num(c.failed))}</span>` : esc(num(c.failed)))
                    },
                    {
                        key: 'rate',
                        label: 'Delivery rate',
                        render: (c) => {
                            const rate = deliveryRate(c);
                            // An idle channel has no rate to report; 0% would read as a failure.
                            if (!c.sent) return `<span class="text-secondary">No traffic</span>`;
                            const tone = rate >= 97 ? 'green' : rate >= 90 ? 'yellow' : 'red';
                            return `
                                <span class="text-${esc(tone)} font-semibold">${esc(pct(rate, 1))}</span>
                                ${progressBar(rate, tone)}`;
                        }
                    }
                ],
                rows: ALERT_CHANNELS
            })}
            <div class="chart-caption mt-4">Failure rate by channel — absolute counts are in the table above</div>
            <div id="alert-channel-chart"></div>`
    });
}

function composeCard() {
    const firstTemplate = ALERT_TEMPLATES[0];
    return card({
        title: 'Message Preview',
        subtitle: 'Template, target, and audience — rendered live',
        body: `
            <div class="compose-form">
                ${select('alert-template', ALERT_TEMPLATES.map((t) => ({ value: t.id, label: t.name })), { label: 'Template' })}
                ${select('alert-target', [
                    { value: 'all', label: 'All districts' },
                    ...DISTRICT_RISK.map((d) => ({ value: d.id, label: d.name }))
                ], { label: 'Target' })}
                ${select('alert-group', RECIPIENT_GROUPS.map((g) => ({ value: g.id, label: `${g.name} (${compact(g.count)})` })), { label: 'Audience' })}
                <div class="template-preview">
                    <div class="chart-caption">Message preview · <span id="alert-reach">${esc(compact(RECIPIENT_GROUPS[0].count))} recipients</span></div>
                    <p class="template-body font-mono" id="alert-preview">${esc(firstTemplate.body)}</p>
                </div>
                <div class="compose-actions">
                    ${button('Copy message', { icon: 'copy', attrs: 'id="alert-copy"' })}
                </div>
            </div>`
    });
}

function recentCard() {
    return card({
        title: 'Recent Alerts',
        subtitle: `${ALERTS.length} issued in this window`,
        actions: `<a class="link-btn" href="#/reports">Alert log</a>`,
        bodyClass: 'scrollable',
        body: timeline(ALERTS)
    });
}

function dispatchSection() {
    return `
        <section class="hero-section">
            ${channelsCard()}
            <div class="hero-right-panel">
                ${composeCard()}
                ${recentCard()}
            </div>
        </section>`;
}

/* ---------------------------------------------------------- Audience band */

function recipientsCard() {
    return card({
        title: 'Recipient Groups',
        subtitle: 'Subscribed audiences and their routes',
        actions: `<a class="link-btn" href="#/admin">Manage groups</a>`,
        body: `
            ${table({
                columns: [
                    { key: 'name', label: 'Group', render: (g) => `<span class="font-semibold">${esc(g.name)}</span>` },
                    { key: 'count', label: 'Recipients', align: 'right', render: (g) => esc(num(g.count)) },
                    { key: 'channels', label: 'Routes', render: (g) => channelBadges(g.channels) },
                    {
                        key: 'share',
                        label: 'Share of reach',
                        // Public dwarfs every other group, so the bar is the only
                        // readable comparison — the raw counts are three orders apart.
                        render: (g) => progressBar((g.count / totalReach) * 100, 'purple')
                    }
                ],
                rows: RECIPIENT_GROUPS
            })}
            <div class="mt-4">
                ${statRow('Total addressable', esc(num(totalReach)), { bold: true })}
                ${statRow('Groups configured', esc(num(RECIPIENT_GROUPS.length)))}
            </div>`
    });
}

function templatesCard() {
    return card({
        title: 'Alert Templates',
        subtitle: 'Pre-approved message bodies',
        actions: `<a class="link-btn" href="#/alerts?tab=automation">SOP bindings</a>`,
        body: `
            <div class="template-list">
                ${ALERT_TEMPLATES.map(
                    (t) => `
                <div class="template-item">
                    <div class="template-head">
                        <span class="font-semibold">${esc(t.name)}</span>
                        ${severityBadge(t.severity)}
                    </div>
                    <div class="template-meta">
                        <span class="font-mono text-secondary">${esc(t.id)}</span>
                        ${channelBadges(t.channels)}
                    </div>
                    <p class="template-body font-mono">${esc(t.body)}</p>
                </div>`
                ).join('')}
            </div>`
    });
}

function audienceSection() {
    return `
        <section class="section-heading">
            <h2>Recipients &amp; Templates</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${recipientsCard()}
            ${templatesCard()}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Alerts & Notifications',
    subtitle: 'Compose alerts, track delivery, manage recipients',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${dispatchSection()}
            ${audienceSection()}`;
    },

    mount(root) {
        // Plotted as a RATE, not absolute counts. App Push sends 612k against
        // Sirens' 42, so on a shared linear axis every channel but App Push
        // flattens to nothing — and a log axis is out because idle Public
        // Address is a legitimate zero. Rate is comparable across channels and
        // surfaces the real problem (IVR fails ~12% of calls), which raw
        // volume hides. Public Address stays in so its idle state is visible.
        mkChart('#alert-channel-chart', {
            ...columnOptions({
                series: [
                    {
                        name: 'Failure rate',
                        data: ALERT_CHANNELS.map((c) =>
                            c.sent ? Math.round((c.failed / c.sent) * 1000) / 10 : 0
                        )
                    }
                ],
                categories: ALERT_CHANNELS.map((c) => c.name),
                colors: [PALETTE.red],
                height: 280
            }),
            yaxis: { labels: { formatter: (v) => `${v}%` } },
            legend: { show: false }
        });

        // Template + target + audience render a live preview. textContent
        // (not innerHTML) keeps the substituted message inert.
        const templateSelect = root.querySelector('#alert-template');
        const targetSelect = root.querySelector('#alert-target');
        const groupSelect = root.querySelector('#alert-group');
        const preview = root.querySelector('#alert-preview');
        const reachEl = root.querySelector('#alert-reach');

        const rebuildPreview = () => {
            const tpl = ALERT_TEMPLATES.find((t) => t.id === templateSelect?.value) || ALERT_TEMPLATES[0];
            const targetName =
                targetSelect && targetSelect.value !== 'all'
                    ? DISTRICT_RISK.find((d) => d.id === targetSelect.value)?.name || 'your district'
                    : 'your district';
            const filled = tpl.body
                .replace(/\{\{district\}\}/g, targetName)
                .replace(/\{\{validUntil\}\}/g, 'further notice')
                .replace(/\{\{duration\}\}/g, '2 hours')
                .replace(/\{\{shelter\}\}/g, 'the nearest designated shelter');
            if (preview) preview.textContent = filled;
            const group = RECIPIENT_GROUPS.find((g) => g.id === groupSelect?.value) || RECIPIENT_GROUPS[0];
            if (reachEl) reachEl.textContent = `${compact(group.count)} recipients`;
        };
        [templateSelect, targetSelect, groupSelect].forEach((el) => el?.addEventListener('change', rebuildPreview));
        rebuildPreview();

        // Copy the rendered message to the clipboard.
        const copyBtn = root.querySelector('#alert-copy');
        copyBtn?.addEventListener('click', () => {
            if (navigator.clipboard && preview) navigator.clipboard.writeText(preview.textContent);
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = 'Copied';
            setTimeout(() => {
                copyBtn.innerHTML = orig;
                if (window.lucide) window.lucide.createIcons();
            }, 1200);
        });

        // Channel filter narrows the delivery table.
        const channelFilter = root.querySelector('#alert-channel-filter');
        channelFilter?.addEventListener('change', () => {
            const v = channelFilter.value;
            root.querySelectorAll('.channel-cell[data-channel]').forEach((cell) => {
                const tr = cell.closest('tr');
                if (tr) tr.hidden = !(v === 'all' || cell.dataset.channel === v);
            });
        });

        const refreshBtn = root.querySelector('[aria-label="Refresh delivery stats"]');
        refreshBtn?.addEventListener('click', () => {
            refreshBtn.classList.add('refreshing');
            setTimeout(refresh, 400);
        });

        // Export delivery log → CSV of per-channel delivery stats.
        root.querySelector('[aria-label="Export delivery log"]')?.addEventListener('click', () =>
            downloadCsv(ALERT_CHANNELS, ['id', 'name', 'status', 'sent', 'delivered', 'failed'], 'alert-delivery-log.csv')
        );
    }
};
