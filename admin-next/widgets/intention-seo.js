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
    link.href = `${base}/user/plugins/intention-seo/assets/css/intention-seo-admin.css`;
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

function marks(row) {
    const col = document.createElement('div');
    col.className = 'iseo-col';
    col.dataset.iseoCol = '1';
    col.append(
        dot(row?.title_state, row?.title_message, 'Meta title'),
        dot(row?.description_state, row?.description_message, 'Meta description'),
        dot(row?.index_state === 'index' ? 'green' : (row?.index_state === 'site' ? 'amber' : (row?.index_state === 'noindex' ? 'red' : 'muted')), row?.index_message, 'Indexing'),
    );
    return col;
}

function headerCell() {
    const col = document.createElement('div');
    col.className = 'iseo-col';
    col.dataset.iseoCol = '1';
    col.dataset.iseoHeader = '1';
    const span = document.createElement('span');
    span.className = 'iseo-col-header';
    span.textContent = 'SEO';
    col.title = 'Meta title, meta description, indexing';
    col.appendChild(span);
    return col;
}

function isTemplateColumn(el) {
    return el && el.matches('div.hidden.w-20.text-center.md\\:block, div.w-20.text-center');
}

function paintHeaders() {
    const dots = document.querySelectorAll('div.w-6.text-center');
    for (const el of dots) {
        if (el.dataset.iseoHeader) {
            continue;
        }
        if ((el.textContent || '').trim() !== '·') {
            continue;
        }
        if (!isTemplateColumn(el.previousElementSibling)) {
            continue;
        }
        if (el.nextElementSibling?.dataset?.iseoHeader) {
            continue;
        }
        el.insertAdjacentElement('afterend', headerCell());
    }
}

function pageLinkFrom(node) {
    return node.parentElement?.querySelector('a[href*="/pages/edit"]') || null;
}

function paintRowColumns() {
    const cells = document.querySelectorAll('div.flex.w-6.justify-center');
    for (const el of cells) {
        if (el.dataset.iseoCol) {
            continue;
        }
        const prev = el.previousElementSibling;
        if (!prev || !prev.classList.contains('w-20')) {
            continue;
        }
        const next = el.nextElementSibling;
        if (next?.dataset?.iseoCol && !next.dataset.iseoHeader) {
            continue;
        }
        const link = pageLinkFrom(el);
        const row = lookup(routeFromHref(link?.getAttribute('href')));
        if (!row) {
            continue;
        }
        el.insertAdjacentElement('afterend', marks(row));
    }
}

function paintMiller() {
    const list = document.querySelectorAll('[data-miller-row]');
    for (const rowEl of list) {
        const link = rowEl.querySelector('a[href*="/pages/edit"]');
        if (!link) {
            continue;
        }
        const cluster = rowEl.querySelector('[class*="gap-1.5"]');
        if (!cluster || cluster.querySelector('[data-iseo-col]')) {
            continue;
        }
        const row = lookup(routeFromHref(link.getAttribute('href')));
        if (!row) {
            continue;
        }
        cluster.appendChild(marks(row));
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
        paintRowColumns();
        paintMiller();
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

class IntentionSeoWidget extends HTMLElement {
    connectedCallback() {
        this.style.display = 'none';
        ensureStylesheet();
        loadStatus();
        loadPages();
        startObserver();
        schedulePaint();
    }
}

try {
    if (!customElements.get(TAG)) {
        customElements.define(TAG, IntentionSeoWidget);
    }
} catch {
    // The host may define the tag before this file finishes.
}

ensureStylesheet();
