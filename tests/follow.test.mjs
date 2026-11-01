import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followPrompt, parseFollowReply, shouldFollow } from '../lib/follow.mjs';

const ON = { follow: true, addedThisTurn: false, inFlight: false };
const LONG = 'x'.repeat(400);

test('follows a substantial main-loop answer only', () => {
    assert.equal(shouldFollow({ reason: 'answer', answer: LONG }, ON), true);
    assert.equal(shouldFollow({ reason: 'answer', answer: 'ok', durationMs: 30000 }, ON), true);
    assert.equal(shouldFollow({ reason: 'answer', answer: 'ok', durationMs: 1000 }, ON), false);
    assert.equal(shouldFollow({ reason: 'answer', answer: LONG, agentId: 'a1' }, ON), false);
    assert.equal(shouldFollow({ reason: 'aborted', answer: LONG, isAborted: true }, ON), false);
    assert.equal(shouldFollow({ reason: 'answer', answer: LONG }, { ...ON, follow: false }), false);
    assert.equal(shouldFollow({ reason: 'answer', answer: LONG }, { ...ON, addedThisTurn: true }), false);
    assert.equal(shouldFollow({ reason: 'answer', answer: LONG }, { ...ON, inFlight: true }), false);
});

test('lists the cells so the fork can update one', () => {
    assert.match(followPrompt([{ id: 2, title: 'Auth flow', alt: 'login steps' }]), /#2 Auth flow \(login steps\)/);
    assert.match(followPrompt([]), /\(none yet\)/);
});

test('parses a drawing reply, and SKIP or junk as nothing', () => {
    const reply = 'TITLE: Cache path\nREPLACES: 3\nALT: request hits cache first\nNOTE: Reads go to **Redis** first.\n<svg viewBox="0 0 720 200"><rect/></svg>';
    assert.deepEqual(parseFollowReply(reply), {
        title: 'Cache path',
        alt: 'request hits cache first',
        markdown: 'Reads go to **Redis** first.',
        svg: '<svg viewBox="0 0 720 200"><rect/></svg>',
        replaces: 3,
    });
    assert.equal(parseFollowReply('TITLE: X\nREPLACES: none\nALT: a\nNOTE: b\n<svg></svg>').replaces, undefined);
    assert.equal(parseFollowReply('SKIP'), null);
    assert.equal(parseFollowReply('TITLE: no drawing here'), null);
    assert.equal(parseFollowReply(''), null);
});
