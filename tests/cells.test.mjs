import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCell, contextFor } from '../lib/cells.mjs';
import { markdownToHtml, notebookHtml, svgAspect } from '../lib/html.mjs';

const SVG = '<svg viewBox="0 0 640 200"><rect width="10" height="10"/></svg>';

test('adds cells with increasing numbers', () => {
    const a = addCell([], { title: 'Flow', svg: SVG, alt: 'a box' }, 1);
    const b = addCell(a.cells, { title: 'Notes', markdown: '**hi**' }, 2);
    assert.deepEqual(b.cells.map((c) => c.id), [1, 2]);
});

test('replaces a cell in place', () => {
    const a = addCell([], { title: 'Old', markdown: 'x' }, 1);
    const b = addCell(a.cells, { title: 'New', markdown: 'y', replaces: 1 }, 2);
    assert.equal(b.cells.length, 1);
    assert.equal(b.cells[0].title, 'New');
    assert.match(addCell(a.cells, { title: 'T', markdown: 'y', replaces: 9 }, 3).error, /no cell #9/);
});

test('refuses bad input with a reason Claude can act on', () => {
    assert.match(addCell([], { markdown: 'x' }, 1).error, /title/);
    assert.match(addCell([], { title: 'T' }, 1).error, /markdown, svg/);
    assert.match(addCell([], { title: 'T', svg: '<div/>', alt: 'a' }, 1).error, /<svg/);
    assert.match(addCell([], { title: 'T', svg: SVG }, 1).error, /alt/);
});

test('a large page fills the window', () => {
    const cells = addCell([], { title: 'Flow', svg: SVG, alt: 'a box' }, 1).cells;
    assert.match(notebookHtml(cells, { large: true }), /<body class="large">/);
    assert.match(notebookHtml(cells), /<body>/);
});

test('turns interactions into context for the next prompt', () => {
    assert.equal(contextFor([]), null);
    const text = contextFor([
        { cellId: 2, title: 'Pick a cache', kind: 'choice', value: 'Redis' },
        { cellId: 2, title: 'Pick a cache', kind: 'note', value: 'keep TTL short' },
    ]);
    assert.match(text, /cell #2 "Pick a cache": chose "Redis"/);
    assert.match(text, /wrote "keep TTL short"/);
});

test('renders markdown and sandboxes svg in the HTML copy', () => {
    assert.match(markdownToHtml('# T\n- a\n- b\n\n`x` **y** <b>'), /<h2>T<\/h2>[\s\S]*<ul><li>a<\/li><li>b<\/li><\/ul>[\s\S]*<code>x<\/code> <strong>y<\/strong> &lt;b&gt;/);
    assert.equal(svgAspect(SVG), '640 / 200');
    const html = notebookHtml(addCell([], { title: 'Flow', svg: SVG, alt: 'a box', choices: ['A'] }, 1).cells);
    assert.match(html, /<iframe class="svg" sandbox=""/);
    assert.doesNotMatch(html, /<svg viewBox/); // only escaped, inside srcdoc
});
