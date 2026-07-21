/**
 * Hash router.
 *
 * Each view module exports:
 *   title        - string, shown in the header
 *   subtitle     - string, shown under the title
 *   render()     - returns an HTML string
 *   mount(root)  - optional; runs AFTER the HTML is in the DOM. Chart/map
 *                  init belongs here — ApexCharts and Leaflet both measure
 *                  their container, so they must not run against detached HTML.
 *   unmount()    - optional; tear down anything mount() created.
 *
 * Anything registered via `track()` inside mount() is destroyed automatically
 * on navigation, so views rarely need their own unmount().
 */

const routes = new Map();
let current = null;
let disposers = [];

/** Register a view module under a hash path, e.g. 'dashboard'. */
export function register(path, view) {
    routes.set(path, view);
}

/**
 * Register a teardown callback for the active view. Pass an ApexCharts or
 * Leaflet instance and it's destroyed on navigate; pass a function and it's
 * called on navigate.
 */
export function track(resource) {
    if (!resource) return resource;
    if (typeof resource === 'function') {
        disposers.push(resource);
    } else if (typeof resource.destroy === 'function') {
        disposers.push(() => resource.destroy());
    } else if (typeof resource.remove === 'function') {
        // Leaflet map
        disposers.push(() => resource.remove());
    }
    return resource;
}

function runDisposers() {
    disposers.forEach((fn) => {
        try {
            fn();
        } catch (err) {
            console.warn('teardown failed', err);
        }
    });
    disposers = [];
}

function pathFromHash() {
    // The hash may carry a query string — global search navigates to
    // '#/district-analytics?q=ranchi'. Only the part before '?' is the route
    // key; leaving it attached meant every search landed on Not Found.
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim();
    return raw || 'dashboard';
}

/** Query params from the current hash, e.g. '#/x?q=ranchi' -> { q: 'ranchi' }. */
export function queryParams() {
    const [, query = ''] = window.location.hash.split('?');
    return Object.fromEntries(new URLSearchParams(query));
}

function setActiveNav(path) {
    document.querySelectorAll('.sidebar-nav li').forEach((li) => {
        const link = li.querySelector('a');
        const href = link ? link.getAttribute('href') || '' : '';
        li.classList.toggle('active', href === `#/${path}`);
    });
}

function notFound(path) {
    return {
        title: 'Not Found',
        subtitle: 'The requested section does not exist',
        render: () => `
            <div class="empty-state">
                <i data-lucide="compass"></i>
                <h2>Section not found</h2>
                <p>No view is registered for <code>#/${path}</code>.</p>
                <a class="btn btn-primary" href="#/dashboard">Back to Dashboard</a>
            </div>`
    };
}

function renderRoute() {
    const path = pathFromHash();
    const view = routes.get(path) || notFound(path);
    const root = document.getElementById('view');

    if (current && current.view.unmount) {
        try {
            current.view.unmount();
        } catch (err) {
            console.warn('unmount failed', err);
        }
    }
    runDisposers();

    root.innerHTML = view.render();
    current = { path, view };

    const titleEl = document.querySelector('.dashboard-title');
    const subtitleEl = document.querySelector('.dashboard-subtitle');
    if (titleEl) titleEl.textContent = view.title;
    if (subtitleEl) subtitleEl.textContent = view.subtitle || '';
    document.title = `${view.title} — Access Genie ThunderShield`;

    setActiveNav(path);
    if (window.lucide) window.lucide.createIcons();

    if (view.mount) {
        // Defer one frame so layout settles before charts measure the container.
        requestAnimationFrame(() => {
            try {
                view.mount(root);
                if (window.lucide) window.lucide.createIcons();
            } catch (err) {
                console.error(`mount failed for #/${path}`, err);
            }
        });
    }

    root.scrollTop = 0;
}

export function start() {
    window.addEventListener('hashchange', renderRoute);
    if (!window.location.hash) {
        window.location.hash = '#/dashboard';
    } else {
        renderRoute();
    }
}

export function navigate(path) {
    window.location.hash = `#/${path}`;
}

/**
 * Re-render the active view in place. Charts resolve their colours from the
 * CSS custom properties when they are built, so a theme switch needs a
 * re-render to recolour them — ApexCharts cannot read the variables itself.
 */
export function refresh() {
    if (current) renderRoute();
}
