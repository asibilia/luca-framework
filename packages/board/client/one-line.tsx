/**
 * The side panel's one-line rule (#626): every card line and the footer
 * stay on one line, cut at the end with "…". A tap on a cut line opens a
 * bubble with its full text; a second tap, or a tap anywhere else, closes
 * it. On a computer, hovering opens it too.
 *
 * A card or the footer is a bubble scope (`useBubbles` and `BubbleScope`):
 * it shows the open bubble of its lines under them. Inside the panel
 * (`SharedBubbles`), one bubble is open at a time across every scope; a
 * card or footer drawn on its own keeps its bubble itself.
 */
import {
    createContext,
    useContext,
    useId,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from 'react'

import {
    Pressable,
    Text,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native'

import type { Styles } from './board-panel-styles'

type OpenBubble = {
    /** The card or footer that shows it. */
    scope: string
    /** The cut line it belongs to. */
    line: string
    text: string
    /** Opened by hovering: leaving the line closes it, a tap keeps it. */
    hovered: boolean
}

type Shared = {
    open: OpenBubble | null
    show: Dispatch<SetStateAction<OpenBubble | null>>
}

export type Bubbles = Shared & { scope: string }

const SharedContext = createContext<Shared | null>(null)

const ScopeContext = createContext<Bubbles | null>(null)

/**
 * One open bubble for the whole panel. A tap on any part of the panel that
 * isn't a button of its own closes it.
 */
export const SharedBubbles = ({
    style,
    children,
}: {
    style: StyleProp<ViewStyle>
    children: ReactNode
}) => {
    const [open, show] = useState<OpenBubble | null>(null)
    return (
        <SharedContext.Provider value={{ open, show }}>
            <Pressable
                accessible={false}
                onPress={() => show(null)}
                style={style}
            >
                {children}
            </Pressable>
        </SharedContext.Provider>
    )
}

/** Closes the panel's open bubble: for a button's tap that does more. */
export const useCloseBubble = (): (() => void) => {
    const shared = useContext(SharedContext)
    return () => shared?.show(null)
}

/** A card's or the footer's bubbles: the panel's, or its own outside one. */
export const useBubbles = (): Bubbles => {
    const shared = useContext(SharedContext)
    const [open, show] = useState<OpenBubble | null>(null)
    const scope = useId()
    return { scope, ...(shared ?? { open, show }) }
}

/** Gives its cut lines their bubble, and shows it under them when open. */
export const BubbleScope = ({
    bubbles,
    styles,
    children,
}: {
    bubbles: Bubbles
    styles: Styles
    children: ReactNode
}) => (
    <ScopeContext.Provider value={bubbles}>
        {children}
        {bubbles.open?.scope === bubbles.scope ? (
            <Text style={styles.bubble} onPress={() => bubbles.show(null)}>
                {bubbles.open.text}
            </Text>
        ) : null}
    </ScopeContext.Provider>
)

/**
 * A line of text cut at its end with "…". Inside a `BubbleScope`, a tap
 * (or hovering) opens its full text in a bubble, or `full` when given: a
 * short line's longer sentence.
 */
export const CutLine = ({
    text,
    full,
    style,
    styles,
}: {
    text: string
    full?: string
    style: StyleProp<TextStyle>
    styles: Styles
}) => {
    const bubbles = useContext(ScopeContext)
    const line = useId()
    const shown = full ?? text
    const label = (
        <Text style={style} numberOfLines={1} ellipsizeMode="tail">
            {text}
        </Text>
    )
    if (!bubbles) return label
    const { scope, show } = bubbles
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityHint="Shows the full text"
            onPress={() =>
                show((open) =>
                    open?.line === line && !open.hovered
                        ? null
                        : { scope, line, text: shown, hovered: false }
                )
            }
            onHoverIn={() =>
                show((open) =>
                    open === null || open.hovered
                        ? { scope, line, text: shown, hovered: true }
                        : open
                )
            }
            onHoverOut={() =>
                show((open) =>
                    open?.line === line && open.hovered ? null : open
                )
            }
            style={styles.cut}
        >
            {label}
        </Pressable>
    )
}
