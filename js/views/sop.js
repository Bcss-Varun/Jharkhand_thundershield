/**
 * SOP Automation.
 *
 * Hierarchy, top to bottom:
 *   1. Command bar   — scope filters for the rule grid
 *   2. KPIs          — armed rules, logged executions, success rate, lifetime fires
 *   3. Rule grid     — one card per rule, read as trigger → conditions → actions
 *   4. Escalation    — the level 1-4 ownership matrix
 *   5. Execution log — what actually fired, with outcome and duration
 *
 * Rules are cards rather than table rows because a rule is a *flow*: the value
 * is in reading the trigger and its consequences together, which a row of
 * truncated cells destroys.
 */

import {
    card, kpi, statRow, badge, statusDot, table, toolbar, segmented, select,
    iconButton, button, num, pct, esc, downloadCsv
} from '../components.js';
import { SOP_RULES, ESCALATION_MATRIX, SOP_EXECUTIONS } from '../data/mock.js';

const enabledCount = SOP_RULES.filter((r) => r.enabled).length;
const totalFires = SOP_RULES.reduce((sum, r) => sum + r.fireCount, 0);
const successRuns = SOP_EXECUTIONS.filter((e) => e.outcome === 'success').length;

/** Escalation level drives colour everywhere on this page, so it lives once. */
const LEVEL_TONE = { 1: 'blue', 2: 'yellow', 3: 'orange', 4: 'red' };

function levelTone(level) {
    return LEVEL_TONE[level] || 'gray';
}

function levelName(level) {
    const row = ESCALATION_MATRIX.find((m) => m.level === level);
    return row ? row.name : `Level ${level}`;
}

/** Sub-second runs read better as ms; anything longer as seconds. */
function duration(ms) {
    return ms < 1000 ? `${num(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/* ----------------------------------------------------------- Command bar */

function commandBar() {
    return toolbar({
        left: `
            ${segmented('sop-state', [
                { value: 'all', label: 'All' },
                { value: 'enabled', label: 'Armed' },
                { value: 'disabled', label: 'Paused' }
            ], 'all')}
            ${select('sop-level', [
                { value: 'all', label: 'All escalation levels' },
                ...ESCALATION_MATRIX.map((m) => ({ value: String(m.level), label: `L${m.level} — ${m.name}` }))
            ])}
        `,
        right: `
            <span class="live-chip"><span class="live-dot"></span> Engine running</span>
            ${iconButton('download', 'Export rule set')}
        `
    });
}

/* ------------------------------------------------------------------ KPIs */

function kpis() {
    return `
        <section class="kpi-section">
            ${kpi({
                title: 'Armed Rules',
                value: `${enabledCount} / ${SOP_RULES.length}`,
                icon: 'shield-check',
                tone: 'green',
                delta: { value: `${SOP_RULES.length - enabledCount} paused`, direction: 'flat', sentiment: 'neutral' },
                context: 'Auto-execute on trigger'
            })}
            ${kpi({
                title: 'Executions Logged',
                value: SOP_EXECUTIONS.length,
                icon: 'zap',
                tone: 'blue',
                delta: { value: 'Last 12 runs', direction: 'flat', sentiment: 'neutral' },
                context: 'Across all rules'
            })}
            ${kpi({
                title: 'Execution Success Rate',
                value: pct((successRuns / SOP_EXECUTIONS.length) * 100),
                icon: 'check-circle-2',
                tone: 'teal',
                delta: {
                    value: `${SOP_EXECUTIONS.length - successRuns} partial`,
                    direction: 'flat',
                    sentiment: successRuns === SOP_EXECUTIONS.length ? 'good' : 'bad'
                },
                context: 'Fully completed action sets'
            })}
            ${kpi({
                title: 'Lifetime Fires',
                value: num(totalFires),
                icon: 'history',
                tone: 'purple',
                delta: { value: 'Since commissioning', direction: 'flat', sentiment: 'neutral' },
                context: 'All rules combined'
            })}
        </section>`;
}

/* ------------------------------------------------------------- Rule grid */

function flowStep(label, icon, items) {
    return `
        <div class="sop-flow-step">
            <span class="sop-flow-label"><i data-lucide="${esc(icon)}"></i> ${esc(label)}</span>
            <ul class="sop-flow-list">
                ${items.map((t) => `<li>${esc(t)}</li>`).join('')}
            </ul>
        </div>`;
}

function ruleCard(rule) {
    return card({
        title: rule.name,
        subtitle: `${rule.id} · L${rule.level} ${levelName(rule.level)}`,
        className: `sop-rule-card ${rule.enabled ? '' : 'is-disabled'}`,
        actions: `
            ${badge(`L${rule.level}`, levelTone(rule.level))}
            ${button(rule.enabled ? 'Armed' : 'Paused', {
                icon: rule.enabled ? 'toggle-right' : 'toggle-left',
                variant: rule.enabled ? 'primary' : 'default',
                attrs: `data-sop-toggle="${esc(rule.id)}" aria-pressed="${rule.enabled}"`
            })}
        `,
        body: `
            <div class="sop-flow">
                ${flowStep('When', 'radio', [rule.trigger])}
                <span class="sop-flow-arrow"><i data-lucide="chevron-down"></i></span>
                ${flowStep('And', 'filter', rule.conditions)}
                <span class="sop-flow-arrow"><i data-lucide="chevron-down"></i></span>
                ${flowStep('Then', 'send', rule.actions)}
            </div>
            ${statRow('Last fired', esc(rule.lastFired))}
            ${statRow('Times fired', num(rule.fireCount), { bold: true })}`
    });
}

function ruleSection() {
    return `
        <section class="section-heading">
            <h2>Automation Rules</h2>
            <span class="section-rule"></span>
        </section>
        <section class="operational-section" id="sop-rule-grid">
            ${SOP_RULES.map(ruleCard).join('')}
        </section>`;
}

/* ------------------------------------------------------ Escalation + log */

function escalationCard() {
    return card({
        title: 'Escalation Matrix',
        subtitle: 'Who owns the response at each level',
        body: table({
            columns: [
                { key: 'level', label: 'Level', render: (r) => badge(`L${r.level}`, levelTone(r.level)) },
                { key: 'name', label: 'Tier' },
                { key: 'owner', label: 'Accountable owner' },
                { key: 'notify', label: 'Notifies' },
                {
                    key: 'timeoutMins',
                    label: 'Ack timeout',
                    align: 'right',
                    // Tinted by level, not by size — a 2-minute timeout is the
                    // severe end of the scale, not the reassuring end.
                    render: (r) => `<span class="font-semibold text-${esc(levelTone(r.level))}">${esc(r.timeoutMins)} min</span>`
                }
            ],
            rows: ESCALATION_MATRIX
        })
    });
}

function executionCard() {
    return card({
        title: 'Execution Log',
        subtitle: `${SOP_EXECUTIONS.length} most recent automated runs`,
        actions: `<a class="link-btn" href="#/reports">Full audit</a>`,
        body: table({
            columns: [
                { key: 'id', label: 'Run', render: (r) => `<span class="font-mono">${esc(r.id)}</span>` },
                { key: 'at', label: 'Fired at' },
                { key: 'ruleName', label: 'Rule' },
                { key: 'districtName', label: 'District' },
                { key: 'actionsRun', label: 'Actions', align: 'right' },
                { key: 'durationMs', label: 'Duration', align: 'right', render: (r) => esc(duration(r.durationMs)) },
                { key: 'outcome', label: 'Outcome', render: (r) => statusDot(r.outcome) }
            ],
            rows: SOP_EXECUTIONS,
            empty: 'No SOP executions recorded'
        })
    });
}

function logSection() {
    return `
        <section class="section-heading">
            <h2>Escalation & History</h2>
            <span class="section-rule"></span>
        </section>
        <section class="resource-section">
            ${escalationCard()}
        </section>
        <section class="trends-section">
            ${executionCard()}
        </section>`;
}

/* ------------------------------------------------------------------ View */

export default {
    title: 'SOP Automation',
    subtitle: 'Trigger rules, escalation matrix, execution history',

    render() {
        return `
            ${commandBar()}
            ${kpis()}
            ${ruleSection()}
            ${logSection()}`;
    },

    mount(root) {
        // Toggle state is held here rather than mutating SOP_RULES: the mock
        // module stands in for a server, and a view should not write to it.
        const state = new Map(SOP_RULES.map((r) => [r.id, r.enabled]));
        let stateFilter = 'all';
        let levelFilter = 'all';

        const rules = [...root.querySelectorAll('[data-sop-toggle]')].map((btn) => ({
            id: btn.dataset.sopToggle,
            btn,
            el: btn.closest('.sop-rule-card'),
            level: String(SOP_RULES.find((r) => r.id === btn.dataset.sopToggle).level)
        }));

        function apply() {
            rules.forEach((r) => {
                const on = state.get(r.id);
                const matchesState = stateFilter === 'all' || (stateFilter === 'enabled') === on;
                const matchesLevel = levelFilter === 'all' || levelFilter === r.level;
                r.el.classList.toggle('is-disabled', !on);
                r.el.classList.toggle('is-filtered-out', !(matchesState && matchesLevel));
            });
        }

        rules.forEach((r) => {
            r.btn.addEventListener('click', () => {
                const on = !state.get(r.id);
                state.set(r.id, on);
                r.btn.setAttribute('aria-pressed', String(on));
                r.btn.classList.toggle('btn-primary', on);
                r.btn.classList.toggle('btn-default', !on);
                r.btn.innerHTML = `<i data-lucide="${on ? 'toggle-right' : 'toggle-left'}"></i>${on ? 'Armed' : 'Paused'}`;
                if (window.lucide) window.lucide.createIcons();
                apply();
            });
        });

        root.querySelectorAll('#sop-state .segment').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.segment').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                stateFilter = btn.dataset.value;
                apply();
            });
        });

        const levelSelect = root.querySelector('#sop-level');
        if (levelSelect) {
            levelSelect.addEventListener('change', () => {
                levelFilter = levelSelect.value;
                apply();
            });
        }

        // Export rule set → CSV (array fields joined with '; ' by downloadCsv).
        root.querySelector('[aria-label="Export rule set"]')?.addEventListener('click', () =>
            downloadCsv(
                SOP_RULES,
                ['id', 'name', 'level', 'enabled', 'trigger', 'conditions', 'actions', 'lastFired', 'fireCount'],
                'sop-rule-set.csv'
            )
        );
    }
};
