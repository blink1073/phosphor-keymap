/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import expect = require('expect.js');

import {
  DisposableDelegate
} from 'phosphor-disposable';

import {
  IKeyBinding, KeymapManager, normalizeKeystroke, EN_US, KeycodeLayout,
  keystrokeForKeydownEvent
} from '../../lib/index';


/**
 * Helper function to generate keyboard events for unit-tests.
 */
function genKeyboardEvent(options?: any): KeyboardEvent {
  options = options || {};
  options.bubbles = options.bubbles || true;
  options.cancelable = options.cancelable || true;
  let evt = new KeyboardEvent('keydown', options);
  // Work around bug in Chrome that zeros out the keyCode.
  Object.defineProperty(evt, 'keyCode', {
      value: options['keyCode'], writable: true });
  return evt;
}

let id = 0;


/**
 * A flag indicating whether the platform is Mac.
 */
var IS_MAC = !!navigator.platform.match(/Mac/i);


/**
 * Create an element with a unique id and add to the document.
 */
function createElement(): HTMLElement {
  let el = document.createElement('div');
  (el as any).id = `test${id++}`;
  document.body.appendChild(el);
  return el;
}


describe('phosphor-keymap', () => {

  describe('KeymapManager', () => {

    describe('#constructor()', () => {

      it('should accept a keyboard layout argument', () => {
        let keymap = new KeymapManager(EN_US);
        expect(keymap).to.be.a(KeymapManager);
      });

      it('should accept no arguments', () => {
        let keymap = new KeymapManager();
        expect(keymap).to.be.a(KeymapManager);
      })

    });

    describe('#layout', () => {

      it('should be a keycode layout', () => {
        let keymap = new KeymapManager();
        expect(keymap.layout instanceof KeycodeLayout).to.be(true);
      });

      it('should default to `EN_US` layout', () => {
        let keymap = new KeymapManager();
        expect(keymap.layout).to.be(EN_US);
      });

      it('should be read only', () => {
        let keymap = new KeymapManager();
        expect(() => { keymap.layout = null }).to.throwError();
      });

    });

    describe('#add()', () => {

      it('should add key bindings to the keymap manager', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        let called = false;
        node.addEventListener('keydown', event => {
          keymap.processKeydownEvent(event);
        });
        let disposable = keymap.add([
          {
            selector: `#${node.id}`,
            sequence: ['Ctrl ;'],
            handler: () => { called = true; }
          }
        ]);
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called).to.be(true);
        document.body.removeChild(node);
      });

      it('should remove the keybindings when disposed', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        let called = false;
        node.addEventListener('keydown', event => {
          keymap.processKeydownEvent(event);
        });
        let disposable = keymap.add([
          {
            selector: `#${node.id}`,
            sequence: ['Ctrl ;'],
            handler: () => { called = true; }
          }
        ]);
        disposable.dispose();
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called).to.be(false);
        document.body.removeChild(node);
      });

      it('should ignore an invalid sequence', () => {
        let keymap = new KeymapManager();
        let disposable = keymap.add([
          {
            selector: 'body',
            sequence: ['Ctrl Ctrl'],
            handler: () => { }
          }
        ]);
        disposable.dispose();
      });

      it('should ignore an empty sequence', () => {
        let keymap = new KeymapManager();
        let disposable = keymap.add([
          {
            selector: 'body',
            sequence: [],
            handler: () => { }
          }
        ]);
        disposable.dispose();
      });

      it('should ignore an invalid selector', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        let called = false;
        node.addEventListener('keydown', event => {
          keymap.processKeydownEvent(event);
        });
        let disposable = keymap.add([
          {
            selector: '..',
            sequence: ['Ctrl ;'],
            handler: () => { called = true; }
          }
        ]);
        disposable.dispose();
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called).to.be(false);
        document.body.removeChild(node);
      });

    });

    describe('#processKeydownEvent()', () => {

      it('should dispatch on a correct keyboard event', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });
        let called = false;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl ;'],
          handler: () => { called = true; }
        };
        keymap.add([binding]);
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called).to.be(true);
        document.body.removeChild(node);
      });

      it('should not dispatch on a non-matching keyboard event', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });
        let called = false;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl ;'],
          handler: () => { called = true; }
        };
        keymap.add([binding]);
        let keyEventIncorrect = genKeyboardEvent({ keyCode: 45, ctrlKey: true });
        node.dispatchEvent(keyEventIncorrect);
        expect(called).to.be(false);
        document.body.removeChild(node);
      });

      it('should not dispatch with non-matching modifiers', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S'],
          handler: () => { count++; }
        };
        keymap.add([binding]);

        let keyEventAlt = genKeyboardEvent({ keyCode: 83, altKey: true });
        node.dispatchEvent(keyEventAlt);
        expect(count).to.be(0);

        let keyEventShift = genKeyboardEvent({ keyCode: 83, shiftKey: true });
        node.dispatchEvent(keyEventShift);
        expect(count).to.be(0);
        document.body.removeChild(node);
      });

      it('should dispatch with multiple chords in a sequence', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl K', 'Ctrl L'],
          handler: () => { count++; }
        };

        let keyEventK = genKeyboardEvent({ keyCode: 75, ctrlKey: true });
        let keyEventL = genKeyboardEvent({ keyCode: 76, ctrlKey: true });

        keymap.add([binding]);

        node.dispatchEvent(keyEventK);
        expect(count).to.be(0);
        node.dispatchEvent(keyEventL);
        expect(count).to.be(1);

        node.dispatchEvent(keyEventL);
        expect(count).to.be(1);
        node.dispatchEvent(keyEventK);
        expect(count).to.be(1);
        document.body.removeChild(node);
      });

      it('should not execute handler without matching selector', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count = 0;
        let binding = {
          selector: '.myScope',
          sequence: ['Shift P'],
          handler: () => { count++; }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 80, shiftKey: true });
        let disposable = keymap.add([binding]);

        expect(count).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(count).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not execute a handler when missing a modifier', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl P'],
          handler: () => { count++; }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 17 });
        let disposable = keymap.add([binding]);

        expect(count).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(count).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should register partial and exact matches', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count0 = 0;
        let firstBinding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S'],
          handler: () => { count0++; }
        };

        let count1 = 0;
        let secondBinding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S', 'Ctrl D'],
          handler: () => { count1++; }
        };

        let firstEvent = genKeyboardEvent({ keyCode: 83, ctrlKey: true });
        let secondEvent = genKeyboardEvent({ keyCode: 68, ctrlKey: true });
        let disposable = keymap.add([firstBinding, secondBinding]);

        expect(count0).to.be(0);
        expect(count1).to.be(0);
        node.dispatchEvent(firstEvent);
        expect(count0).to.be(0);
        expect(count1).to.be(0);
        node.dispatchEvent(secondEvent);
        expect(count0).to.be(0);
        expect(count1).to.be(1);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should recognise permutations of modifiers', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let count0 = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Shift Alt Ctrl T'],
          handler: () => { count0++; }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 84, ctrlKey: true, altKey: true, shiftKey: true });
        let disposable = keymap.add([binding]);

        expect(count0).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(count0).to.be(1);

        let count1 = 0;
        let secondBinding = {
          selector: `#${node.id}`,
          sequence: ['Alt Shift Ctrl Q'],
          handler: () => { count1++; }
        };

        let secondKeyEvent = genKeyboardEvent({ keyCode: 81, ctrlKey: true, altKey: true, shiftKey: true });
        let secondDisposable = keymap.add([secondBinding]);

        expect(count1).to.be(0);
        node.dispatchEvent(secondKeyEvent);
        expect(count1).to.be(1);

        document.body.removeChild(node);
      });

      it('should play back a partial match that was not completed', () => {
        let keymap = new KeymapManager();
        let codes: number[] = [];
        let node = createElement();

        let listener = (event: KeyboardEvent) => {
          codes.push(event.keyCode);
        };
        document.body.addEventListener('keydown', listener);

        let called = false;
        keymap.add([{
          selector: `#${node.id}`,
          sequence: ['D', 'D'],
          handler: () => {  called = true; }
        }]);

        node.addEventListener('keydown', (event: KeyboardEvent) => {
          keymap.processKeydownEvent(event);
        });

        let first = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(first);
        expect(codes).to.eql([]);
        let second = genKeyboardEvent({ keyCode: 69 });
        node.dispatchEvent(second);
        expect(called).to.be(false);
        expect(codes).to.eql([68, 69]);
        document.body.removeChild(node);
        document.body.removeEventListener('keydown', listener);
      });

      it('should play back a partial match that times out', (done) => {
        let keymap = new KeymapManager();
        let codes: number[] = [];
        let node = createElement();
        let listener = (event: KeyboardEvent) => {
          codes.push(event.keyCode);
        };
        document.body.addEventListener('keydown', listener);

        node.addEventListener('keydown', (event: KeyboardEvent) => {
          keymap.processKeydownEvent(event);
        });

        let called = false;
        keymap.add([{
          selector: `#${node.id}`,
          sequence: ['D', 'D'],
          handler: () => { called = true; }
        }]);

        let evt = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(evt);
        expect(codes).to.eql([]);

        setTimeout(() => {
          expect(codes).to.eql([68]);
          expect(called).to.be(false);
          document.body.removeChild(node);
          document.body.removeEventListener('keydown', listener);
          done();
        }, 1300);
      });

      it('should resolve an exact match for a partial match time out', (done) => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let called0 = false;
        let called1 = false;
        keymap.add([
          {
            selector: `#${node.id}`,
            sequence: ['D', 'D'],
            handler: () => { called0 = true; }
          },
          {
            selector: `#${node.id}`,
            sequence: ['D'],
            handler: () => { called1 = true; }
          }
        ]);

        let evt = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(evt);
        expect(called0).to.be(false);
        expect(called1).to.be(false);

        setTimeout(() => {
          expect(called0).to.be(false);
          expect(called1).to.be(true);
          document.body.removeChild(node);
          done();
        }, 1300);
      });

      it('should safely process when an error occurs', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        let called = false;
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
          called = true;
        });
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl ;'],
          handler: () => {
            throw Error('Whoops');
          }
        };
        keymap.add([binding]);
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called).to.be(true);
        document.body.removeChild(node);
      });

      it('should pick the selector with greater specificity', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });
        node.classList.add('test');
        let called0 = false;
        let called1 = false;
        let bindings = [
          {
            selector: 'div',
            sequence: ['Ctrl ;'],
            handler: () => { called0 = true; }
          },
          {
            selector: `#${node.id}`,
            sequence: ['Ctrl ;'],
            handler: () => { called1 = true; }
          }
        ];

        keymap.add(bindings);
        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);
        expect(called0).to.be(false);
        expect(called1).to.be(true);
        document.body.removeChild(node);
      });

      it('should not stop propagation when a partial binding selector does not match', () => {
        let keymap = new KeymapManager();
        let codes: number[] = [];
        let node = createElement();
        let listener = (event: KeyboardEvent) => {
          codes.push(event.keyCode);
        };
        document.body.addEventListener('keydown', listener);

        node.addEventListener('keydown', (event: KeyboardEvent) => {
          keymap.processKeydownEvent(event);
        });

        let called = false;
        keymap.add([
          {
            selector: '#baz',
            sequence: ['D', 'D'],
            handler: () => { called = true; }
          }
        ]);

        let evt = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(evt);
        expect(codes).to.eql([68]);
        expect(called).to.be(false);
        document.body.removeChild(node);
        document.body.removeEventListener('keydown', listener);
      });

      it('should not stop propagation when an exact binding selector does not match', () => {
        let keymap = new KeymapManager();
        let codes: number[] = [];
        let node = createElement();
        let listener = (event: KeyboardEvent) => {
          codes.push(event.keyCode);
        };
        document.body.addEventListener('keydown', listener);

        node.addEventListener('keydown', (event: KeyboardEvent) => {
          keymap.processKeydownEvent(event);
        });

        let called = false;
        keymap.add([{
          selector: '#baz',
          sequence: ['D'],
          handler: () => { called = true; }
        }]);

        let evt = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(evt);
        expect(codes).to.eql([68]);
        expect(called).to.be(false);
        document.body.removeChild(node);
        document.body.removeEventListener('keydown', listener);
      });

    });

  });

  describe('keystrokeForKeydownEvent()', () => {

    it('should create a normalized keystroke', () => {
      let evt = genKeyboardEvent({ ctrlKey: true, keyCode: 83 });
      let keystroke = keystrokeForKeydownEvent(evt, EN_US);
      expect(keystroke).to.be('Ctrl S');
    });

    it('should handle multiple modifiers', () => {
      let evt = genKeyboardEvent({
        ctrlKey: true, altKey: true, shiftKey: true, keyCode: 83
      });
      let keystroke = keystrokeForKeydownEvent(evt, EN_US);
      expect(keystroke).to.be('Ctrl Alt Shift S');
    });

    it('should fail on an invalid shortcut', () => {
      let evt = genKeyboardEvent({ keyCode: -1 });
      let keystroke = keystrokeForKeydownEvent(evt, EN_US);
      expect(keystroke).to.be('');
    });

  });

  describe('normalizeKeystroke()', () => {

    it('should normalize and validate a keystroke', () => {
      let stroke = normalizeKeystroke('Ctrl S', EN_US);
      expect(stroke).to.be('Ctrl S');
    });

    it('should handle multiple modifiers', () => {
      let stroke = normalizeKeystroke('Ctrl Shift Alt S', EN_US);
      expect(stroke).to.be('Ctrl Alt Shift S');
    });

    it('should handle platform specific modifiers', () => {
      let stroke = '';
      if (IS_MAC) {
        stroke = normalizeKeystroke('Cmd S', EN_US);
        expect(stroke).to.be('Cmd S');
        stroke = normalizeKeystroke('Accel S', EN_US);
        expect(stroke).to.be('Cmd S');
      } else {
        expect(() => normalizeKeystroke('Cmd S', EN_US)).to.throwError();
        stroke = normalizeKeystroke('Accel S', EN_US);
        expect(stroke).to.be('Ctrl S');
      }
    });

    it('should fail when modifiers or primary keys are duplicated', () => {
      expect(() => normalizeKeystroke('Ctrl Ctrl S', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('Alt Alt S', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('Cmd Cmd S', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('Shift Shift S', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('S S', EN_US)).to.throwError();
    });

    it('should fail if a modifier follows a primary key', () => {
      expect(() => normalizeKeystroke('S Ctrl', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('S Alt', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('S Cmd', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('S Shift', EN_US)).to.throwError();
    });

    it('should fail if the primary key is not specified', () => {
      expect(() => normalizeKeystroke('Shift', EN_US)).to.throwError();
    });

  });

  describe('KeyCodeLayout', () => {

    describe('#constructor()', () => {

      it('should construct a new keycode layout', () => {
        let layout = new KeycodeLayout('foo', {});
        expect(layout).to.be.a(KeycodeLayout);
      });

    });

    describe('#name', () => {

      it('should be a human readable name of the layout', () => {
        let layout = new KeycodeLayout('foo', {});
        expect(layout.name).to.be('foo');
      });

      it('should be read-only', () => {
        let layout = new KeycodeLayout('foo', {});
        expect(() => { layout.name = 'bar'; }).to.throwError();
      });

    });

    describe('#keycaps()', () => {

      it('should get an array of all keycap values supported by the layout', () => {
        let layout = new KeycodeLayout('foo', { 100: 'F' });
        let keycaps = layout.keycaps();
        expect(keycaps.length).to.be(1);
        expect(keycaps[0]).to.be('F');
      });

    });

    describe('#isValidKeycap()', () => {

      it('should test whether the keycap is valid for the layout', () => {
        let layout = new KeycodeLayout('foo', { 100: 'F' });
        expect(layout.isValidKeycap('F')).to.be(true);
        expect(layout.isValidKeycap('A')).to.be(false);
      });

    });

    describe('#keycapForKeydownEvent()', () => {

      it('should get the keycap for a `keydown` event', () => {
        let layout = new KeycodeLayout('foo', { 100: 'F' });
        let evt = genKeyboardEvent({ keyCode: 100 });
        let cap = layout.keycapForKeydownEvent(evt);
        expect(cap).to.be('F');
      });

      it('should return an empty string if the code is not valid', () => {
        let layout = new KeycodeLayout('foo', { 100: 'F' });
        let evt = genKeyboardEvent({ keyCode: 101 });
        let cap = layout.keycapForKeydownEvent(evt);
        expect(cap).to.be('');
      });

    });

  });

  describe('EN_US', () => {

    it('should be a keycode layout', () => {
      expect(EN_US instanceof KeycodeLayout).to.be(true);
    });

    it('should have some standard keycaps', () => {
      expect(EN_US.isValidKeycap('A')).to.be(true);
      expect(EN_US.isValidKeycap('Z')).to.be(true);
      expect(EN_US.isValidKeycap('0')).to.be(true);
      expect(EN_US.isValidKeycap('a')).to.be(false);
    });

  });

});
