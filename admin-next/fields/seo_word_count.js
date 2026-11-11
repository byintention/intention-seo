/**
 * seo_word_count — saved-page word count. Does not store a value.
 */

const TAG = window.__GRAV_FIELD_TAG;

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

function editRoute() {
    const path = window.location.pathname || '';
    const marker = '/pages/edit';
    const idx = path.indexOf(marker);
    if (idx === -1) {
        return null;
    }
    const rest = path.slice(idx + marker.length);
    if (rest === '' || rest === '/') {
        return '/';
    }
    return rest.startsWith('/') ? rest : `/${rest}`;
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

class SeoWordCountField extends HTMLElement {
    set field(value) {
        this._field = value;
    }

    get field() {
        return this._field || null;
    }

    set value(_value) {
        // Display only.
    }

    get value() {
        return undefined;
    }

    connectedCallback() {
        ensureStylesheet();
        this.innerHTML = '<p class="iseo-words">Word count: …</p><p class="iseo-note"></p>';
        const route = editRoute();
        if (!route) {
            this.querySelector('.iseo-words').textContent = 'Word count is available after the page is saved.';
            return;
        }
        const cache = window.__INTENTION_SEO_SUMMARY;
        const pending = cache?.get(route) || fetch(
            apiUrl(`/intention-seo/page-summary?route=${encodeURIComponent(route)}`),
            { headers: apiHeaders() },
        ).then((response) => (response.ok ? response.json() : null)).then((body) => body?.data || body);
        Promise.resolve(pending).then((summary) => {
            if (!this.isConnected) {
                return;
            }
            const count = Number(summary?.word_count);
            this.querySelector('.iseo-words').innerHTML = `Word count: <strong>${Number.isFinite(count) ? count : '—'}</strong>`;
            const note = this.querySelector('.iseo-note');
            note.textContent = typeof summary?.word_note === 'string' ? summary.word_note : '';
        }).catch(() => {
            if (this.isConnected) {
                this.querySelector('.iseo-words').textContent = 'Word count is unavailable.';
            }
        });
    }
}

customElements.define(TAG, SeoWordCountField);
