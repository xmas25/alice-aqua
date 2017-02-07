import {
  Mesh,
  Vector3,
} from './babylon'

import {
  createScene,
  loadAssets,
  SavedMap,
} from './game'

import {
  ObjectBase,
  ObjectOptions,
  ObjectPlayListener,
} from './objs'

import {
  appendElement,
  LoadingScreen,
  MenuManager,
  KeyEmitter,
} from './utils/dom'

import {
  queue,
  step,
  EventEmitter,
} from './utils'

import Chunks, { TileDefine } from './game/chunks'
import SkyBox from './game/skybox'
import { StageLoader } from './objs/stage'

const KEY_MAP = {
  escape: 'ESCAPE',
  return: 'RETURN',
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  'nav-vertical': 'UP | DOWN',
  'nav-horizontal': 'LEFT | RIGHT',
}

interface StageOptions {
  scene: BABYLON.Scene
  tiles: TileDefine[]
  classes: {
    clsId: number
    cls: typeof ObjectBase
    opts: ObjectOptions
    args: any
  }[]
}

class Stage {
  readonly chunks: Chunks
  readonly objects: (ObjectBase & ObjectPlayListener)[]
  constructor(
      readonly url: string,
      readonly position: Vector3,
      map: SavedMap, opts: StageOptions) {
    const entryPosition = this.position.clone(),
      entryId = Object.keys(map.objectsData).find(id => map.objectsData[id].args.editorSingletonId === 'stage/entry')
    if (entryId) {
      const { x, y, z, args } = map.objectsData[entryId]
      entryPosition.subtractInPlace(new Vector3(Math.floor(x), Math.floor(y + (args.offsetY || 0)), Math.floor(z)))
    }

    const name = url.split('.').slice(-2).shift()
    this.chunks = new Chunks(name, opts.scene, opts.tiles, map.chunksData, entryPosition)
    this.objects = [ ]

    Object.keys(map.objectsData).forEach(id => {
      const objData = map.objectsData[id],
        clsFound = opts.classes.find(c => c.clsId === objData.clsId)
      if (clsFound) {
        const { opts, cls } = clsFound,
          { x, y, z } = objData,
          args = Object.assign({ }, clsFound.args, objData.args),
          object = new cls(id, opts)
        object.position.copyFromFloats(x, y, z).addInPlace(entryPosition)
        Object.assign(object, args)
        this.objects.push(object as any)
      }
      else {
        console.warn(`class ${objData.clsId} is not found! ignoring object #${id}`)
      }
    })
    this.objects.forEach((object: ObjectPlayListener) => object.startPlaying && object.startPlaying() as any)
  }

  dispose() {
    this.objects.forEach((object: ObjectPlayListener) => object.stopPlaying && object.stopPlaying())
    this.objects.forEach(object => object.dispose())
    this.chunks.dispose()
  }
}

class StageManager {
  // TODO: save it somewhere
  private static _oldestURL = localStorage.getItem('stage-oldest-url') || ''
  static get oldestURL() {
    return this._oldestURL
  }
  static set oldestURL(val) {
    localStorage.setItem('stage-oldest-url', val)
    this._oldestURL = val
  }

  private stages = [ ] as Stage[]
  private isDisposed = false

  private addToQueue = queue()
  private async doLoad(url: string, position: Vector3) {
    if (!this.stages.find(stage => stage.url === url && stage.position.equals(position))) {
      const map = await fetch(url).then(res => res.json()) as any as SavedMap
      if (!this.isDisposed) {
        this.stages.push(new Stage(url, position, map, this.opts))
        this.stages.length > 2 && this.stages.shift().dispose()
        StageManager.oldestURL = this.stages[0].url
      }
    }
    return url
  }

  constructor(private opts: StageOptions) {
  }

  async loadFromURL(url: string, position: Vector3) {
    await this.addToQueue(() => this.doLoad(url, position))
    return url
  }

  async loadFromLoader(loader: StageLoader) {
    const { position: { x, y, z }, offsetY } = loader,
      position = new Vector3(Math.floor(x), Math.floor(y + offsetY), Math.floor(z))
    return await this.loadFromURL(loader.stageURL, position)
  }

  dispose() {
    this.stages.forEach(stage => stage.dispose())
    this.isDisposed = true
  }
}

const camelCaseToHyphen = (str: string) => str.replace(/[a-z][A-Z]{1}/g, m => m[0] + '-' + m[1].toLowerCase()),
  wrapString = (str: string) => str.replace(/'[^']*'/g, m => '\'' + btoa(m.slice(1, -1))),
  unwrapString = (str: string) => str[0] === '\'' ? atob(str.slice(1)) : str
class GameState<H extends { [name: string]: (next: () => Promise<any>, ...args: any[]) => Promise<any> }> {
  private stack = [ ] as { name: string, next: () => Promise<any> }[]
  private queue = queue()

  constructor(private handles: H) {
    const styles = [ ] as string[]
    Object.keys(handles).forEach(name => {
      const cls = camelCaseToHyphen(name)
      styles.push(`.screen-${cls} { visibility: hidden }`)
      styles.push(`.game-${cls} .screen-${cls} { visibility: visible }`)
    })
    appendElement('style', { innerHTML: styles.join('\n') }, 'head')
  }

  private async exit() {
    if (this.stack.length > 0) {
      const { name, next } = this.stack.pop()
      document.body.classList.remove('game-' + camelCaseToHyphen(name))
      await next()
      const current = this.current
      current && MenuManager.activate('.menu-' + camelCaseToHyphen(current))
    }
  }

  private async enter(name: keyof H, ...args: any[]) {
    if (this.handles[name]) {
      const next = await step(next => this.handles[name](next, ...args))
      this.stack.push({ name, next })
      document.body.classList.add('game-' + camelCaseToHyphen(name))
      MenuManager.activate('.menu-' + camelCaseToHyphen(name))
    }
  }

  private async gotoAsync(path: string) {
    for (const name of wrapString(path).split('/')) {
      if (name === '..') {
        await this.exit()
      }
      else if (name) {
        await this.enter.apply(this, name.split(':').map(unwrapString))
      }
    }
  }

  goto(path: string) {
    return this.queue(() => this.gotoAsync(path))
  }

  get current() {
    const last = this.stack[this.stack.length - 1]
    return last && last.name
  }
}

class ConfigManager extends EventEmitter<{ change: string }> {
  static async load() {
    const config = new ConfigManager()
    // TODO: load from somewhere
    try {
      Object.assign(config.data, JSON.parse(localStorage.getItem('game-config')))
    }
    catch (err) {
      console.error(err)
    }

    Object.keys(config.data).forEach(key => {
      const val = config.data[key],
        configItem = document.querySelector(`[config-key="${key}"]`)
      if (configItem) {
        const allValues = configItem.querySelectorAll('[config-val]')
        for (const elem of allValues) {
          elem.classList.remove('active')
        }
        const configValue = configItem.querySelector(`[config-val="${val}"]`) || allValues[0]
        configValue.classList.add('active')
      }
    })
    return config
  }
  private constructor(private data = {
    lang: 'en',
    display: 'fine',
    volume: '3',
  } as { [key: string]: any }) {
    super()
  }
  val(key: string) {
    return this.data[key]
  }
  update() {
    const activeList = MenuManager.activeList(),
      key = activeList && activeList.getAttribute('config-key'),
      activeItem = MenuManager.activeItem(),
      val = activeItem && activeItem.getAttribute('config-val')
    this.data[key] = val
    this.emit('change', key)
  }
  save() {
    localStorage.setItem('game-config', JSON.stringify(this.data))
  }
}

function updateLoadingScreenProgress(index: number, total: number, progress: number) {
  LoadingScreen.update(`Loading Assets ${index + 1}/${total} (${~~(progress * 100)}%)`)
}

function updateLanguage(lang: string) {
  for (const elem of document.querySelectorAll(`[i18n-${lang}]`)) {
    elem.innerHTML = elem.getAttribute(`i18n-${lang}`)
  }
}

; (async function() {
  const { scene, camera, canvas2d, ctrl, clock } = createScene(),
    source = new Mesh('cache/object/source', scene),
    assets = await loadAssets(scene, updateLoadingScreenProgress),
    configManager = await ConfigManager.load(),
    keyInput = new KeyEmitter(KEY_MAP)

  new SkyBox('sky', scene)

  updateLanguage(configManager.val('lang'))
  configManager.on('change', key => {
    if (key === 'lang') {
      updateLanguage(configManager.val(key))
    }
  })

  const gameState = new GameState({
    async main(next) {
      camera.followTarget.copyFromFloats(0, 0, 0)
      await next()
    },
    async play(next, url: string) {
      const tiles = assets.tiles,
        classes = assets.classes.map(({ icon, ...others }) => ({ ...others, opts: { icon, source, canvas2d, clock } })),
        stageManager = new StageManager({ scene, classes, tiles }),
        onTrigger = StageLoader.eventEmitter.on('trigger', loader => stageManager.loadFromLoader(loader))
      await stageManager.loadFromURL(url || StageManager.oldestURL, Vector3.Zero())
      await next()
      StageLoader.eventEmitter.off('trigger', onTrigger)
      stageManager.dispose()
    },
    async pause(next) {
      ctrl.pause()
      await next()
      ctrl.resume()
    },
    async config(next) {
      const selectNextConfig = (up: boolean) => MenuManager.selectNext(up ? -1 : 1, 'menu-config-list', 'menu-config-item'),
        changeConfigItem = keyInput.down('nav-vertical', () => selectNextConfig(keyInput.state.up)),
        changeConfigValue = keyInput.down('nav-horizontal', () => configManager.update())
      await next()
      keyInput.off('nav-vertical', changeConfigItem)
      keyInput.off('nav-horizontal', changeConfigValue)
      configManager.save()
    },
  })

  keyInput.down('escape', () => {
    const activeList = MenuManager.activeList()
    if (activeList) {
      gameState.goto(activeList.getAttribute('menu-escape') || '')
    }
  })

  keyInput.down('return', () => {
    const activeItem = MenuManager.activeItem()
    if (activeItem) {
      gameState.goto(activeItem.getAttribute('menu-goto') || '')
    }
  })

  keyInput.down('nav-vertical', () => {
    const activeList = MenuManager.activeList()
    if (activeList && !activeList.classList.contains('menu-horizontal')) {
      MenuManager.selectNext(keyInput.state.up ? -1 : 1)
    }
  })

  keyInput.down('nav-horizontal', () => {
    const activeList = MenuManager.activeList()
    if (activeList && !activeList.classList.contains('menu-vertical')) {
      MenuManager.selectNext(keyInput.state.left ? -1 : 1)
    }
  })

  await new Promise(resolve => setTimeout(resolve, 1000))

  camera.lowerBetaSoftLimit = Math.PI * 0.35
  camera.upperRadiusSoftLimit = 40

  gameState.goto('main')
  LoadingScreen.hide()
})()
