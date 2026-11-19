/**
 * Autoload widget: sitewide noindex banner, and SEO marks on the pages list.
 * Admin Next has no page-list column API, so marks are painted into the rows.
 */

const TAG = window.__GRAV_WIDGET_TAG || 'grav-intention-seo--widget';

const rows = new Map();

function ensureStylesheet() {
    const id = 'intention-seo-admin-stylesheet';
    if (document.getElementById(id)) {
        return;
    }
    const base = (window.__GRAV_API_SERVER_URL || '').replace(/\/$/, '');
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `${base}/user/plugins/intention-seo/assets/css/intention-seo-admin.css?v=og-image`;
    document.head.appendChild(link);
}

function apiUrl(path) {
    return (window.__GRAV_API_SERVER_URL || '')
        + (window.__GRAV_API_PREFIX || '/api/v1')
        + path;
}

function apiHeaders() {
    const headers = { Accept: 'application/json' };
    const token = window.__GRAV_API_TOKEN;
    if (token) {
        headers['X-API-Token'] = token;
    }
    return headers;
}

function normalizeRoute(route) {
    if (route == null || route === '') {
        return '/';
    }
    const value = String(route);
    return value.startsWith('/') ? value : `/${value}`;
}

function remember(row) {
    if (!row) {
        return;
    }
    rows.set(normalizeRoute(row.route), row);
    if (row.raw_route) {
        rows.set(normalizeRoute(row.raw_route), row);
    }
}

function lookup(route) {
    if (route == null) {
        return null;
    }
    const key = normalizeRoute(route);
    return rows.get(key) || rows.get(`${key}/`) || null;
}

function isPagesList() {
    const path = (window.location.pathname || '').replace(/\/+$/, '') || '/';
    return path.endsWith('/pages');
}

function routeFromHref(href) {
    if (!href) {
        return null;
    }
    try {
        const parsed = new URL(href, window.location.origin);
        const marker = '/pages/edit';
        const idx = parsed.pathname.indexOf(marker);
        if (idx === -1) {
            return null;
        }
        const rest = parsed.pathname.slice(idx + marker.length);
        if (rest === '' || rest === '/') {
            return '/';
        }
        return rest.startsWith('/') ? rest : `/${rest}`;
    } catch {
        return null;
    }
}

function dot(state, message, label) {
    const wrap = document.createElement('span');
    wrap.className = `iseo-status is-${state || 'muted'}`;
    wrap.title = message || '';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `${label}: ${message || ''}`);
    const icon = document.createElement('span');
    icon.className = 'iseo-icon';
    icon.setAttribute('aria-hidden', 'true');
    wrap.appendChild(icon);
    return wrap;
}

function indexMark(state) {
    if (state === 'index') {
        return 'green';
    }
    if (state === 'site') {
        return 'amber';
    }
    if (state === 'noindex') {
        return 'red';
    }
    return 'muted';
}

function column(kind, content) {
    const col = document.createElement('div');
    col.className = `iseo-col iseo-col-${kind}`;
    col.appendChild(content);
    return col;
}

function headerLabel(text, tip) {
    const span = document.createElement('span');
    span.className = 'iseo-col-header';
    span.textContent = text;
    span.title = tip;
    return span;
}

function marks(row, compact) {
    const wrap = document.createElement('div');
    wrap.className = compact ? 'iseo-cols is-compact' : 'iseo-cols';
    wrap.dataset.iseoCol = '1';
    wrap.append(
        column('title', dot(row?.title_state, row?.title_message, 'Meta title')),
        column('desc', dot(row?.description_state, row?.description_message, 'Meta description')),
        column('index', dot(indexMark(row?.index_state), row?.index_message, 'Index')),
    );
    return wrap;
}

function headerCell() {
    const wrap = document.createElement('div');
    wrap.className = 'iseo-cols';
    wrap.dataset.iseoCol = '1';
    wrap.dataset.iseoHeader = '1';
    wrap.append(
        column('title', headerLabel('Meta title', 'Document title length')),
        column('desc', headerLabel('Meta desc', 'Meta description length')),
        column('index', headerLabel('Index', 'Whether this page is indexed')),
    );
    return wrap;
}

function paintHeaders() {
    const dots = document.querySelectorAll('div.w-6.text-center');
    for (const el of dots) {
        if ((el.textContent || '').trim() !== '·') {
            continue;
        }
        if (el.nextElementSibling?.dataset?.iseoHeader) {
            continue;
        }
        el.insertAdjacentElement('afterend', headerCell());
    }
}

function statusCell(rowEl) {
    for (const child of rowEl.children) {
        if (child.matches('div.flex.w-6.justify-center')) {
            return child;
        }
    }
    return null;
}

function paintPageRows() {
    const list = document.querySelectorAll('[data-page-route]');
    for (const rowEl of list) {
        const route = rowEl.getAttribute('data-page-route');
        const existing = rowEl.querySelector(':scope > [data-iseo-col]');
        const row = lookup(route) || lookup(routeFromHref(rowEl.querySelector('a[href*="/pages/edit"]')?.getAttribute('href')));
        if (!row) {
            existing?.remove();
            continue;
        }
        const key = normalizeRoute(row.route);
        if (existing?.dataset.iseoRoute === key) {
            continue;
        }
        existing?.remove();
        const col = marks(row, !statusCell(rowEl));
        col.dataset.iseoRoute = key;
        const status = statusCell(rowEl);
        if (status) {
            status.insertAdjacentElement('afterend', col);
        } else {
            rowEl.appendChild(col);
        }
    }
}

function clearInjected() {
    document.querySelectorAll('[data-iseo-col]').forEach((node) => node.remove());
}

let painting = false;
let paintQueued = false;

function paint() {
    if (painting) {
        return;
    }
    painting = true;
    try {
        if (!isPagesList()) {
            clearInjected();
            return;
        }
        paintHeaders();
        paintPageRows();
    } finally {
        painting = false;
    }
}

function schedulePaint() {
    if (paintQueued) {
        return;
    }
    paintQueued = true;
    requestAnimationFrame(() => {
        paintQueued = false;
        paint();
    });
}

function placeBanner(message) {
    let banner = document.getElementById('intention-seo-noindex-banner');
    if (!message) {
        banner?.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'intention-seo-noindex-banner';
        banner.className = 'iseo-site-banner';
        banner.setAttribute('role', 'status');
    }
    banner.textContent = message;
    const host = document.querySelector('main') || document.body;
    if (banner.parentElement !== host) {
        host.prepend(banner);
    }
}

let statusLoaded = false;

function loadStatus() {
    if (statusLoaded) {
        return;
    }
    statusLoaded = true;
    fetch(apiUrl('/intention-seo/status'), { headers: apiHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
            const data = body?.data || body;
            if (data?.site_noindex) {
                placeBanner(data.message || 'This site is set to noindex.');
            }
        })
        .catch(() => {});
}

function loadPages() {
    if (window.__INTENTION_SEO_PAGES_LOADED) {
        schedulePaint();
        return;
    }
    window.__INTENTION_SEO_PAGES_LOADED = true;
    fetch(apiUrl('/intention-seo/page-status'), { headers: apiHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
            const data = body?.data || body;
            const pages = Array.isArray(data?.pages) ? data.pages : [];
            pages.forEach(remember);
            schedulePaint();
        })
        .catch(() => {});
}

function startObserver() {
    if (window.__intentionSeoObserver) {
        return;
    }
    const observer = new MutationObserver(() => {
        if (painting) {
            return;
        }
        schedulePaint();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__intentionSeoObserver = observer;
}

function boot() {
    ensureStylesheet();
    loadStatus();
    loadPages();
    startObserver();
    schedulePaint();
}

class IntentionSeoWidget extends HTMLElement {
    connectedCallback() {
        this.style.display = 'none';
        boot();
    }
}

try {
    if (!customElements.get(TAG)) {
        customElements.define(TAG, IntentionSeoWidget);
    }
} catch {
    // The host may define the tag before this file finishes.
}

boot();
