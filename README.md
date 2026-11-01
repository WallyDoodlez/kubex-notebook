# cc-notebook

A living notebook pane for Claude Code. When a picture or a choice explains more than prose, Claude adds a **cell** to a pane beside the conversation: a diagram, a chart, a comparison, or a question with options. What you click or type in a cell reaches Claude with your next message, so the notebook is a two-way surface, not a static render.

**Status: prototype (v0.1).** Local only. A hosted copy you can open from any browser is planned (see [Roadmap](#roadmap)).

## How it works

- The mod registers a tool, `mcp__notebook__add_cell`. Claude calls it with a title, Markdown, an SVG drawing, clickable `choices`, or an `ask` question with a text box. `replaces` updates a cell in place.
- The pane draws the cells, newest first: Markdown, the SVG (interactive in the Desktop app: `<title>` tooltips, CSS `:hover`), buttons for the choices and a text field for the question.
- A click or an answer is queued and shown in the pane. Your next prompt carries it to Claude as context (a `prompt.submit` hook), or press **Send to Claude now** to start a turn with it.
- **Follow-along** (`/nb follow`, or the **Following** button in the pane): after each substantial answer, the mod asks a fork of the conversation for one diagram of what just happened, or an update to an existing cell on the same topic. It runs in the background, so your next prompt never waits. It skips short answers, interrupted turns, subagents, and turns where Claude already added a cell. Each drawing is one extra model request over the cached conversation, billed like any other request in the session.
- Every change also writes the notebook to `~/.cache/cc-notebook/<session-id>/` as `cells.json` and a self-contained `index.html`, with each drawing in a script-less sandboxed frame. Resuming a session restores its notebook.

## Where it draws

| App | Pane | Drawings |
|---|---|---|
| Claude Code Desktop | Yes | Yes (`Svg`) |
| VS Code extension | Yes | Yes (`Svg`) |
| Terminal | Yes | No: the pane shows the drawing's description; run `/nb-html` for the HTML copy |

## Try it

Needs Claude Code 2.1.287 or later (mods). Tested with 2.1.316.

Install it from this repo's marketplace, in the Desktop app or the terminal:

```
/plugin install notebook --marketplace WallyDoodlez/cc-notebook
```

Or load a clone for one session (terminal only):

```bash
git clone https://github.com/WallyDoodlez/cc-notebook
claude --plugin-dir ./cc-notebook
```

Then ask for something visual, for example *"draw the request flow of this service and let me pick which part to dig into"*.

| Command | What it does |
|---|---|
| `/nb` | Open the notebook pane |
| `/nb follow` / `/nb follow off` | Draw a diagram after each substantial answer, or stop |
| `/nb-html` | Print the path of the notebook's HTML copy |

## Development

```bash
npm test                         # unit tests for the cell logic and the HTML copy
claude plugin validate .         # what Claude Code reads from the mod
```

`lib/` holds the pure logic (`cells.mjs`, `html.mjs`); `hooks/register.mjs` is the mod.

## Roadmap

1. Verify the pane in the Desktop app: interactive `Svg`, choices, the ask field, and dark mode.
2. Hosted notebook: push cells to a small Cloudflare Worker you deploy yourself, so the notebook opens from any browser (another machine, a phone, a cloud session), and clicks there flow back to Claude.
3. A render check: screenshot each new cell headlessly before showing it.
4. An MCP server form of `add_cell`, so other agents can write to the same notebook.

## Licence

MIT, see [LICENSE](LICENSE). Not affiliated with Anthropic.
