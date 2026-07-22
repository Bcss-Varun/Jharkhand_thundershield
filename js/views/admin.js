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
import { THRESHOLDS, INTEGRATIONS, AUDIT_LOG } from '../data/mock.js';
import {
    listUsers, createUser, deleteUser, roleList, roleNames,
    allowedRoutesFor, ROLE_ACCESS, MODULES
} from '../data/users.js';
import { getSession } from '../auth.js';

const CONNECTED = INTEGRATIONS.filter((i) => i.status === 'connected');
const DEGRADED = INTEGRATIONS.filter((i) => i.status !== 'connected');

/** Human summary of how many modules a role reaches. */
function accessSummary(role) {
    const n = allowedRoutesFor(role).length;
    return n >= MODULES.length ? 'Full access' : `${n} of ${MODULES.length} modules`;
}

const TABS = [
    { value: 'users', label: 'Access Management' },
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
    const users = listUsers();
    const roles = roleList();
    const admins = users.filter((u) => ROLE_ACCESS[u.role] && ROLE_ACCESS[u.role].canManageUsers).length;
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'User Accounts',
                value: users.length,
                icon: 'users',
                tone: 'blue',
                delta: { value: `${admins} with admin rights`, direction: 'flat', sentiment: 'neutral' },
                context: 'Can sign in to the platform'
            })}
            ${kpi({
                title: 'Roles Defined',
                value: roles.length,
                icon: 'shield-check',
                tone: 'purple',
                delta: { value: `${num(users.length)} seats assigned`, direction: 'flat', sentiment: 'neutral' },
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

/* -------------------------------------------------- Access Management panel */

const initial = (name) => (name || 'U').trim().charAt(0).toUpperCase();

/** The user directory rows. Rebuilt in place after a create/delete. */
function userTable() {
    const me = getSession();
    return table({
        className: 'access-table',
        columns: [
            {
                key: 'name',
                label: 'User',
                render: (u) => `
                    <div class="user-cell">
                        <span class="user-avatar tint-${esc((ROLE_ACCESS[u.role] || {}).tone || 'blue')}">${esc(initial(u.name))}</span>
                        <span>
                            <span class="font-semibold">${esc(u.name)}</span>
                            <span class="text-xs text-secondary block">${esc(u.email)}</span>
                        </span>
                    </div>`
            },
            { key: 'role', label: 'Role', render: (u) => badge(u.role, (ROLE_ACCESS[u.role] || {}).tone || 'blue') },
            { key: 'access', label: 'Access', render: (u) => `<span class="text-secondary">${esc(accessSummary(u.role))}</span>` },
            { key: 'createdAt', label: 'Created', render: (u) => `<span class="font-mono text-xs">${esc(u.createdAt)}</span>` },
            {
                key: 'actions',
                label: '',
                align: 'right',
                render: (u) => {
                    const isSelf = me && me.email && me.email.toLowerCase() === u.email.toLowerCase();
                    return isSelf
                        ? `<span class="badge tint-gray">You</span>`
                        : `<button class="btn-icon danger-icon" data-del-user="${esc(u.id)}"
                                   title="Delete user" aria-label="Delete ${esc(u.name)}"><i data-lucide="trash-2"></i></button>`;
                }
            }
        ],
        rows: listUsers(),
        empty: 'No accounts yet — create one to get started'
    });
}

function createModal() {
    const options = roleNames()
        .map((r) => `<option value="${esc(r)}">${esc(r)}</option>`)
        .join('');
    return `
        <div class="rbac-modal-overlay" id="user-modal" hidden>
            <div class="rbac-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
                <div class="rbac-modal-header">
                    <div class="rbac-modal-title-wrap">
                        <span class="rbac-modal-icon"><i data-lucide="user-plus"></i></span>
                        <h3 id="user-modal-title">Create New User</h3>
                    </div>
                    <button class="rbac-modal-close" id="user-modal-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
                </div>
                <form class="rbac-modal-body" id="user-form" novalidate>
                    <div class="form-error" id="user-form-error" hidden>
                        <i data-lucide="alert-circle"></i><span id="user-form-error-text"></span>
                    </div>
                    <div class="form-group">
                        <label for="uf-name">Full Name</label>
                        <input type="text" id="uf-name" class="form-input" placeholder="e.g. Inspector S. Kumar" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label for="uf-email">Email Address</label>
                        <input type="email" id="uf-email" class="form-input" placeholder="name@jharkhand.gov.in" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label for="uf-pass">Password</label>
                        <input type="password" id="uf-pass" class="form-input" placeholder="At least 6 characters" autocomplete="new-password">
                    </div>
                    <div class="form-group">
                        <label for="uf-role">Role</label>
                        <select id="uf-role" class="form-input form-select">${options}</select>
                        <span class="form-hint" id="uf-role-hint"></span>
                    </div>
                    <div class="rbac-modal-footer">
                        <button type="button" class="btn" id="user-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Create User</button>
                    </div>
                </form>
            </div>
        </div>`;
}

function usersPanel() {
    return `
        <div data-panel="users">
            <section class="section-heading">
                <h2>Access Management</h2>
                <span class="section-rule"></span>
            </section>
            <section class="trends-section">
                ${card({
                    title: 'User Accounts',
                    subtitle: 'Create sign-in profiles and assign each a role. Roles control which modules a user can open.',
                    actions: `${iconButton('download', 'Export directory')}${button('New User', { icon: 'user-plus', variant: 'primary', attrs: 'id="new-user-btn"' })}`,
                    body: `<div id="user-table-wrap">${userTable()}</div>`
                })}
            </section>
            ${createModal()}
        </div>`;
}

/* ------------------------------------------------------------ Roles panel */

function roleCard(role) {
    const moduleBadges = role.routes
        .map((key) => {
            const mod = MODULES.find((m) => m.key === key);
            return mod ? badge(mod.label, role.tone) : '';
        })
        .join('');
    return card({
        title: role.name,
        subtitle: `${num(role.userCount)} user${role.userCount === 1 ? '' : 's'} · ${accessSummary(role.name).toLowerCase()}`,
        bodyClass: 'flex-col',
        body: `
            <p class="text-sm text-secondary">${esc(role.description)}</p>
            ${role.canManageUsers ? `<div class="mt-2">${badge('Can manage users & roles', 'purple')}</div>` : ''}
            <div class="chart-caption mt-3">Module access</div>
            <div class="badge-group mt-2">${moduleBadges}</div>`
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
                ${roleList().map(roleCard).join('')}
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
            downloadCsv(listUsers(), ['id', 'name', 'email', 'role', 'createdAt'], 'user-directory.csv')
        );
        root.querySelector('[aria-label="Export log"]')?.addEventListener('click', () =>
            downloadCsv(AUDIT_LOG, ['id', 'at', 'user', 'action', 'target', 'ip'], 'audit-log.csv')
        );

        bindAccessManagement(root);
    }
};

/* ------------------------------------------------ Access Management wiring */

function bindAccessManagement(root) {
    const modal = root.querySelector('#user-modal');
    if (!modal) return;

    const openModal = () => {
        modal.hidden = false;
        root.querySelector('#uf-name')?.focus();
        updateRoleHint();
    };
    const closeModal = () => {
        modal.hidden = true;
        root.querySelector('#user-form')?.reset();
        hideError();
    };
    const showError = (msg) => {
        const box = root.querySelector('#user-form-error');
        root.querySelector('#user-form-error-text').textContent = msg;
        box.hidden = false;
        if (window.lucide) window.lucide.createIcons();
    };
    const hideError = () => {
        const box = root.querySelector('#user-form-error');
        if (box) box.hidden = true;
    };
    const updateRoleHint = () => {
        const role = root.querySelector('#uf-role')?.value;
        const hint = root.querySelector('#uf-role-hint');
        if (hint && role) hint.textContent = (ROLE_ACCESS[role]?.description || '') + ` (${accessSummary(role).toLowerCase()})`;
    };

    root.querySelector('#new-user-btn')?.addEventListener('click', openModal);
    root.querySelector('#user-modal-close')?.addEventListener('click', closeModal);
    root.querySelector('#user-cancel')?.addEventListener('click', closeModal);
    root.querySelector('#uf-role')?.addEventListener('change', updateRoleHint);
    // Click on the dimmed backdrop (but not the dialog) closes it.
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    root.querySelector('#user-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const result = createUser({
            name: root.querySelector('#uf-name').value,
            email: root.querySelector('#uf-email').value,
            password: root.querySelector('#uf-pass').value,
            role: root.querySelector('#uf-role').value
        });
        if (!result.ok) {
            showError(result.error);
            return;
        }
        // Re-render the whole view so the table, KPIs and roles stay consistent.
        refresh();
    });

    // Delete via event delegation on the panel (survives table re-render).
    const me = getSession();
    root.querySelector('[data-panel="users"]')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del-user]');
        if (!btn) return;
        const id = btn.dataset.delUser;
        const user = listUsers().find((u) => u.id === id);
        if (!user) return;
        if (!window.confirm(`Delete the account for ${user.name} (${user.email})? They will no longer be able to sign in.`)) return;
        const result = deleteUser(id, me && me.email);
        if (!result.ok) {
            window.alert(result.error);
            return;
        }
        refresh();
    });
}
