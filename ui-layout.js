/**
 * UI Layout — dynamic sparse/empty container collapsing.
 *
 * Pure decision logic for whether a container should render in its
 * compact/collapsed visual state, plus a thin DOM-application helper.
 * Kept separate from any specific card's rendering code so the same
 * rule applies consistently everywhere a box can legitimately be
 * empty, null, or trivial (holiday lists, logs, graphs, etc.).
 */
'use strict';

/**
 * Decides whether a piece of data counts as "nothing to show" for
 * layout purposes:
 *  - null/undefined            -> collapse
 *  - empty array                -> collapse
 *  - empty/whitespace-only string -> collapse
 *  - empty object (no own keys) -> collapse
 *  - a number (including 0)     -> never collapses — a real 0 (e.g.
 *    "0 steps today") is a fact worth showing, not an absence of data
 *  - anything else non-empty    -> never collapses
 */
function shouldCollapse(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return false;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Applies (or removes) the compact CSS state on an element.
 * `dataOrIsEmpty` may be a raw boolean (caller already decided), or any
 * value to run through shouldCollapse() first. Safe no-op if `el` is
 * missing (e.g. not yet rendered), same as the app's own helper.
 */
function applyCardCompactState(el, dataOrIsEmpty) {
  if (!el || !el.classList) return;
  const isEmpty = typeof dataOrIsEmpty === 'boolean' ? dataOrIsEmpty : shouldCollapse(dataOrIsEmpty);
  el.classList.toggle('card-compact', !!isEmpty);
  return isEmpty;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shouldCollapse, applyCardCompactState };
}
