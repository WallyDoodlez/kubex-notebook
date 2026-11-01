// Follow-along: after a turn, a fork of the conversation draws one diagram of what just happened.
// The prompt asks for a tagged reply rather than JSON, so the SVG needs no escaping.

export const FOLLOW_MIN_ANSWER_CHARS = 300;
export const FOLLOW_MIN_DURATION_MS = 20000;

// Whether a finished turn is worth a diagram: the main loop's own answer, of some size,
// and Claude did not already add a cell itself.
export function shouldFollow(e, { follow, addedThisTurn, inFlight }) {
    if (!follow || addedThisTurn || inFlight) {
        return false;
    }
    if (e.agentId || e.isAborted || e.reason !== 'answer') {
        return false;
    }
    return (e.answer ?? '').length >= FOLLOW_MIN_ANSWER_CHARS || (e.durationMs ?? 0) >= FOLLOW_MIN_DURATION_MS;
}

export function followPrompt(cells) {
    const list = cells.length
        ? cells.map((c) => `#${c.id} ${c.title}${c.alt ? ` (${c.alt})` : ''}`).join('\n')
        : '(none yet)';
    return `[Notebook illustrator, not a message from the person] You are not replying in the conversation now. You draw the notebook pane that sits beside it.

Look at the last exchange above. If a diagram would help the person see what just happened or how the thing being discussed works, draw ONE: a flow, sequence, architecture, state machine, timeline, before/after, or comparison. If an existing cell shows the same system or topic, update it with REPLACES instead of adding a near-copy.

Reply SKIP and nothing else when the last exchange was small talk, a short factual answer, a question back to the person, or is already shown well.

Cells in the notebook now:
${list}

Otherwise reply in exactly this form, with nothing before or after:
TITLE: <short heading>
REPLACES: <cell number, or none>
ALT: <one sentence saying what the drawing shows>
NOTE: <one or two sentences of explanation, Markdown allowed>
<svg viewBox="0 0 720 H" xmlns="http://www.w3.org/2000/svg">...</svg>

SVG rules: one self-contained document, width 640-760, no scripts or event attributes, no external images or fonts. Text at least 13px, labels short. Use currentColor for text and lines and mid-tone fills, so it reads on light and dark backgrounds. Put <title> inside shapes for hover details.`;
}

// Turns the fork's reply into add_cell input, or null for SKIP or a reply that does not parse.
export function parseFollowReply(text) {
    const reply = String(text ?? '').trim();
    if (!reply || /^SKIP\b/i.test(reply)) {
        return null;
    }
    const field = (name) => {
        const m = new RegExp(`^${name}:[ \\t]*(.*)$`, 'mi').exec(reply);
        return m ? m[1].trim() : '';
    };
    const svg = /<svg[\s\S]*<\/svg>/i.exec(reply)?.[0] ?? '';
    const title = field('TITLE');
    if (!title || !svg) {
        return null;
    }
    const replaces = Number.parseInt(field('REPLACES'), 10);
    return {
        title,
        alt: field('ALT') || title,
        markdown: field('NOTE'),
        svg,
        ...(Number.isInteger(replaces) ? { replaces } : {}),
    };
}
