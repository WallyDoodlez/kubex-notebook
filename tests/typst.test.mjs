import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFollowReply } from '../lib/follow.mjs';
import {
    HOTSPOT_QUERY,
    addHotspots,
    checkTypstBody,
    cleanParams,
    hotspotName,
    inputArgs,
    parseHotspots,
    typstSource,
} from '../lib/typst.mjs';

test('refuses page settings in a cell', () => {
    assert.match(checkTypstBody('#set page(width: 1pt)'), /#page/);
    assert.match(checkTypstBody('#pagebreak()'), /#page/);
    assert.match(checkTypstBody('  '), /empty/);
    assert.equal(checkTypstBody('#diagram()'), null);
});

test('cleans params and turns them into --input flags', () => {
    const params = cleanParams([
        { name: 'view', label: 'View', options: ['login', 'refresh'], value: 'refresh' },
        { name: 'bad name', options: ['a', 'b'] },
        { name: 'one', options: ['only'] },
        { name: 'range', options: ['7d', '30d'], value: 'nope' },
    ]);
    assert.deepEqual(params.map((p) => [p.name, p.value]), [['view', 'refresh'], ['range', '7d']]);
    assert.deepEqual(inputArgs(params), ['--input', 'view=refresh', '--input', 'range=7d']);
});

test('adds a hover area with a tooltip for each marked part', () => {
    const hotspots = parseHotspots('[{"id":"gw","tip":"Gateway: checks <JWT>","x":10,"y":20,"w":30,"h":8},{"id":"gw","tip":"dup","x":0,"y":0,"w":1,"h":1},{"id":"x"}]');
    assert.equal(hotspots.length, 1);
    assert.equal(hotspotName(hotspots[0]), 'Gateway');
    const svg = addHotspots('<svg viewBox="0 0 100 50"><path/></svg>', hotspots);
    assert.match(svg, /<rect class="nb-hot" x="3.0" y="13.0" width="44.0" height="22.0" rx="5"><title>Gateway: checks &lt;JWT&gt;<\/title><\/rect>/);
    assert.match(svg, /\.nb-hot:hover/);
    assert.equal(parseHotspots('not json').length, 0);
});

test('reads a typst drawing from the follow-along reply', () => {
    const reply = 'TITLE: Flow\nREPLACES: none\nALT: three steps\nNOTE: n\n```typst\n#diagram(node((0,0), [A]))\n```';
    const input = parseFollowReply(reply);
    assert.equal(input.typst, '#diagram(node((0,0), [A]))');
    assert.equal(input.svg, undefined);
});

// Runs the real compile when Typst is installed: the packages, the preamble and the hover marks.
const typst = (() => {
    try {
        execFileSync('typst', ['--version'], { stdio: 'pipe' });
        return 'typst';
    } catch {
        return null;
    }
})();

test('compiles a fletcher diagram with marked parts and a param', { skip: !typst && 'typst not installed' }, () => {
    const root = mkdtempSync(join(tmpdir(), 'nb-typst-'));
    const src = join(root, 'main.typ');
    writeFileSync(
        src,
        typstSource(`#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#diagram(spacing: 3em, node-stroke: theme.fg,
  node((0,0), hot("b", "Browser: sends credentials")[Browser]), edge("-|>"),
  node((1,0), hot("gw", "Gateway: " + param("mode", "checks the JWT"))[Gateway]))`),
    );
    const inputs = inputArgs(cleanParams([{ name: 'mode', options: ['checks the JWT', 'refreshes it'], value: 'refreshes it' }]));
    execFileSync(typst, ['compile', '--root', root, ...inputs, src, join(root, 'out.svg')], { stdio: 'pipe', timeout: 120000 });
    const json = execFileSync(typst, ['eval', HOTSPOT_QUERY, '--in', src, '--root', root, ...inputs, '--format', 'json'], { encoding: 'utf8' });
    const hotspots = parseHotspots(json);
    assert.deepEqual(hotspots.map((h) => h.id), ['b', 'gw']);
    assert.equal(hotspots[1].tip, 'Gateway: refreshes it');
    const svg = addHotspots(readFileSync(join(root, 'out.svg'), 'utf8'), hotspots);
    assert.match(svg, /^<svg[\s\S]*<rect class="nb-hot"[\s\S]*<\/svg>$/);
});
