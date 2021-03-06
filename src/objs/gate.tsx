import { h } from 'preact'

import {
  Mesh,
  Vector2,
  Vector3,
  Color3,
  Quaternion,
  PhysicsImpostor,
  StandardMaterial,
  DynamicTexture,
} from '../babylon'

import {
  VERTEX_BOX,
  VERTEX_PLANE,
  ColorNoLightingMaterial,
} from '../utils/babylon'

import {
  drawIconFont,
} from '../utils/dom'

import {
  ObjectBase,
  ObjectOptions,
  IObjectTriggerable,
} from '../game/objbase'

export default class Gate extends ObjectBase implements IObjectTriggerable {
  public direction = 'x' as 'x' | 'z'
  public isOpen = false

  private creatBox(name: string, cache: Mesh, args: { [dir: string]: { pos: Vector2, rotY: number }[] }) {
    const box = cache.createInstance(this.name + '/' + name)
    box.physicsImpostor = new PhysicsImpostor(box, PhysicsImpostor.BoxImpostor)
    box.physicsImpostor.registerBeforePhysicsStep(_ => {
      const arg = args[this.direction],
        { pos, rotY } = this.isOpen && arg.length > 1 ? arg[1] : arg[0],
        position = this.position.add(new Vector3(pos.x, box.scaling.y / 2, pos.y)),
        rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), rotY)
      if (!position.equalsWithEpsilon(box.position, 1e-3) ||
          rotationQuaternion.subtract(box.rotationQuaternion).length() > 1e-3) {
        setImmediate(() => {
          box.position.copyFrom(Vector3.Lerp(box.position, position, 0.1))
          box.rotationQuaternion.copyFrom(Quaternion.Slerp(box.rotationQuaternion, rotationQuaternion, 0.1))
        })
      }
      if (this._isDisposed) {
        setImmediate(() => box.dispose())
      }
    })

    setImmediate(() => box.position.copyFrom(this.position))
    return box
  }

  private getFlagMesh() {
    const cacheId = 'cache/gate/flag',
      scene = this.getScene()
    let cache = scene.getMeshByName(cacheId) as Mesh
    if (!cache) {
      cache = new Mesh(cacheId, scene)
      cache.isVisible = false
      VERTEX_PLANE.applyToMesh(cache)

      const material = cache.material = new StandardMaterial(cacheId + '/mat', scene)
      material.disableLighting = true
      material.emissiveColor = Color3.White()

      const size = 24,
        texture = material.diffuseTexture =
          new DynamicTexture(cacheId + '/text', size, scene, false, DynamicTexture.NEAREST_SAMPLINGMODE)
      texture.hasAlpha = true

      const dc = texture.getContext()
      dc.fillStyle = new Color3(1, 0.5, 0.5).toHexString()
      drawIconFont(dc, 'fa fa-check-square-o', 0, 0, size)
      texture.update()
    }
    return cache
  }

  constructor(name: string, opts: ObjectOptions) {
    super(name, opts)

    let cacheId: string, cache: Mesh

    cacheId = 'cache/gate/block'
    cache = this.getScene().getMeshByName(cacheId) as Mesh
    if (!cache) {
      cache = new Mesh(cacheId, this.getScene())
      VERTEX_BOX.applyToMesh(cache)
      cache.scaling.copyFromFloats(0.95, 1.8, 0.4)
      cache.isVisible = false
      cache.material = ColorNoLightingMaterial.getCached(this.getScene(), Color3.White().scale(0.8))
    }
    this.creatBox('block/left', cache, {
      x: [
        { pos: new Vector2(-0.50, 0), rotY: 0 },
        { pos: new Vector2(-1.25, 0), rotY: Math.PI / 2 },
      ],
      z: [
        { pos: new Vector2(0, -0.50), rotY: Math.PI / 2 },
        { pos: new Vector2(0, -1.25), rotY: 0 },
      ]
    })
    this.creatBox('block/right', cache, {
      x: [
        { pos: new Vector2( 0.50, 0), rotY: 0 },
        { pos: new Vector2( 1.25, 0), rotY: -Math.PI / 2 },
      ],
      z: [
        { pos: new Vector2(0,  0.50), rotY: -Math.PI / 2 },
        { pos: new Vector2(0,  1.25), rotY: 0 },
      ]
    })

    cacheId = 'cache/gate/border'
    cache = this.getScene().getMeshByName(cacheId) as Mesh
    if (!cache) {
      cache = new Mesh(cacheId, this.getScene())
      VERTEX_BOX.applyToMesh(cache)
      cache.scaling.copyFromFloats(1, 2, 0.5)
      cache.isVisible = false
      cache.material = ColorNoLightingMaterial.getCached(this.getScene(), Color3.White())
    }
    this.creatBox('border/left', cache, {
      x: [
        { pos: new Vector2(-1.25, 0), rotY: Math.PI / 2 },
      ],
      z: [
        { pos: new Vector2(0, -1.25), rotY: 0 },
      ]
    })
    this.creatBox('border/right', cache, {
      x: [
        { pos: new Vector2( 1.25, 0), rotY: Math.PI / 2 },
      ],
      z: [
        { pos: new Vector2(0,  1.25), rotY: 0 },
      ]
    })
  }

  renderConfig(save: (args: Partial<Gate>) => void) {
    return [
      <div>
        <label>direction: </label>
        <select value={ this.direction } onChange={ evt => save({ direction: (evt.target as HTMLSelectElement).value as any }) }>
          <option>x</option>
          <option>z</option>
        </select>
      </div>
    ]
  }

  onTrigger(isOn: boolean) {
    this.isOpen = isOn

    const flagId = this.name + '/flag'
    let flag = this.getScene().getMeshByName(flagId)
    if (isOn && !flag) {
        flag = this.getFlagMesh().createInstance(flagId)
        flag.position.y = 2 + flag.scaling.y / 2
        flag.isVisible = true
        flag.parent = this
        flag.billboardMode = Mesh.BILLBOARDMODE_Y
    }
    if (flag) {
      flag.isVisible = isOn
    }
  }
}
