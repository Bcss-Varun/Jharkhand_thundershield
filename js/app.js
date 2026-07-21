/**
 * Bootstrap: wires the persistent shell (clock, notifications, user menu,
 * theme, mobile sidebar, ticker) and registers every route.
 *
 * The shell renders once. Only #view is replaced on navigation.
 */

import { register, start, refresh } from './router.js';
import {
    ADVISORY_TEXT, DATA_SOURCES, NOTIFICATIONS,
    SENSOR_HEALTH, WEATHER_NOW, sensorCounts, alertCounts
} from './data/mock.js';
import { esc, severityTone, num } from './components.js';

import dashboard from './views/dashboard.js';
import riskMap from './views/risk-map.js';
import lightning from './views/lightning.js';
import weather from './views/weather.js';
import aiRisk from './views/ai-risk.js';
import sensorNetwork from './views/sensor-network.js';
import incidents from './views/incidents.js';
import alertsAutomation from './views/alerts-automation.js';
import analytics from './views/analytics.js';
import reports from './views/reports.js';
import admin from './views/admin.js';

/* ------------------------------------------------------------------ Clock */

function startClock() {
    const dateEl = document.getElementById('current-date');
    const timeEl = document.getElementById('current-time');
    const updatedEl = document.getElementById('sidebar-updated-time');
    const tick = () => {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
        timeEl.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
        // Was a static string before — keep the sidebar "Last Updated" live.
        if (updatedEl) updatedEl.textContent = now.toLocaleTimeString('en-IN', { hour12: true });
    };
    tick();
    setInterval(tick, 1000);
}

/* ------------------------------------------------------- System metrics */

/** Populate the shell's status figures from the data (was hardcoded). */
function fillSystemMetrics() {
    const sensors = sensorCounts();
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    set('sys-uptime', `${SENSOR_HEALTH.uptime}%`);
    set('sys-sensors', `${num(sensors.online)} / ${num(sensors.total)}`);
    set('sys-latency', `${SENSOR_HEALTH.latencyMs} ms`);
    set('header-weather-text', `${WEATHER_NOW.temperature}°C ${WEATHER_NOW.location}`);

    const badge = document.getElementById('nav-alert-badge');
    if (badge) {
        const active = alertCounts().active;
        badge.textContent = String(active);
        badge.hidden = active === 0;
    }
}

/* ---------------------------------------------------------------- Ticker */

function fillTicker() {
    document.getElementById('ticker-content').textContent = ADVISORY_TEXT;
    document.getElementById('ticker-sources').textContent = `Data Sources: ${DATA_SOURCES}`;
}

/* --------------------------------------------------- Popovers (header UI) */

/** Close every open popover except `keep`. */
function closePopovers(keep) {
    document.querySelectorAll('.popover').forEach((p) => {
        if (p !== keep) {
            p.hidden = true;
            const host = p.closest('.popover-host');
            const trigger = host && host.querySelector('[aria-expanded]');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
    });
}

function bindPopover(triggerId, popoverId) {
    const trigger = document.getElementById(triggerId);
    const popover = document.getElementById(popoverId);
    if (!trigger || !popover) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = popover.hidden;
        closePopovers(willOpen ? popover : null);
        popover.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
    });
    popover.addEventListener('click', (e) => e.stopPropagation());
}

function renderNotifications() {
    const list = document.getElementById('notification-list');
    const count = document.getElementById('notification-count');
    const unread = NOTIFICATIONS.filter((n) => !n.read);

    count.textContent = String(unread.length);
    count.hidden = unread.length === 0;

    list.innerHTML = NOTIFICATIONS.length
        ? NOTIFICATIONS.map(
              (n) => `
            <div class="notification-item ${n.read ? '' : 'unread'}">
                <span class="notification-dot bg-${esc(severityTone(n.severity))}"></span>
                <div class="notification-text">
                    <div class="notification-title">${esc(n.title)}</div>
                    <div class="notification-desc">${esc(n.desc)}</div>
                    <div class="notification-time">${esc(n.time)}</div>
                </div>
            </div>`
          ).join('')
        : '<div class="popover-empty">No notifications</div>';

    if (window.lucide) window.lucide.createIcons();
}

function bindNotifications() {
    bindPopover('notification-btn', 'notification-popover');
    renderNotifications();
    document.getElementById('mark-all-read').addEventListener('click', () => {
        NOTIFICATIONS.forEach((n) => {
            n.read = true;
        });
        renderNotifications();
    });
}

/* ------------------------------------------------------------------ Theme */

function bindTheme() {
    const stored = localStorage.getItem('ag-theme');
    const initial = stored || 'light';
    applyTheme(initial);

    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('ag-theme', next);
        // Charts bake in their colours at build time; re-render to recolour.
        refresh();
    });
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        const isDark = theme === 'dark';
        btn.querySelector('span').textContent = isDark ? 'Light mode' : 'Dark mode';
        
        const icon = btn.querySelector('i') || btn.querySelector('svg');
        if (icon) {
            const newI = document.createElement('i');
            newI.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            icon.parentNode.replaceChild(newI, icon);
        }
        if (window.lucide) window.lucide.createIcons();
    }
}

/* --------------------------------------------------------- Mobile sidebar */

function bindSidebar() {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    const open = () => {
        sidebar.classList.add('open');
        scrim.classList.add('visible');
    };
    const close = () => {
        sidebar.classList.remove('open');
        scrim.classList.remove('visible');
    };

    document.getElementById('menu-toggle').addEventListener('click', open);
    document.getElementById('sidebar-close').addEventListener('click', close);
    scrim.addEventListener('click', close);
    // Navigating on mobile should dismiss the drawer.
    sidebar.querySelectorAll('.sidebar-nav a').forEach((a) => a.addEventListener('click', close));
}

/* ----------------------------------------------------------------- Search */

function bindSearch() {
    const input = document.getElementById('global-search');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            window.location.hash = `#/analytics?q=${encodeURIComponent(input.value.trim())}`;
        }
        if (e.key === 'Escape') input.blur();
    });
    // "/" focuses search, the way most ops consoles behave.
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
            e.preventDefault();
            input.focus();
        }
    });
}

/* ------------------------------------------------------------------ Routes */

function registerRoutes() {
    register('dashboard', dashboard);
    register('risk-map', riskMap);
    register('lightning', lightning);
    register('weather', weather);
    register('ai-risk', aiRisk);
    register('sensor-network', sensorNetwork);
    register('incidents', incidents);
    register('alerts', alertsAutomation);
    register('analytics', analytics);
    register('reports', reports);
    register('admin', admin);
}

/* -------------------------------------------------------------------- Init */

// Immediate bootstrap execution since ES modules load deferred by default.
lucide.createIcons();
startClock();
fillTicker();
fillSystemMetrics();
bindNotifications();
bindPopover('user-btn', 'user-popover');
bindTheme();
bindSidebar();
bindSearch();
document.addEventListener('click', () => closePopovers(null));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopovers(null);
});

registerRoutes();
start();

