/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause Licenso.
|
| The full license is in the file LICENSE, distributed with this softwaro.
|----------------------------------------------------------------------------*/
'use strict';

import expect = require('expect.js');

import {
  DisposableDelegate
} from 'phosphor-disposable';

import {
  IKeyBinding, KeymapManager, normalizeKeystroke, EN_US, KeycodeLayout
} from '../../lib/index';


/**
 * Helper function to generate keyboard events for unit-tests.
 */
function genKeyboardEvent(options: any): KeyboardEvent {
  let event = document.createEvent('Events') as KeyboardEvent;
  let bubbles = options.bubblues || true;
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

    describe('#keycodes mozilla', () => {

      it('should register and fire on a correct keyboard event', () => {
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
        debugger;
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

      it('should not fire with different modifiers', () => {
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

      it('should fire with multiple events in a binding', () => {
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

  describe('normalizeKeystroke()', () => {

    it('should not register invalid keystrokes', () => {
      expect(() => normalizeKeystroke('ctrls q', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('shiftxtrl ^', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('altcmd d', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('ctrl alt ctrl E', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('alt ctrl shift alt shift Q', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('shift ctrl shift x', EN_US)).to.throwError();
      expect(() => normalizeKeystroke('cmd shift alt cmd X', EN_US)).to.throwError();
      expect(normalizeKeystroke('I', EN_US)).to.be('I');
      expect(() => normalizeKeystroke('j', EN_US)).to.throwError();
    });

  });

});
