/**
 * seo_banner — warning text from field.content. Does not store a value.
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
    link.href = `${base}/user/plugins/intention-seo/assets/css/intention-seo-admin.css?v=og-image`;
    document.head.appendChild(link);
}

class SeoBannerField extends HTMLElement {
    set field(value) {
        this._field = value;
        this._render();
    }

    get field() {
        return this._field || null;
    }

    set value(_value) {}

    get value() {
        return undefined;
    }

    connectedCallback() {
        ensureStylesheet();
        this._render();
    }

    _render() {
        const text = String(this._field?.content || '');
        this.innerHTML = '';
        const banner = document.createElement('div');
        banner.className = 'iseo-banner';
        banner.setAttribute('role', 'status');
        banner.textContent = text;
        this.appendChild(banner);
    }
}

customElements.define(TAG, SeoBannerField);
