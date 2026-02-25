/**
 * cb_perf.js — ClassBridge Performance Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Load this BEFORE script.js so its helpers are available globally.
 *
 * Provides:
 *   __awaiter / __rest — TypeScript runtime helpers (for compiled async code)
 *   window.loadPlotlyAndRender(callback) — lazy-loads Plotly 3.4MB on demand
 *   window.cachedFetchAPI(url, ttlMs)    — in-memory TTL cache for GET responses
 *   window.cbInvalidateCache(prefix)     — invalidate cached URLs by prefix
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── TypeScript Runtime Helpers ────────────────────────────────────────────────
// script.js is compiled from TypeScript; module files that contain async
// functions need __awaiter before script.js loads. Guard prevents redeclaration.

if (typeof __awaiter === 'undefined') {
    var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };
}

if (typeof __rest === 'undefined') {
    var __rest = (this && this.__rest) || function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    };
}

// ── Lazy Plotly Loader ────────────────────────────────────────────────────────
// Injects the Plotly CDN script the FIRST TIME a chart view is opened.
// Subsequent calls use the already-loaded window.Plotly immediately (0 ms).
// Multiple simultaneous callers are queued and all fire once the download ends.

window._plotlyLoading = false;
window._plotlyQueue = [];

window.loadPlotlyAndRender = function (callback) {
    if (window.Plotly) { callback(); return; }       // already loaded — instant

    window._plotlyQueue.push(callback);
    if (window._plotlyLoading) return;               // download already in flight

    window._plotlyLoading = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
    s.onload = () => {
        window._plotlyLoading = false;
        window._plotlyQueue.forEach(fn => { try { fn(); } catch (e) { console.error('[CB][Plotly]', e); } });
        window._plotlyQueue = [];
    };
    s.onerror = () => {
        console.error('[CB] Failed to load Plotly from CDN');
        window._plotlyLoading = false;
        window._plotlyQueue = [];
    };
    document.head.appendChild(s);
};


// ── Frontend API Response Cache ───────────────────────────────────────────────
// Prevents repeat roundtrips for identical GET requests within the same session.
// Data is considered fresh until ttlMs milliseconds have elapsed.
// Writes/mutations should call cbInvalidateCache() to bust stale entries.

window._cbApiCache = {};

/**
 * Drop-in replacement for fetchAPI() calls you want to cache.
 * @param {string} url    — API endpoint path (same format as fetchAPI)
 * @param {number} ttlMs  — milliseconds to keep the response fresh (default 30s)
 * @returns {Promise<any>} parsed JSON body
 */
window.cachedFetchAPI = async function (url, ttlMs = 30_000) {
    const now = Date.now();
    const cached = window._cbApiCache[url];
    if (cached && (now - cached.ts) < ttlMs) return cached.data;   // cache hit

    const res = await fetchAPI(url);
    if (!res.ok) throw new Error(`[CB] API error ${res.status} for ${url}`);
    const data = await res.json();
    window._cbApiCache[url] = { data, ts: now };
    return data;
};

/**
 * Invalidate all cache entries whose URL starts with the given prefix.
 * Call this after any mutation (POST/PUT/DELETE) that affects the resource.
 * @param {string} prefix — e.g. '/students/' to clear all student data
 */
window.cbInvalidateCache = function (prefix) {
    Object.keys(window._cbApiCache).forEach(k => {
        if (k.startsWith(prefix)) delete window._cbApiCache[k];
    });
};
