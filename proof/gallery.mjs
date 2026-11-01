// A gallery of what the notebook should produce for software work: one form per kind of content,
// all in one style, with CSS hover and no scripts. The data in the examples is made up.
// Run: node proof/gallery.mjs > proof/gallery.html
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const f = (n) => Number(n).toFixed(1);

let uid = 0;
const css = [];

function canvas(H = 340) {
    const parts = [];
    const caps = [];
    const c = {
        add: (s) => parts.push(s),
        // Marks a shape as hoverable, with a line of explanation under the drawing.
        hot(cap) {
            const id = uid++;
            caps.push(`<text class="cap c${id}" x="320" y="${H - 10}">${esc(cap)}</text>`);
            css.push(`svg:has(.h${id}:hover) .c${id}{opacity:1}`);
            return `hot h${id}`;
        },
        text: (x, y, s, cls = 'lb', anchor = 'start') => parts.push(`<text class="${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${esc(s)}</text>`),
        box(x, y, w, h, label, { cap, cls = '', sub } = {}) {
            const hot = cap ? c.hot(cap) : '';
            const name = sub
                ? `<text class="lb" x="${f(x + w / 2)}" y="${f(y + h / 2 - 3)}" text-anchor="middle">${esc(label)}</text><text class="sm" x="${f(x + w / 2)}" y="${f(y + h / 2 + 12)}" text-anchor="middle">${esc(sub)}</text>`
                : `<text class="lb" x="${f(x + w / 2)}" y="${f(y + h / 2 + 4)}" text-anchor="middle">${esc(label)}</text>`;
            parts.push(`<g class="${hot}"><rect class="node ${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="7"/>${name}</g>`);
        },
        arrow(x1, y1, x2, y2, { label, cls = '', dashed, lx, ly } = {}) {
            const a = Math.atan2(y2 - y1, x2 - x1);
            const s = 7;
            const hx1 = x2 - s * Math.cos(a - 0.42);
            const hy1 = y2 - s * Math.sin(a - 0.42);
            const hx2 = x2 - s * Math.cos(a + 0.42);
            const hy2 = y2 - s * Math.sin(a + 0.42);
            parts.push(`<path class="wire ${cls} ${dashed ? 'dash' : ''}" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/><path class="wire ${cls}" d="M${f(hx1)} ${f(hy1)}L${f(x2)} ${f(y2)}L${f(hx2)} ${f(hy2)}"/>`);
            if (label) {
                parts.push(`<text class="sm" x="${f(lx ?? (x1 + x2) / 2)}" y="${f(ly ?? (y1 + y2) / 2 - 6)}" text-anchor="middle">${esc(label)}</text>`);
            }
        },
        svg: (alt) => `<svg viewBox="0 0 640 ${H}" role="img" aria-label="${esc(alt)}">${parts.join('')}${caps.join('')}</svg>`,
    };
    return c;
}

function sequence() {
    const c = canvas(350);
    const actors = [['browser', 80], ['gateway', 240], ['auth', 400], ['redis', 560]];
    for (const [name, x] of actors) {
        c.box(x - 46, 16, 92, 30, name);
        c.add(`<path class="life" d="M${x} 46V306"/>`);
    }
    const msg = (x1, x2, y, label, cap, cls) => {
        const hot = c.hot(cap);
        c.add(`<g class="${hot}"><rect class="zone" x="${Math.min(x1, x2) - 4}" y="${y - 20}" width="${Math.abs(x2 - x1) + 8}" height="28"/>`);
        c.arrow(x1, y, x2, y, { label, cls, dashed: x2 < x1 });
        c.add('</g>');
    };
    msg(80, 240, 80, 'GET /orders', 'The access token in the cookie has expired', '');
    msg(240, 400, 118, 'refresh(token)', 'The gateway refreshes without bothering the browser', '');
    msg(400, 560, 156, 'GET jti', 'The refresh token is checked against the revoked list', '');
    msg(560, 400, 194, 'not revoked', 'A hit here would end the session', '');
    msg(400, 240, 232, 'new JWT', 'A new access token, and a rotated refresh token', 'acc');
    msg(240, 80, 270, '200 + Set-Cookie', 'The original request succeeds; the user never noticed', '');
    return c.svg('Sequence of a silent token refresh');
}

function flow() {
    const c = canvas(300);
    c.box(16, 70, 76, 40, 'push', { cap: 'Every push to a branch starts this' });
    c.box(124, 70, 76, 40, 'lint', { cap: 'ESLint and tsc, about 40 seconds' });
    c.box(232, 70, 76, 40, 'test', { cap: 'Unit tests in parallel, about 4 minutes' });
    c.box(340, 70, 76, 40, 'build', { cap: 'Docker image, tagged with the commit' });
    c.add('<path class="node" d="M448 90L490 62L532 90L490 118Z"/><text class="sm" x="490" y="94" text-anchor="middle">main?</text>');
    c.box(550, 70, 78, 40, 'deploy', { cap: 'Rolling deploy to production', cls: 'on' });
    c.box(232, 186, 76, 40, 'notify', { cap: 'A failed job posts to the PR and stops the run' });
    c.box(452, 186, 76, 40, 'preview', { cap: 'Other branches get a preview URL' });
    c.arrow(92, 90, 124, 90);
    c.arrow(200, 90, 232, 90);
    c.arrow(308, 90, 340, 90);
    c.arrow(416, 90, 448, 90);
    c.arrow(532, 90, 550, 90, { label: 'yes', lx: 538, ly: 62 });
    c.arrow(490, 118, 490, 186, { label: 'no', lx: 506, ly: 156 });
    c.arrow(162, 110, 248, 186, { dashed: true, label: 'fail', lx: 188, ly: 156 });
    c.arrow(270, 110, 270, 186, { dashed: true, label: 'fail', lx: 288, ly: 156 });
    return c.svg('CI pipeline with its branches');
}

function state() {
    const c = canvas(300);
    c.box(20, 110, 96, 40, 'draft', { cap: 'Not ready; reviewers are not notified' });
    c.box(170, 110, 96, 40, 'open', { cap: 'Waiting for review and for CI' });
    c.box(330, 30, 130, 40, 'changes asked', { cap: 'A reviewer blocked it; a new push goes back to open' });
    c.box(330, 190, 130, 40, 'approved', { cap: 'A new push can reset this, depending on branch rules' });
    c.box(530, 190, 94, 40, 'merged', { cap: 'Final', cls: 'on' });
    c.box(530, 30, 94, 40, 'closed', { cap: 'Final, but it can be reopened' });
    c.arrow(116, 130, 170, 130, { label: 'ready' });
    c.arrow(256, 110, 330, 68, { label: 'review', lx: 322, ly: 98 });
    c.arrow(330, 44, 212, 110, { label: 'push', lx: 250, ly: 62, dashed: true });
    c.arrow(250, 150, 330, 208, { label: 'approve', lx: 262, ly: 192 });
    c.arrow(460, 210, 530, 210, { label: 'merge' });
    c.arrow(460, 50, 530, 50, { label: 'close' });
    return c.svg('Pull request lifecycle');
}

function architecture() {
    const c = canvas(330);
    c.box(20, 130, 90, 40, 'web', { cap: 'Next.js storefront' });
    c.box(150, 130, 90, 40, 'gateway', { cap: 'Auth and routing; it owns no data' });
    c.box(290, 50, 100, 40, 'orders', { cap: 'Owns the order state' });
    c.box(290, 130, 100, 40, 'payments', { cap: 'Talks to Stripe; idempotent by order id' });
    c.box(290, 210, 100, 40, 'catalog', { cap: 'Read-heavy, served through the cache' });
    c.box(440, 50, 84, 40, 'kafka', { cap: 'order.placed fans out to everything downstream', cls: 'on' });
    c.box(556, 50, 72, 40, 'email', { cap: 'A consumer: sends the receipt' });
    c.box(440, 130, 84, 40, 'stripe', { cap: 'External', cls: 'ext' });
    c.box(440, 210, 84, 40, 'redis', { cap: 'Read-through cache, 60 second TTL' });
    c.box(556, 210, 72, 40, 'pg', { cap: 'Primary database' });
    c.arrow(110, 150, 150, 150);
    c.arrow(240, 142, 290, 80);
    c.arrow(240, 150, 290, 150);
    c.arrow(240, 158, 290, 222);
    c.arrow(390, 70, 440, 70);
    c.arrow(524, 70, 556, 70);
    c.arrow(390, 150, 440, 150);
    c.arrow(390, 230, 440, 230);
    c.arrow(524, 230, 556, 230, { dashed: true, label: 'miss', ly: 220 });
    return c.svg('Services behind a checkout');
}

function isometric() {
    const c = canvas(372);
    const pt = (x, y, z) => [250 + (x - y) * 0.866, 76 + (x + y) * 0.5 - z];
    const plate = (x, y, z, w, d, h, cap, cls = '') => {
        const hot = cap ? c.hot(cap) : '';
        const q = (a, b, zz) => pt(a, b, zz).map(f).join(' ');
        const top = `M${q(x, y, z + h)}L${q(x + w, y, z + h)}L${q(x + w, y + d, z + h)}L${q(x, y + d, z + h)}Z`;
        const side = `M${q(x, y + d, z + h)}L${q(x, y + d, z)}L${q(x + w, y + d, z)}L${q(x + w, y, z)}L${q(x + w, y, z + h)}L${q(x + w, y + d, z + h)}Z`;
        c.add(`<g class="${hot}"><path class="node ${cls}" d="${side}"/><path class="node ${cls}" d="${top}"/></g>`);
    };
    plate(0, 0, 0, 250, 250, 8, 'The cluster: control plane plus two nodes');
    plate(14, 14, 8, 104, 222, 8, 'A node: one machine; pods are scheduled onto it');
    plate(132, 14, 8, 104, 222, 8, 'A second node: losing it reschedules its pods');
    // Back to front, so nearer solids cover farther ones.
    const pods = [[26, 26], [144, 26], [26, 92], [144, 92], [26, 158]];
    pods.forEach(([x, y], i) => {
        const open = i === 3;
        plate(x, y, 16, 80, 54, 6, open ? 'This pod holds the app and a log sidecar, which share a network' : 'A pod: the unit that gets scheduled', open ? 'on' : '');
        if (open) {
            plate(x + 8, y + 8, 22, 28, 38, 20, 'A container: the app process');
            plate(x + 44, y + 8, 22, 28, 38, 12, 'A container: the log sidecar');
        }
    });
    const names = [['cluster', 'the whole system'], ['node', 'a machine'], ['pod', 'scheduled together'], ['container', 'one process']];
    names.forEach(([a, b], i) => {
        c.text(484, 92 + i * 44, a, 'lb');
        c.text(484, 108 + i * 44, b, 'sm');
    });
    return c.svg('Kubernetes containment: cluster, node, pod, container');
}

function chart() {
    const c = canvas(300);
    const pts = [210, 214, 205, 220, 216, 212, 390, 455, 440, 300, 226, 214, 208, 212];
    const x = (i) => 64 + i * 42;
    const y = (v) => 240 - (v / 500) * 200;
    for (const v of [0, 250, 500]) {
        c.add(`<path class="grid" d="M60 ${f(y(v))}H620"/>`);
        c.text(52, y(v) + 4, `${v} ms`, 'sm', 'end');
    }
    c.add(`<path class="line" d="M${pts.map((v, i) => `${f(x(i))} ${f(y(v))}`).join('L')}"/>`);
    c.add(`<path class="mark" d="M${x(5.5)} 34V240"/>`);
    c.text(x(5.5) + 6, 44, 'deploy 14:02', 'sm');
    c.add(`<path class="mark" d="M${x(9.5)} 34V240"/>`);
    c.text(x(9.5) + 6, 44, 'rollback 14:21', 'sm');
    pts.forEach((v, i) => {
        const hot = c.hot(`14:${String(i * 4).padStart(2, '0')} · p95 ${v} ms`);
        c.add(`<g class="${hot}"><rect class="zone" x="${x(i) - 21}" y="30" width="42" height="212"/><circle class="pt" cx="${x(i)}" cy="${f(y(v))}" r="3"/></g>`);
    });
    return c.svg('p95 latency around a bad deploy and its rollback');
}

function timeline() {
    const c = canvas(240);
    const events = [
        [40, '14:02', 'deploy', 'v2.31 rolls out'],
        [150, '14:09', 'alert', 'p95 over 400 ms pages on-call'],
        [260, '14:14', 'found', 'New query misses an index'],
        [370, '14:21', 'rollback', 'Back on v2.30'],
        [480, '14:27', 'recovered', 'p95 back under 220 ms'],
        [590, '15:10', 'fix', 'Index added; v2.32 ships'],
    ];
    c.add('<path class="wire" d="M24 110H620"/>');
    events.forEach(([x, time, name, cap], i) => {
        const hot = c.hot(`${time} · ${cap}`);
        const up = i % 2 === 0;
        c.add(`<g class="${hot}"><rect class="zone" x="${x - 50}" y="30" width="100" height="160"/><path class="wire" d="M${x} 110V${up ? 80 : 140}"/><circle class="pt ${i === 3 ? 'on' : ''}" cx="${x}" cy="110" r="4"/></g>`);
        c.text(x, up ? 56 : 160, name, 'lb', 'middle');
        c.text(x, up ? 72 : 176, time, 'sm', 'middle');
    });
    return c.svg('Incident timeline');
}

function compare() {
    const c = canvas(290);
    const cols = ['', 'in-process', 'Redis', 'CDN'];
    const rows = [
        ['latency', '< 1 ms', '1-2 ms', '10-40 ms'],
        ['shared across pods', 'no', 'yes', 'yes'],
        ['invalidation', 'hard', 'easy', 'slow'],
        ['survives deploy', 'no', 'yes', 'yes'],
        ['extra cost', 'none', 'a cluster', 'by traffic'],
    ];
    const xs = [24, 216, 356, 496];
    cols.forEach((t, i) => c.text(xs[i], 34, t, i === 2 ? 'lb acct' : 'lb'));
    c.add('<path class="wire" d="M24 46H616"/>');
    rows.forEach((r, j) => {
        const y = 76 + j * 36;
        const hot = c.hot(['Only matters on very hot paths', 'With many pods, in-process caches disagree', 'Decides most cases: orders must never show stale prices', 'A cold cache after every deploy hurts', 'Redis is often already there'][j]);
        c.add(`<g class="${hot}"><rect class="zone" x="16" y="${y - 22}" width="608" height="34"/>`);
        r.forEach((t, i) => c.text(xs[i], y, t, i === 0 ? 'sm' : i === 2 ? 'lb acct' : 'lb'));
        c.add('</g>');
        c.add(`<path class="grid" d="M24 ${y + 12}H616"/>`);
    });
    return c.svg('Three cache options compared');
}

function beforeAfter() {
    const c = canvas(300);
    c.text(160, 26, 'before: N+1', 'lb', 'middle');
    c.text(480, 26, 'after: one join', 'lb', 'middle');
    c.add('<path class="grid" d="M320 12V250"/>');
    c.box(112, 40, 96, 30, 'list orders');
    for (let i = 0; i < 12; i++) {
        const hot = c.hot('One query per order: 101 round trips, 410 ms');
        const x = 26 + i * 23;
        c.add(`<rect class="node ${hot}" x="${x}" y="130" width="17" height="30" rx="3"/>`);
        c.arrow(160, 70, x + 8, 130);
    }
    c.text(160, 186, '… 101 queries · 410 ms', 'sm', 'middle');
    c.box(432, 40, 96, 30, 'list orders');
    c.arrow(480, 70, 480, 130);
    c.box(410, 130, 140, 34, 'orders JOIN items', { cap: 'One query, a single round trip, 18 ms', cls: 'on' });
    c.text(480, 186, '1 query · 18 ms', 'sm', 'middle');
    return c.svg('An N+1 query before and after the fix');
}

function gitGraph() {
    const c = canvas(240);
    const main = [60, 150, 240, 330, 420, 510, 590];
    const y0 = 150;
    c.add(`<path class="wire" d="M40 ${y0}H620"/>`);
    c.add(`<path class="wire acc" d="M150 ${y0}C190 ${y0} 190 80 230 80H420C460 80 460 ${y0} 510 ${y0}"/>`);
    c.add(`<path class="wire dash" d="M330 ${y0}C350 ${y0} 360 210 390 210H430"/>`);
    main.forEach((x) => {
        const hot = c.hot('Commit on main');
        c.add(`<circle class="pt ${hot}" cx="${x}" cy="${y0}" r="5"/>`);
    });
    [260, 340, 410].forEach((x, i) => {
        const hot = c.hot(['feat: add endpoint', 'test: cover the retry', 'fix: review comments'][i]);
        c.add(`<circle class="pt on ${hot}" cx="${x}" cy="80" r="5"/>`);
    });
    const hot = c.hot('hotfix: cherry-picked to the release branch, not merged back yet');
    c.add(`<circle class="pt ${hot}" cx="430" cy="210" r="5"/>`);
    c.text(620, y0 - 12, 'main', 'sm', 'end');
    c.text(340, 62, 'feature/retry', 'sm', 'middle');
    c.text(442, 214, 'release/2.31', 'sm');
    return c.svg('A feature branch merging into main, and a release branch');
}

function schema() {
    const c = canvas(290);
    const table = (x, y, name, cols, w = 170) => {
        const hot = c.hot(`${name}: ${cols.length} columns`);
        c.add(`<g class="${hot}"><rect class="node" x="${x}" y="${y}" width="${w}" height="${30 + cols.length * 22}" rx="7"/></g>`);
        c.text(x + 12, y + 20, name, 'lb');
        c.add(`<path class="wire" d="M${x} ${y + 30}H${x + w}"/>`);
        cols.forEach(([col, type], i) => {
            c.text(x + 12, y + 47 + i * 22, col, 'sm');
            c.text(x + w - 12, y + 47 + i * 22, type, 'sm', 'end');
        });
    };
    table(20, 30, 'users', [['id', 'uuid'], ['email', 'text'], ['created_at', 'time']]);
    table(240, 30, 'orders', [['id', 'uuid'], ['user_id', 'fk'], ['status', 'enum'], ['total', 'int']]);
    table(460, 90, 'order_items', [['order_id', 'fk'], ['sku', 'text'], ['qty', 'int']]);
    c.arrow(240, 100, 190, 80, { label: 'n : 1', lx: 214, ly: 78 });
    c.arrow(460, 130, 410, 120, { label: 'n : 1', lx: 436, ly: 112 });
    return c.svg('Database tables and their relations');
}

function blastRadius() {
    const c = canvas(300);
    c.box(20, 112, 140, 44, 'formatMoney()', { cap: 'The function you changed', cls: 'on', sub: 'changed' });
    const rows = [
        [36, 'CartTotal', 'Direct caller', 'checkout page', 'Two hops away'],
        [114, 'InvoicePdf', 'Direct caller: output goes to customers', 'tax report', 'Two hops: the export is snapshot tested'],
        [192, 'RefundDialog', 'Direct caller', 'admin refunds', 'Two hops away'],
    ];
    c.text(290, 22, 'calls it', 'sm', 'middle');
    c.text(530, 22, 'reaches', 'sm', 'middle');
    for (const [y, near, nearCap, far, farCap] of rows) {
        c.box(220, y, 140, 40, near, { cap: nearCap });
        c.box(460, y, 140, 40, far, { cap: farCap });
        c.arrow(160, 134, 220, y + 20);
        c.arrow(360, y + 20, 460, y + 20, { dashed: true });
    }
    return c.svg('What a change to one function can reach');
}

function waterfall() {
    const c = canvas(280);
    const spans = [
        ['GET /orders', 0, 450, 0, 'The whole request'],
        ['auth', 4, 18, 1, 'JWT check, local, cheap'],
        ['SELECT orders', 24, 310, 1, '69% of the request: this is the one to fix'],
        ['GET cache', 340, 12, 1, 'Redis hit'],
        ['serialize', 356, 88, 1, 'JSON for 400 rows'],
    ];
    const x = (ms) => 150 + (ms / 450) * 470;
    spans.forEach(([name, start, ms, depth, cap], i) => {
        const y = 28 + i * 40;
        const hot = c.hot(`${name} · ${ms} ms · ${cap}`);
        c.text(20 + depth * 14, y + 16, name, 'sm');
        const width = Math.max(3, (ms / 450) * 470);
        c.add(`<rect class="node ${ms === 310 ? 'on' : ''} ${hot}" x="${f(x(start))}" y="${y}" width="${f(width)}" height="24" rx="4"/>`);
        c.text(width > 70 ? x(start) + 8 : x(start) + width + 6, y + 16, `${ms} ms`, 'sm');
    });
    return c.svg('A request trace as a waterfall');
}

const EXAMPLES = [
    ['How does token refresh work?', 'Sequence diagram', 'Who calls whom, in what order', sequence],
    ['Why did my PR not deploy?', 'Flow chart', 'Steps with branches', flow],
    ['What states can a PR be in?', 'State diagram', 'Things that change state', state],
    ['What talks to what in checkout?', 'Architecture', 'Components and connections', architecture],
    ['What is a pod, really?', 'Isometric', 'Real containment, one thing inside another', isometric],
    ['Did that deploy hurt latency?', 'Chart', 'Numbers over time', chart],
    ['Write up the incident', 'Timeline', 'Events in order', timeline],
    ['Which cache should we use?', 'Comparison', 'Options against the same criteria', compare],
    ['What did your fix change?', 'Before and after', 'A change you can see', beforeAfter],
    ['Where is this branch now?', 'Git graph', 'History and branches', gitGraph],
    ['What does the schema look like?', 'Schema', 'Tables and relations', schema],
    ['What breaks if I change this?', 'Impact graph', 'What depends on a thing', blastRadius],
    ['Why is this endpoint slow?', 'Trace waterfall', 'Where the time goes', waterfall],
];

const cards = EXAMPLES.map(([ask, form, why, draw]) => `<section class="card"><p class="ask">“${esc(ask)}”</p><h2>${esc(form)}</h2><p class="why">${esc(why)}</p>${draw()}</section>`);

cards.push(`<section class="card none"><p class="ask">“What port does Postgres use?”</p><h2>No drawing</h2><p class="why">A short fact: the answer in chat is enough</p><p class="plain">5432.</p></section>`);

console.log(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>cc-notebook: output examples</title>
<link rel="icon" href="data:,">
<style>
:root{--bg:#fbfbfa;--panel:#fff;--edge:#71717a;--mid:#a1a1aa;--lo:#e4e4e7;--hi:#18181b;--acc:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#08090a;--panel:#0d0e10;--edge:#a1a1aa;--mid:#52525b;--lo:#27272a;--hi:#fafafa;--acc:#60a5fa}}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--hi);font:14px/1.5 ui-monospace,Consolas,monospace}
header{max-width:1320px;margin:0 auto 24px}
h1{font-size:18px;margin:0;font-weight:600}
header p{margin:4px 0 0;color:var(--edge)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,620px),1fr));gap:20px;max-width:1320px;margin:0 auto}
.card{background:var(--panel);border:1px solid var(--lo);border-radius:12px;padding:18px 20px}
.ask{margin:0;color:var(--edge);font-size:13px}
h2{font-size:15px;margin:6px 0 0;font-weight:600}
.why{margin:0 0 10px;color:var(--edge);font-size:12.5px}
.plain{font-size:15px;margin:24px 0 0}
svg{display:block;width:100%;height:auto}
svg text{font-family:ui-monospace,Consolas,monospace;pointer-events:none}
.lb{font-size:12.5px;fill:var(--hi)}
.sm{font-size:11px;fill:var(--edge)}
.acct{fill:var(--acc)}
.node{fill:var(--panel);stroke:var(--edge);stroke-width:.9;transition:stroke .15s,fill .15s}
.node.on{stroke:var(--acc);stroke-width:1.4}
.node.ext{stroke-dasharray:3 3}
.wire{fill:none;stroke:var(--edge);stroke-width:.9}
.wire.acc{stroke:var(--acc);stroke-width:1.3}
.wire.dash{stroke-dasharray:3 4}
.life{stroke:var(--mid);stroke-width:.9;stroke-dasharray:2 4}
.grid{stroke:var(--lo);stroke-width:.9}
.line{fill:none;stroke:var(--acc);stroke-width:1.4;stroke-linejoin:round}
.mark{stroke:var(--mid);stroke-width:.9;stroke-dasharray:2 4}
.pt{fill:var(--panel);stroke:var(--edge);stroke-width:1;transition:r .15s}
.pt.on{stroke:var(--acc);stroke-width:1.5}
.zone{fill:transparent}
.hot{cursor:help}
.hot:hover .node,.node.hot:hover{stroke:var(--hi);stroke-width:1.4}
.hot:hover .pt,.pt.hot:hover{stroke:var(--hi)}
.hot:hover .zone{fill:var(--lo);fill-opacity:.35}
.cap{font-size:12px;fill:var(--acc);text-anchor:middle;opacity:0;transition:opacity .12s}
${css.join('')}
</style>
</head>
<body>
<header>
<h1>What cc-notebook should draw for software work</h1>
<p>The form follows the question. Hover anything for more. The data in these examples is made up.</p>
</header>
<main>
${cards.join('\n')}
</main>
</body>
</html>`);
