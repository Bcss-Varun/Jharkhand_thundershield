/**
 * Role-based access control — the live user directory + role model.
 *
 * This is the single source of truth for BOTH the login gate (js/auth.js) and
 * the Access Management screen (Administration → Access Management). It is a
 * mock/demo store: accounts live in localStorage under `ag-users`, seeded on
 * first run. Swapping in a real backend means replacing the CRUD functions
 * below with API calls and dropping the plaintext password field.
 *
 * A role maps to a set of accessible modules (sidebar routes). After login the
 * shell hides modules the role can't reach and the router blocks direct links
 * to them — so role-based access is demonstrably enforced, not cosmetic.
 */

const USERS_KEY = 'ag-users';

/* Every routable module, in sidebar order. `label` is used when a role's
   access is listed as badges on the Roles screen. */
export const MODULES = [
    { key: 'dashboard',      label: 'Dashboard' },
    { key: 'lightning',      label: 'Lightning' },
    { key: 'weather',        label: 'Weather' },
    { key: 'risk-map',       label: 'Risk Map' },
    { key: 'sensor-network', label: 'Sensor Network' },
    { key: 'ai-risk',        label: 'AI Risk & Forecast' },
    { key: 'analytics',      label: 'Analytics' },
    { key: 'incidents',      label: 'Incidents' },
    { key: 'alerts',         label: 'Alerts & Automation' },
    { key: 'reports',        label: 'Reports' },
    { key: 'admin',          label: 'Administration' }
];

const ALL_ROUTES = MODULES.map((m) => m.key);

/* Role definitions. `routes: 'all'` is a shorthand for every module. Order is
   most-privileged first — it drives the Roles screen and the role dropdown. */
export const ROLE_ACCESS = {
    'Super Admin': {
        tone: 'purple',
        canManageUsers: true,
        description: 'Full platform control, including user & role administration.',
        routes: 'all'
    },
    'State Coordinator': {
        tone: 'blue',
        canManageUsers: false,
        description: 'Full operational access across all districts; no system administration.',
        routes: ['dashboard', 'lightning', 'weather', 'risk-map', 'sensor-network', 'ai-risk', 'analytics', 'incidents', 'alerts', 'reports']
    },
    'District Officer': {
        tone: 'teal',
        canManageUsers: false,
        description: 'Monitoring, intelligence and response for the assigned district.',
        routes: ['dashboard', 'lightning', 'weather', 'risk-map', 'sensor-network', 'ai-risk', 'analytics', 'incidents', 'alerts']
    },
    'Field Responder': {
        tone: 'orange',
        canManageUsers: false,
        description: 'Front-line response only — dashboard, incidents and alerts.',
        routes: ['dashboard', 'incidents', 'alerts']
    }
};

export function roleNames() {
    return Object.keys(ROLE_ACCESS);
}

/** Resolve a role to its allowed route keys. Unknown role → all (fail-open,
    so a stale session can never lock a demo user out). */
export function allowedRoutesFor(role) {
    const def = ROLE_ACCESS[role];
    if (!def) return ALL_ROUTES.slice();
    return def.routes === 'all' ? ALL_ROUTES.slice() : def.routes.slice();
}

export function canAccessRoute(role, routeKey) {
    return allowedRoutesFor(role).includes(routeKey);
}

export function canManageUsers(role) {
    return !!(ROLE_ACCESS[role] && ROLE_ACCESS[role].canManageUsers);
}

/** Full role objects (name + resolved access) for the Roles screen. */
export function roleList() {
    const users = listUsers();
    return roleNames().map((name) => ({
        name,
        ...ROLE_ACCESS[name],
        routes: allowedRoutesFor(name),
        userCount: users.filter((u) => u.role === name).length
    }));
}

/* --------------------------------------------------------------- Seed data */

const SEED_USERS = [
    { id: 'U-001', name: 'S. Verma',  email: 'admin@jharkhand.gov.in',       role: 'Super Admin',       password: 'thunder123', createdAt: '2026-06-01' },
    { id: 'U-002', name: 'A. Kumar',  email: 'coordinator@jharkhand.gov.in', role: 'State Coordinator', password: 'thunder123', createdAt: '2026-06-04' },
    { id: 'U-003', name: 'S. Mahato', email: 'ranchi@jharkhand.gov.in',      role: 'District Officer',  password: 'thunder123', createdAt: '2026-06-09' },
    { id: 'U-004', name: 'R. Oraon',  email: 'responder@jharkhand.gov.in',   role: 'Field Responder',   password: 'thunder123', createdAt: '2026-06-12' }
];

/* ------------------------------------------------------------- Store (CRUD) */

function read() {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* fall through to seed */ }
    localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS.slice();
}

function write(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** All accounts, newest last. Passwords are stripped for display use. */
export function listUsers() {
    return read().map(({ password: _pw, ...safe }) => safe);
}

function nextId(users) {
    const max = users.reduce((m, u) => {
        const n = parseInt(String(u.id).replace(/\D/g, ''), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return `U-${String(max + 1).padStart(3, '0')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create an account. Returns { ok, error?, user? }.
 * Validates required fields, email shape, password length and email uniqueness.
 */
export function createUser({ name, email, password, role }) {
    name = (name || '').trim();
    email = (email || '').trim();
    password = password || '';
    role = role || '';

    if (!name) return { ok: false, error: 'Enter the full name.' };
    if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    if (!ROLE_ACCESS[role]) return { ok: false, error: 'Select a role.' };

    const users = read();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return { ok: false, error: 'An account with that email already exists.' };
    }

    const user = {
        id: nextId(users),
        name,
        email,
        role,
        password,
        createdAt: new Date().toISOString().slice(0, 10)
    };
    users.push(user);
    write(users);
    const { password: _pw, ...safe } = user;
    return { ok: true, user: safe };
}

/**
 * Delete an account by id. Returns { ok, error? }.
 * Guards: can't delete the currently signed-in account, and can't remove the
 * last remaining Super Admin (which would lock everyone out of administration).
 */
export function deleteUser(id, currentEmail) {
    const users = read();
    const target = users.find((u) => u.id === id);
    if (!target) return { ok: false, error: 'Account not found.' };
    if (currentEmail && target.email.toLowerCase() === currentEmail.toLowerCase()) {
        return { ok: false, error: 'You cannot delete your own account.' };
    }
    if (target.role === 'Super Admin' && users.filter((u) => u.role === 'Super Admin').length <= 1) {
        return { ok: false, error: 'At least one Super Admin must remain.' };
    }
    write(users.filter((u) => u.id !== id));
    return { ok: true };
}

/** Validate a login. `identifier` matches the full email or its local part
    (so 'admin' works for 'admin@jharkhand.gov.in'). Returns a safe user or null. */
export function findByCredentials(identifier, password) {
    const id = String(identifier || '').trim().toLowerCase();
    const match = read().find((u) => {
        const email = u.email.toLowerCase();
        return (email === id || email.split('@')[0] === id) && u.password === password;
    });
    if (!match) return null;
    const { password: _pw, ...safe } = match;
    return safe;
}
