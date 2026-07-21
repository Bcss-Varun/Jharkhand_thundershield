/**
 * Administration — users, roles, thresholds, integrations, and the audit log.
 *
 * Five areas that share nothing but an audience, so they are tabbed rather
 * than stacked: rendered together this page is several thousand pixels of
 * scroll, and an operator looking for one threshold should not have to walk
 * past 200 audit rows to reach it.
 *
 * Every panel is rendered up front and toggled with the `hidden` attribute —
 * the data is small enough that re-rendering on tab change buys nothing.
 */

import {
    card, kpi, statRow, statusDot, statusToneOf, statusPill, table, badge,
    toolbar, segmented, iconButton, button, num, esc, downloadCsv
} from '../components.js';
import { mkChart, donutOptions, SERIES_COLORS } from '../charts.js';
import { refresh } from '../router.js';
import { USERS, ROLES, THRESHOLDS, INTEGRATIONS, AUDIT_LOG } from '../data/mock.js';

const ACTIVE_USERS = USERS.filter((u) => u.status === 'active');
const CONNECTED = INTEGRATIONS.filter((i) => i.status === 'connected');
const DEGRADED = INTEGRATIONS.filter((i) => i.status !== 'connected');
const ROLE_SEATS = ROLES.reduce((sum, r) => sum + r.users, 0);

const TABS = [
    { value: 'users', label: 'Users' },
    { value: 'roles', label: 'Roles' },
    { value: 'thresholds', label: 'Thresholds' },
    { value: 'integrations', label: 'Integrations' },
    { value: 'audit', label: 'Audit Log' }
];

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: segmented('admin-tabs', TABS, 'users'),
        right: `${iconButton('refresh-cw', 'Refresh')}`
    });
}

/* ------------------------------------------------------------ Hero KPIs */

function heroKpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'User Accounts',
                value: USERS.length,
                icon: 'users',
                tone: 'blue',
                delta: { value: `${ACTIVE_USERS.length} active`, direction: 'up', sentiment: 'good' },
                context: `${USERS.length - ACTIVE_USERS.length} inactive`
            })}
            ${kpi({
                title: 'Roles Defined',
                value: ROLES.length,
                icon: 'shield-check',
                tone: 'purple',
                delta: { value: `${num(ROLE_SEATS)} seats assigned`, direction: 'flat', sentiment: 'neutral' },
                context: 'Statewide RBAC'
            })}
            ${kpi({
                title: 'Alert Thresholds',
                value: THRESHOLDS.length,
                icon: 'sliders-horizontal',
                tone: 'orange',
                delta: {
                    value: `${THRESHOLDS.filter((t) => t.scope === 'Statewide').length} statewide`,
                    direction: 'flat',
                    sentiment: 'neutral'
                },
                context: `${THRESHOLDS.filter((t) => t.scope !== 'Statewide').length} per-district`
            })}
            ${kpi({
                title: 'Integrations Healthy',
                value: `${CONNECTED.length} / ${INTEGRATIONS.length}`,
                icon: 'plug',
                tone: DEGRADED.length ? 'yellow' : 'green',
                delta: {
                    value: DEGRADED.length ? `${DEGRADED.length} degraded` : 'All connected',
                    direction: DEGRADED.length ? 'down' : 'flat',
                    sentiment: DEGRADED.length ? 'bad' : 'good'
                },
                context: DEGRADED.length ? DEGRADED.map((i) => i.name).join(', ') : 'No action needed'
            })}
        </section>`;
}

/* ------------------------------------------------------------ Users panel */

function usersPanel() {
    return `
        <div data-panel="users">
            <section class="section-heading">
                <h2>User Accounts</h2>
                <span class="section-rule"></span>
            </section>
            <section class="trends-section">
                ${card({
                    title: 'Directory',
                    subtitle: `${ACTIVE_USERS.length} of ${USERS.length} accounts active`,
                    actions: `${iconButton('download', 'Export directory')}`,
                    body: table({
                        columns: [
                            {
                                key: 'name',
                                label: 'User',
                                render: (u) => `
                                    <span class="font-semibold">${esc(u.name)}</span>
                                    <div class="text-xs text-secondary">${esc(u.email)}</div>`
                            },
                            { key: 'role', label: 'Role', render: (u) => badge(u.role, 'purple') },
                            { key: 'district', label: 'District', render: (u) => esc(u.district) },
                            { key: 'status', label: 'Status', render: (u) => statusDot(u.status) },
                            {
                                key: 'lastLogin',
                                label: 'Last login',
                                render: (u) => `<span class="font-mono text-xs">${esc(u.lastLogin)}</span>`
                            }
                        ],
                        rows: USERS,
                        empty: 'No user accounts provisioned'
                    })
                })}
            </section>
        </div>`;
}

/* ------------------------------------------------------------ Roles panel */

function roleCard(role) {
    return card({
        title: role.name,
        subtitle: `${num(role.users)} users · ${role.permissions.length} permissions`,
        bodyClass: 'flex-col',
        body: `
            ${statRow('Assigned users', `<span class="font-semibold">${esc(num(role.users))}</span>`)}
            <div class="chart-caption mt-3">Permissions</div>
            <div class="badge-group mt-2">
                ${role.permissions.map((p) => badge(p, 'blue')).join('')}
            </div>`
    });
}

function rolesPanel() {
    return `
        <div data-panel="roles" hidden>
            <section class="section-heading">
                <h2>Roles &amp; Permissions</h2>
                <span class="section-rule"></span>
            </section>
            <section class="operational-section">
                ${ROLES.map(roleCard).join('')}
            </section>
        </div>`;
}

/* ------------------------------------------------------- Thresholds panel */

function thresholdsPanel() {
    return `
        <div data-panel="thresholds" hidden>
            <section class="section-heading">
                <h2>Alert Thresholds</h2>
                <span class="section-rule"></span>
            </section>
            <section class="hero-section">
                ${card({
                    title: 'Trigger Values',
                    subtitle: 'What the detection layer treats as actionable',
                    actions: `${button('Save changes', { icon: 'save', variant: 'primary' })}`,
                    body: `
                        ${table({
                            columns: [
                                {
                                    key: 'name',
                                    label: 'Threshold',
                                    render: (t) => `
                                        <span class="font-semibold">${esc(t.name)}</span>
                                        <div class="text-xs text-secondary">${esc(t.id)}</div>`
                                },
                                {
                                    key: 'value',
                                    label: 'Value',
                                    align: 'right',
                                    render: (t) => `<span class="font-mono font-semibold">${esc(t.value)}</span>`
                                },
                                { key: 'unit', label: 'Unit', render: (t) => `<span class="text-secondary">${esc(t.unit)}</span>` },
                                {
                                    key: 'scope',
                                    label: 'Scope',
                                    render: (t) => badge(t.scope, t.scope === 'Statewide' ? 'teal' : 'orange')
                                }
                            ],
                            rows: THRESHOLDS,
                            empty: 'No thresholds configured'
                        })}
                        <div class="chart-caption mt-3">
                            Threshold edits are simulated in this build — nothing is written back to the detection layer.
                        </div>`
                })}
                <div class="hero-right-panel">
                    ${card({
                        title: 'Scope Split',
                        subtitle: 'Statewide vs per-district',
                        body: `<div id="admin-scope-chart"></div>`
                    })}
                    ${card({
                        title: 'Escalation Context',
                        subtitle: 'Values other views depend on',
                        bodyClass: 'flex-col',
                        body: THRESHOLDS.map((t) =>
                            statRow(t.name, `<span class="font-mono font-semibold">${esc(t.value)}</span> <span class="text-secondary">${esc(t.unit)}</span>`)
                        ).join('')
                    })}
                </div>
            </section>
        </div>`;
}

/* ----------------------------------------------------- Integrations panel */

function integrationRow(item) {
    const tone = statusToneOf(item.status);
    return `
        <div class="infra-item">
            <div class="infra-left">
                <div class="kpi-icon-wrapper bg-${esc(tone)}"><i data-lucide="${esc(item.icon)}"></i></div>
                <div class="infra-details">
                    <span class="infra-title">${esc(item.name)}</span>
                    <span class="infra-sub">${esc(item.id)} · last sync ${esc(item.lastSync)}</span>
                </div>
            </div>
            ${statusPill({ value: item.status === 'connected' ? 'Connected' : 'Degraded', tone })}
        </div>`;
}

function integrationsPanel() {
    return `
        <div data-panel="integrations" hidden>
            <section class="section-heading">
                <h2>External Integrations</h2>
                <span class="section-rule"></span>
            </section>
            <section class="resource-section">
                ${card({
                    title: 'Connected Systems',
                    subtitle: `${CONNECTED.length} of ${INTEGRATIONS.length} healthy`,
                    body: `<div class="infra-list">${INTEGRATIONS.map(integrationRow).join('')}</div>`
                })}
                ${card({
                    title: 'Sync Status',
                    subtitle: 'Freshness of the last successful pull',
                    body: table({
                        columns: [
                            { key: 'name', label: 'Integration', render: (i) => `<span class="font-semibold">${esc(i.name)}</span>` },
                            { key: 'status', label: 'Status', render: (i) => statusDot(i.status) },
                            { key: 'lastSync', label: 'Last sync', align: 'right', render: (i) => esc(i.lastSync) }
                        ],
                        rows: INTEGRATIONS,
                        empty: 'No integrations registered'
                    })
                })}
            </section>
        </div>`;
}

/* ------------------------------------------------------------ Audit panel */

function auditPanel() {
    return `
        <div data-panel="audit" hidden>
            <section class="section-heading">
                <h2>Audit Log</h2>
                <span class="section-rule"></span>
            </section>
            <section class="trends-section">
                ${card({
                    title: 'Recent Administrative Activity',
                    subtitle: `${AUDIT_LOG.length} most recent entries`,
                    actions: `${iconButton('download', 'Export log')}`,
                    body: table({
                        columns: [
                            { key: 'id', label: 'Entry', render: (a) => `<span class="font-mono text-xs">${esc(a.id)}</span>` },
                            { key: 'at', label: 'Timestamp', render: (a) => `<span class="font-mono text-xs">${esc(a.at)}</span>` },
                            { key: 'user', label: 'User', render: (a) => `<span class="font-semibold">${esc(a.user)}</span>` },
                            { key: 'action', label: 'Action', render: (a) => esc(a.action) },
                            { key: 'target', label: 'Target', render: (a) => badge(a.target, 'gray') },
                            { key: 'ip', label: 'Source IP', align: 'right', render: (a) => `<span class="font-mono text-xs">${esc(a.ip)}</span>` }
                        ],
                        rows: AUDIT_LOG,
                        empty: 'No administrative activity recorded'
                    })
                })}
            </section>
        </div>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'Administration',
    subtitle: 'Users, roles, thresholds, and integrations',

    render() {
        return `
            ${commandBar()}
            ${heroKpis()}
            ${usersPanel()}
            ${rolesPanel()}
            ${thresholdsPanel()}
            ${integrationsPanel()}
            ${auditPanel()}`;
    },

    mount(root) {
        const scopes = [...new Set(THRESHOLDS.map((t) => t.scope))];
        mkChart('#admin-scope-chart', donutOptions({
            series: scopes.map((s) => THRESHOLDS.filter((t) => t.scope === s).length),
            labels: scopes,
            colors: SERIES_COLORS,
            height: 220,
            totalLabel: 'Thresholds'
        }));

        const panels = Array.from(root.querySelectorAll('[data-panel]'));
        root.querySelectorAll('#admin-tabs .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                panels.forEach((p) => {
                    p.hidden = p.dataset.panel !== btn.dataset.value;
                });
                // Charts inside a panel that was hidden at mount measure a
                // zero-width container, so nudge them once it becomes visible.
                window.dispatchEvent(new Event('resize'));
            });
        });

        const refreshBtn = root.querySelector('[aria-label="Refresh"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('refreshing');
                setTimeout(refresh, 400);
            });
        }

        // Working exports (the rest of the admin actions are read-only here).
        root.querySelector('[aria-label="Export directory"]')?.addEventListener('click', () =>
            downloadCsv(USERS, ['id', 'name', 'email', 'role', 'district', 'status', 'lastLogin'], 'user-directory.csv')
        );
        root.querySelector('[aria-label="Export log"]')?.addEventListener('click', () =>
            downloadCsv(AUDIT_LOG, ['id', 'at', 'user', 'action', 'target', 'ip'], 'audit-log.csv')
        );
    }
};
