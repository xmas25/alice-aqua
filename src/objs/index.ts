import {
  InstancedMesh,
  Mesh,
  Material,
  AbstractMesh,
  ScreenSpaceCanvas2D,
} from '../babylon'

export interface ObjectOptions {
  source: Mesh
  canvas2d: ScreenSpaceCanvas2D
  clock: {
    now: () => number
    timeout: (fn: Function, delay: number) => (() => void)
  }
  icon: {
    material: Material
    texSize: number
    offsetX: number
    offsetY: number
    width: number
    height: number
  }
}

export interface ObjectTriggerable {
  onTrigger(isOn: boolean, by?: AbstractMesh): void
}

export interface ObjectUsable {
  canBeUsedBy(mesh: AbstractMesh): boolean
  displayUsable(mesh: AbstractMesh, show: boolean): void
  useFrom(mesh: AbstractMesh): void
}

export interface ObjectEditable {
  attachEditorContent(container: HTMLElement, save: (args: Partial<ObjectEditable>) => void): void
}

export interface ObjectPlayListener {
  startPlaying(): void
  stopPlaying(): void
}

export class ObjectBase extends InstancedMesh {
  constructor(name: string, readonly opts: ObjectOptions) {
    super(name, opts.source)
  }
}