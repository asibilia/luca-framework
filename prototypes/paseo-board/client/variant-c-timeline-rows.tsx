import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { EventRow, LimitRow, RunRow, StuckRow, TicketState } from "../shared/board";
import { usageColor } from "./usage-color";

/**
 * Variant C: rows the daemon appends into one agent's timeline while `/luca-board-demo`
 * runs. A header row and the stuck and limit-wait rows update in place; each stage move is
 * its own row. Its layout is its own; B shares only the fake data and the usage colors.
 */

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

type StylesFactory = typeof makeStyles;
type Styles = ReturnType<StylesFactory>;

function makeStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return StyleSheet.create({
    card: {
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      padding: compact ? 10 : 12,
      gap: 6,
      backgroundColor: colors.surface1,
      marginVertical: 4,
    },
    top: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    badge: {
      color: colors.statusWarning,
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 1,
    },
    title: { color: colors.foreground, fontSize: 14, fontWeight: "700", flexShrink: 1 },
    spacer: { flex: 1 },
    status: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
    text: { color: colors.foreground, fontSize: 13 },
    muted: { color: colors.foregroundMuted, fontSize: 12 },
    mono: { color: colors.foregroundMuted, fontSize: 11, fontFamily: MONO },
    counts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    count: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      fontSize: 11,
      fontWeight: "600",
    },
    event: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 },
    eventClock: { color: colors.foregroundMuted, fontSize: 11, fontFamily: MONO, width: compact ? 36 : 44, paddingTop: 2 },
    eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
    eventText: { color: colors.foreground, fontSize: 13, flex: 1 },
    eventTag: { color: colors.foregroundMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1, paddingTop: 3 },
    replyRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    reply: {
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      fontSize: 12,
      fontFamily: MONO,
    },
  });
}

function stateColor(state: TicketState, theme: PluginTheme): string {
  switch (state) {
    case "building":
    case "reviewing":
      return theme.colors.accent;
    case "stuck":
      return theme.colors.statusDanger;
    case "done":
      return theme.colors.statusSuccess;
    case "blocked":
    case "skipped":
      return theme.colors.foregroundMuted;
  }
}

function toneColor(tone: EventRow["tone"], theme: PluginTheme): string {
  switch (tone) {
    case "success":
      return theme.colors.statusSuccess;
    case "warning":
      return theme.colors.statusWarning;
    case "danger":
      return theme.colors.statusDanger;
    case "info":
      return theme.colors.accent;
  }
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useStyles(theme: PluginTheme, compact: boolean): Styles {
  return useMemo(() => makeStyles(theme, compact), [theme, compact]);
}

export function RunRowCard({ item, theme, layout }: PluginTimelineItemProps<RunRow>) {
  const styles = useStyles(theme, layout.compact);
  const row = item.data;
  const live = row.status === "live";
  return (
    <View style={[styles.card, { borderColor: live ? theme.colors.accent : theme.colors.border }]}>
      <View style={styles.top}>
        <Text style={styles.badge}>PROTOTYPE</Text>
        <Icon name="Kanban" size={14} color={theme.colors.foreground} />
        <Text style={styles.title}>
          Luca board · Spec #{row.specNumber} {row.specTitle}
        </Text>
        <View style={styles.spacer} />
        <Text style={[styles.status, { color: live ? theme.colors.accent : theme.colors.foregroundMuted }]}>
          {row.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.text}>
        run {row.clock} · {row.agentsRunning} agents running
        {row.limitWait ? <Text style={{ color: theme.colors.statusWarning }}> · limit wait</Text> : null}
      </Text>
      <View style={styles.counts}>
        {row.counts
          .filter((entry) => entry.count > 0)
          .map((entry) => {
            const color = stateColor(entry.state, theme);
            return (
              <Text key={entry.state} style={[styles.count, { color, borderColor: color }]}>
                {entry.count} {entry.state}
              </Text>
            );
          })}
      </View>
      <Text style={styles.muted}>Final review: {row.finalReview}</Text>
      <View style={styles.counts}>
        {row.usage.map((plan) => (
          <Text key={plan.plan} style={styles.mono}>
            {plan.plan} 5h <Text style={{ color: usageColor(plan.fiveHour, theme) }}>{plan.fiveHour}%</Text> · week{" "}
            <Text style={{ color: usageColor(plan.weekly, theme) }}>{plan.weekly}%</Text>
          </Text>
        ))}
      </View>
      <Text style={styles.muted}>{row.footer}</Text>
      <Text style={styles.mono}>{row.debug}</Text>
    </View>
  );
}

export function EventRowLine({ item, theme, layout }: PluginTimelineItemProps<EventRow>) {
  const styles = useStyles(theme, layout.compact);
  const row = item.data;
  return (
    <View style={styles.event}>
      <Text style={styles.eventClock}>{row.clock}</Text>
      <View style={[styles.eventDot, { backgroundColor: toneColor(row.tone, theme) }]} />
      <Text style={styles.eventText}>{row.text}</Text>
      <Text style={styles.eventTag}>LUCA · PROTOTYPE</Text>
    </View>
  );
}

export function StuckRowCard({ item, theme, layout }: PluginTimelineItemProps<StuckRow>) {
  const styles = useStyles(theme, layout.compact);
  const row = item.data;
  const waiting = row.status === "waiting";
  const color = waiting
    ? theme.colors.statusDanger
    : row.status === "resolved"
      ? theme.colors.statusSuccess
      : theme.colors.foregroundMuted;
  const status =
    row.status === "waiting"
      ? `WAITING ON YOU ${clock(row.waitingSeconds)}`
      : row.status === "resolved"
        ? "RESOLVED"
        : "FEED ENDED";
  return (
    <View style={[styles.card, { borderColor: color, borderLeftWidth: 4 }]}>
      <View style={styles.top}>
        <Text style={styles.badge}>PROTOTYPE</Text>
        <Icon name={row.status === "resolved" ? "CircleCheck" : "OctagonAlert"} size={14} color={color} />
        <Text style={[styles.title, { color }]}>{row.subject}</Text>
        <View style={styles.spacer} />
        <Text style={[styles.status, { color }]}>{status}</Text>
      </View>
      {row.status === "ended" ? (
        <Text style={styles.muted}>{row.reason} This row stopped updating when the feed ended.</Text>
      ) : waiting ? (
        <>
          <Text style={styles.text}>{row.reason}</Text>
          {row.tried.map((line) => (
            <Text key={line} style={styles.muted}>
              · {line}
            </Text>
          ))}
          <View style={styles.replyRow}>
            <Text style={styles.muted}>Reply with a comment on spec issue #{row.specNumber}:</Text>
            {row.replies.map((reply) => (
              <Text key={reply} style={styles.reply} selectable>
                {reply}
              </Text>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.muted}>{row.resolution}</Text>
      )}
    </View>
  );
}

export function LimitRowCard({ item, theme, layout }: PluginTimelineItemProps<LimitRow>) {
  const styles = useStyles(theme, layout.compact);
  const row = item.data;
  const waiting = row.status === "waiting";
  const color = waiting
    ? theme.colors.statusWarning
    : row.status === "over"
      ? theme.colors.statusSuccess
      : theme.colors.foregroundMuted;
  const status =
    row.status === "waiting" ? `RESETS IN ${clock(row.resetsInSeconds)}` : row.status === "over" ? "RESUMED" : "FEED ENDED";
  const detail =
    row.status === "waiting"
      ? `${row.pausedAgents} agents paused. The run carries on by itself when the limit resets, so it isn't stuck.`
      : row.status === "over"
        ? `The ${row.plan} reset and the run carried on by itself.`
        : "This row stopped updating when the feed ended.";
  return (
    <View style={[styles.card, { borderColor: color }]}>
      <View style={styles.top}>
        <Text style={styles.badge}>PROTOTYPE</Text>
        <Icon name="Hourglass" size={14} color={color} />
        <Text style={[styles.title, { color }]}>
          {row.status === "over" ? "Limit wait over" : `Limit wait: the ${row.plan}'s ${row.window} is used up`}
        </Text>
        <View style={styles.spacer} />
        <Text style={[styles.status, { color }]}>{status}</Text>
      </View>
      <Text style={styles.mono}>
        {row.plan} {row.window}{" "}
        <Text style={{ color: usageColor(row.fiveHour, theme) }}>{row.fiveHour}%</Text>
      </Text>
      <Text style={styles.muted}>{detail}</Text>
    </View>
  );
}
