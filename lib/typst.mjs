// Typst cells: the source Claude writes, the preamble the mod puts before it, and the hover
// marks added to the SVG Typst makes. Running Typst is the mod's job; this file is pure.

export const PACKAGES = {
    fletcher: '@preview/fletcher:0.5.8',
    cetz: '@preview/cetz:0.5.2',
    cetzPlot: '@preview/cetz-plot:0.1.4',
};

// Typst writes fixed colors, so these are the light theme; themedSvg swaps them for dark.
export const PREAMBLE = `#set page(width: 720pt, height: auto, margin: 14pt, fill: white)
#set text(size: 12pt, fill: rgb("#1f2328"), font: ("Segoe UI", "Helvetica Neue", "Arial", "DejaVu Sans", "Libertinus Serif"))
#let theme = (
  fg: rgb("#1f2328"), muted: rgb("#59636e"), border: rgb("#d1d9e0"), bg: white,
  blue: rgb("#0969da"), orange: rgb("#bc4c00"), green: rgb("#1a7f37"),
  red: rgb("#cf222e"), purple: rgb("#8250df"), yellow: rgb("#9a6700"),
  palette: (rgb("#0969da"), rgb("#bc4c00"), rgb("#1a7f37"), rgb("#cf222e"), rgb("#8250df"), rgb("#9a6700")),
  width: 692pt,
)
#let param(name, default) = sys.inputs.at(name, default: default)
#let hot(id, tip, body) = context {
  let size = measure(body)
  let at = here().position()
  [#metadata((id: id, tip: tip, x: at.x.pt(), y: at.y.pt(), w: size.width.pt(), h: size.height.pt()))<hot>#body]
}
`;

export const HOTSPOT_QUERY = 'query(<hot>).map(it => it.value)';

// Refuses what would break the one-page layout; file reads fail anyway in the private root.
export function checkTypstBody(body) {
    const src = String(body ?? '');
    if (!src.trim()) {
        return 'typst is empty';
    }
    if (/#\s*(set\s+page|page\s*\(|pagebreak)/.test(src)) {
        return '#page, #set page and #pagebreak are not allowed: the notebook sets the page';
    }
    return null;
}

export function typstSource(body) {
    return `${PREAMBLE}\n${String(body)}\n`;
}

// Parameters the pane shows as dropdowns. Each value reaches the source through param(name, default).
export function cleanParams(params) {
    if (!Array.isArray(params)) {
        return [];
    }
    return params
        .map((p) => {
            const name = String(p?.name ?? '').trim();
            const options = Array.isArray(p?.options) ? p.options.map((o) => String(o)).filter(Boolean).slice(0, 12) : [];
            if (!/^[A-Za-z][\w-]{0,31}$/.test(name) || options.length < 2) {
                return null;
            }
            const value = options.includes(String(p.value)) ? String(p.value) : options[0];
            return { name, label: String(p.label ?? name).trim() || name, options, value };
        })
        .filter(Boolean)
        .slice(0, 4);
}

export function inputArgs(params) {
    return params.flatMap((p) => ['--input', `${p.name}=${p.value}`]);
}

// The JSON Typst prints for HOTSPOT_QUERY, cleaned; duplicates of one id keep the first.
export function parseHotspots(json) {
    let list;
    try {
        list = JSON.parse(json);
    } catch {
        return [];
    }
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
        .filter((h) => {
            const ok = h && typeof h.id === 'string' && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(h[k]));
            if (!ok || seen.has(h.id)) {
                return false;
            }
            seen.add(h.id);
            return true;
        })
        .map((h) => {
            return { id: h.id, tip: String(h.tip ?? h.id), x: h.x, y: h.y, w: h.w, h: h.h };
        });
}

const escapeXml = (s) => {
    return String(s).replace(/[&<>"]/g, (ch) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
};

// Invisible areas over each marked part: a tooltip from <title>, and a highlight on hover.
// Typst's SVG is in points, as the positions are, so they need no scaling.
export function addHotspots(svg, hotspots, pad = 7) {
    if (!hotspots.length) {
        return svg;
    }
    const rects = hotspots
        .map((h) => {
            const x = (h.x - pad).toFixed(1);
            const y = (h.y - pad).toFixed(1);
            const w = (h.w + pad * 2).toFixed(1);
            const hh = (h.h + pad * 2).toFixed(1);
            return `<rect class="nb-hot" x="${x}" y="${y}" width="${w}" height="${hh}" rx="5"><title>${escapeXml(h.tip)}</title></rect>`;
        })
        .join('');
    const style =
        '<style>.nb-hot{fill:#0969da;fill-opacity:0;stroke:#0969da;stroke-opacity:0;stroke-width:1.5;cursor:help}' +
        '.nb-hot:hover{fill-opacity:.12;stroke-opacity:.9}</style>';
    return svg.replace(/<\/svg>\s*$/, `${style}<g class="nb-hots">${rects}</g></svg>`);
}

// Each color the preamble uses, and its dark counterpart. Black is Typst's default stroke.
const DARK_COLORS = {
    '#ffffff': '#0d1117',
    '#000000': '#e6edf3',
    '#1f2328': '#e6edf3',
    '#59636e': '#9198a1',
    '#d1d9e0': '#3d444d',
    '#0969da': '#4493f8',
    '#bc4c00': '#f0883e',
    '#1a7f37': '#3fb950',
    '#cf222e': '#f85149',
    '#8250df': '#a371f7',
    '#9a6700': '#d29922',
};

// Typst's fixed colors, restyled by attribute: under a dark media rule for 'auto', so one drawing
// follows the system, or directly for 'dark', because a frame's media query cannot be forced.
export function themedSvg(svg, theme = 'auto') {
    if (svg.includes('nb-theme') || theme === 'light') {
        return svg;
    }
    const rules = Object.entries(DARK_COLORS)
        .map(([light, dark]) => `[fill="${light}"]{fill:${dark}}[stroke="${light}"]{stroke:${dark}}`)
        .join('');
    const css = theme === 'dark' ? rules : `@media (prefers-color-scheme:dark){${rules}}`;
    return svg.replace(/<\/svg>\s*$/, `<style class="nb-theme">${css}</style></svg>`);
}

// The short name of a marked part, for buttons and dropdowns: the tip up to its first colon.
export function hotspotName(h) {
    const head = h.tip.split(':')[0].trim();
    return head && head.length <= 40 ? head : h.id;
}
