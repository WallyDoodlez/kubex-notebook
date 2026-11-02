import { addCell, contextFor, eventsText } from '../lib/cells.mjs';
import { followPrompt, parseFollowReply, shouldFollow } from '../lib/follow.mjs';
import { notebookHtml } from '../lib/html.mjs';
import {
    HOTSPOT_QUERY,
    addHotspots,
    themedSvg,
    checkTypstBody,
    cleanParams,
    hotspotName,
    inputArgs,
    parseHotspots,
    typstSource,
} from '../lib/typst.mjs';

const PANE = 'notebook';
const TOOL = 'mcp__notebook__add_cell';

const TOOL_DESCRIPTION = [
    'Add a cell to the notebook pane beside the conversation, or replace one with `replaces`.',
    'Use it when a picture or a choice explains more than prose: architecture and flows, sequences,',
    'state machines, timelines, comparisons, charts, or a decision the person should make by clicking.',
    'Keep the chat reply short and point at the cell ("see cell #3"). Do not use it for plain answers.',
    '',
    'svg: one self-contained <svg viewBox="0 0 W H"> document, W about 640-760. No scripts, no event',
    'attributes, no external images or fonts. Use <title> on shapes for hover tooltips and CSS :hover for',
    'highlights; they work in the Desktop pane. Colors must read on light and dark backgrounds: use',
    'currentColor for text and lines, and mid-tone fills.',
    'choices: up to 6 short options the person can click; you learn the pick with their next message.',
    'ask: a question with a text box under the cell; their answer reaches you the same way.',
].join('\n');

const TYPST_DESCRIPTION = [
    '',
    'typst (preferred over svg for diagrams and charts): the body of a Typst 0.15 document; the notebook sets',
    'the page (720pt wide, white) and compiles it to SVG. Import what you use:',
    '  #import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge   (flows, architecture, state machines)',
    '  #import "@preview/cetz:0.5.2"   and   #import "@preview/cetz-plot:0.1.4": plot, chart   (plots, charts, timelines)',
    'In scope: `theme` (fg, muted, border, blue, orange, green, red, purple, yellow, palette, width).',
    'hot(id, tip)[content] marks a part: hovering it shows the tip, and the person can ask you about it.',
    'Mark the parts that matter, e.g. node((1,0), hot("gw", "API gateway: checks the JWT locally")[Gateway]).',
    'params: up to 4 dropdowns, [{name, label, options, value}]; read one with param("name", "default").',
    'Changing one recompiles the drawing at once, with no call to you; you learn the change with the next message.',
    'No #page, #set page or #pagebreak. Files cannot be read.',
].join('\n');

const INPUT_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string', description: 'Short heading for the cell' },
        markdown: { type: 'string', description: 'Text above the drawing, in Markdown' },
        svg: { type: 'string', description: 'One <svg> document, at most 131072 characters' },
        alt: { type: 'string', description: 'Required with svg: one sentence saying what the drawing shows' },
        choices: { type: 'array', items: { type: 'string' }, description: 'Options the person can click' },
        ask: { type: 'string', description: 'A question answered in a text box under the cell' },
        replaces: { type: 'integer', description: 'The number of a cell to replace in place' },
        typst: { type: 'string', description: 'Typst source for the drawing, compiled to SVG' },
        params: {
            type: 'array',
            description: 'Dropdowns that recompile the typst drawing: read with param("name", "default")',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    label: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    value: { type: 'string' },
                },
                required: ['name', 'options'],
            },
        },
    },
    required: ['title'],
};

// The notebook of this session, and what the person did in it that Claude has not seen yet.
let cells = [];
let pending = [];
let dir = null;
// Follow-along: whether it is on, whether Claude added a cell itself this turn, and a drawing in progress.
let follow = false;
let addedThisTurn = false;
let drawing = false;
// The Typst program, when the session found one at start.
let typstBin = null;
let compileCount = 0;
// The one cell the pane is showing by itself, if any.
let expanded = null;

async function notebookDir($) {
    if (dir) {
        return dir;
    }
    const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || $.plugin.root;
    const cache = (await $.env.get('XDG_CACHE_HOME')) || `${home}/.cache`;
    dir = `${cache.replace(/\\/g, '/')}/cc-notebook/${await $.session.id()}`;
    return dir;
}

// The pane draws from memory; the files let a browser show the same notebook and a resume restore it.
// The theme chosen in Claude Code, so a page matches it even when the system differs.
async function pageTheme($) {
    try {
        const row = (await $.config.list()).find((r) => r.key === 'theme');
        const value = String(row?.value ?? '');
        return value.includes('dark') ? 'dark' : value.includes('light') ? 'light' : 'auto';
    } catch {
        return 'auto';
    }
}

async function save($) {
    const d = await notebookDir($);
    await $.fs.write(`${d}/cells.json`, JSON.stringify({ cells, pending }, null, 2));
    await $.fs.write(`${d}/index.html`, notebookHtml(cells, { title: 'Notebook', updatedAt: await $.clock.now(), theme: await pageTheme($) }));
}

function record($, cell, kind, value) {
    pending.push({ cellId: cell.id, title: cell.title, kind, value });
    if (kind === 'choice') {
        cell.chosen = value;
    }
    $.ui.toast('Noted for Claude: it reads this with your next message');
    $.ui.invalidate('ui.render');
    save($).catch(() => {});
}

async function findTypst($) {
    for (const bin of [(await $.env.get('NOTEBOOK_TYPST')) || '', 'typst'].filter(Boolean)) {
        try {
            const r = await $.process.run([bin, '--version'], { timeoutMs: 10000 });
            if (r.exitCode === 0) {
                return bin;
            }
        } catch {
            // Not on PATH; try the next.
        }
    }
    return null;
}

// Compiles a Typst body to SVG in a folder that holds only that source, so the code cannot read
// other files. Returns { svg, hotspots } or { error } with Typst's message for Claude to fix.
async function compileTypst($, body, params) {
    if (!typstBin) {
        return { error: 'Typst is not installed on this machine; send svg instead' };
    }
    const problem = checkTypstBody(body);
    if (problem) {
        return { error: problem };
    }
    const root = `${await notebookDir($)}/typst/${++compileCount}-${await $.clock.now()}`;
    const src = `${root}/main.typ`;
    await $.fs.write(src, typstSource(body));
    // The first compile can download the packages, so it gets longer.
    const timeoutMs = 120000;
    const inputs = inputArgs(params);
    const made = await $.process.run([typstBin, 'compile', '--root', root, ...inputs, src, `${root}/out.svg`], { timeoutMs });
    if (made.exitCode !== 0) {
        return { error: `typst failed:\n${(made.stderr || made.stdout).trim().slice(0, 1500)}` };
    }
    const asked = await $.process.run(
        [typstBin, 'eval', HOTSPOT_QUERY, '--in', src, '--root', root, ...inputs, '--format', 'json'],
        { timeoutMs },
    );
    const hotspots = asked.exitCode === 0 ? parseHotspots(asked.stdout) : [];
    const svg = addHotspots(await $.fs.read(`${root}/out.svg`), hotspots);
    return { svg, hotspots };
}

// Puts a cell in the notebook and shows it; returns the cell and whether the pane is showing.
async function placeCell($, raw) {
    let input = raw;
    if (raw.typst) {
        const params = cleanParams(raw.params);
        const made = await compileTypst($, raw.typst, params);
        if (made.error) {
            return made;
        }
        input = { ...raw, params, svg: made.svg, hotspots: made.hotspots };
    }
    const added = addCell(cells, input, await $.clock.now());
    if (added.error) {
        return added;
    }
    cells = added.cells;
    await save($);
    // A pane a mod opens by itself only shows in a wide window.
    const opened = await $.ui.open({ id: PANE, title: 'Notebook' });
    $.ui.invalidate('ui.render');
    if (!opened?.isPlaced) {
        $.ui.toast(`Notebook cell #${added.cell.id} added. Run /nb to open the pane`, { timeoutMs: 8000 });
    }
    return { cell: added.cell, isPlaced: Boolean(opened?.isPlaced) };
}

// Runs in the background after a turn: a fork of the conversation draws what just happened.
async function drawFollowUp($) {
    drawing = true;
    $.ui.invalidate('ui.render');
    try {
        const reply = await $.model.fork({ prompt: followPrompt(cells, { typst: Boolean(typstBin) }) });
        const input = reply.isAnswered ? parseFollowReply(reply.text) : null;
        if (input) {
            const placed = await placeCell($, input);
            // A cell number that does not exist: add the drawing as a new cell instead.
            if (placed.error && /^no cell #/.test(placed.error)) {
                const { replaces, ...fresh } = input;
                await placeCell($, fresh);
            } else if (placed.error) {
                $.ui.toast(`Follow-along drawing failed: ${placed.error.split('\n')[0]}`);
            }
        }
    } finally {
        drawing = false;
        $.ui.invalidate('ui.render');
    }
}

// A dropdown changed: recompile the drawing with the new value, with no model call.
async function setParam($, cell, name, value) {
    const params = cell.params.map((p) => (p.name === name ? { ...p, value } : p));
    const made = await compileTypst($, cell.typst, params);
    if (made.error) {
        $.ui.toast(`Could not redraw cell #${cell.id}: ${made.error.split('\n')[0]}`);
        return;
    }
    Object.assign(cell, { params, svg: made.svg, hotspots: made.hotspots });
    const label = params.find((p) => p.name === name)?.label ?? name;
    pending.push({ cellId: cell.id, title: cell.title, kind: 'set', value: `${label} to "${value}"` });
    $.ui.invalidate('ui.render');
    await save($);
}

// The nearest thing to a popup: one cell in its own page, filling a browser window.
async function openLarge($, cell) {
    const file = `${await notebookDir($)}/cell-${cell.id}.html`;
    await $.fs.write(file, notebookHtml([cell], { title: `#${cell.id} ${cell.title}`, updatedAt: await $.clock.now(), large: true, theme: await pageTheme($) }));
    const windows = (await $.env.get('OS')) === 'Windows_NT';
    const openers = windows ? [['rundll32', 'url.dll,FileProtocolHandler', file.replace(/\//g, '\\')]] : [['open', file], ['xdg-open', file]];
    for (const argv of openers) {
        try {
            if ((await $.process.run(argv, { timeoutMs: 10000 })).exitCode === 0) {
                return;
            }
        } catch {
            // No such opener here; try the next.
        }
    }
    $.ui.toast(`Could not open a browser. The page is at ${file}`, { timeoutMs: 10000 });
}

async function setFollow($, on) {
    follow = on;
    await $.store.set('follow', on);
    $.ui.toast(on ? 'Notebook follows the conversation: a diagram after each substantial answer' : 'Notebook follow-along is off');
    $.ui.invalidate('ui.render');
}

export function register(on) {
    on('session.start', async ($, e, next) => {
        try {
            const saved = JSON.parse(await $.fs.read(`${await notebookDir($)}/cells.json`));
            cells = Array.isArray(saved.cells) ? saved.cells : [];
            pending = Array.isArray(saved.pending) ? saved.pending : [];
        } catch {
            // A new session has no notebook yet.
        }
        follow = (await $.store.get('follow')) === true;
        typstBin = await findTypst($);
        await $.tool.register({
            name: 'add_cell',
            description: typstBin ? TOOL_DESCRIPTION + TYPST_DESCRIPTION : TOOL_DESCRIPTION,
            inputSchema: INPUT_SCHEMA,
            isDeferred: false,
        });
        // Commands last: a refused registration throws and skips the rest.
        await $.command.register({
            name: 'nb',
            description: 'Open the notebook pane; "follow" or "follow off" draws a diagram after each answer',
            argumentHint: '[follow | follow off]',
            immediate: true,
        });
        await $.command.register({ name: 'nb-html', description: 'Print the path of the notebook as an HTML file' });
        return next(e);
    });

    on('tool.call', { tool: TOOL }, async ($, e) => {
        const placed = await placeCell($, e);
        if (placed.error) {
            return { result: `Not added: ${placed.error}` };
        }
        addedThisTurn = true;
        const verb = e.replaces == null ? 'Added' : 'Replaced';
        const where = placed.isPlaced
            ? 'It is showing in the notebook pane beside the conversation.'
            : 'The notebook pane is closed: tell the person to run /nb to see it.';
        return { result: `${verb} cell #${placed.cell.id} "${placed.cell.title}". ${where}` };
    }).catch(async ($, e, next) => {
        return { result: `The notebook failed to add the cell (${next.error.kind}); answer in chat instead.` };
    });

    // What the person clicked or typed reaches Claude with their next prompt, as context only Claude reads.
    on('prompt.submit', async ($, e, next) => {
        const context = contextFor(pending);
        if (!context) {
            return next(e);
        }
        pending = [];
        save($).catch(() => {});
        return next({ ...e, context: [...(e.context ?? []), context] });
    }).catch(async ($, e, next) => {
        // Never hold up a prompt because the notebook failed.
        return next(e);
    });

    on('turn.start', async ($, e, next) => {
        if (!e.agentId) {
            addedThisTurn = false;
        }
        return next(e);
    });

    // Not awaited: the person's next prompt never waits for the drawing.
    on('turn.complete', async ($, e, next) => {
        if (shouldFollow(e, { follow, addedThisTurn, inFlight: drawing })) {
            drawFollowUp($).catch(() => {});
        }
        return next(e);
    });

    on('command.run', { command: 'nb' }, async ($, e) => {
        const arg = String(e.args ?? '').trim().toLowerCase();
        if (arg === 'follow' || arg === 'follow on') {
            await setFollow($, true);
        } else if (arg === 'follow off') {
            await setFollow($, false);
        }
        await $.ui.open({ id: PANE, title: 'Notebook', focus: true, closeOnEscape: true });
        return {};
    });

    on('command.run', { command: 'nb-html' }, async ($) => {
        await save($);
        return { text: `Notebook as HTML: ${await notebookDir($)}/index.html` };
    });

    on('ui.render', { component: 'Pane' }, async ($, e, next) => {
        if (e.requestId !== PANE) {
            return next(e);
        }
        const { Box, Text, Button, Markdown, Input, Select, Svg } = $.ui.resolve(e);
        const canDraw = typeof Svg === 'function' && e.surface !== 'terminal';
        const theme = await pageTheme($);

        const header = Box({
            flexDirection: 'row',
            columnGap: 2,
            children: [
                Text({ bold: true, children: [`Notebook · ${cells.length} cell${cells.length === 1 ? '' : 's'}`] }),
                Button({
                    key: 'follow',
                    label: follow ? 'Following: on' : 'Following: off',
                    dimColor: !follow,
                    onPress: () => {
                        setFollow($, !follow).catch(() => {});
                        return undefined;
                    },
                }),
                ...(drawing ? [Text({ dimColor: true, children: ['Drawing the last answer…'] })] : []),
                ...(pending.length
                    ? [
                          Button({
                              key: 'send',
                              label: `Send ${pending.length} to Claude now`,
                              onPress: () => {
                                  // The prompt.submit hook attaches the pending interactions as context.
                                  $.prompt.submit({ text: 'I made choices in the notebook pane. Continue from them.', asUser: true });
                                  return undefined;
                              },
                          }),
                      ]
                    : []),
            ],
        });

        if (cells.length === 0) {
            return Box({
                flexDirection: 'column',
                children: [header, Text({ dimColor: true, children: ['No cells yet. Claude adds them with the add_cell tool.'] })],
            });
        }

        const cellBox = (cell) => {
            const children = [
                Box({
                    flexDirection: 'row',
                    columnGap: 2,
                    children: [
                        Text({ bold: true, children: [`#${cell.id} ${cell.title}`] }),
                        ...(cell.svg
                            ? [
                                  Button({
                                      key: `large${cell.id}`,
                                      label: 'Open large',
                                      onPress: () => {
                                          openLarge($, cell).catch(() => {});
                                          return undefined;
                                      },
                                  }),
                              ]
                            : []),
                        Button({
                            key: `expand${cell.id}`,
                            label: expanded === cell.id ? 'Show all' : 'Expand',
                            onPress: () => {
                                expanded = expanded === cell.id ? null : cell.id;
                                $.ui.invalidate('ui.render');
                                return undefined;
                            },
                        }),
                    ],
                }),
            ];
            if (cell.markdown) {
                children.push(Markdown({ text: cell.markdown }));
            }
            if (cell.svg) {
                children.push(
                    canDraw
                        ? Svg({ source: cell.typst ? themedSvg(cell.svg, theme) : cell.svg, alt: cell.alt, isInteractive: true })
                        : Text({ dimColor: true, children: [`[drawing] ${cell.alt} (shown in the Desktop app or /nb-html)`] }),
                );
            }
            const params = cell.params ?? [];
            const hotspots = cell.hotspots ?? [];
            if (params.length || hotspots.length) {
                children.push(
                    Box({
                        flexDirection: 'row',
                        columnGap: 2,
                        flexWrap: 'wrap',
                        children: [
                            ...params.map((p) => {
                                return Select({
                                    key: `p${cell.id}-${p.name}`,
                                    label: p.label,
                                    options: p.options.map((o) => ({ value: o, label: o })),
                                    value: p.value,
                                    onSelect: (value) => {
                                        setParam($, cell, p.name, value).catch(() => {});
                                        return undefined;
                                    },
                                });
                            }),
                            ...(hotspots.length
                                ? [
                                      Select({
                                          key: `h${cell.id}`,
                                          label: 'Ask Claude about',
                                          options: [
                                              { value: '', label: 'Ask Claude about…' },
                                              ...hotspots.map((h) => ({ value: h.id, label: hotspotName(h) })),
                                          ],
                                          value: '',
                                          onSelect: (value) => {
                                              const h = hotspots.find((x) => x.id === value);
                                              if (h) {
                                                  record($, cell, 'explore', h.tip);
                                              }
                                              return undefined;
                                          },
                                      }),
                                  ]
                                : []),
                        ],
                    }),
                );
            }
            if (cell.choices.length) {
                children.push(
                    Box({
                        flexDirection: 'row',
                        columnGap: 2,
                        flexWrap: 'wrap',
                        children: cell.choices.map((choice, i) => {
                            return Button({
                                key: `c${cell.id}-${i}`,
                                label: cell.chosen === choice ? `✓ ${choice}` : choice,
                                dimColor: cell.chosen != null && cell.chosen !== choice,
                                onPress: () => {
                                    record($, cell, 'choice', choice);
                                    return undefined;
                                },
                            });
                        }),
                    }),
                );
            }
            if (cell.ask) {
                children.push(
                    Input({
                        key: `a${cell.id}`,
                        label: cell.ask,
                        placeholder: 'Type and press Enter',
                        value: '',
                        submitLabel: 'send',
                        onSubmit: (value) => {
                            if (String(value).trim()) {
                                record($, cell, 'note', String(value).trim());
                            }
                            return undefined;
                        },
                    }),
                );
            }
            return Box({ key: `cell-${cell.id}`, flexDirection: 'column', borderStyle: 'round', paddingX: 1, children });
        };

        // Newest first, so the cell Claude just added is in view.
        return Box({
            flexDirection: 'column',
            rowGap: 1,
            children: [
                header,
                ...(pending.length ? [Text({ dimColor: true, children: [eventsText(pending)] })] : []),
                ...[...cells].reverse().filter((cell) => expanded == null || cell.id === expanded).map(cellBox),
            ],
        });
    });
}
