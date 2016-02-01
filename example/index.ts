/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import {
  IKeyBinding, KeymapManager
} from 'phosphor-keymap';


/**
 * A list of keyboard shortcuts for the example.
 */
const SHORTCUTS = [
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
 * A command which logs the key binding sequence.
 */
const logCommand = {
  execute: (args: any) => {
    let span = document.getElementById('log-span');
    span.textContent = makeStr(args.sequence as string[]);
  },
  isEnabled: (args: any) => {
    return true;
  },
};


/**
 * Create a log key binding for the given key sequence.
 */
function makeLogBinding(sequence: string[]): IKeyBinding {
  return {
    selector: '*',
    sequence: sequence,
    command: logCommand,
    args: { sequence },
  };
}


/**
 * Create an unordered list from an array of strings.
 */
function createList(data: string[][]): HTMLElement {
  let ul = document.createElement('ul');
  ul.innerHTML = data.map(seq => `<li>${makeStr(seq)}</li>`).join('');
  return ul;
}


/**
 * The main application entry point.
 */
function main(): void {
  // Create the key bindings for the shortcuts.
  let bindings = SHORTCUTS.map(makeLogBinding);

  // Initialize the keymap manager with the bindings.
  let keymap = new KeymapManager();
  keymap.add(bindings);

  // Setup the keydown listener for the document.
  document.addEventListener('keydown', event => {
    keymap.processKeydownEvent(event);
  });

  // Create and add the list of shortcuts to the DOM.
  let host = document.getElementById('list-host');
  host.appendChild(createList(SHORTCUTS));
}


window.onload = main;
