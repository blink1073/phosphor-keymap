/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import {
  calculateSpecificity, isSelectorValid
} from 'clear-cut';

import {
  DisposableDelegate, IDisposable
} from 'phosphor-disposable';

import {
  EN_US, IKeyboardLayout, keystrokeForKeydownEvent, normalizeKeystroke
} from './keyboard';


/**
 * An object which represents a key binding.
 */
export
interface IKeyBinding {
  /**
   * The key sequence for the key binding.
   *
   * A key sequence is represented as an array of keystrokes, where
   * each keystroke is a combination of modifiers (optional) and a
   * primary key (required).
   *
   * Most key sequences will be an array of length `1`, which represent
   * a typical keyboard shortcut. Sequences of longer length are known
   * as "chords" and can be useful for modal input (ala Vim).
   *
   * Each keystroke in the sequence must adhere to the format:
   *
   *   `[<modifier 1> [<modifier 2> [<modifier N>]]] <primary key>`
   *
   * The supported modifiers are: `Accel`, `Alt`, `Cmd`, `Ctrl`, and
   * `Shift`. The `Accel` modifier is translated to `Cmd` on Mac and
   * `Ctrl` on all other platforms.
   *
   * Each keystroke must conform to the following:
   *   - Modifiers and the primary key are case senstive.
   *   - The primary key must be a valid key for the layout.
   *   - Whitespace is used to separate modifiers and primary key.
   *   - Modifiers may appear in any order before the primary key.
   *   - Modifiers cannot appear in duplicate.
   *   - The `Cmd` modifier is only valid on Mac.
   *
   * If a keystroke is nonconforming, the key binding will be ignored.
   */
  sequence: string[];

  /**
   * The CSS selector for the key binding.
   *
   * The selector must match a node on the propagation path of the
   * keyboard event in order for the binding command to be invoked.
   *
   * If the selector is invalid, the key binding will be ignored.
   */
  selector: string;

  /**
   * The handler to execute when the key binding is matched.
   *
   * Returns `true` if the action is handled, `false` otherwise.
   */
  handler: (args: any) => boolean;

  /**
   * The arguments for the handler, if necessary.
   */
  args?: any;
}


/**
 * A class which manages a collection of key bindings.
 */
export
class KeymapManager {
  /**
   * Construct a new key map manager.
   *
   * @param layout - The keyboard layout to use with the manager.
   *   The default layout is US English.
   */
  constructor(layout: IKeyboardLayout = EN_US) {
    this._layout = layout;
  }

  /**
   * Get the keyboard layout used by the manager.
   *
   * #### Notes
   * This is a read-only property.
   */
  get layout(): IKeyboardLayout {
    return this._layout;
  }

  /**
   * Add key bindings to the key map manager.
   *
   * @param bindings - The key bindings to add to the manager.
   *
   * @returns A disposable which removes the added key bindings.
   *
   * #### Notes
   * If a key binding is invalid, a warning will be logged to the
   * console and the offending key binding will be ignored.
   *
   * If multiple key bindings are registered for the same sequence,
   * the binding with the highest CSS specificity is executed first.
   *
   * Ambiguous key bindings are resolved with a timeout.
   */
  add(bindings: IKeyBinding[]): IDisposable {
    let exbArray: IExBinding[] = [];
    for (let kb of bindings) {
      let exb = createExBinding(kb, this._layout);
      if (exb !== null) {
        exbArray.push(exb);
        this._bindings.push(exb);
      }
    }
    return new DisposableDelegate(() => this._removeBindings(exbArray));
  }

  /**
   * Process a `'keydown'` event and invoke a matching key binding.
   *
   * @param event - The event object for a `'keydown'` event.
   *
   * #### Notes
   * This should be called in response to a `'keydown'` event in order
   * to invoke the handler function of the best matching key binding.
   *
   * The manager **does not** install its own key event listeners. This
   * allows user code full control over the nodes for which the manager
   * processes `'keydown'` events.
   */
  processKeydownEvent(event: KeyboardEvent): void {
    // Bail immediately if playing back keystrokes.
    if (this._replaying) {
      return;
    }

    // Get the canonical keystroke for the event. An empty string
    // indicates a keystroke which cannot be a valid key shortcut.
    let keystroke = keystrokeForKeydownEvent(event, this._layout);
    if (!keystroke) {
      return;
    }

    // Add the keystroke to the current key sequence.
    this._sequence.push(keystroke);

    // Find the exact and partial matches for the key sequence.
    let matches = findSequenceMatches(this._bindings, this._sequence);

    // If there are no exact matches and no partial matches, clear
    // all pending state so the next key press starts from default.
    if (matches.exact.length === 0 && matches.partial.length === 0) {
      this._replayEvents();
      this._clearPendingState();
      return;
    }

    // If there are partial matches, make sure the selector actually
    // matches, otherwise captured `keydown` events would be prevented
    // from propagating.
    if (matches.partial.length > 0) {
      matches.partial = findMatchingBindings(event, matches.partial);
    }

    // If there are exact matches but no partial matches, the exact
    // matches can be dispatched immediately. The pending state is
    // cleared so the next key press starts from default.
    if (matches.partial.length === 0) {
      this._clearPendingState();
      dispatchBindings(matches.exact, event);
      return;
    }

    // If there are both exact matches and partial matches, the exact
    // matches are stored so that they can be dispatched if the timer
    // expires before a more specific match is found.
    if (matches.exact.length > 0) {
      this._exactData = { exact: matches.exact, event: event };
    }

    // Store the event for possible playback in the future.
    this._events.push(event);

    // (Re)start the timer to trigger the most recent exact match in
    // the event the pending partial match fails to result in a final
    // unambiguous exact match.
    event.preventDefault();
    event.stopPropagation();
    this._startTimer();
  }

  /**
   * Remove an array of extended bindings from the key map.
   */
  private _removeBindings(exbArray: IExBinding[]): void {
    let count = 0;
    for (let i = 0, n = this._bindings.length; i < n; ++i) {
      let exb = this._bindings[i];
      if (exbArray.indexOf(exb) !== -1) {
        count++;
      } else {
        this._bindings[i - count] = exb;
      }
    }
    this._bindings.length -= count;
  }

  /**
   * Start or restart the pending timer for the key map.
   */
  private _startTimer(): void {
    this._clearTimer();
    this._timer = setTimeout(() => {
      this._onPendingTimeout();
    }, 1000);
  }

  /**
   * Clear the pending timer for the key map.
   */
  private _clearTimer(): void {
    if (this._timer !== 0) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
  }

  /**
   * Replay the events which were suppressed.
   */
  private _replayEvents(): void {
    if (this._events.length === 0) {
      return;
    }
    this._replaying = true;
    for (let evt of this._events) {
      evt.target.dispatchEvent(cloneKeyboardEvent(evt));
    }
    this._replaying = false;
  }

  /**
   * Clear the pending state for the keymap.
   */
  private _clearPendingState(): void {
    this._clearTimer();
    this._exactData = null;
    this._events.length = 0;
    this._sequence.length = 0;
  }

  /**
   * Handle the partial match timeout.
   */
  private _onPendingTimeout(): void {
    this._timer = 0;
    if (this._exactData) {
      dispatchBindings(this._exactData.exact, this._exactData.event);
    } else {
      this._replayEvents();
    }
    this._clearPendingState();
  }

  private _timer = 0;
  private _replaying = false;
  private _layout: IKeyboardLayout;
  private _sequence: string[] = [];
  private _bindings: IExBinding[] = [];
  private _events: KeyboardEvent[] = [];
  private _exactData: IExactData = null;
}


/**
 * An extended key binding object which holds extra data.
 */
interface IExBinding extends IKeyBinding {
  /**
   * The specificity of the CSS selector.
   */
  specificity: number;
}


/**
 * An object which holds pending exact match data.
 */
interface IExactData {
  /**
   * The exact match bindings.
   */
  exact: IExBinding[];

  /**
   * The keyboard event which triggered the exact match.
   */
  event: KeyboardEvent;
}


/**
 * An object which holds the results of a sequence match.
 */
interface IMatchResult {
  /**
   * The bindings which exactly match the key sequence.
   */
  exact: IExBinding[];

  /**
   * The bindings which partially match the key sequence.
   */
  partial: IExBinding[];
}


/**
 * Create an extended key binding from a user key binding.
 *
 * Warns and returns `null` if the key binding is invalid.
 */
function createExBinding(binding: IKeyBinding, layout: IKeyboardLayout): IExBinding {
  if (!isSelectorValid(binding.selector)) {
    console.warn(`invalid key binding selector: ${binding.selector}`);
    return null;
  }
  if (binding.sequence.length === 0) {
    console.warn('empty key sequence for key binding');
    return null;
  }
  try {
    var sequence = binding.sequence.map(ks => normalizeKeystroke(ks, layout));
  } catch (e) {
    console.warn(e.message);
    return null;
  }
  return {
    sequence: sequence,
    args: binding.args,
    handler: binding.handler,
    selector: binding.selector,
    specificity: calculateSpecificity(binding.selector),
  };
}


/**
 * An enum which describes the possible sequence matches.
 */
const enum SequenceMatch { None, Exact, Partial };


/**
 * Test whether an ex-binding sequence matches a key sequence.
 *
 * Returns a `SequenceMatch` value indicating the type of match.
 */
function matchSequence(exbSeq: string[], keySeq: string[]): SequenceMatch {
  if (exbSeq.length < keySeq.length) {
    return SequenceMatch.None;
  }
  for (let i = 0, n = keySeq.length; i < n; ++i) {
    if (exbSeq[i] !== keySeq[i]) {
      return SequenceMatch.None;
    }
  }
  if (exbSeq.length > keySeq.length) {
    return SequenceMatch.Partial;
  }
  return SequenceMatch.Exact;
}


/**
 * Find the extended bindings which match a key sequence.
 *
 * Returns a match result which contains the exact and partial matches.
 */
function findSequenceMatches(bindings: IExBinding[], sequence: string[]): IMatchResult {
  let exact: IExBinding[] = [];
  let partial: IExBinding[] = [];
  for (let exb of bindings) {
    let match = matchSequence(exb.sequence, sequence);
    if (match === SequenceMatch.Exact) {
      exact.push(exb);
    } else if (match === SequenceMatch.Partial) {
      partial.push(exb);
    }
  }
  return { exact: exact, partial: partial };
}


/**
 * Find the bindings which match the given target element.
 *
 * The matched bindings are ordered from highest to lowest specificity.
 */
function findOrderedMatches(bindings: IExBinding[], target: Element): IExBinding[] {
  return bindings.filter(exb => {
    return matchesSelector(target, exb.selector);
  }).sort((a, b) => {
    return b.specificity - a.specificity;
  });
}


/**
 * Dispatch the key bindings for the given keyboard event.
 *
 * As the dispatcher walks up the DOM, the bindings will be filtered
 * for the best matching keybinding. If a match is found, the handler
 * is invoked and event propagation is stopped.
 */
function dispatchBindings(bindings: IExBinding[], event: KeyboardEvent): void {
  let target = event.target as Element;
  while (target) {
    for (let { handler, args } of findOrderedMatches(bindings, target)) {
      if (handler(args)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (target === event.currentTarget) {
      return;
    }
    target = target.parentElement;
  }
}


/**
 * Find the bindings that match a given event based on selector.
 */
function findMatchingBindings(event: KeyboardEvent, bindings: IExBinding[]): IExBinding[] {
  let newBindings: IExBinding[] = [];
  for (let i = 0; i < bindings.length; i++) {
    let target = event.target as Element;
    while (target) {
      if (matchesSelector(target, bindings[i].selector)) {
        newBindings.push(bindings[i]);
        break;
      }
      if (target === event.currentTarget) {
        break;
      }
      target = target.parentElement;
    }
  }
  return newBindings;
}


/**
 * A cross-browser CSS selector matching prototype function.
 *
 * This function must be called with an element as `this` context.
 */
const protoMatchFunc: Function = (() => {
  let proto = Element.prototype as any;
  return (
    proto.matches ||
    proto.matchesSelector ||
    proto.mozMatchesSelector ||
    proto.msMatchesSelector ||
    proto.oMatchesSelector ||
    proto.webkitMatchesSelector ||
    (function(selector: string) {
      let elem = this as Element;
      let matches = elem.ownerDocument.querySelectorAll(selector);
      return Array.prototype.indexOf.call(matches, elem) !== -1;
    })
  );
})();


/**
 * Test whether an element matches a CSS selector.
 */
function matchesSelector(elem: Element, selector: string): boolean {
  return protoMatchFunc.call(elem, selector);
}


/**
 * Clone a keyboard event.
 *
 * #### Notes
 * A custom event is required because Chrome nulls out the `keyCode`
 * field in user-generated `KeyboardEvent` types.
 */
function cloneKeyboardEvent(event: KeyboardEvent) {
  let clone = document.createEvent('Event') as KeyboardEvent;
  let bubbles = event.bubbles || true;
  let cancelable = event.cancelable || true;
  clone.initEvent(event.type || 'keydown', bubbles, cancelable);
  clone.key = event.key || '';
  clone.keyCode = event.keyCode || 0;
  clone.which = event.keyCode || 0;
  clone.ctrlKey = event.ctrlKey || false;
  clone.altKey = event.altKey || false;
  clone.shiftKey = event.shiftKey || false;
  clone.metaKey = event.metaKey || false;
  clone.view = event.view || window;
  return clone;
}
