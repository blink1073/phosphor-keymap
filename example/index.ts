/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use-strict';

import {
  SimpleCommand
} from 'phosphor-command';

import {
  IKeyBinding, KeymapManager, keystrokeForKeydownEvent
} from 'phosphor-keymap';


/**
 * A list of keyboard shortcuts for the example.
 */
var SHORTCUTS = [
  ['A'],
  ['B'],
  ['D'],
  ['Escape'],
  ['D', 'D'],
  ['Accel ='],
  ['Accel -'],
  ['Accel ['],
  ['Accel ]'],
  ['Accel A'],
  ['Accel C'],
  ['Accel V'],
  ['Shift B'],
  ['Shift Enter'],
  ['Ctrl Space'],
  ['Ctrl Alt 0'],
  ['Ctrl K', 'Ctrl ;'],
  ['Shift F7', 'Shift F8'],
  ['Alt N', 'Alt M', 'Shift Alt P'],
];


/**
 * Convert a key sequence into a display string.
 */
function makeStr(sequence: string[]): string {
  return sequence.map(s => s.replace(/\s/g, '-')).join(' ');
}


/**
 * A shortcut handler function which logs the sequence.
 *
 * This handler always returns true to stop event propagation.
 */
function logHandler(sequence: string[]): boolean {
  var span = document.getElementById('log-span');
  span.textContent = makeStr(sequence);
  return true;
}


/**
 * Create a log key binding for the given key sequence.
 */
function makeLogBinding(sequence: string[]): IKeyBinding {
  return {
    selector: '*',
    sequence: sequence,
    command: new SimpleCommand({ handler: logHandler.bind(void 0, sequence) })
  };
}


/**
 * Create an unordered list from an array of strings.
 */
function createList(data: string[][]): HTMLElement {
  var ul = document.createElement('ul');
  ul.innerHTML = data.map(seq => `<li>${makeStr(seq)}</li>`).join('');
  return ul;
}


/**
 * The main application entry point.
 */
function main(): void {
  // Create the key bindings for the shortcuts.
  var bindings = SHORTCUTS.map(makeLogBinding);

  // Initialize the keymap manager with the bindings.
  var keymap = new KeymapManager();
  keymap.add(bindings);

  // Setup the keydown listener for the document.
  document.addEventListener('keydown', event => {
    keymap.processKeydownEvent(event);
  });

  // Create and add the list of shortcuts to the DOM.
  var host = document.getElementById('list-host');
  host.appendChild(createList(SHORTCUTS));
}


window.onload = main;
