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
  Command, safeExecute
} from 'phosphor-command';

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
   * The command to execute when the key binding is matched.
   *
   * A command which is not enabled will not be matched.
   */
  command: Command;

  /**
   * The arguments for the command, if necessary.
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
      if (exb) exbArray.push(exb);
    }
    this._bindings = this._bindings.concat(exbArray);
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
      this._clearPendingState();
      return;
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

    // (Re)start the timer to trigger the most recent exact match in
    // the event the pending partial match fails to result in a final
    // unambiguous exact match.
    //
    // TODO - we may want to replay events if an exact match fails.
    event.preventDefault();
    event.stopPropagation();
    this._startTimer();
  }

  /**
   * Remove an array of extended bindings from the key map.
   */
  private _removeBindings(array: IExBinding[]): void {
    this._bindings = this._bindings.filter(exb => array.indexOf(exb) === -1);
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
   * Clear the pending state for the keymap.
   */
  private _clearPendingState(): void {
    this._clearTimer();
    this._exactData = null;
    this._sequence.length = 0;
  }

  /**
   * Handle the partial match timeout.
   */
  private _onPendingTimeout(): void {
    let data = this._exactData;
    this._timer = 0;
    this._exactData = null;
    this._sequence.length = 0;
    if (data) dispatchBindings(data.exact, data.event);
  }

  private _timer = 0;
  private _layout: IKeyboardLayout;
  private _sequence: string[] = [];
  private _bindings: IExBinding[] = [];
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
    command: binding.command,
    args: binding.args || null,
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
    for (let { command, args } of findOrderedMatches(bindings, target)) {
      if (command.isEnabled(args)) {
        event.preventDefault();
        event.stopPropagation();
        safeExecute(command, args);
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
