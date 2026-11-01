// Proof of the hairline look with no JavaScript: an isometric stack, drawn as static SVG,
// that answers hover through CSS alone. Run: node proof/iso-proof.mjs > proof/iso-proof.svg
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const OX = 360;
const OY = 320;
const pt = (x, y, z) => [OX + (x - y) * COS, OY + (x + y) * SIN - z];
const f = (n) => n.toFixed(1);

// A rounded rectangle on the ground plane, as a ring of points.
function ring(x, y, w, d, r) {
    const pts = [];
    const corners = [[x + w - r, y + r, -90], [x + w - r, y + d - r, 0], [x + r, y + d - r, 90], [x + r, y + r, 180]];
    for (const [cx, cy, start] of corners) {
        for (let a = 0; a <= 90; a += 30) {
            const t = ((start + a) * Math.PI) / 180;
            pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
        }
    }
    return pts;
}

function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
        const out = [];
        for (const q of list) {
            while (out.length > 1 && cross(out.at(-2), out.at(-1), q) <= 0) out.pop();
            out.push(q);
        }
        out.pop();
        return out;
    };
    return [...half(p), ...half([...p].reverse())];
}

const path = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

// A solid: its silhouette, then the top ring as the one crease.
function prism(x, y, z, w, d, h, r, cls = '') {
    const base = ring(x, y, w, d, r);
    const low = base.map(([a, b]) => pt(a, b, z));
    const top = base.map(([a, b]) => pt(a, b, z + h));
    return `<path class="sil" d="${path(hull([...low, ...top]))}"/><path class="crease ${cls}" d="${path(top)}"/>`;
}

const SIZE = 210;
const GAP = 78;
const layers = [
    { id: 'data', cap: 'data · Postgres keeps the orders; Redis answers repeat reads first', parts: [[22, 30, 70, 150, 26], [116, 30, 70, 62, 16], [116, 118, 70, 62, 16]] },
    { id: 'services', cap: 'services · auth signs tokens; orders holds the business rules', parts: [[22, 30, 76, 150, 20], [112, 30, 76, 150, 20]] },
    { id: 'gateway', cap: 'gateway · checks the token locally, then routes the request', parts: [[30, 92, 150, 26, 14]] },
    { id: 'client', cap: 'client · the browser sends the request with its cookie', parts: [[30, 34, 150, 12, 4], [30, 60, 104, 12, 4], [30, 86, 128, 12, 4]] },
];

const zOf = (i) => i * GAP;
const groups = layers.map((l, i) => {
    const z = zOf(i);
    const body = l.parts.map(([x, y, w, d, h]) => prism(x, y, z + 6, w, d, h, 5)).join('');
    return `<g class="layer l${i}">${prism(0, 0, z, SIZE, SIZE, 6, 14, 'plate')}${body}</g>`;
});

// Hit areas stay at the rest pose, so a part moving never moves its target.
const hits = layers.map((l, i) => {
    const z = zOf(i);
    const pts = hull(ring(0, 0, SIZE, SIZE, 14).flatMap(([a, b]) => [pt(a, b, z), pt(a, b, z + 40)]));
    return `<path class="hit h${i}" d="${path(pts)}"/>`;
});

const caps = layers.map((l, i) => `<text class="cap c${i}" x="360" y="584">${l.cap}</text>`);

// One rule per layer: it lifts, what is above opens further, what is below settles, nearest first.
const rules = layers.flatMap((_, k) =>
    layers.map((_, i) => {
        const shift = i > k ? -34 - (i - k) * 8 : i === k ? -16 : 10 * (k - i);
        return `svg:has(.h${k}:hover) .l${i}{transform:translateY(${shift}px);transition-delay:${Math.abs(i - k) * 45}ms}`;
    }),
).join('');
const lit = layers.map((_, k) => `svg:has(.h${k}:hover) .l${k} .plate{stroke:var(--hi);stroke-width:1.4}svg:has(.h${k}:hover) .c${k}{opacity:1}svg:has(.h${k}:hover) .rest{opacity:0}`).join('');

const rails = [[0, 0], [SIZE, 0], [0, SIZE], [SIZE, SIZE]].map(([x, y]) => {
    const [a, b] = pt(x, y, 0);
    const [, c] = pt(x, y, zOf(3));
    return `<path class="rail" d="M${f(a)} ${f(b)}L${f(a)} ${f(c)}"/>`;
});

const [ax, ay] = pt(SIZE / 2, SIZE / 2, zOf(3) + 20);
const [, by] = pt(SIZE / 2, SIZE / 2, zOf(0) + 30);

console.log(`<svg viewBox="0 0 720 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A web app as four stacked layers: client, gateway, services, data">
<style>
svg{--bg:#fbfbfa;--edge:#71717a;--mid:#a1a1aa;--lo:#d4d4d8;--hi:#18181b;--acc:#2563eb}
@media (prefers-color-scheme:dark){svg{--bg:#08090a;--edge:#a1a1aa;--mid:#52525b;--lo:#27272a;--hi:#fafafa;--acc:#60a5fa}}
.bg{fill:var(--bg)}
.sil{fill:var(--bg);stroke:var(--edge);stroke-width:.9;stroke-linejoin:round}
.crease{fill:none;stroke:var(--mid);stroke-width:.9;stroke-linejoin:round;transition:stroke .25s}
.rail{stroke:var(--lo);stroke-width:.9;stroke-dasharray:2 4}
.layer{transition:transform .5s cubic-bezier(.2,.9,.25,1.15)}
.hit{fill:transparent;cursor:pointer}
.cap{font:12.5px ui-monospace,Consolas,monospace;fill:var(--edge);text-anchor:middle;opacity:0;transition:opacity .2s}
.rest{opacity:1}
.dot{fill:var(--acc)}
${rules}${lit}
</style>
<rect class="bg" width="720" height="600"/>
${rails.join('')}
${groups.join('\n')}
<circle class="dot" r="2.6"><animateMotion dur="4.5s" repeatCount="indefinite" path="M${f(ax)} ${f(ay)}L${f(ax)} ${f(by)}" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear"/></circle>
${hits.join('')}
<text class="cap rest" x="360" y="584">a request, top to bottom · hover a layer</text>
${caps.join('')}
</svg>`);
