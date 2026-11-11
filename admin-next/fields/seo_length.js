/**
 * seo_length — text or textarea with a live length status.
 *
 * Title fields (no rows) use 50–60 good, 30–49 ok.
 * Description fields (rows > 1) use 150–160 good, 120–149 ok.
 * classes iseo-empty-ok: an empty value is "Not set", not Poor.
 * classes iseo-composed: an empty value is scored as the page's document title.
 */

const TAG = window.__GRAV_FIELD_TAG;

function lengthState(len, greenMin, greenMax, amberMin) {
    if (len >= greenMin && len <= greenMax) {
        return 'green';
    }
    if (len >= amberMin && len < greenMin) {
        return 'amber';
    }
    return 'red';
}

function lengthWord(state) {
    if (state === 'green') return 'Good';
    if (state === 'amber') return 'OK';
    return 'Poor';
}

function lengthMessage(len, state, greenMin, greenMax) {
    const word = lengthWord(state);
    if (state === 'green') {
        return `${word} — ${len} characters`;
    }
    if (state === 'amber') {
        return `${word} — ${len} characters, a little short (aim for ${greenMin}–${greenMax})`;
    }
    if (len > greenMax) {
        return `${word} — ${len} characters, too long (aim for ${greenMin}–${greenMax})`;
    }
    return `${word} — ${len} characters, too short (aim for ${greenMin}–${greenMax})`;
}

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

function loadSummary(route) {
    if (!route) {
        return Promise.resolve(null);
    }
    const cache = window.__INTENTION_SEO_SUMMARY || (window.__INTENTION_SEO_SUMMARY = new Map());
    if (cache.has(route)) {
        return cache.get(route);
    }
    const pending = fetch(apiUrl(`/intention-seo/page-summary?route=${encodeURIComponent(route)}`), {
        headers: apiHeaders(),
    }).then((response) => (response.ok ? response.json() : null))
        .then((body) => body?.data || body)
        .catch(() => null);
    cache.set(route, pending);
    return pending;
}

class SeoLengthField extends HTMLElement {
    constructor() {
        super();
        this._value = '';
        this._field = null;
        this._status = null;
        this._statusWord = null;
        this._statusCount = null;
        this._input = null;
        this._built = false;
        this._composed = '';
    }

    set field(value) {
        this._field = value;
        if (this.isConnected) {
            this._updateIcon();
        }
    }

    get field() {
        return this._field;
    }

    set value(value) {
        const next = value == null ? '' : String(value);
        if (next !== this._value) {
            this._value = next;
            if (this._input && this._input.value !== next) {
                this._input.value = next;
            }
            this._updateIcon();
        }
    }

    get value() {
        return this._value;
    }

    connectedCallback() {
        ensureStylesheet();
        this._build();
        this._placeIcon();
        this._updateIcon();
        this._loadComposed();
        requestAnimationFrame(() => {
            this._placeIcon();
            this._updateIcon();
        });
    }

    disconnectedCallback() {
        this._status?.remove();
        this._status = null;
        this._statusWord = null;
        this._statusCount = null;
    }

    _classes() {
        return String(this._field?.classes || '');
    }

    _multiline() {
        return Number(this._field?.rows) > 1;
    }

    _limits() {
        if (this._multiline()) {
            return { greenMin: 150, greenMax: 160, amberMin: 120 };
        }
        return { greenMin: 50, greenMax: 60, amberMin: 30 };
    }

    _build() {
        if (this._built) {
            return;
        }
        this._built = true;
        if (this._multiline()) {
            const rows = Number(this._field?.rows) || 3;
            this.innerHTML = `<textarea class="iseo-area" rows="${rows}"></textarea>`;
        } else {
            this.innerHTML = '<input class="iseo-input" type="text" />';
        }
        this._input = this.querySelector('textarea, input');
        this._input.value = this._value;
        this._input.addEventListener('input', () => {
            this._value = this._input.value;
            this._updateIcon();
            this.dispatchEvent(new CustomEvent('change', {
                detail: this._value,
                bubbles: true,
            }));
        });
    }

    _loadComposed() {
        if (!this._classes().includes('iseo-composed')) {
            return;
        }
        loadSummary(editRoute()).then((summary) => {
            this._composed = typeof summary?.document_title === 'string' ? summary.document_title : '';
            this._updateIcon();
        });
    }

    _labelHolder() {
        let node = this.parentElement;
        for (let i = 0; i < 8 && node; i += 1) {
            if (String(node.className || '').includes('lg:grid-cols')) {
                const holder = node.querySelector(':scope > .flex > div');
                if (holder && !holder.contains(this)) {
                    return holder;
                }
            }
            node = node.parentElement;
        }
        return null;
    }

    _placeIcon() {
        if (!this._status) {
            this._status = document.createElement('span');
            this._status.className = 'iseo-status iseo-field-status';
            this._status.setAttribute('role', 'status');
            const dot = document.createElement('span');
            dot.className = 'iseo-icon';
            dot.setAttribute('aria-hidden', 'true');
            this._statusWord = document.createElement('span');
            this._statusWord.className = 'iseo-word';
            this._statusCount = document.createElement('span');
            this._statusCount.className = 'iseo-count';
            this._status.append(dot, this._statusWord, this._statusCount);
        }
        const holder = this._labelHolder();
        if (holder) {
            if (this._status.parentElement !== holder) {
                holder.appendChild(this._status);
            }
            return;
        }
        if (this._input && this._status.parentElement !== this) {
            this.insertBefore(this._status, this._input);
        }
    }

    _updateIcon() {
        if (this.isConnected) {
            this._placeIcon();
        }
        if (!this._status) {
            return;
        }
        const classes = this._classes();
        const emptyOk = classes.includes('iseo-empty-ok');
        const composed = classes.includes('iseo-composed') && this._value === '' && this._composed !== '';
        const measured = composed ? this._composed : this._value;
        const len = measured.length;
        this._status.classList.remove('is-green', 'is-amber', 'is-red', 'is-muted');
        if (len === 0 && emptyOk) {
            this._status.classList.add('is-muted');
            this._status.title = 'Not set';
            this._status.setAttribute('aria-label', 'Not set');
            this._statusWord.textContent = 'Not set';
            this._statusCount.textContent = '';
            return;
        }
        const { greenMin, greenMax, amberMin } = this._limits();
        const state = lengthState(len, greenMin, greenMax, amberMin);
        const message = lengthMessage(len, state, greenMin, greenMax);
        this._status.classList.add(`is-${state}`);
        this._status.title = composed ? `${message}. Using the page title.` : message;
        this._status.setAttribute('aria-label', this._status.title);
        this._statusWord.textContent = lengthWord(state);
        this._statusCount.textContent = String(len);
    }
}

customElements.define(TAG, SeoLengthField);
