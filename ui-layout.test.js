'use strict';
const assert = require('assert');
const { shouldCollapse, applyCardCompactState } = require('./ui-layout.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS -', name); }
  catch (e) { fail++; console.log('FAIL -', name, '\n   ', e.message); }
}

// Minimal standalone element stub — just enough classList behavior to
// verify the toggle, without depending on a full DOM/browser environment.
function makeFakeElement(initialClasses) {
  const classes = new Set(initialClasses || []);
  return {
    classList: {
      toggle(name, force) {
        const has = classes.has(name);
        const want = force === undefined ? !has : force;
        if (want) classes.add(name); else classes.delete(name);
        return want;
      },
      contains(name) { return classes.has(name); }
    }
  };
}

// ---------------------------------------------------------------
// shouldCollapse — pure decision logic
// ---------------------------------------------------------------

test('null collapses', () => assert.strictEqual(shouldCollapse(null), true));
test('undefined collapses', () => assert.strictEqual(shouldCollapse(undefined), true));
test('empty array collapses', () => assert.strictEqual(shouldCollapse([]), true));
test('non-empty array does not collapse', () => assert.strictEqual(shouldCollapse([1]), false));
test('empty string collapses', () => assert.strictEqual(shouldCollapse(''), true));
test('whitespace-only string collapses', () => assert.strictEqual(shouldCollapse('   '), true));
test('non-empty string does not collapse', () => assert.strictEqual(shouldCollapse('hello'), false));
test('empty object collapses', () => assert.strictEqual(shouldCollapse({}), true));
test('non-empty object does not collapse', () => assert.strictEqual(shouldCollapse({ a: 1 }), false));
test('the number 0 does NOT collapse (a real zero is still data)', () => assert.strictEqual(shouldCollapse(0), false));
test('a positive number does not collapse', () => assert.strictEqual(shouldCollapse(42), false));
test('boolean false does not collapse', () => assert.strictEqual(shouldCollapse(false), false));

// ---------------------------------------------------------------
// applyCardCompactState — DOM application
// ---------------------------------------------------------------

test('applying with empty data adds the compact class', () => {
  const el = makeFakeElement();
  applyCardCompactState(el, []);
  assert.strictEqual(el.classList.contains('card-compact'), true);
});

test('applying with populated data removes the compact class', () => {
  const el = makeFakeElement(['card-compact']);
  applyCardCompactState(el, ['one item']);
  assert.strictEqual(el.classList.contains('card-compact'), false);
});

test('accepts a raw boolean directly, bypassing shouldCollapse', () => {
  const el = makeFakeElement();
  applyCardCompactState(el, true);
  assert.strictEqual(el.classList.contains('card-compact'), true);
  applyCardCompactState(el, false);
  assert.strictEqual(el.classList.contains('card-compact'), false);
});

test('is a safe no-op when the element is missing (null/undefined)', () => {
  assert.doesNotThrow(() => applyCardCompactState(null, []));
  assert.doesNotThrow(() => applyCardCompactState(undefined, []));
});

test('toggling back and forth is idempotent and reversible', () => {
  const el = makeFakeElement();
  applyCardCompactState(el, []);
  applyCardCompactState(el, []);
  assert.strictEqual(el.classList.contains('card-compact'), true, 'still compact after repeated empty state');
  applyCardCompactState(el, ['data']);
  assert.strictEqual(el.classList.contains('card-compact'), false, 'expands once data arrives');
  applyCardCompactState(el, []);
  assert.strictEqual(el.classList.contains('card-compact'), true, 're-collapses if data disappears again');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
