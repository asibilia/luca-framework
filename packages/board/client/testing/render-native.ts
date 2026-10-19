/**
 * A small renderer for the side panel's tests. React Native doesn't load
 * under Bun (its entry is Flow), so this module stands in for it, and for
 * the Paseo plugin's client modules: their components are plain host nodes
 * ('View', 'Text', 'Pressable', ...), and function components run with
 * their hooks. A test reads the tree it renders (texts, styles, line
 * limits) and taps what a person would tap.
 *
 * Import it before any client module, and load client modules with a
 * dynamic `import()`, so they get the stand-ins. While a screen is mounted
 * its timers are fake: `advance` moves the clock and fires them.
 */
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

import type { PluginTheme } from '@getpaseo/plugin'
import { mock, setSystemTime } from 'bun:test'

const { createElement } = React

export type HostNode = {
    type: string
    props: Record<string, unknown>
    children: Child[]
    parent: HostNode | null
}

type Child = HostNode | string

type Style = Record<string, unknown>

/** Any style prop, flattened: arrays merged in order, falsy parts skipped. */
export const flatten = (style: unknown): Style => {
    if (Array.isArray(style)) {
        return Object.assign({}, ...style.map((part) => flatten(part)))
    }
    return style && typeof style === 'object' ? { ...(style as Style) } : {}
}

const Platform = {
    OS: 'ios',
    select: (choices: Record<string, unknown>) =>
        'ios' in choices ? choices.ios : choices.default,
}

const StyleSheet = {
    create: <T>(styles: T): T => styles,
    flatten,
    compose: (left: unknown, right: unknown) => [left, right],
    hairlineWidth: 1,
    absoluteFill: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    absoluteFillObject: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
}

const WINDOW = { width: 390, height: 844, scale: 3, fontScale: 1 }

const FlatList = ({
    data,
    renderItem,
}: {
    data: unknown[]
    renderItem: (info: { item: unknown; index: number }) => ReactNode
}) =>
    createElement(
        'FlatList',
        null,
        ...(data ?? []).map((item, index) => renderItem({ item, index }))
    )

/** The host's modal: its children only while it is open. */
const PluginModal = Object.assign(
    ({
        open,
        title,
        children,
    }: {
        open: boolean
        title: string
        children: ReactNode
    }) => (open ? createElement('Modal', { title }, children) : null),
    {
        Content: ({ children }: { children: ReactNode }) =>
            createElement('View', null, children),
    }
)

mock.module('react-native', () => ({
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    TouchableOpacity: 'Pressable',
    TouchableWithoutFeedback: 'Pressable',
    ScrollView: 'ScrollView',
    Modal: 'Modal',
    TextInput: 'TextInput',
    Image: 'Image',
    SafeAreaView: 'View',
    FlatList,
    StyleSheet,
    Platform,
    Dimensions: { get: () => WINDOW },
    useWindowDimensions: () => WINDOW,
    Linking: { openURL: async () => undefined },
}))

mock.module('@getpaseo/plugin/client/react-native', () => ({
    Icon: 'Icon',
    Modal: PluginModal,
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    FlatList,
    useToast: () => ({ show: () => undefined, error: () => undefined }),
    useRevealedText: (text: string) => text,
    copyText: async () => undefined,
}))

mock.module('@getpaseo/plugin/client', () => ({
    usePaseo: () => ({}),
    useRpc: () => async () => ({}),
    useWorkspace: () => null,
    useAgent: () => null,
    useSettings: () => ({}),
    useHosts: () => [],
    openExternalUrl: async () => undefined,
}))

mock.module('@getpaseo/plugin/client/ui', () => ({
    ExternalLink: 'ExternalLink',
    SettingsGroup: 'View',
    SettingsSection: 'View',
    SettingsCard: 'View',
    SettingsRow: 'View',
    SettingsSwitch: 'View',
    SettingsSelect: 'View',
    SettingsInput: 'TextInput',
    SettingsAction: 'Pressable',
}))

/** A host theme with a distinct color per slot. */
export const THEME: PluginTheme = {
    colors: {
        surface0: '#101010',
        surface1: '#181818',
        surface2: '#202020',
        border: '#303030',
        foreground: '#f0f0f0',
        foregroundMuted: '#a0a0a0',
        accent: '#4080ff',
        accentForeground: '#ffffff',
        statusSuccess: '#40c040',
        statusWarning: '#e0a020',
        statusDanger: '#e04040',
    },
}

/** A phone-sized layout, as `PluginHostProps` passes it. */
export const LAYOUT = { compact: true, platform: 'ios' as const }

/** The host, as `PluginHostProps` passes it. */
export const HOST = { id: 'paseo-test', label: 'Paseo' }

const FRAGMENT = Symbol.for('react.fragment')
const MEMO = Symbol.for('react.memo')
const FORWARD_REF = Symbol.for('react.forward_ref')
const CONTEXT = Symbol.for('react.context')
const CONSUMER = Symbol.for('react.consumer')

type Hook = {
    ready: boolean
    value: unknown
    deps: unknown[] | undefined
    cleanup: (() => void) | undefined
    dispatch: ((action: unknown) => void) | undefined
}

type Instance = { hooks: Hook[] }

type Context = { $$typeof: symbol; _currentValue: unknown }

type Timer = { at: number; every: number | null; run: () => void }

const internals = (
    React as unknown as {
        __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
            H: unknown
        }
    }
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

const depsChanged = (
    before: unknown[] | undefined,
    after: unknown[] | undefined
): boolean =>
    before === undefined ||
    after === undefined ||
    before.length !== after.length ||
    before.some((value, index) => !Object.is(value, after[index]))

const nameOf = (type: unknown): string =>
    typeof type === 'string'
        ? type
        : typeof type === 'function'
          ? type.name
          : typeof type === 'object' && type !== null
            ? String((type as { $$typeof?: symbol }).$$typeof?.description)
            : String(type)

/** Every host node under `node`, itself first, depth first. */
export const nodesIn = (node: HostNode): HostNode[] => [
    node,
    ...node.children.flatMap((child) =>
        typeof child === 'string' ? [] : nodesIn(child)
    ),
]

/** The text a node shows, nested texts included. */
export const textOf = (node: Child): string =>
    typeof node === 'string' ? node : node.children.map(textOf).join('')

/** A node's style, flattened. */
export const styleOf = (node: HostNode): Style => flatten(node.props.style)

const insideText = (node: HostNode): boolean => {
    for (let up = node.parent; up !== null; up = up.parent) {
        if (up.type === 'Text') return true
    }
    return false
}

/** The `Text` nodes under `node` that no other `Text` holds: its lines. */
export const textsIn = (node: HostNode): HostNode[] =>
    nodesIn(node).filter((found) => found.type === 'Text' && !insideText(found))

/** The node itself or its nearest ancestor with a handler named `name`. */
const handlerFor = (node: HostNode, name: string): HostNode | null => {
    for (let up: HostNode | null = node; up !== null; up = up.parent) {
        if (typeof up.props[name] === 'function') return up
    }
    return null
}

/** The real timers, put back when a screen unmounts. */
const REAL_TIMERS = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
}

const EVENT = {
    nativeEvent: {},
    stopPropagation: () => undefined,
    preventDefault: () => undefined,
}

/**
 * Renders `element` and returns its screen. `unmount` it after the test:
 * it puts the real timers back.
 */
export const render = (element: ReactElement) => {
    let top: ReactElement = element
    let root: HostNode = { type: 'root', props: {}, children: [], parent: null }
    const instances = new Map<string, Instance>()
    let seen = new Set<string>()
    let effects: { hook: Hook; create: () => unknown }[] = []
    let current: { instance: Instance; index: number; path: string } | null =
        null
    let contexts = new Map<Context, unknown>()
    let dirty = false
    let busy = false

    let clock = Date.now()
    let next_timer = 1
    const timers = new Map<number, Timer>()
    const addTimer = (run: () => void, ms: number, every: boolean) => {
        const id = next_timer++
        const wait = Math.max(1, ms ?? 0)
        timers.set(id, { at: clock + wait, every: every ? wait : null, run })
        return id
    }
    const fake = globalThis as unknown as Record<string, unknown>
    fake.setTimeout = (run: () => void, ms: number) => addTimer(run, ms, false)
    fake.setInterval = (run: () => void, ms: number) => addTimer(run, ms, true)
    fake.clearTimeout = (id: number) => timers.delete(id)
    fake.clearInterval = (id: number) => timers.delete(id)

    const hook = (): Hook => {
        if (!current) throw new Error('a hook ran outside a component')
        const { instance } = current
        const found = instance.hooks[current.index] ?? {
            ready: false,
            value: undefined,
            deps: undefined,
            cleanup: undefined,
            dispatch: undefined,
        }
        instance.hooks[current.index] = found
        current.index += 1
        return found
    }

    const changed = () => {
        dirty = true
        if (!busy) settle()
    }

    const useReducer = (
        reducer: (state: unknown, action: unknown) => unknown,
        initial: unknown,
        init?: (value: unknown) => unknown
    ) => {
        const found = hook()
        if (!found.ready) {
            found.ready = true
            found.value = init ? init(initial) : initial
            found.dispatch = (action) => {
                found.value = reducer(found.value, action)
                changed()
            }
        }
        return [found.value, found.dispatch]
    }

    const useEffect = (create: () => unknown, deps?: unknown[]) => {
        const found = hook()
        if (!found.ready || depsChanged(found.deps, deps)) {
            found.ready = true
            found.deps = deps
            effects.push({ hook: found, create })
        }
    }

    const useMemo = (create: () => unknown, deps?: unknown[]) => {
        const found = hook()
        if (!found.ready || depsChanged(found.deps, deps)) {
            found.ready = true
            found.deps = deps
            found.value = create()
        }
        return found.value
    }

    const useContext = (context: Context) =>
        contexts.has(context) ? contexts.get(context) : context._currentValue

    const dispatcher = {
        useState: (initial: unknown) =>
            useReducer(
                (state, action) =>
                    typeof action === 'function' ? action(state) : action,
                initial,
                (value) => (typeof value === 'function' ? value() : value)
            ),
        useReducer,
        useEffect,
        useLayoutEffect: useEffect,
        useInsertionEffect: useEffect,
        useMemo,
        useCallback: (callback: unknown, deps?: unknown[]) =>
            useMemo(() => callback, deps),
        useRef: (initial: unknown) => useMemo(() => ({ current: initial }), []),
        useContext,
        use: (usable: Context) => {
            if (usable.$$typeof === CONTEXT) return useContext(usable)
            throw new Error('use() of a promise is not supported here')
        },
        useId: () => {
            const where = `id-${current?.path}-${current?.index}`
            const found = hook()
            if (!found.ready) {
                found.ready = true
                found.value = where
            }
            return found.value
        },
        useSyncExternalStore: (
            subscribe: (listener: () => void) => () => void,
            getSnapshot: () => unknown
        ) => {
            const found = hook()
            if (!found.ready) {
                found.ready = true
                found.cleanup = subscribe(changed)
            }
            return getSnapshot()
        },
        useImperativeHandle: () => undefined,
        useDebugValue: () => undefined,
        useTransition: () => [false, (run: () => void) => run()],
        useDeferredValue: (value: unknown) => value,
        useOptimistic: (value: unknown) => [value, () => undefined],
    }

    const component = (
        run: (props: unknown) => ReactNode,
        props: unknown,
        path: string,
        parent: HostNode
    ) => {
        const instance = instances.get(path) ?? { hooks: [] }
        instances.set(path, instance)
        seen.add(path)
        current = { instance, index: 0, path }
        internals.H = dispatcher
        let out: ReactNode
        try {
            out = run(props)
        } finally {
            internals.H = null
            current = null
        }
        place(out, path, parent)
    }

    const place = (node: ReactNode, path: string, parent: HostNode): void => {
        if (node === null || node === undefined || typeof node === 'boolean') {
            return
        }
        if (typeof node === 'string' || typeof node === 'number') {
            parent.children.push(String(node))
            return
        }
        if (Array.isArray(node)) {
            node.forEach((child: ReactNode, index) => {
                const key = (child as { key?: string | null } | null)?.key
                place(child, `${path}[${key ?? index}]`, parent)
            })
            return
        }
        if (typeof node !== 'object' || !('type' in node)) return
        const type: unknown = node.type
        const props = (node.props ?? {}) as Record<string, unknown>
        const here = `${path}/${nameOf(type)}`
        if (typeof type === 'string') {
            host(type, props, here, parent)
            return
        }
        if (type === FRAGMENT) {
            place(props.children as ReactNode, here, parent)
            return
        }
        if (typeof type === 'function') {
            component(
                type as (props: unknown) => ReactNode,
                props,
                here,
                parent
            )
            return
        }
        const special = type as {
            $$typeof?: symbol
            type?: unknown
            render?: (props: unknown, ref: unknown) => ReactNode
            _context?: Context
        }
        if (special.$$typeof === MEMO) {
            place({ ...node, type: special.type } as ReactNode, path, parent)
        } else if (special.$$typeof === FORWARD_REF && special.render) {
            const { render: draw } = special
            component((given) => draw(given, null), props, here, parent)
        } else if (special.$$typeof === CONTEXT) {
            const before = contexts
            contexts = new Map(before)
            contexts.set(special as Context, props.value)
            place(props.children as ReactNode, here, parent)
            contexts = before
        } else if (special.$$typeof === CONSUMER && special._context) {
            const value = useContext(special._context)
            const draw = props.children as (value: unknown) => ReactNode
            place(draw(value), here, parent)
        }
    }

    const host = (
        type: string,
        given: Record<string, unknown>,
        path: string,
        parent: HostNode
    ) => {
        if (type === 'Modal' && given.visible === false) return
        const state = { pressed: false, hovered: false, focused: false }
        const props = { ...given }
        if (typeof props.style === 'function') props.style = props.style(state)
        const children =
            typeof props.children === 'function'
                ? props.children(state)
                : props.children
        delete props.children
        const node: HostNode = { type, props, children: [], parent }
        parent.children.push(node)
        place(children as ReactNode, path, node)
    }

    const draw = () => {
        seen = new Set()
        effects = []
        root = { type: 'root', props: {}, children: [], parent: null }
        place(top, '', root)
        for (const [path, instance] of instances) {
            if (seen.has(path)) continue
            for (const found of instance.hooks) found.cleanup?.()
            instances.delete(path)
        }
        for (const { hook: found, create } of effects) {
            found.cleanup?.()
            const cleanup = create()
            found.cleanup =
                typeof cleanup === 'function'
                    ? (cleanup as () => void)
                    : undefined
        }
    }

    /** Draws until nothing changes, as React would after an event. */
    const settle = () => {
        busy = true
        try {
            let rounds = 0
            do {
                dirty = false
                draw()
                rounds += 1
                if (rounds > 50) throw new Error('the render never settles')
            } while (dirty)
        } finally {
            busy = false
        }
    }

    const batch = (work: () => void) => {
        busy = true
        try {
            work()
        } finally {
            busy = false
        }
        settle()
    }

    settle()

    const screen = {
        /** The rendered tree; read it again after each change. */
        get root() {
            return root
        },
        /** Every host node, depth first. */
        all: () => nodesIn(root),
        /** The outermost `Text` nodes: each one line of text. */
        texts: () => textsIn(root),
        /** Taps `node`: the nearest handler at or above it runs. */
        press: (node: HostNode) => {
            const target = handlerFor(node, 'onPress')
            if (!target) throw new Error(`nothing to tap at "${textOf(node)}"`)
            batch(() =>
                (target.props.onPress as (event: unknown) => void)(EVENT)
            )
        },
        /** Draws `element` in place of the first one, keeping state. */
        rerender: (element: ReactElement) => {
            top = element
            settle()
        },
        /** Moves the clock by `ms` and fires the timers due by then. */
        advance: (ms: number) => {
            const until = clock + ms
            batch(() => {
                for (;;) {
                    const due = [...timers.entries()]
                        .filter(([, timer]) => timer.at <= until)
                        .sort(([, left], [, right]) => left.at - right.at)[0]
                    if (!due) break
                    const [id, timer] = due
                    clock = timer.at
                    setSystemTime(new Date(clock))
                    if (timer.every === null) timers.delete(id)
                    else timer.at += timer.every
                    timer.run()
                }
                clock = until
                setSystemTime(new Date(clock))
            })
        },
        /** Runs every cleanup and puts the real timers back. */
        unmount: () => {
            for (const instance of instances.values()) {
                for (const found of instance.hooks) found.cleanup?.()
            }
            instances.clear()
            timers.clear()
            Object.assign(globalThis, REAL_TIMERS)
        },
    }
    return screen
}

export type Screen = ReturnType<typeof render>
