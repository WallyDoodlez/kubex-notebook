// Pure notebook state: cells Claude adds, and the interactions the person makes on them.
// No mods API here, so the tests can run it under plain node.

import { cleanParams } from './typst.mjs';

export const MAX_SVG_CHARS = 131072;

// Cleans one add_cell input into a cell, or returns { error } for Claude to read.
export function cellFromInput(input, id, nowMs) {
    const title = String(input?.title ?? '').trim();
    if (!title) {
        return { error: 'title is required' };
    }
    const markdown = input.markdown == null ? '' : String(input.markdown);
    const svg = input.svg == null ? '' : String(input.svg).trim();
    if (!markdown && !svg) {
        return { error: 'give markdown, svg, or both' };
    }
    if (svg && !/^<svg[\s>]/i.test(svg)) {
        return { error: 'svg must be one <svg ...>...</svg> document' };
    }
    if (svg.length > MAX_SVG_CHARS) {
        return { error: `svg is ${svg.length} characters; the limit is ${MAX_SVG_CHARS}` };
    }
    const typst = input.typst == null ? '' : String(input.typst);
    if (typst && !svg) {
        return { error: 'the typst source did not produce a drawing' };
    }
    if (svg && !String(input.alt ?? '').trim()) {
        return { error: 'alt is required with svg: one sentence saying what the drawing shows' };
    }
    const choices = Array.isArray(input.choices)
        ? input.choices
              .map((c) => {
                  return String(c ?? '').trim();
              })
              .filter(Boolean)
              .slice(0, 6)
        : [];
    const ask = input.ask == null ? '' : String(input.ask).trim();
    return {
        cell: {
            id,
            title,
            markdown,
            svg,
            alt: String(input.alt ?? '').trim(),
            choices,
            ask,
            typst,
            params: typst ? cleanParams(input.params) : [],
            hotspots: Array.isArray(input.hotspots) ? input.hotspots : [],
            chosen: null,
            createdAt: nowMs,
        },
    };
}

// Adds a cell, or replaces the one named by input.replaces. Returns { cells, cell } or { error }.
export function addCell(cells, input, nowMs) {
    const replaces = input?.replaces == null ? null : Number(input.replaces);
    if (replaces != null && !cells.some((c) => c.id === replaces)) {
        return { error: `no cell #${replaces} to replace` };
    }
    const nextId = cells.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    const made = cellFromInput(input, replaces ?? nextId, nowMs);
    if (made.error) {
        return made;
    }
    const next =
        replaces == null
            ? [...cells, made.cell]
            : cells.map((c) => {
                  return c.id === replaces ? made.cell : c;
              });
    return { cells: next, cell: made.cell };
}

// One line per interaction, in the order they happened, for Claude to read.
export function eventsText(events) {
    return events
        .map((ev) => {
            const where = `cell #${ev.cellId} "${ev.title}"`;
            const said = {
                choice: `chose "${ev.value}"`,
                note: `wrote "${ev.value}"`,
                set: `set ${ev.value}`,
                explore: `asked about "${ev.value}"`,
            }[ev.kind];
            return `- ${where}: ${said ?? ev.value}`;
        })
        .join('\n');
}

export function contextFor(events) {
    if (events.length === 0) {
        return null;
    }
    return `Since the last message, the person did this in the notebook pane:\n${eventsText(events)}`;
}
