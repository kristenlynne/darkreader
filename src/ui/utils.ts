import {MessageType} from '../utils/message';
import {isFirefox, isMobile} from '../utils/platform';
import type {Message} from '../definitions';

export function classes(...args: Array<string | {[cls: string]: boolean}>) {
    const classes: string[] = [];
    args.filter((c) => Boolean(c)).forEach((c) => {
        if (typeof c === 'string') {
            classes.push(c);
        } else if (typeof c === 'object') {
            classes.push(...Object.keys(c).filter((key) => Boolean(c[key])));
        }
    });
    return classes.join(' ');
}

export function compose<T extends Malevic.Component>(type: T, ...wrappers: Array<(t: T) => T>) {
    return wrappers.reduce((t, w) => w(t), type);
}

export function openFile(options: {extensions: string[]}, callback: (content: string) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (options.extensions && options.extensions.length > 0) {
        input.accept = options.extensions.map((ext) => `.${ext}`).join(',');
    }
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result as string);
    input.onchange = () => {
        if (input.files[0]) {
            reader.readAsText(input.files[0]);
            document.body.removeChild(input);
        }
    };
    document.body.appendChild(input);
    input.click();
}

export function saveFile(name: string, content: string) {
    if (isFirefox) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content]));
        a.download = name;
        a.click();
    } else {
        chrome.runtime.sendMessage<Message>({type: MessageType.UI_SAVE_FILE, data: {name, content}});
    }
}

type AnyVoidFunction = (...args: any[]) => void;

export function throttle<F extends AnyVoidFunction>(callback: F): F {
    let frameId: number = null;
    return ((...args: any[]) => {
        if (!frameId) {
            callback(...args);
            frameId = requestAnimationFrame(() => (frameId = null));
        }
    }) as F;
}

interface SwipeEventObject {
    clientX: number;
    clientY: number;
}

type SwipeEventHandler<T = void> = (e: SwipeEventObject, nativeEvent: MouseEvent | TouchEvent) => T;
type StartSwipeHandler = SwipeEventHandler<{move: SwipeEventHandler; up: SwipeEventHandler}>;

function onSwipeStart(
    startEventObj: MouseEvent | TouchEvent,
    startHandler: StartSwipeHandler,
) {
    const isTouchEvent =
        typeof TouchEvent !== 'undefined' &&
        startEventObj instanceof TouchEvent;
    const touchId = isTouchEvent
        ? (startEventObj as TouchEvent).changedTouches[0].identifier
        : null;
    const pointerMoveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
    const pointerUpEvent = isTouchEvent ? 'touchend' : 'mouseup';

    if (!isTouchEvent) {
        startEventObj.preventDefault();
    }

    function getSwipeEventObject(e: MouseEvent | TouchEvent) {
        const {clientX, clientY} = isTouchEvent
            ? getTouch(e as TouchEvent)
            : e as MouseEvent;
        return {clientX, clientY};
    }

    const startSE = getSwipeEventObject(startEventObj);
    const {move: moveHandler, up: upHandler} = startHandler(startSE, startEventObj);

    function getTouch(e: TouchEvent) {
        return Array.from(e.changedTouches).find(
            ({identifier: id}) => id === touchId,
        );
    }

    const onPointerMove = throttle((e) => {
        const se = getSwipeEventObject(e);
        moveHandler(se, e);
    });

    function onPointerUp(e: MouseEvent) {
        unsubscribe();
        const se = getSwipeEventObject(e);
        upHandler(se, e);
    }

    function unsubscribe() {
        window.removeEventListener(pointerMoveEvent, onPointerMove);
        window.removeEventListener(pointerUpEvent, onPointerUp);
    }

    window.addEventListener(pointerMoveEvent, onPointerMove, {passive: true});
    window.addEventListener(pointerUpEvent, onPointerUp, {passive: true});
}

export function createSwipeHandler(startHandler: StartSwipeHandler) {
    return (e: MouseEvent | TouchEvent) => onSwipeStart(e, startHandler);
}

export async function getFontList() {
    return new Promise<string[]>((resolve) => {
        if (!chrome.fontSettings) {
            // Todo: Remove it as soon as Firefox and Edge get support.
            resolve([
                'serif',
                'sans-serif',
                'monospace',
                'cursive',
                'fantasy',
                'system-ui'
            ]);
            return;
        }
        chrome.fontSettings.getFontList((list) => {
            const fonts = list.map((f) => f.fontId);
            resolve(fonts);
        });
    });
}

export async function getExtensionPageObject(path: string): Promise<chrome.windows.Window | chrome.tabs.Tab> {
    if (isMobile) {
        return new Promise<chrome.tabs.Tab>((resolve) => {
            chrome.tabs.query({}, (t) => {
                for (const tab of t) {
                    if (tab.url.endsWith(path)) {
                        resolve(tab);
                        return;
                    }
                }
                resolve(null);
            });
        });
    }
    return new Promise<chrome.windows.Window>((resolve) => {
        chrome.windows.getAll({
            populate: true,
            windowTypes: ['popup']
        }, (w) => {
            for (const window of w) {
                if (window.tabs[0].url.endsWith(path)) {
                    resolve(window);
                    return;
                }
            }
            resolve(null);
        });
    });
}

export async function openExtensionPage(page: 'devtools' | 'stylesheet-editor') {
    const path = `${page}/index.html`;
    const cssEditorObject = await getExtensionPageObject(path);
    if (isMobile) {
        if (cssEditorObject) {
            chrome.tabs.update(cssEditorObject.id, {'active': true});
            window.close();
        } else {
            chrome.tabs.create({
                url: `../${path}`,
            });
            window.close();
        }
    } else if (cssEditorObject) {
        chrome.windows.update(cssEditorObject.id, {'focused': true});
    } else {
        chrome.windows.create({
            type: 'popup',
            // Note: this is a hack which works on Firefox because all
            // UI pages have paths like ui/*/index.html
            // See also: https://github.com/w3c/webextensions/issues/273
            url: isFirefox ? `../${path}` : `ui/${path}`,
            width: 600,
            height: 600,
        });
    }
}
