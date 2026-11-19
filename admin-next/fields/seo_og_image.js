/**
 * seo_og_image — preview of the site Open Graph image, with replace and clear.
 *
 * Stores the same Grav file map as a blueprint file field:
 * { "<path>": { name, type, size, path, url } }
 */

const TAG = window.__GRAV_FIELD_TAG;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

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
    const environment = window.__GRAV_ENVIRONMENT;
    if (environment) {
        headers['X-Grav-Environment'] = environment;
    }
    return headers;
}

function decodePart(part) {
    try {
        return decodeURIComponent(part);
    } catch {
        return part;
    }
}

function encodePublicPath(raw) {
    const value = String(raw || '').trim();
    if (value === '') {
        return '';
    }
    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            url.pathname = url.pathname
                .split('/')
                .map((part, index) => (index === 0 ? part : encodeURIComponent(decodePart(part))))
                .join('/');
            return url.toString();
        } catch {
            return value;
        }
    }

    const base = (window.__GRAV_API_SERVER_URL || '').replace(/\/$/, '');
    const path = value.startsWith('/') ? value : `/${value}`;
    const encoded = path
        .split('/')
        .map((part, index) => (index === 0 ? '' : encodeURIComponent(decodePart(part))))
        .join('/');
    return base + encoded;
}

function firstEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    for (const [key, entry] of Object.entries(value)) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const path = typeof entry.path === 'string' ? entry.path : '';
        const url = typeof entry.url === 'string' ? entry.url : '';
        const name = typeof entry.name === 'string' ? entry.name : '';
        if (path === '' && url === '' && name === '' && key === '') {
            continue;
        }
        return { key, entry: { ...entry, name, path, url } };
    }
    return null;
}

function previewSource(stored) {
    if (!stored) {
        return '';
    }
    const raw = stored.entry.url || stored.entry.path || stored.key;
    return encodePublicPath(raw);
}

function extensionOf(name) {
    const parts = String(name || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function sameValue(left, right) {
    return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

class SeoOgImageField extends HTMLElement {
    constructor() {
        super();
        this._value = {};
        this._field = null;
        this._error = '';
        this._busy = false;
        this._broken = false;
    }

    set field(value) {
        this._field = value;
        if (this.isConnected) {
            this._render();
        }
    }

    get field() {
        return this._field;
    }

    set value(value) {
        const next = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        if (sameValue(next, this._value)) {
            return;
        }
        this._value = next;
        this._broken = false;
        if (this.isConnected) {
            this._render();
        }
    }

    get value() {
        return this._value;
    }

    connectedCallback() {
        ensureStylesheet();
        this._render();
    }

    _limitMb() {
        const limit = Number(this._field?.filesize);
        return limit > 0 ? limit : 5;
    }

    _acceptList() {
        const accept = this._field?.accept;
        if (Array.isArray(accept) && accept.length > 0) {
            return accept.map((item) => String(item));
        }
        return IMAGE_TYPES.slice();
    }

    _allowed(file) {
        const extension = extensionOf(file.name);
        const type = String(file.type || '').toLowerCase();
        const typeOk = type === '' || IMAGE_TYPES.includes(type);
        return IMAGE_EXTENSIONS.includes(extension) && typeOk;
    }

    _commit(next) {
        this._value = next;
        this._error = '';
        this._broken = false;
        this._render();
        this.dispatchEvent(new CustomEvent('change', {
            detail: next,
            bubbles: true,
        }));
    }

    async _clear() {
        if (this._busy) {
            return;
        }
        const dialogs = window.__GRAV_DIALOGS;
        if (dialogs?.confirm) {
            const ok = await dialogs.confirm({
                title: 'Remove image?',
                message: 'The default Open Graph image will be cleared when you save.',
                confirmLabel: 'Remove',
                variant: 'destructive',
            });
            if (!ok) {
                return;
            }
        }
        this._commit({});
    }

    _pick(input) {
        if (this._busy) {
            return;
        }
        input.click();
    }

    async _chosen(input) {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || this._busy) {
            return;
        }
        if (!this._allowed(file)) {
            this._error = 'Use a PNG, JPEG, or WebP image.';
            this._render();
            return;
        }
        const max = this._limitMb() * 1024 * 1024;
        if (file.size > max) {
            this._error = `Image must be ${this._limitMb()} MB or smaller.`;
            this._render();
            return;
        }

        this._busy = true;
        this._error = '';
        this._render();
        try {
            const saved = await this._upload(file);
            const entry = {
                name: saved.name || file.name,
                type: saved.type || file.type || 'application/octet-stream',
                size: saved.size || file.size,
                path: saved.path,
            };
            if (saved.url) {
                entry.url = saved.url;
            }
            this._busy = false;
            this._commit({ [saved.path]: entry });
        } catch (error) {
            this._busy = false;
            this._error = error instanceof Error && error.message
                ? error.message
                : 'Could not upload the image.';
            this._render();
        }
    }

    async _upload(file) {
        const body = new FormData();
        body.append('file', file);
        body.append('destination', this._field?.destination || 'user://data/intention-seo');
        body.append('scope', 'plugins/intention-seo');
        body.append('field', this._field?.name || 'og_image');
        body.append('accept', this._acceptList().join(','));
        body.append('filesize', String(this._limitMb()));

        const response = await fetch(apiUrl('/blueprint-upload'), {
            method: 'POST',
            headers: apiHeaders(),
            body,
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
        if (!response.ok) {
            const detail = payload && (payload.detail || payload.title);
            throw new Error(detail || 'Could not upload the image.');
        }
        const rows = payload && Array.isArray(payload.data) ? payload.data : [];
        const saved = rows.find((row) => row && row.name === file.name) || rows[0];
        if (!saved || typeof saved.path !== 'string' || saved.path === '') {
            throw new Error('Could not upload the image.');
        }
        return saved;
    }

    _render() {
        const stored = firstEntry(this._value);
        const src = this._broken ? '' : previewSource(stored);
        const name = stored ? (stored.entry.name || stored.key) : '';

        this.replaceChildren();
        const root = document.createElement('div');
        root.className = 'iseo-og';

        const input = document.createElement('input');
        input.type = 'file';
        input.className = 'iseo-og-file';
        input.accept = this._acceptList().join(',');
        input.disabled = this._busy;
        input.addEventListener('change', () => {
            this._chosen(input);
        });

        if (src) {
            const image = document.createElement('img');
            image.className = 'iseo-og-preview';
            image.alt = name || 'Open Graph image';
            image.src = src;
            image.addEventListener('error', () => {
                if (this._broken) {
                    return;
                }
                this._broken = true;
                this._error = 'The saved image could not be shown.';
                this._render();
            });
            root.appendChild(image);
        } else {
            const choose = document.createElement('button');
            choose.type = 'button';
            choose.className = 'iseo-og-choose';
            choose.textContent = this._busy ? 'Uploading…' : 'Choose image';
            choose.disabled = this._busy;
            choose.addEventListener('click', () => this._pick(input));
            root.appendChild(choose);
        }

        if (src || stored) {
            const actions = document.createElement('div');
            actions.className = 'iseo-og-actions';

            const replace = document.createElement('button');
            replace.type = 'button';
            replace.className = 'iseo-og-button';
            replace.textContent = this._busy ? 'Uploading…' : 'Replace image';
            replace.disabled = this._busy;
            replace.addEventListener('click', () => this._pick(input));
            actions.appendChild(replace);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'iseo-og-button is-quiet';
            remove.textContent = 'Remove image';
            remove.disabled = this._busy;
            remove.addEventListener('click', () => {
                this._clear();
            });
            actions.appendChild(remove);
            root.appendChild(actions);
        }

        if (this._error) {
            const error = document.createElement('p');
            error.className = 'iseo-og-error';
            error.setAttribute('role', 'alert');
            error.textContent = this._error;
            root.appendChild(error);
        }

        root.appendChild(input);
        this.appendChild(root);
    }
}

customElements.define(TAG, SeoOgImageField);
