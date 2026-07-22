/**
 * Authentication gate.
 *
 * The app is a persistent-shell SPA (see index.html + router.js), so login is
 * NOT a hash route — it is a full-screen gate that sits in front of the shell
 * and only lets the bootstrap run once a session exists.
 *
 * This is a mock/demo platform with no backend, so credentials are validated
 * against DEMO_USERS below and the session lives in localStorage. Swapping in a
 * real backend means replacing authenticate()/DEMO_USERS with a fetch call and
 * keeping the same setSession()/getSession()/clearSession() contract.
 */

import { findByCredentials } from './data/users.js';

const SESSION_KEY = 'ag-session';

/* ------------------------------------------------------------- Session API */

/* Reads both stores: a "remember me" session lives in localStorage (persists
   across tabs/restarts); a plain one lives in sessionStorage (this tab only). */
export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function isAuthenticated() {
    return getSession() !== null;
}

function setSession(user, remember) {
    const store = remember ? localStorage : sessionStorage;
    // Clear the other store so "remember me" toggles behave predictably.
    (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
    store.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
}

function authenticate(identifier, password) {
    const user = findByCredentials(identifier, password);
    if (!user) return null;
    return { ...user, loginAt: new Date().toISOString() };
}

/* ---------------------------------------------- Reflect user in the shell */

/** Push the signed-in identity into the header user-profile chip. */
export function applyUserToShell(user) {
    if (!user) return;
    const initial = (user.name || 'U').trim().charAt(0).toUpperCase();
    const set = (sel, text) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = text;
    };
    set('#user-btn .avatar', initial);
    set('#user-btn .user-name', user.name);
    set('#user-btn .user-role', user.role);
}

/* ---------------------------------------------------------- Login screen */

/**
 * Render the full-screen login gate into #auth-root and resolve `onSuccess`
 * with the authenticated user once credentials check out.
 */
export function renderLoginScreen(onSuccess) {
    const root = document.getElementById('auth-root');
    if (!root) return;

    root.innerHTML = `
        <div class="login-screen">
          <div class="login-shell">
            <!-- Brand: full-bleed ThunderShield hero artwork -->
            <aside class="login-brand" role="img"
                   aria-label="ThunderShield for Jharkhand — AI-Powered Thunderstorm Command & Control"></aside>

            <!-- Form panel -->
            <main class="login-form-panel">
                <div class="form-topbar">
                    <button type="button" class="lang-select" id="login-lang">
                        <i data-lucide="globe"></i> English <i data-lucide="chevron-down"></i>
                    </button>
                    <button class="login-theme-toggle" id="login-theme-toggle" type="button"
                            aria-label="Toggle theme"><i data-lucide="moon"></i></button>
                </div>

                <form class="login-card" id="login-form" novalidate>
                    <div class="login-card-head">
                        <h2>Welcome back</h2>
                        <p>Sign in to your ThunderShield operations console.</p>
                    </div>

                    <div class="login-error" id="login-error" hidden>
                        <span class="login-error-ico"></span>
                        <span id="login-error-text"></span>
                    </div>

                    <label class="login-field">
                        <span class="login-field-label">Username</span>
                        <span class="login-input-wrap">
                            <i data-lucide="user"></i>
                            <input type="text" id="login-username" autocomplete="username"
                                   placeholder="Enter your username" required autofocus>
                        </span>
                    </label>

                    <label class="login-field">
                        <span class="login-field-label">Password</span>
                        <span class="login-input-wrap">
                            <i data-lucide="lock"></i>
                            <input type="password" id="login-password" autocomplete="current-password"
                                   placeholder="Enter your password" required>
                            <button type="button" class="login-eye" id="login-eye"
                                    aria-label="Show password"><i data-lucide="eye"></i></button>
                        </span>
                    </label>

                    <div class="login-row">
                        <label class="login-check">
                            <input type="checkbox" id="login-remember" checked>
                            <span>Keep me signed in</span>
                        </label>
                        <a href="#" class="login-forgot" id="login-forgot">Forgot password?</a>
                    </div>

                    <button type="submit" class="login-submit" id="login-submit">
                        <span class="login-submit-label">Sign in</span>
                        <i data-lucide="arrow-right"></i>
                    </button>

                    <p class="login-foot">Authorised personnel only · All activity is monitored and logged.</p>
                    <div class="login-demo">Demo — username <code>admin</code> · password <code>thunder123</code></div>
                </form>
            </main>
          </div>
        </div>`;

    if (window.lucide) window.lucide.createIcons();

    /* --- theme toggle (login has no shell, so it manages theme itself) --- */
    const themeBtn = document.getElementById('login-theme-toggle');
    themeBtn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('ag-theme', next);
        syncThemeIcon(themeBtn);
    });
    syncThemeIcon(themeBtn);

    /* --- password visibility --- */
    const pw = document.getElementById('login-password');
    const eye = document.getElementById('login-eye');
    eye.addEventListener('click', () => {
        const show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        setIcon(eye, show ? 'eye-off' : 'eye');
        eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    document.getElementById('login-forgot').addEventListener('click', (e) => {
        e.preventDefault();
        showMessage('Contact your State EOC administrator to reset access.', 'info');
    });

    /* --- submit --- */
    const form = document.getElementById('login-form');
    const submit = document.getElementById('login-submit');
    const errorBox = document.getElementById('login-error');
    const errorIco = errorBox.querySelector('.login-error-ico');

    // One banner does double duty: red for errors, blue for informational notes.
    function showMessage(msg, tone = 'error') {
        errorBox.classList.toggle('info', tone === 'info');
        document.getElementById('login-error-text').textContent = msg;
        setIcon(errorIco, tone === 'info' ? 'info' : 'alert-circle');
        errorBox.hidden = false;
    }
    function showError(msg) { showMessage(msg, 'error'); }
    function clearError() { errorBox.hidden = true; }

    form.addEventListener('input', clearError);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = pw.value;
        const remember = document.getElementById('login-remember').checked;

        if (!username.trim() || !password) {
            showError('Enter both username and password.');
            return;
        }

        // Simulate a brief auth round-trip for realism.
        submit.disabled = true;
        submit.classList.add('is-loading');
        submit.querySelector('.login-submit-label').textContent = 'Signing in…';

        setTimeout(() => {
            const user = authenticate(username, password);
            if (!user) {
                submit.disabled = false;
                submit.classList.remove('is-loading');
                submit.querySelector('.login-submit-label').textContent = 'Sign in';
                showError('Invalid username or password.');
                pw.value = '';
                pw.focus();
                return;
            }
            setSession(user, remember);
            root.classList.add('auth-leaving');
            setTimeout(() => {
                root.innerHTML = '';
                root.hidden = true;
                onSuccess(user);
            }, 240);
        }, 550);
    });
}

function syncThemeIcon(btn) {
    const isDark = document.documentElement.dataset.theme === 'dark';
    setIcon(btn, isDark ? 'sun' : 'moon');
}

/* Replace an element's lucide icon cleanly. lucide.createIcons() swaps the
   <i data-lucide> placeholder for an <svg>, so removing only <i> on a repeat
   toggle leaves the old <svg> behind and the icon doubles up. Clear both. */
function setIcon(el, name) {
    el.querySelector('i, svg')?.remove();
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    el.appendChild(i);
    if (window.lucide) window.lucide.createIcons();
}
