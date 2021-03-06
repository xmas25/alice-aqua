import {
  h,
  Component,
  render as renderWithReact,
} from 'preact'

import {
  EventEmitter,
  queryStringGet,
  queryStringSet,
  promiseObject,
} from './'

export async function checkFontsLoaded() {
  const fonts = (document as any).fonts
  if (fonts && fonts.ready) {
    await fonts.ready
  }
}

export interface ElementAttributes {
  attributes?: any
  style?: any
  [key: string]: any
}

export function createElement(tag: string, attrs = { } as ElementAttributes, children = [ ] as Element[]) {
  attrs = { ...attrs }
  const elem = document.createElement(tag)
  if (attrs.style) {
    'width/height/lineHeight/left/top/right/bottom'.split('/').forEach(name => {
      attrs.style[name] > 0 && (attrs.style[name] = attrs.style[name] + 'px')
    })
    Object.assign(elem.style, attrs.style)
    delete attrs.style
  }
  if (attrs.attributes) {
    for (const key in attrs.attributes) {
      elem.setAttribute(key, attrs.attributes[key])
    }
    delete attrs.attributes
  }
  Object.assign(elem, attrs)
  children.forEach((child: Element) => elem.appendChild(child))
  return elem
}

export function appendElement(tag: string, attrs = { } as ElementAttributes, parent = document.body as string | Element) {
  const elem = createElement(tag, attrs)
  if (typeof parent === 'string') {
    document.querySelector(parent).appendChild(elem)
  }
  else if (parent) {
    parent.appendChild(elem)
  }
  return elem
}

export async function appendScript(src: string) {
  let script: HTMLScriptElement
  await new Promise((onload, onerror) => script = appendElement('script', { src, onload, onerror }) as HTMLScriptElement)
  return script
}

export function renderReactComponent<P, S>(render: (state: S, props?: P) => JSX.Element, container: Element) {
  class Renderer extends Component<P, S> {
    setStatePartial(state: Partial<S>) {
      super.setState(state as S)
    }
    componentDidMount() {
      wait.resolve(this as Renderer)
    }
    render() {
      return render(this.state)
    }
  }
  const wait = promiseObject<Renderer>()
  renderWithReact(h(Renderer, { }), container)
  return wait.promise
}

export function drawIconFont(dc: CanvasRenderingContext2D, className: string, x: number, y: number, size: number) {
  const attrs = { className, width: size, height: size, style: { fontSize: size + 'px' } },
    span = appendElement('i', attrs) as HTMLCanvasElement,
    style = getComputedStyle(span, ':before'),
    text = (style.content || '').replace(/"/g, '')
  dc.save()
  dc.textAlign = 'center'
  dc.textBaseline = 'middle'
  dc.font = style.font
  dc.fillText(text, x + size / 2, y + size / 2)
  dc.restore()
  span.parentNode.removeChild(span)
}

export function promptDownloadText(filename: string, content: string) {
  const a = appendElement('a', {
    href: 'data:text/json;charset=utf-8,' + encodeURIComponent(content),
    target: '_blank',
    download: filename,
  }) as HTMLLinkElement
  a.click()
  a.parentNode.removeChild(a)
}

export function requestUploadingText() {
  return new Promise<string>((resolve, reject) => {
    const f = appendElement('input', { type: 'file', className: 'hidden' }) as HTMLInputElement
    f.addEventListener('change', _ => {
      const r = new FileReader()
      r.onload = _ => resolve(r.result)
      r.onerror = reject
      r.readAsText(f.files[0])
    })
    f.click()
    f.parentNode.removeChild(f)
  })
}

export function attachDragable<T>(
  elemOrFilter: HTMLElement | ((evt: MouseEvent) => T),
  onDown:  (evt: MouseEvent, arg?: T) => void,
  onMove?: (evt: MouseEvent, arg?: T) => void,
  onUp?:   (evt: MouseEvent, arg?: T) => void) {
  let arg: T

  function handleMouseDown(evt: MouseEvent) {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    if (typeof elemOrFilter !== 'function' || (arg = elemOrFilter(evt))) {
      onDown(evt, arg)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
  }

  function handleMouseMove(evt: MouseEvent) {
    onMove && onMove(evt, arg)
  }

  function handleMouseUp(evt: MouseEvent) {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    onUp && onUp(evt, arg)
  }

  const elem = typeof elemOrFilter !== 'function' ? elemOrFilter : window
  elem.addEventListener('mousedown', handleMouseDown)
  return () => {
    elem.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }
}

export const LocationSearch = {
  get(key: string): string {
    return queryStringGet(location.search.replace(/^\?/, ''), key)
  },
  set(dict: any) {
    location.search = queryStringSet(location.search.replace(/^\?/, ''), dict)
  },
}

const LOADING_SCREEN_STYLE = `
.loading-screen {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.loading-screen {
  background: #eee;
  color: #333;
  font-size: 150%;
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s 0.2s, opacity 0.2s linear;
  z-index: 99;
  text-align: center;
}
.loading-screen.loading {
  visibility: visible;
  opacity: 1;
}
.loading-screen .loading-dot:before {
  content: '-';
}
.loading-screen .loading-dot {
  color: #666;
  font-size: 200%;
  transition: all 0.3s;
}
.loading-screen .loading-dot.active {
  color: #aaa;
  font-size: 100%;
}
`
type LoadingScreenState = {
  isLoading: boolean,
  loadText: string,
  loadError: string,
}
let loadingScreenContainer = window as any as {
  _loadingScreenTimeout: number
  _loadingScreenInst: {
    setStatePartial(states: Partial<LoadingScreenState>): void
    state: LoadingScreenState
  }
}
export const LoadingScreen = {
  async init() {
    if (!loadingScreenContainer._loadingScreenInst) {
      await appendElement('style', { innerHTML: LOADING_SCREEN_STYLE }, document.querySelector('head'))
      loadingScreenContainer._loadingScreenInst = await renderReactComponent<null, LoadingScreenState>((states) =>
        <div class={ `loading-screen ${states.isLoading ? 'loading' : ''}` }>
        {
          states.loadError ?
          <div class="loading-error">
            { states.loadError }
            <div>
              : (
            </div>
          </div> :
          <div class="loading-text">
            { states.loadText }
            <div>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
              <span class="loading-dot"></span>
            </div>
          </div>
        }
        </div>, document.body)
    }
  },
  inst() {
    const c = loadingScreenContainer
    c._loadingScreenTimeout = c._loadingScreenTimeout || setTimeout(LoadingScreen.check, 300)
    return c._loadingScreenInst
  },
  check() {
    const c = loadingScreenContainer
    if (c._loadingScreenInst.state.isLoading) {
      const dots = Array.from(document.querySelectorAll('.loading-dot')),
        index = dots.findIndex(dot => dot.classList.contains('active'))
      if (dots.length) {
        dots.forEach(dot => dot.classList.remove('active'))
        dots[(index + 1) % dots.length].classList.add('active')
      }
      c._loadingScreenTimeout && clearTimeout(c._loadingScreenTimeout)
      c._loadingScreenTimeout = setTimeout(LoadingScreen.check, 300)
    }
    else {
      c._loadingScreenTimeout = 0
    }
  },
  update(message: string) {
    LoadingScreen.inst().setStatePartial({ loadError: '', loadText: message, isLoading: true })
  },
  error(message: string) {
    LoadingScreen.inst().setStatePartial({ loadText: '', loadError: message, isLoading: true })
  },
  hide() {
    LoadingScreen.inst().setStatePartial({ isLoading: false })
  },
}

export const MenuManager = {
  activate(list: string | Element, itemSelector?: string, listClass = 'menu-list', itemClass = 'menu-item') {
    for (const elem of document.querySelectorAll(`.${listClass}.active`)) {
      elem.classList.remove('active')
    }
    const elem = typeof list === 'string' ? document.querySelector(list) : list,
      listElem = elem && (elem.classList.contains(listClass) ? elem : elem.querySelector(`.${listClass}`))
    if (listElem) {
      listElem.classList.add('active')
      const lastActive = listElem.querySelector(`.${itemClass}.active`)
      if (lastActive) {
        lastActive.classList.remove('active')
      }
      const listItem = itemSelector ? listElem.querySelector(itemSelector) :
        (lastActive ? [lastActive] : [ ]).concat(Array.from(listElem.querySelectorAll(`.${itemClass}`)))
          .filter(elem => !elem.classList.contains('hidden'))[0]
      if (listItem) {
        listItem.classList.add('active')
      }
    }
  },
  activeList(listClass = 'menu-list') {
    return document.querySelector(`.${listClass}.active`)
  },
  activeItem(listClass = 'menu-list', itemClass = 'menu-item') {
    return document.querySelector(`.${listClass}.active .${itemClass}.active`)
  },
  selectNext(delta: number, listClass = 'menu-list', itemClass = 'menu-item') {
    const activeList = MenuManager.activeList(listClass)
    if (activeList) {
      const activeItem = MenuManager.activeItem(listClass, itemClass),
        allItems = Array.from(activeList.querySelectorAll(`.${itemClass}`))
          .filter(elem => !elem.classList.contains('hidden')),
        nextItem = allItems[(allItems.indexOf(activeItem) + delta + allItems.length) % allItems.length]
      activeItem && activeItem.classList.remove('active')
      nextItem && nextItem.classList.add('active')
    }
  },
  createList(parent: Element, menuOptions: { [title: string]: string }, escapePath: string) {
    const listItem = appendElement('div', { className: 'menu-list', attributes: { 'menu-escape': escapePath } }, parent)
    for (const title of Object.keys(menuOptions)) {
      appendElement('span', { innerHTML: title, className: 'menu-item', attributes: { 'menu-goto': menuOptions[title] } }, listItem)
    }
    return listItem
  },
}

export function loadWithXHR<T>(src: string, opts?: any, onProgress?: (progress: number) => void) {
  return new Promise<T>((onload, onerror) => {
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('error', onerror)
    xhr.addEventListener('load', _ => xhr.status === 200 ? onload(xhr.response) : onerror(xhr.statusText))
    xhr.addEventListener('progress', evt => onProgress && onProgress(evt.loaded / evt.total))
    Object.assign(xhr, opts)
    xhr.open('get', src)
    xhr.send()
  })
}

export async function readBlob(blob: Blob, type = 'dataURL' as 'objectURL' | 'arrayBuffer' | 'dataURL') {
  return new Promise<string>((onload, onerror) => {
    const fr = new FileReader()
    fr.onload = function() { onload(this.result) }
    fr.onerror = onerror
    if (type === 'objectURL') {
      onload(URL.createObjectURL(blob))
    }
    else if (type === 'arrayBuffer') {
      fr.readAsArrayBuffer(blob)
    }
    else if (type === 'dataURL') {
      fr.readAsDataURL(blob)
    }
    else {
      onerror(new Error('invalid type'))
    }
  })
}

export async function loadBlobWithXHR(src: string, onProgress?: (progress: number) => void) {
  return await loadWithXHR<Blob>(src, { responseType: 'blob' }, onProgress)
}

const SPECIAL_KEYS: { [keyCode: number]: string } = {
  [13]: 'RETURN',
  [16]: 'SHIFT',
  [17]: 'CTRL',
  [27]: 'ESCAPE',
  [32]: 'SPACE',
  [37]: 'LEFT',
  [38]: 'UP',
  [39]: 'RIGHT',
  [40]: 'DOWN',
  [46]: 'DELETE',
}

export class KeyEmitter<KM> extends EventEmitter<{ [P in keyof KM]: boolean }> {
  readonly down = new EventEmitter<{ [P in keyof KM]: KeyboardEvent }>()
  readonly up = new EventEmitter<{ [P in keyof KM]: KeyboardEvent }>()
  readonly state = { } as { [P in keyof KM]: boolean }
  readonly any = new EventEmitter<{
    change: { name: keyof KM, down: boolean }
    up:     keyof KM
    down:   keyof KM
  }>()

  protected keyEvents = new EventEmitter<{ [key: string]: { isDown: boolean, event: KeyboardEvent } }>()
  constructor(keyMap: KM) {
    super()

    for (const name in keyMap) {
      const comboKeys = (keyMap[name] + '').split('|'),
        comboKeyDown = comboKeys.map(_ => false)
      comboKeys.forEach((combKey, order) => {
        const keys = combKey.split('+').map(s => s.replace(/^\s+/, '').replace(/\s+$/, '')),
          keyDown = keys.map(_ => false)
        keys.forEach((key, index) => this.keyEvents.on(key, ({ isDown, event }) => {
          keyDown[index] = isDown
          comboKeyDown[order] = keyDown.every(Boolean)
          const down = comboKeyDown.some(Boolean)
          if (this.state[name] !== down) {
            this.emit(name, this.state[name] = down)
            this[down ? 'down' : 'up'].emit(name, event)
            this.any.emit(down ? 'down' : 'up', name)
            this.any.emit('change', { name, down })
          }
        }))
      })
    }

    window.addEventListener('keydown', evt => {
      const key = SPECIAL_KEYS[evt.which] || String.fromCharCode(evt.which) || evt.which.toString()
      this.keyEvents.emit(key, { isDown: true, event: evt })
    })

    window.addEventListener('keyup', evt => {
      const key = SPECIAL_KEYS[evt.which] || String.fromCharCode(evt.which) || evt.which.toString()
      this.keyEvents.emit(key, { isDown: false, event: evt })
    })
  }
}
