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
function genKeyboardEvent(options: any): KeyboardEvent {
  let event = document.createEvent('Events') as KeyboardEvent;
  let bubbles = options.bubbles || true;
  let cancelable = options.cancelable || true;
  event.initEvent(options.type || 'keydown', bubbles, cancelable);
  event.keyCode = options.keyCode || 0;
  event.key = options.key || '';
  event.which = event.keyCode;
  event.ctrlKey = options.ctrlKey || false;
  event.altKey = options.altKey || false;
  event.shiftKey = options.shiftKey || false;
  event.metaKey = options.metaKey || false;
  event.view = options.view || window;
  return event;
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
        expect(keymap instanceof KeymapManager).to.be(true);
      });

      it('should accept no arguments', () => {
        let keymap = new KeymapManager();
        expect(keymap instanceof KeymapManager).to.be(true);
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

    describe('#processKeydownEvent()', () => {

      it('should dispatch on a correct keyboard event', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl ;'],
          handler: () => {
            id++;
            return true;
          }
        };

        let disposable = keymap.add([binding]);

        expect(id).to.be(0);

        let keyEvent = genKeyboardEvent({ keyCode: 59, ctrlKey: true });
        node.dispatchEvent(keyEvent);

        expect(id).to.be(1);

        let keyEventIncorrect = genKeyboardEvent({ keyCode: 45, ctrlKey: true });
        node.dispatchEvent(keyEventIncorrect);

        expect(id).to.be(1);

        disposable.dispose();

        node.dispatchEvent(keyEvent);
        expect(id).to.be(1);

        document.body.removeChild(node);
      });

      it('should not dispatch with different modifiers', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 83, ctrlKey: true });
        node.dispatchEvent(keyEvent);

        expect(id).to.be(0);

        let disposable = keymap.add([binding]);

        node.dispatchEvent(keyEvent);
        expect(id).to.be(1);

        let keyEventAlt = genKeyboardEvent({ keyCode: 83, altKey: true });
        node.dispatchEvent(keyEventAlt);
        expect(id).to.be(1);

        let keyEventShift = genKeyboardEvent({ keyCode: 83, shiftKey: true });
        node.dispatchEvent(keyEventShift);
        expect(id).to.be(1);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should dispatch with multiple events in a binding', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl K', 'Ctrl L'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEventK = genKeyboardEvent({ keyCode: 75, ctrlKey: true });
        let keyEventL = genKeyboardEvent({ keyCode: 76, ctrlKey: true });

        let disposable = keymap.add([binding]);

        node.dispatchEvent(keyEventK);
        expect(id).to.be(0);
        node.dispatchEvent(keyEventL);
        expect(id).to.be(1);

        node.dispatchEvent(keyEventL);
        expect(id).to.be(1);
        node.dispatchEvent(keyEventK);
        expect(id).to.be(1);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not stop propagation if handler returns false', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl Y'],
          handler: () => {
            id++;
            return false;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 89, ctrlKey: true });
        let disposable = keymap.add([binding]);

        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be.greaterThan(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not execute handler without matching selector', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: '.myScope',
          sequence: ['Shift P'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 80, shiftKey: true });
        let disposable = keymap.add([binding]);

        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not execute handler on modifier keycode', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl P'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 17 });
        let disposable = keymap.add([binding]);

        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not register invalid sequence', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl Ctrl'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 85, ctrlKey: true });
        let disposable = keymap.add([binding]);
        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should not register invalid selector', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: '123',
          sequence: ['Alt Z'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 90, altKey: true });
        let disposable = keymap.add([binding]);
        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should register partial and exact matches', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let firstBinding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S'],
          handler: () => {
            id++;
            return true;
          }
        };

        let secondId = 0;
        let secondBinding = {
          selector: `#${node.id}`,
          sequence: ['Ctrl S', 'Ctrl D'],
          handler: () => {
            secondId++;
            return true;
          }
        };

        let firstEvent = genKeyboardEvent({ keyCode: 83, ctrlKey: true });
        let secondEvent = genKeyboardEvent({ keyCode: 68, ctrlKey: true });
        let disposable = keymap.add([firstBinding, secondBinding]);

        expect(id).to.be(0);
        expect(secondId).to.be(0);
        node.dispatchEvent(firstEvent);
        expect(id).to.be(0);
        expect(secondId).to.be(0);
        node.dispatchEvent(secondEvent);
        expect(id).to.be(0);
        expect(secondId).to.be(1);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should do nothing with null handlers', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let handler: any = null;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Shift A'],
          handler: handler
        };

        let keyEvent = genKeyboardEvent({ keyCode: 65, altKey: true });
        let disposable = keymap.add([binding]);
        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(0);

        disposable.dispose();
        document.body.removeChild(node);
      });

      it('should recognise permutations of modifiers', () => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let id = 0;
        let binding = {
          selector: `#${node.id}`,
          sequence: ['Shift Alt Ctrl T'],
          handler: () => {
            id++;
            return true;
          }
        };

        let keyEvent = genKeyboardEvent({ keyCode: 84, ctrlKey: true, altKey: true, shiftKey: true });
        let disposable = keymap.add([binding]);

        expect(id).to.be(0);
        node.dispatchEvent(keyEvent);
        expect(id).to.be(1);

        let secondId = 0;
        let secondBinding = {
          selector: `#${node.id}`,
          sequence: ['alt cmd shift ctrl Q'],
          handler: () => {
            id++;
            return true;
          }
        };

        let secondKeyEvent = genKeyboardEvent({ keyCode: 81, ctrlKey: true, altKey: true, shiftKey: true, metaKey: true });
        let secondDisposable = keymap.add([secondBinding]);

        expect(secondId).to.be(0);
        node.dispatchEvent(secondKeyEvent);
        expect(secondId).to.be(0);

        disposable.dispose();
        secondDisposable.dispose();
        document.body.removeChild(node);
      });

      it('should play back a partial match that was not completed', () => {
        let keymap = new KeymapManager();
        let codes: number[] = [];
        let node = createElement();

        let listener = (event: KeyboardEvent) => {
          codes.push(event.keyCode);
        }
        document.body.addEventListener('keydown', listener);

        let called = false;
        keymap.add([{
          selector: `#${node.id}`,
          sequence: ['D', 'D'],
          handler: () => {
            called = true;
            return true;
          }
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
        }
        document.body.addEventListener('keydown', listener);

        node.addEventListener('keydown', (event: KeyboardEvent) => {
          keymap.processKeydownEvent(event);
        });

        let called = false;
        keymap.add([{
          selector: `#${node.id}`,
          sequence: ['D', 'D'],
          handler: () => {
            called = true;
            return true;
          }
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
        }, 1001);
      });

      it('should resolve an exact match for a partial match time out', (done) => {
        let keymap = new KeymapManager();
        let node = createElement();
        node.addEventListener('keydown', (event) => {
          keymap.processKeydownEvent(event)
        });

        let called0 = false;
        let called1 = false;
        keymap.add([{
          selector: `#${node.id}`,
          sequence: ['D', 'D'],
          handler: () => {
            called0 = true;
            return true;
          }
        }, {
          selector: `#${node.id}`,
          sequence: ['D'],
          handler: () => {
            called1 = true;
            return true;
          }
        }]);

        let evt = genKeyboardEvent({ keyCode: 68 });
        node.dispatchEvent(evt);
        expect(called0).to.be(false);
        expect(called1).to.be(false);

        setTimeout(() => {
          expect(called0).to.be(false);
          expect(called1).to.be(true);
          document.body.removeChild(node);
          done();
        }, 1001);
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
        expect(layout instanceof KeycodeLayout).to.be(true);
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
