import { addCell, contextFor, eventsText } from '../lib/cells.mjs';
import { followPrompt, parseFollowReply, shouldFollow } from '../lib/follow.mjs';
import { notebookHtml } from '../lib/html.mjs';

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
async function save($) {
    const d = await notebookDir($);
    await $.fs.write(`${d}/cells.json`, JSON.stringify({ cells, pending }, null, 2));
    await $.fs.write(`${d}/index.html`, notebookHtml(cells, { title: 'Notebook', updatedAt: await $.clock.now() }));
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

// Puts a cell in the notebook and shows it; returns the cell and whether the pane is showing.
async function placeCell($, input) {
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
        const reply = await $.model.fork({ prompt: followPrompt(cells) });
        const input = reply.isAnswered ? parseFollowReply(reply.text) : null;
        if (input) {
            const placed = await placeCell($, input);
            // A cell number that does not exist: add the drawing as a new cell instead.
            if (placed.error && input.replaces != null) {
                const { replaces, ...fresh } = input;
                await placeCell($, fresh);
            }
        }
    } finally {
        drawing = false;
        $.ui.invalidate('ui.render');
    }
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
        await $.tool.register({
            name: 'add_cell',
            description: TOOL_DESCRIPTION,
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
        const { Box, Text, Button, Markdown, Input, Svg } = $.ui.resolve(e);
        const canDraw = typeof Svg === 'function' && e.surface !== 'terminal';

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
            const children = [Text({ bold: true, children: [`#${cell.id} ${cell.title}`] })];
            if (cell.markdown) {
                children.push(Markdown({ text: cell.markdown }));
            }
            if (cell.svg) {
                children.push(
                    canDraw
                        ? Svg({ source: cell.svg, alt: cell.alt, isInteractive: true })
                        : Text({ dimColor: true, children: [`[drawing] ${cell.alt} (shown in the Desktop app or /nb-html)`] }),
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
                ...[...cells].reverse().map(cellBox),
            ],
        });
    });
}
