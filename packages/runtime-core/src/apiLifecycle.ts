import {
  ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  LifecycleHooks,
  setCurrentInstance,
  unsetCurrentInstance
} from './component'
import { ComponentPublicInstance } from './componentPublicInstance'
import { callWithAsyncErrorHandling, ErrorTypeStrings } from './errorHandling'
import { warn } from './warning'
import { toHandlerKey } from '@vue/shared'
import { DebuggerEvent, pauseTracking, resetTracking } from '@vue/reactivity'

export { onActivated, onDeactivated } from './components/KeepAlive'

export function injectHook( // 注入钩子
  type: LifecycleHooks, // 生命周期钩子
  hook: Function & { __weh?: Function }, // 钩子函数
  target: ComponentInternalInstance | null = currentInstance, // 组件实例
  prepend: boolean = false // 是否在前面插入
): Function | undefined {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".
    // 翻译为中文 => 为注入的钩子缓存错误处理包装器，以便调度程序可以正确地对钩子进行去重。 “__weh”代表“带错误处理”。
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        if (target.isUnmounted) { // 组件是否已经卸载
          return
        }
        // disable tracking inside all lifecycle hooks
        // since they can potentially be called inside effects.
        // 翻译为中文 => 在所有的生命周期钩子中禁用追踪，因为它们可能会在effect中调用。 
        pauseTracking()
        // Set currentInstance during hook invocation.
        // This assumes the hook does not synchronously trigger other hooks, which
        // can only be false when the user does something really funky.
        // 翻译为中文 => 在钩子调用期间设置currentInstance。这假设钩子不会同步触发其他钩子，除非用户做了一些非常有趣的事情。
        setCurrentInstance(target) // 设置当前组件实例
        const res = callWithAsyncErrorHandling(hook, target, type, args) // 调用钩子函数
        unsetCurrentInstance() // 重置当前组件实例
        resetTracking() // 重置追踪
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  } else if (__DEV__) {
    const apiName = toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''))
    warn(
      `${apiName} is called when there is no active component instance to be ` +
        `associated with. ` +
        `Lifecycle injection APIs can only be used during execution of setup().` +
        (__FEATURE_SUSPENSE__
          ? ` If you are using async setup(), make sure to register lifecycle ` +
            `hooks before the first await statement.`
          : ``)
    )
  }
}

export const createHook = // 创建钩子
  <T extends Function = () => any>(lifecycle: LifecycleHooks) =>
  (hook: T, target: ComponentInternalInstance | null = currentInstance) =>
    // post-create lifecycle registrations are noops during SSR (except for serverPrefetch)
    // 翻译为中文 => SSR期间，后创建的生命周期注册是无操作的（除了serverPrefetch）
    (!isInSSRComponentSetup || lifecycle === LifecycleHooks.SERVER_PREFETCH) &&
    injectHook(lifecycle, hook, target)

export const onBeforeMount = createHook(LifecycleHooks.BEFORE_MOUNT)
export const onMounted = createHook(LifecycleHooks.MOUNTED)
export const onBeforeUpdate = createHook(LifecycleHooks.BEFORE_UPDATE)
export const onUpdated = createHook(LifecycleHooks.UPDATED)
export const onBeforeUnmount = createHook(LifecycleHooks.BEFORE_UNMOUNT)
export const onUnmounted = createHook(LifecycleHooks.UNMOUNTED)
export const onServerPrefetch = createHook(LifecycleHooks.SERVER_PREFETCH)

export type DebuggerHook = (e: DebuggerEvent) => void
export const onRenderTriggered = createHook<DebuggerHook>(
  LifecycleHooks.RENDER_TRIGGERED
)
export const onRenderTracked = createHook<DebuggerHook>(
  LifecycleHooks.RENDER_TRACKED
)

export type ErrorCapturedHook<TError = unknown> = (
  err: TError,
  instance: ComponentPublicInstance | null,
  info: string
) => boolean | void

export function onErrorCaptured<TError = Error>(
  hook: ErrorCapturedHook<TError>,
  target: ComponentInternalInstance | null = currentInstance
) {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, target)
}
