// Proof of digging with no JavaScript: three levels, opened by click through CSS :focus-within.
// Run: node proof/iso-dig.mjs > proof/iso-dig.svg
const COS = Math.cos(Math.PI / 6);
const f = (n) => n.toFixed(1);
const iso = (ox, oy) => (x, y, z) => [ox + (x - y) * COS, oy + (x + y) * 0.5 - z];

function ring(x, y, w, d, r) {
    const corners = [[x + w - r, y + r, -90], [x + w - r, y + d - r, 0], [x + r, y + d - r, 90], [x + r, y + r, 180]];
    return corners.flatMap(([cx, cy, s]) =>
        [0, 30, 60, 90].map((a) => [cx + r * Math.cos(((s + a) * Math.PI) / 180), cy + r * Math.sin(((s + a) * Math.PI) / 180)]),
    );
}

function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (l) => {
        const out = [];
        for (const q of l) {
            while (out.length > 1 && cross(out.at(-2), out.at(-1), q) <= 0) out.pop();
            out.push(q);
        }
        out.pop();
        return out;
    };
    return [...half(p), ...half([...p].reverse())];
}

const path = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function prism(P, x, y, z, w, d, h, r, cls = '') {
    const base = ring(x, y, w, d, r);
    const low = base.map(([a, b]) => P(a, b, z));
    const top = base.map(([a, b]) => P(a, b, z + h));
    const outline = path(hull([...low, ...top]));
    return { d: outline, svg: `<path class="sil" d="${outline}"/><path class="crease ${cls}" d="${path(top)}"/>` };
}

const LAYERS = [
    { name: 'storage', cap: 'What survives: the notebook on disk, and one setting', parts: [
        { name: 'cells.json', cap: 'The working copy of the notebook, one file per session', steps: [
            ['cells', 'Every cell: title, Markdown, SVG, Typst source, params, hover marks'],
            ['pending', 'Clicks and answers Claude has not read yet'],
            ['resume', 'Read back at session start, so a resumed session keeps its notebook'] ] },
        { name: 'index.html', cap: 'The same notebook as one file a browser can open', steps: [
            ['one file', 'All cells inline, nothing to serve or install'],
            ['sandbox', 'Each drawing sits in a frame with no scripts'],
            ['CSP', 'default-src none: the page can load nothing from the network'] ] },
        { name: '$.store', cap: 'Settings that outlive a session, kept by Claude Code', steps: [
            ['follow', 'Whether follow-along is on, for every session'] ] } ] },
    { name: 'drawing', cap: 'Turns what Claude wrote into a picture', parts: [
        { name: 'Typst', cap: 'Compiles a Typst cell to SVG, in about a second', steps: [
            ['private root', 'A folder holding only this source, so it cannot read other files'],
            ['compile', 'typst compile writes out.svg; the first run downloads the packages'],
            ['query marks', 'typst eval lists each hot() mark with its position'],
            ['hover areas', 'Invisible rects with tooltips are added to the SVG'] ] },
        { name: 'fork', cap: 'The follow-along illustrator: a copy of the conversation', steps: [
            ['$.model.fork', 'Resends the conversation, mostly from the prompt cache'],
            ['tagged reply', 'TITLE, REPLACES, ALT, NOTE, then the drawing'],
            ['SKIP', 'Small talk and short answers draw nothing'],
            ['REPLACES', 'A topic already drawn is updated, not drawn twice'] ] },
        { name: 'params', cap: 'Dropdowns that redraw at once, with no model call', steps: [
            ['Select', 'The pane shows each param as a dropdown'],
            ['--input', 'The new value reaches the source through sys.inputs'],
            ['recompile', 'Only Typst runs; Claude hears of it with the next message'] ] } ] },
    { name: 'hooks', cap: 'Where the mod plugs into Claude Code', parts: [
        { name: 'tool.call', cap: 'Claude calls add_cell', steps: [
            ['validate', 'A bad cell comes back with a reason Claude can fix'],
            ['compile', 'Typst cells go through the drawing layer first'],
            ['place', 'Save, open the pane, tell Claude where the cell is'] ] },
        { name: 'prompt.submit', cap: 'Your clicks travel with your next message', steps: [
            ['read queue', 'Takes the pending clicks and answers'],
            ['context', 'Added as text only Claude reads; your message looks unchanged'],
            ['clear', 'The queue empties, so nothing is said twice'] ] },
        { name: 'turn.complete', cap: 'Decides whether the last answer deserves a drawing', steps: [
            ['gate', 'At least 300 characters or 20 seconds, on the main loop only'],
            ['skip', 'Not when Claude already drew, or a drawing is in progress'],
            ['background', 'Not awaited, so your next prompt never waits'] ] },
        { name: 'ui.render', cap: 'Claude Code asks what to draw in the pane', steps: [
            ['newest first', 'The latest cell is in view'],
            ['Svg', 'Interactive frame in Desktop; a text description in the terminal'],
            ['controls', 'Buttons, dropdowns and a text field that queue events'] ] } ] },
    { name: 'surfaces', cap: 'Where you see it', parts: [
        { name: 'pane', cap: 'Beside the conversation, drawn by Claude Code itself', steps: [
            ['Markdown', 'The text of a cell'],
            ['Svg', 'A sandboxed frame: hover and CSS work, scripts do not'],
            ['controls', 'What you click here reaches Claude'] ] },
        { name: 'browser', cap: 'The HTML copy, from /nb-html', steps: [
            ['same cells', 'Read-only: clicks here do not reach Claude yet'],
            ['anywhere', 'The planned Worker would open it from any device'] ] },
        { name: 'terminal', cap: 'The pane works, but it has no Svg element', steps: [
            ['description', 'A drawing shows as its alt text'],
            ['/nb-html', 'Prints the path of the HTML copy'] ] } ] },
];

const W = 720;
const H = 640;
let n = 0;
const css = [];
const capsOut = [];
const hover = (cls, text) => {
    const id = `t${n++}`;
    capsOut.push(`<text class="cap ${id}" x="360" y="${H - 34}">${esc(text)}</text>`);
    css.push(`svg:has(.${cls}:hover) .${id}{opacity:1}`);
};

const P0 = iso(360, 300);
const SIZE = 190;
const GAP = 66;
const zOf = (i) => i * GAP;

const stack = LAYERS.map((l, i) => {
    const z = zOf(i);
    const cell = (SIZE - 28) / l.parts.length;
    const parts = l.parts.map((_, j) => prism(P0, 14 + j * cell + 5, 34, z + 6, cell - 10, 122, 14 + (j % 2) * 8, 4).svg).join('');
    const [lx, ly] = P0(SIZE, 0, z);
    return `<g class="layer l${i}">${prism(P0, 0, 0, z, SIZE, SIZE, 6, 13, 'plate').svg}${parts}<path class="lead" d="M${f(lx + 8)} ${f(ly)}H${f(lx + 34)}"/><text class="name" x="${f(lx + 40)}" y="${f(ly + 4)}">${l.name}</text></g>`;
});

const P1 = iso(360, 170);
const P2 = iso(300, 150);
const STEP = 170;

const zones = LAYERS.map((l, i) => {
    hover(`h${i}`, l.cap);
    const z = zOf(i);
    const hitShape = hull(ring(0, 0, SIZE, SIZE, 13).flatMap(([a, b]) => [P0(a, b, z), P0(a, b, z + 34)]));
    const size = 330;
    const count = l.parts.length;
    const cols = count === 4 ? 2 : count;
    const rows = Math.ceil(count / cols);
    const cw = (size - 36) / cols;
    const cd = (size - 36) / rows;
    const parts = l.parts.map((p, j) => {
        const key = `p${i}-${j}`;
        hover(key, `${p.cap} · click to open`);
        const x = 18 + (j % cols) * cw + 8;
        const y = 18 + Math.floor(j / cols) * cd + 8;
        const solid = prism(P1, x, y, 8, cw - 16, cd - 16, 34, 7);
        const [tx, ty] = P1(x + (cw - 16) / 2, y + (cd - 16) / 2, 42);
        const steps = p.steps.map(([name, cap], s) => {
            const key2 = `s${i}-${j}-${s}`;
            hover(key2, cap);
            const zz = (p.steps.length - 1 - s) * 62;
            const plate = prism(P2, 0, 0, zz, STEP, STEP, 6, 11);
            const [nx, ny] = P2(STEP, 0, zz);
            const top = hull(ring(0, 0, STEP, STEP, 11).flatMap(([a, b]) => [P2(a, b, zz), P2(a, b, zz + 30)]));
            return `<g class="step ${key2}"><g class="lift">${plate.svg}<path class="lead" d="M${f(nx + 8)} ${f(ny)}H${f(nx + 30)}"/><text class="name" x="${f(nx + 36)}" y="${f(ny + 4)}">${s + 1}  ${esc(name)}</text></g><path class="shit" d="${path(top)}"/></g>`;
        }).reverse().join('');
        return `<g class="part" tabindex="0"><g class="body">${solid.svg}<text class="pname" x="${f(tx)}" y="${f(ty + 4)}">${esc(p.name)}</text></g><path class="phit ${key}" d="${solid.d}"/><g class="detail">${steps}</g></g>`;
    }).join('');
    return `<g class="zone z${i}" tabindex="0"><path class="hit h${i}" d="${path(hitShape)}"/><g class="view"><rect class="vbg" width="${W}" height="${H - 60}"/>${prism(P1, 0, 0, 0, size, size, 8, 16, 'plate').svg}<g class="partlist">${parts}</g></g></g>`;
});

const rules = LAYERS.flatMap((_, k) => LAYERS.map((_, i) => {
    const shift = i > k ? -30 - (i - k) * 6 : i === k ? -12 : 8 * (k - i);
    const away = i > k ? -260 : i === k ? 0 : 260;
    return `svg:has(.h${k}:hover) .l${i}{transform:translateY(${shift}px);transition-delay:${Math.abs(i - k) * 40}ms}svg:has(.z${k}:focus-within) .l${i}{transform:translateY(${away}px);opacity:0}`;
}));
const lit = LAYERS.map((_, k) => `svg:has(.h${k}:hover) .l${k} .plate{stroke:var(--hi);stroke-width:1.4}`);
const crumbs = LAYERS.map((l, k) => `<text class="crumb cz${k}" x="24" y="34">cc-notebook / ${l.name}</text>`);
css.push(...LAYERS.map((_, k) => `svg:has(.z${k}:focus-within) .cz${k}{opacity:1}`));

const STYLE = `
svg{--bg:#fbfbfa;--edge:#71717a;--mid:#a1a1aa;--lo:#d4d4d8;--hi:#18181b;--acc:#2563eb}
@media (prefers-color-scheme:dark){svg{--bg:#08090a;--edge:#a1a1aa;--mid:#52525b;--lo:#27272a;--hi:#fafafa;--acc:#60a5fa}}
*:focus{outline:none}
.bg{fill:var(--bg)}
.sil{fill:var(--bg);stroke:var(--edge);stroke-width:.9;stroke-linejoin:round}
.crease{fill:none;stroke:var(--mid);stroke-width:.9;stroke-linejoin:round;transition:stroke .2s}
.layer{transition:transform .5s cubic-bezier(.2,.9,.25,1.1),opacity .35s}
.lead{fill:none;stroke:var(--mid);stroke-width:.9;stroke-dasharray:2 3}
text{font-family:ui-monospace,Consolas,monospace;pointer-events:none}
.name{font-size:12px;fill:var(--edge)}
.pname{font-size:12px;fill:var(--edge);text-anchor:middle}
.cap{font-size:12.5px;fill:var(--edge);text-anchor:middle;opacity:0;transition:opacity .15s}
.hint{font-size:11.5px;fill:var(--mid);text-anchor:middle;opacity:0;transition:opacity .2s}
.crumb{font-size:12.5px;fill:var(--hi);opacity:0;transition:opacity .2s}
.back{font-size:12.5px;fill:var(--acc);opacity:0;visibility:hidden;pointer-events:auto;cursor:pointer}
.hit{fill:transparent;cursor:pointer}
.view{visibility:hidden;opacity:0;transition:opacity .25s,visibility 0s .25s}
.zone:focus-within>.view{visibility:visible;opacity:1;transition:opacity .35s .12s}
.vbg{fill:transparent}
svg:has(.zone:focus-within) .hit{pointer-events:none}
svg:has(.zone:focus-within) .back{opacity:1;visibility:visible}
.body{transition:transform .3s cubic-bezier(.2,.9,.25,1.1),opacity .25s}
.phit{fill:transparent;cursor:pointer}
.part:has(.phit:hover) .body{transform:translateY(-9px)}
.part:has(.phit:hover) .body .crease{stroke:var(--hi)}
.partlist:has(.part:focus-within) .body{opacity:.1}
.partlist:has(.part:focus-within) .phit{pointer-events:none}
.view:has(.part:focus-within)>.sil,.view:has(.part:focus-within)>.crease{opacity:.12;transition:opacity .25s}
.detail{visibility:hidden;opacity:0;transition:opacity .2s,visibility 0s .2s}
.part:focus-within .detail{visibility:visible;opacity:1;transition:opacity .35s .1s}
.lift{transition:transform .3s cubic-bezier(.2,.9,.25,1.1)}
.shit{fill:transparent;cursor:help}
.step:has(.shit:hover) .lift{transform:translateY(-8px)}
.step:has(.shit:hover) .crease{stroke:var(--acc);stroke-width:1.4}
.h-top{opacity:1}
svg:has(.zone:focus-within) .h-top{opacity:0}
svg:has(.zone:focus-within) .h-layer{opacity:1}
svg:has(.part:focus-within) .h-layer{opacity:0}
svg:has(.part:focus-within) .h-part{opacity:1}
${rules.join('')}${lit.join('')}${css.join('')}`;

console.log(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How cc-notebook works, as layers you can open">
<style>${STYLE}
</style>
<rect class="bg" width="${W}" height="${H}"/>
<g>${stack.join('\n')}</g>
${zones.join('\n')}
<text class="hint h-top" x="360" y="${H - 14}">hover a layer · click to open it</text>
<text class="hint h-layer" x="360" y="${H - 14}">hover a part · click to open it</text>
<text class="hint h-part" x="360" y="${H - 14}">hover a step · click empty space to go back up</text>
${crumbs.join('')}
<text class="back" x="${W - 24}" y="34" text-anchor="end">back to all layers</text>
${capsOut.join('')}
</svg>`);
