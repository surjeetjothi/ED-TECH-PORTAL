/**
 * cb_ui.js — ClassBridge Centralized UI Component Library
 *
 * Single source of truth for all repeated UI patterns.
 * Change here → reflects everywhere in the app instantly.
 *
 * Namespace: window.CB.ui
 *
 * Functions:
 *   CB.ui.spinner(message?, size?)    → HTML string for full-block loading spinner
 *   CB.ui.btnLoading(btn, label?)    → puts a button into loading state
 *   CB.ui.btnRestore(btn, label)     → restores a button from loading state
 *   CB.ui.empty(message?, icon?)     → HTML string for empty/no-data state
 *   CB.ui.error(message?, icon?)     → HTML string for error state
 *   CB.ui.toast(message, type?, duration?) → creates & auto-removes a toast notification
 *   CB.ui.badge(label, type?)        → HTML string for an inline status badge
 *   CB.ui.tableSpinner(colSpan?)     → HTML string for spinner inside a <table>
 *   CB.ui.metric(container, label, value, colorClass?) → appends a stat metric card
 */

(function () {
    'use strict';

    // Ensure the CB namespace exists
    window.CB = window.CB || {};

    // ─────────────────────────────────────────────────────────────
    // Design Tokens — change these to update the whole app
    // ─────────────────────────────────────────────────────────────
    const TOKENS = {
        spinnerColor: 'text-primary',   // Bootstrap text-color class for spinners
        toastZIndex: '1090',            // z-index for toast notifications
        toastDuration: 3500,            // ms before toast auto-dismisses
        emptyIcon: 'inbox',             // Material icon for empty states
        errorIcon: 'error_outline',     // Material icon for error states
        field: {
            radius: '10px',
            labelColor: '#475569',
            borderColor: '#d1d5db',
            focusColor: '#2563eb',
            background: '#ffffff',
        },
        // Toast type → Bootstrap bg class
        toastTypes: {
            success: 'bg-success',
            error: 'bg-danger',
            warning: 'bg-warning text-dark',
            info: 'bg-info text-dark',
        },
        // Badge type → inline styles (keeps consistent theming)
        badgeStyles: {
            success: 'background:#dcfce7;color:#15803d',
            danger: 'background:#fee2e2;color:#b91c1c',
            warning: 'background:#fef3c7;color:#b45309',
            info: 'background:#dbeafe;color:#1d4ed8',
            secondary: 'background:#f1f5f9;color:#64748b',
            primary: 'background:#ede9fe;color:#5b21b6',
        }
    };

    // ─────────────────────────────────────────────────────────────
    // SPINNER — full container loading block
    // ─────────────────────────────────────────────────────────────
    /**
     * Returns an HTML string for a centred loading spinner block.
     * @param {string} [message='Loading...'] - Optional loading message displayed below the spinner.
     * @param {'sm'|'md'|'lg'} [size='md'] - Spinner size. 'sm' = spinner-border-sm, 'md' = default, 'lg' = larger.
     * @returns {string} HTML string ready to set as innerHTML.
     *
     * @example
     * container.innerHTML = CB.ui.spinner('Loading attendance...');
     */
    function spinner(message = 'Loading...', size = 'md') {
        const sizeClass = size === 'sm' ? 'spinner-border-sm' : '';
        const paddingClass = size === 'lg' ? 'py-5' : 'p-4';
        const msgHtml = message
            ? `<p class="text-muted mt-2 mb-0 small">${message}</p>`
            : '';
        return `
            <div class="text-center ${paddingClass}">
                <div class="spinner-border ${TOKENS.spinnerColor} ${sizeClass}" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                ${msgHtml}
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // TABLE SPINNER — spinner row inside a <tbody>
    // ─────────────────────────────────────────────────────────────
    /**
     * Returns an HTML string for a <tr> spinner row inside a table.
     * @param {number} [colSpan=5] - Number of columns to span.
     * @returns {string} HTML string for a <tr>.
     *
     * @example
     * tbody.innerHTML = CB.ui.tableSpinner(4);
     */
    function tableSpinner(colSpan = 5) {
        return `
            <tr>
                <td colspan="${colSpan}" class="text-center py-4">
                    <div class="spinner-border spinner-border-sm ${TOKENS.spinnerColor}" role="status"></div>
                    <span class="text-muted ms-2 small">Loading...</span>
                </td>
            </tr>`;
    }

    // ─────────────────────────────────────────────────────────────
    // BUTTON LOADING STATE
    // ─────────────────────────────────────────────────────────────
    /**
     * Puts a button element into a loading/disabled state with an inline spinner.
     * Stores the original label on the element for easy restoration.
     * @param {HTMLElement} btn - The button element to mutate.
     * @param {string} [loadingLabel='Saving...'] - Text to show while loading.
     *
     * @example
     * CB.ui.btnLoading(submitBtn, 'Sending...');
     */
    function btnLoading(btn, loadingLabel = 'Saving...') {
        if (!btn) return;
        btn.dataset.cbOriginalLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${loadingLabel}`;
    }

    /**
     * Restores a button from loading state to its original label (or a new label).
     * @param {HTMLElement} btn - The button element to restore.
     * @param {string} [label] - Optional override label. If omitted, restores original.
     *
     * @example
     * CB.ui.btnRestore(submitBtn);
     */
    function btnRestore(btn, label) {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = label || btn.dataset.cbOriginalLabel || 'Submit';
    }

    // ─────────────────────────────────────────────────────────────
    // EMPTY STATE
    // ─────────────────────────────────────────────────────────────
    /**
     * Returns an HTML string for an empty / no-data state.
     * @param {string} [message='No data found.'] - Message to display.
     * @param {string} [icon] - Material icon name. Defaults to TOKENS.emptyIcon.
     * @returns {string} HTML string.
     *
     * @example
     * list.innerHTML = CB.ui.empty('No assignments found.', 'assignment');
     */
    function empty(message = 'No data found.', icon = TOKENS.emptyIcon) {
        return `
            <div class="text-center py-5 text-muted">
                <span class="material-icons d-block mb-2" style="font-size:2.5rem;opacity:0.35;">${icon}</span>
                <p class="mb-0 small">${message}</p>
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // ERROR STATE
    // ─────────────────────────────────────────────────────────────
    /**
     * Returns an HTML string for an error / failure state.
     * @param {string} [message='Something went wrong.'] - Error message to display.
     * @param {string} [icon] - Material icon name. Defaults to TOKENS.errorIcon.
     * @returns {string} HTML string.
     *
     * @example
     * container.innerHTML = CB.ui.error('Failed to load attendance data.');
     */
    function error(message = 'Something went wrong. Please try again.', icon = TOKENS.errorIcon) {
        return `
            <div class="text-center py-4 text-danger">
                <span class="material-icons d-block mb-2" style="font-size:2.5rem;">${icon}</span>
                <p class="mb-0 small fw-medium">${message}</p>
            </div>`;
    }

    // ─────────────────────────────────────────────────────────────
    // TOAST NOTIFICATION
    // ─────────────────────────────────────────────────────────────
    /**
     * Creates a Bootstrap-style toast notification, appends it to the body,
     * and auto-removes it after the given duration.
     * @param {string} message - The message to show.
     * @param {'success'|'error'|'warning'|'info'} [type='success'] - Toast type.
     * @param {number} [duration] - Duration in ms before auto-dismiss. Defaults to TOKENS.toastDuration.
     *
     * @example
     * CB.ui.toast('Attendance saved successfully.');
     * CB.ui.toast('Failed to upload file.', 'error');
     */
    function toast(message, type = 'success', duration = TOKENS.toastDuration) {
        const bgClass = TOKENS.toastTypes[type] || TOKENS.toastTypes.success;
        const iconMap = {
            success: 'check_circle',
            error: 'cancel',
            warning: 'warning',
            info: 'info',
        };
        const icon = iconMap[type] || 'check_circle';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            bottom: 1.5rem;
            right: 1.5rem;
            z-index: ${TOKENS.toastZIndex};
            animation: cbFadeIn 0.25s ease;
        `;
        wrapper.innerHTML = `
            <div class="toast show align-items-center text-white ${bgClass} border-0 shadow-lg" role="alert" aria-live="polite" style="min-width:280px;border-radius:10px;">
                <div class="d-flex align-items-center gap-2 p-3">
                    <span class="material-icons fs-5">${icon}</span>
                    <div class="toast-body p-0 fw-medium flex-grow-1">${message}</div>
                    <button type="button" class="btn-close btn-close-white ms-2 flex-shrink-0" onclick="this.closest('[role=alert]').parentElement.remove()" aria-label="Close"></button>
                </div>
            </div>`;

        // Inject keyframe animation once
        if (!document.getElementById('cb-ui-styles')) {
            const style = document.createElement('style');
            style.id = 'cb-ui-styles';
            style.textContent = `
                @keyframes cbFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes cbFadeOut { from { opacity: 1; } to { opacity: 0; transform: translateY(5px); } }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(wrapper);

        setTimeout(() => {
            wrapper.style.animation = 'cbFadeOut 0.25s ease forwards';
            setTimeout(() => wrapper.remove(), 280);
        }, duration);
    }

    // ─────────────────────────────────────────────────────────────
    // STATUS BADGE
    // ─────────────────────────────────────────────────────────────
    /**
     * Returns an HTML string for a small pill-shaped status badge.
     * @param {string} label - Text to display inside the badge.
     * @param {'success'|'danger'|'warning'|'info'|'secondary'|'primary'} [type='secondary'] - Badge colour type.
     * @returns {string} HTML string.
     *
     * @example
     * row.innerHTML += CB.ui.badge('Active', 'success');
     * row.innerHTML += CB.ui.badge('Pending', 'warning');
     */
    function badge(label, type = 'secondary') {
        const styles = TOKENS.badgeStyles[type] || TOKENS.badgeStyles.secondary;
        return `<span class="badge rounded-pill px-3 py-1" style="${styles};font-size:0.72rem;font-weight:600;">${label}</span>`;
    }

    // ─────────────────────────────────────────────────────────────
    // METRIC WIDGET — stat card (replaces renderMetric in script.js)
    // ─────────────────────────────────────────────────────────────
    /**
     * Appends a stat metric card to a container element.
     * Backward-compatible with the existing window.renderMetric signature.
     *
     * @param {HTMLElement} container - The row/container to append to.
     * @param {string} label - i18n key or display label for the metric.
     * @param {string|number} value - Metric value to display.
     * @param {string} [colorClass='widget-purple'] - CSS class for card colour.
     *
     * @example
     * CB.ui.metric(metricsDiv, 'dashboard_students', data.total_students, 'widget-blue');
     */
    function metric(container, label, value, colorClass = 'widget-purple') {
        // Icon mapping
        const iconMap = {
            Student: 'school', dashboard_students: 'school',
            Teacher: 'person_outline', dashboard_teachers: 'person_outline',
            Staff: 'people', dashboard_staff: 'people',
            Awards: 'emoji_events', dashboard_awards: 'emoji_events',
            Revenue: 'monetization_on',
            'Net Income': 'trending_up',
            Attendance: 'rule',
            Score: 'bar_chart',
        };
        let icon = 'menu_book';
        for (const [key, val] of Object.entries(iconMap)) {
            if (label.includes(key) || label === key) { icon = val; break; }
        }

        // Subtext mapping — uses t() if available, else falls back to string
        const subtextMap = {
            dashboard_teachers: { key: 'metric_change_teachers', def: '↑ 3% from last month' },
            dashboard_staff: { key: 'metric_change_staff', def: '→ No change' },
            dashboard_awards: { key: 'metric_change_awards', def: '↑ 15% from last month' },
        };
        const sub = subtextMap[label];
        const subHtml = sub
            ? `<span class="text-white small opacity-75" data-i18n="${sub.key}">${typeof t === 'function' ? t(sub.key) : sub.def}</span>`
            : '';

        const displayLabel = typeof t === 'function' ? t(label) : label;

        const col = document.createElement('div');
        col.className = 'col-lg-3 col-md-6';
        col.innerHTML = `
            <div class="metric-widget ${colorClass}">
                <div class="d-flex justify-content-between w-100 mb-3">
                    <span class="text-white fw-medium" data-i18n="${label}">${displayLabel}</span>
                    <span class="material-icons text-white">${icon}</span>
                </div>
                <div class="d-flex flex-column align-items-start">
                    <h3 class="fw-bold text-white mb-1" style="font-size:28px;">${value}</h3>
                    ${subHtml}
                </div>
            </div>`;
        container.appendChild(col);
    }

    // ─────────────────────────────────────────────────────────────
    // FORM FIELD STANDARDS
    // ─────────────────────────────────────────────────────────────
    /**
     * Injects baseline CSS for uniform form fields across modules.
     * Safe to call multiple times.
     */
    function ensureFieldStyles() {
        if (document.getElementById('cb-ui-field-styles')) return;
        const style = document.createElement('style');
        style.id = 'cb-ui-field-styles';
        style.textContent = `
            .cb-form-field { margin-bottom: 0.875rem; }
            .cb-form-label {
                display: inline-block;
                margin-bottom: 0.35rem;
                font-size: 0.86rem;
                font-weight: 600;
                color: ${TOKENS.field.labelColor};
            }
            .cb-form-control {
                border-radius: ${TOKENS.field.radius};
                border-color: ${TOKENS.field.borderColor};
                background: ${TOKENS.field.background};
                min-height: 2.5rem;
                padding: 0.5rem 0.75rem;
                box-shadow: none;
                transition: border-color .15s ease, box-shadow .15s ease;
            }
            .cb-form-control:focus {
                border-color: ${TOKENS.field.focusColor};
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
            }
            textarea.cb-form-control { min-height: 6.25rem; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Normalizes field classes under a root node.
     * Respects `data-cb-skip` to opt out.
     * @param {ParentNode} [root=document]
     */
    function standardizeFields(root = document) {
        ensureFieldStyles();

        const controlSelector = [
            'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"])',
            'select',
            'textarea'
        ].join(',');

        root.querySelectorAll(controlSelector).forEach((el) => {
            if (el.closest('[data-cb-skip="true"]') || el.dataset.cbSkip === 'true') return;
            el.classList.add('cb-form-control');

            if (el.tagName === 'SELECT') el.classList.add('form-select');
            else el.classList.add('form-control');
        });

        root.querySelectorAll('label').forEach((label) => {
            if (label.closest('[data-cb-skip="true"]') || label.dataset.cbSkip === 'true') return;
            label.classList.add('cb-form-label');
        });
    }

    /**
     * Enables automatic field standardization for dynamic pages.
     * @param {ParentNode} [root=document]
     */
    function autoStandardizeFields(root = document) {
        standardizeFields(root);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof Element)) return;
                    if (node.matches && (node.matches('input,select,textarea,label') || node.querySelector('input,select,textarea,label'))) {
                        standardizeFields(node);
                    }
                });
            });
        });

        const observeRoot = root.body || root;
        if (observeRoot) {
            observer.observe(observeRoot, { childList: true, subtree: true });
        }

        return observer;
    }

    // ─────────────────────────────────────────────────────────────
    // PAGINATION WIDGET
    // ─────────────────────────────────────────────────────────────
    /**
     * Renders a generic client-side paginated list with page controls.
     * @param {Object} options
     * @param {Array} options.data - The full array of items to paginate.
     * @param {string|HTMLElement} options.container - The DOM element (or ID) where rows will be rendered (e.g., <tbody>).
     * @param {string|HTMLElement} options.paginationContainer - The DOM element (or ID) where page controls go.
     * @param {Function} options.renderRow - Callback (item, index) => string|HTMLElement.
     * @param {number} [options.pageSize=10] - Number of items per page.
     * @param {Function} [options.onEmpty] - Optional callback triggered if data is empty.
     */
    function paginate(options) {
        let { data, container, paginationContainer, renderRow, pageSize = 10, onEmpty } = options;
        container = typeof container === 'string' ? document.getElementById(container) : container;
        paginationContainer = typeof paginationContainer === 'string' ? document.getElementById(paginationContainer) : paginationContainer;

        if (!container || !paginationContainer) return;
        container.dataset.cbPaginationManaged = 'manual';

        if (!data || data.length === 0) {
            paginationContainer.innerHTML = '';
            if (onEmpty) {
                onEmpty(container);
            } else {
                container.innerHTML = empty('No records found.'); // or similar based on container type
            }
            return;
        }

        let currentPage = 1;
        const totalPages = Math.ceil(data.length / pageSize);

        function renderPage(page) {
            currentPage = page;
            container.innerHTML = '';

            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, data.length);
            const pageData = data.slice(start, end);

            // Using DocumentFragment if renderRow returns DOM nodes
            const fragment = document.createDocumentFragment();
            let htmlStr = '';

            pageData.forEach((item, index) => {
                const row = renderRow(item, start + index);
                if (typeof row === 'string') {
                    htmlStr += row;
                } else if (row instanceof Node) {
                    fragment.appendChild(row);
                }
            });

            if (htmlStr) container.innerHTML = htmlStr;
            if (fragment.childNodes.length > 0) container.appendChild(fragment);

            renderControls();
        }

        function renderControls() {
            if (totalPages <= 1) {
                paginationContainer.innerHTML = '';
                return;
            }

            let html = `<nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0 justify-content-end">`;

            // Prev Button
            html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage - 1}" tabindex="-1" aria-disabled="true">Previous</a>
            </li>`;

            // Simplified Page Numbers (max 5 visible pages to prevent overflow)
            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages, currentPage + 2);

            if (endPage - startPage < 4) {
                if (startPage === 1) endPage = Math.min(totalPages, startPage + 4);
                else if (endPage === totalPages) startPage = Math.max(1, endPage - 4);
            }

            if (startPage > 1) {
                html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
                if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }

            for (let i = startPage; i <= endPage; i++) {
                html += `<li class="page-item ${currentPage === i ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>`;
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
            }

            // Next Button
            html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
            </li>`;

            html += `</ul></nav>`;
            paginationContainer.innerHTML = html;

            // Attach event listeners
            paginationContainer.querySelectorAll('a.page-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = parseInt(e.target.dataset.page);
                    if (page && page >= 1 && page <= totalPages && page !== currentPage) {
                        renderPage(page);
                    }
                });
            });
        }

        // Initial render
        renderPage(1);
    }

    // ─────────────────────────────────────────────────────────────
    // AUTO TABLE PAGINATION
    // ─────────────────────────────────────────────────────────────
    /**
     * Automatically paginates all <tbody> listings in the app.
     * This keeps existing table rendering code intact and applies page controls
     * only when row count exceeds the configured page size.
     * @param {Object} [options]
     * @param {number} [options.pageSize=10] - Default rows per page.
     */
    function autoPaginateTables(options = {}) {
        const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : 10;
        const stateByTbody = new WeakMap();
        const controlsByTbody = new WeakMap();
        let scheduleTimer = null;

        function ensureControls(tbody) {
            const table = tbody.closest('table');
            if (!table) return null;

            const existing = controlsByTbody.get(tbody);
            if (existing && document.body.contains(existing)) return existing;

            const wrapper = document.createElement('div');
            wrapper.className = 'cb-auto-pagination mt-3 mb-3 d-flex justify-content-end w-100';
            if (tbody.id) wrapper.dataset.for = tbody.id;
            table.insertAdjacentElement('afterend', wrapper);
            controlsByTbody.set(tbody, wrapper);
            return wrapper;
        }

        function getRows(tbody) {
            return Array.from(tbody.children).filter((el) => el.tagName === 'TR');
        }

        function renderControls(controls, currentPage, totalPages, onPageChange) {
            if (totalPages <= 1) {
                controls.innerHTML = '';
                return;
            }

            let html = '<nav aria-label="Pagination"><ul class="pagination pagination-sm mb-0 justify-content-end">';
            html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a></li>`;

            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);
            for (let i = startPage; i <= endPage; i += 1) {
                html += `<li class="page-item ${currentPage === i ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
            }

            html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}">Next</a></li>`;
            html += '</ul></nav>';
            controls.innerHTML = html;

            controls.querySelectorAll('a.page-link').forEach((link) => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = Number(e.currentTarget.dataset.page);
                    if (page >= 1 && page <= totalPages && page !== currentPage) {
                        onPageChange(page);
                    }
                });
            });
        }

        function paginateTbody(tbody) {
            if (!tbody || tbody.dataset.cbPaginationManaged === 'manual') return;
            if (tbody.dataset.cbAutoPagination === 'off') return;

            const rows = getRows(tbody);
            if (rows.length === 0) return;

            const controls = ensureControls(tbody);
            if (!controls) return;

            const totalPages = Math.ceil(rows.length / pageSize);
            const prevState = stateByTbody.get(tbody);
            let currentPage = prevState && prevState.totalRows === rows.length ? prevState.currentPage : 1;
            currentPage = Math.min(Math.max(1, currentPage), Math.max(totalPages, 1));

            const applyPage = (page) => {
                currentPage = page;
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                rows.forEach((row, idx) => {
                    row.hidden = idx < start || idx >= end;
                });

                renderControls(controls, currentPage, totalPages, applyPage);
                stateByTbody.set(tbody, { currentPage, totalRows: rows.length });
            };

            if (totalPages <= 1) {
                rows.forEach((row) => { row.hidden = false; });
                controls.innerHTML = '';
                stateByTbody.set(tbody, { currentPage: 1, totalRows: rows.length });
                return;
            }

            applyPage(currentPage);
        }

        function scanAndApply() {
            scheduleTimer = null;
            document.querySelectorAll('tbody').forEach((tbody) => {
                paginateTbody(tbody);
            });
        }

        function scheduleScan() {
            if (scheduleTimer) return;
            scheduleTimer = window.setTimeout(scanAndApply, 60);
        }

        const observer = new MutationObserver(() => {
            scheduleScan();
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
            scheduleScan();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
                scheduleScan();
            }, { once: true });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Expose the CB.ui namespace
    // ─────────────────────────────────────────────────────────────
    window.CB.ui = {
        spinner,
        tableSpinner,
        btnLoading,
        btnRestore,
        empty,
        error,
        toast,
        badge,
        metric,
        ensureFieldStyles,
        standardizeFields,
        autoStandardizeFields,
        paginate,
        autoPaginateTables,
    };

    // ── Backward-compatibility aliases ──────────────────────────
    // Keep window.renderMetric working for any inline-HTML callers
    // that has not yet been migrated. They delegate to CB.ui.metric.
    window.renderMetric = function (container, label, value, colorClass) {
        CB.ui.metric(container, label, value, colorClass);
    };

    autoStandardizeFields(document);
    autoPaginateTables({ pageSize: 10 });

    console.log('[CB] cb_ui.js loaded — CB.ui ready');
})();
