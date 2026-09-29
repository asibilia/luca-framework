import { useMemo, useState } from 'react'

import type { PluginTheme } from '@getpaseo/plugin'
import { usePaseo, useRpc } from '@getpaseo/plugin/client'
import { copyText, useToast } from '@getpaseo/plugin/client/react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { MONO } from './board-look'

import { replyPostRpc } from '../shared/board-rpc'
import {
    confirmReplyText,
    postedFor,
    postedText,
    replyButtons,
    unstickCommand,
    type PostedReply,
    type ReplyButton,
} from '../shared/reply-actions'

/**
 * The actions on stuck work (#503), in the side panel and in the chat's
 * stuck rows: a button per reply the engine takes, which asks to confirm
 * and then posts the reply on the spec issue through `reply.post`, and
 * "Help me", which sends `/luca-unstick` to a chat's agent.
 */

const makeStyles = ({ theme }: { theme: PluginTheme }) => {
    const { colors } = theme
    return StyleSheet.create({
        box: { gap: 6 },
        row: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
        },
        label: {
            color: colors.foregroundMuted,
            fontSize: 12,
            fontWeight: '700',
        },
        text: { color: colors.foreground, fontSize: 12 },
        muted: { color: colors.foregroundMuted, fontSize: 12 },
        danger: { color: colors.statusDanger, fontSize: 12 },
        success: { color: colors.statusSuccess, fontSize: 12 },
        button: {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface2,
            borderRadius: 6,
            paddingHorizontal: 9,
            paddingVertical: 4,
        },
        buttonText: {
            color: colors.foreground,
            fontSize: 12,
            fontFamily: MONO,
        },
        primary: {
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: colors.accent,
        },
        primaryText: {
            color: colors.accentForeground,
            fontSize: 12,
            fontWeight: '700',
        },
        posted: { borderColor: colors.statusSuccess },
        postedText: { color: colors.statusSuccess },
        locked: { opacity: 0.45 },
    })
}

type Styles = ReturnType<typeof makeStyles>

/** What a reply button reads, for its state. */
const buttonLabel = ({ button }: { button: ReplyButton }): string => {
    switch (button.state) {
        case 'sending':
            return `${button.reply} · posting…`
        case 'posted':
            return `${button.reply} · posted`
        default:
            return button.reply
    }
}

const ReplyButtonView = ({
    button,
    onPress,
    styles,
}: {
    button: ReplyButton
    onPress: () => void
    styles: Styles
}) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Post the reply ${button.reply}`}
        accessibilityState={{ disabled: button.state !== 'ready' }}
        disabled={button.state !== 'ready'}
        onPress={onPress}
        style={[
            styles.button,
            button.state === 'posted' ? styles.posted : null,
            button.state === 'locked' ? styles.locked : null,
        ]}
    >
        <Text
            style={[
                styles.buttonText,
                button.state === 'posted' ? styles.postedText : null,
            ]}
        >
            {buttonLabel({ button })}
        </Text>
    </Pressable>
)

/**
 * A stuck item's reply buttons and "Help me". `posted` is what the board
 * says it posted (from `board.read`); a post made here shows at once too.
 * `chat_agent_id` is the chat "Help me" sends `/luca-unstick` to; without
 * one, the command is copied instead.
 */
export const StuckActions = ({
    run_id,
    item,
    spec_number,
    posted,
    chat_agent_id,
    theme,
}: {
    run_id: string
    item: { key: string; ticket: number | null; since: string }
    spec_number: number | null
    posted: PostedReply[]
    chat_agent_id: string | null
    theme: PluginTheme
}) => {
    const styles = useMemo(() => makeStyles({ theme }), [theme])
    const postReply = useRpc(replyPostRpc)
    const paseo = usePaseo()
    const toast = useToast()
    const [confirming, setConfirming] = useState<string | null>(null)
    const [sending, setSending] = useState<string | null>(null)
    const [mine, setMine] = useState<PostedReply | null>(null)
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

    const known = [...posted, ...(mine ? [mine] : [])]
    const buttons = replyButtons({ item, posted: known, sending })
    const done = postedFor({ item, posted: known })
    const command = unstickCommand({ run_id, ticket: item.ticket })

    const post = async ({ reply }: { reply: string }) => {
        setConfirming(null)
        setSending(reply)
        setNote(null)
        try {
            const output = await postReply({ run_id, key: item.key, reply })
            if (output.posted) setMine(output.posted)
            setNote({ ok: output.ok, text: output.message })
        } catch (error) {
            setNote({
                ok: false,
                text: `Couldn't post \`${reply}\`: ${String(error)}`,
            })
        } finally {
            setSending(null)
        }
    }

    const helpMe = async () => {
        if (chat_agent_id !== null) {
            try {
                await paseo.agents.ref(chat_agent_id).send(command)
                toast.show(`Sent ${command} to the run's chat.`, {
                    variant: 'success',
                })
                return
            } catch {
                // The chat may be gone: copy it instead.
            }
        }
        try {
            await copyText(command)
            toast.show(`Copied ${command}. Paste it in a chat.`, {
                variant: 'success',
            })
        } catch {
            toast.error(`Could not copy. Type ${command} in a chat.`)
        }
    }

    return (
        <View style={styles.box}>
            <Text style={styles.label}>
                Reply on{' '}
                {spec_number === null
                    ? 'the spec issue'
                    : `spec issue #${spec_number}`}
            </Text>
            <View style={styles.row}>
                {buttons.map((button) => (
                    <ReplyButtonView
                        key={button.reply}
                        button={button}
                        onPress={() => {
                            setNote(null)
                            setConfirming(button.reply)
                        }}
                        styles={styles}
                    />
                ))}
            </View>
            {confirming !== null && done === null && sending === null ? (
                <View style={styles.row}>
                    <Text style={styles.text}>
                        {confirmReplyText({ reply: confirming, spec_number })}
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Yes, post ${confirming}`}
                        onPress={() => void post({ reply: confirming })}
                        style={styles.primary}
                    >
                        <Text style={styles.primaryText}>Post</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                        onPress={() => setConfirming(null)}
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>Cancel</Text>
                    </Pressable>
                </View>
            ) : null}
            {note !== null && !(note.ok && done !== null) ? (
                <Text style={note.ok ? styles.success : styles.danger}>
                    {note.text}
                </Text>
            ) : null}
            {done !== null ? (
                <Text style={styles.success}>
                    {postedText({ posted: done })}
                </Text>
            ) : null}
            <View style={styles.row}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Help me: ${command}`}
                    onPress={() => void helpMe()}
                    style={styles.button}
                >
                    <Text style={styles.buttonText}>Help me</Text>
                </Pressable>
                <Text style={styles.muted}>
                    {chat_agent_id === null
                        ? `copies ${command}`
                        : `sends ${command} to the run's chat`}
                </Text>
            </View>
        </View>
    )
}
