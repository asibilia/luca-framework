import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  LOOP_CAP,
  POLL_MS,
  readBoardRpc,
  type Agent,
  type FinalReview,
  type Lens,
  type PlanUsage,
  type RunSnapshot,
  type Ticket,
  type TicketState,
} from "../shared/board";

/**
 * Variant A: a full-screen "mission control" reached from the sidebar. Run header with plan
 * usage meters, a limit-wait banner, tickets in lanes by state, and a final-review strip.
 * Its layout is its own; B and C share only the fake data.
 */

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const LANES: { state: TicketState; title: string; hint: string; icon: string }[] = [
  { state: "blocked", title: "Blocked", hint: "waits on a ticket that isn't done", icon: "Lock" },
  { state: "building", title: "Building", hint: "tests, red check, implementer, gates", icon: "Hammer" },
  { state: "reviewing", title: "Reviewing", hint: "fresh ticket review, other family", icon: "ScanSearch" },
  { state: "stuck", title: "Stuck", hint: "needs your reply", icon: "OctagonAlert" },
  { state: "done", title: "Done", hint: "committed and reviewed", icon: "CircleCheck" },
  { state: "skipped", title: "Skipped", hint: "left out, stays open", icon: "SkipForward" },
];

type StylesFactory = typeof makeStyles;
type Styles = ReturnType<StylesFactory>;

function makeStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 12 : 24, gap: compact ? 12 : 18 },
    topBar: { flexDirection: compact ? "column" : "row", alignItems: compact ? "flex-start" : "center", gap: 8 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    title: { color: colors.foreground, fontSize: compact ? 18 : 22, fontWeight: "700" },
    subtitle: { color: colors.foregroundMuted, fontSize: 13 },
    spacer: { flex: 1 },
    badge: {
      color: colors.statusWarning,
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 1,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
    },
    debug: { color: colors.foregroundMuted, fontSize: 11, fontFamily: MONO },
    header: {
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: compact ? 12 : 18,
      gap: 12,
    },
    specTitle: { color: colors.foreground, fontSize: compact ? 18 : 24, fontWeight: "700" },
    specLabel: { color: colors.foregroundMuted, fontSize: 13 },
    branch: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
    stats: { flexDirection: "row", flexWrap: "wrap", gap: compact ? 16 : 32 },
    stat: { gap: 2 },
    statValue: { color: colors.foreground, fontSize: compact ? 18 : 22, fontWeight: "700", fontFamily: MONO },
    statLabel: { color: colors.foregroundMuted, fontSize: 12 },
    plans: { flexDirection: compact ? "column" : "row", gap: compact ? 10 : 24 },
    plan: { flex: compact ? undefined : 1, gap: 6 },
    planName: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    meterRow: { flexDirection: "row", gap: 12 },
    meter: { flex: 1, gap: 4 },
    meterLabels: { flexDirection: "row", justifyContent: "space-between" },
    meterLabel: { color: colors.foregroundMuted, fontSize: 12 },
    meterValue: { fontSize: 12, fontWeight: "700", fontFamily: MONO },
    meterTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
    meterFill: { height: 8, borderRadius: 4 },
    banner: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 12,
      padding: compact ? 12 : 16,
      backgroundColor: colors.surface1,
    },
    bannerBody: { flex: 1, gap: 4 },
    bannerTitle: { color: colors.statusWarning, fontSize: 15, fontWeight: "700" },
    bannerText: { color: colors.foreground, fontSize: 13 },
    lanesWide: { gap: 12, paddingBottom: 4 },
    lanesCompact: { gap: 12 },
    lane: {
      width: compact ? undefined : 236,
      gap: 8,
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
    },
    laneHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
    laneTitle: { fontSize: 14, fontWeight: "700" },
    laneCount: { color: colors.foregroundMuted, fontSize: 13, fontFamily: MONO },
    laneHint: { color: colors.foregroundMuted, fontSize: 11 },
    laneEmpty: { color: colors.foregroundMuted, fontSize: 12, fontStyle: "italic", paddingVertical: 6 },
    card: {
      backgroundColor: colors.surface0,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      gap: 6,
    },
    cardStuck: { borderColor: colors.statusDanger, borderWidth: 2 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    cardNumber: { color: colors.foregroundMuted, fontSize: 13, fontWeight: "700", fontFamily: MONO },
    tag: {
      color: colors.foregroundMuted,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 10,
    },
    activity: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 1,
      fontSize: 11,
      fontWeight: "700",
    },
    cardTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
    cardRole: { color: colors.foreground, fontSize: 12 },
    cardMuted: { color: colors.foregroundMuted, fontSize: 12 },
    counters: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    counter: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 1,
      fontSize: 11,
      fontFamily: MONO,
    },
    danger: { color: colors.statusDanger, fontSize: 12 },
    warning: { color: colors.statusWarning, fontSize: 12 },
    tokens: { color: colors.foregroundMuted, fontSize: 11, fontFamily: MONO },
    stuckBox: { gap: 4, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 6 },
    stuckReason: { color: colors.statusDanger, fontSize: 12, fontWeight: "600" },
    tried: { color: colors.foregroundMuted, fontSize: 11 },
    replyLabel: { color: colors.foreground, fontSize: 12, fontWeight: "600" },
    replies: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    reply: {
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 12,
      fontFamily: MONO,
    },
    strip: {
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: compact ? 12 : 16,
      gap: 10,
    },
    stripStuck: { borderColor: colors.statusDanger, borderWidth: 2 },
    stripTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    stripState: { color: colors.foregroundMuted, fontSize: 13 },
    lenses: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    lens: {
      minWidth: compact ? 140 : 170,
      flexGrow: 1,
      flexBasis: compact ? 140 : 170,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      gap: 3,
      backgroundColor: colors.surface0,
    },
    lensName: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
    lensState: { fontSize: 12, fontWeight: "600" },
    lensNote: { color: colors.foregroundMuted, fontSize: 11 },
    muted: { color: colors.foregroundMuted, fontSize: 13 },
  });
}

function laneColor(state: TicketState, theme: PluginTheme): string {
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

function usageColor(percent: number, theme: PluginTheme): string {
  if (percent >= 90) {
    return theme.colors.statusDanger;
  }
  if (percent >= 70) {
    return theme.colors.statusWarning;
  }
  return theme.colors.accent;
}

function familyName(family: Agent["family"]): string {
  return family === "claude" ? "Claude" : "GPT";
}

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function roleLine(ticket: Ticket): string {
  if (ticket.activity === "red-check") {
    return "engine · red check";
  }
  if (ticket.activity === "gates") {
    return "engine · gates (tests, types)";
  }
  const active = [...ticket.agents]
    .reverse()
    .find((agent) => agent.state === "running" || agent.state === "paused" || agent.state === "idle");
  if (active) {
    return `${active.role} · ${familyName(active.family)} (${active.model})`;
  }
  if (ticket.state === "blocked") {
    return "no agent yet";
  }
  const last = ticket.agents[ticket.agents.length - 1];
  return last ? `last: ${last.role} · ${familyName(last.family)} (${last.model})` : "no agent";
}

function Meter({ label, percent, theme, styles }: { label: string; percent: number; theme: PluginTheme; styles: Styles }) {
  const color = usageColor(percent, theme);
  const width = `${Math.min(100, Math.max(0, percent))}%` as const;
  return (
    <View style={styles.meter}>
      <View style={styles.meterLabels}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterValue, { color }]}>{percent}%</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function PlanMeters({ plan, theme, styles }: { plan: PlanUsage; theme: PluginTheme; styles: Styles }) {
  return (
    <View style={styles.plan}>
      <Text style={styles.planName}>{plan.plan}</Text>
      <View style={styles.meterRow}>
        <Meter label="5-hour window" percent={plan.fiveHour} theme={theme} styles={styles} />
        <Meter label="weekly" percent={plan.weekly} theme={theme} styles={styles} />
      </View>
    </View>
  );
}

function RunHeader({ run, theme, styles }: { run: RunSnapshot; theme: PluginTheme; styles: Styles }) {
  const open = run.tickets.filter((ticket) => ticket.state !== "done" && ticket.state !== "skipped").length;
  return (
    <View style={styles.header}>
      <View style={{ gap: 2 }}>
        <Text style={styles.specLabel}>Spec #{run.spec.number}</Text>
        <Text style={styles.specTitle}>{run.spec.title}</Text>
        <Text style={styles.branch}>{run.branch}</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(run.elapsedSeconds)}</Text>
          <Text style={styles.statLabel}>elapsed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{run.agentsRunning}</Text>
          <Text style={styles.statLabel}>agents running now</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {run.tickets.length - open}/{run.tickets.length}
          </Text>
          <Text style={styles.statLabel}>tickets done or skipped</Text>
        </View>
      </View>
      <View style={styles.plans}>
        {run.usage.map((plan) => (
          <PlanMeters key={plan.plan} plan={plan} theme={theme} styles={styles} />
        ))}
      </View>
    </View>
  );
}

function LimitWaitBanner({ run, theme, styles }: { run: RunSnapshot; theme: PluginTheme; styles: Styles }) {
  if (!run.limitWait) {
    return null;
  }
  const paused = run.tickets.flatMap((ticket) => ticket.agents).filter((agent) => agent.state === "paused").length;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="Hourglass" size={20} color={theme.colors.statusWarning} />
      <View style={styles.bannerBody}>
        <Text style={styles.bannerTitle}>
          Limit wait: the {run.limitWait.plan}'s {run.limitWait.window} is used up
        </Text>
        <Text style={styles.bannerText}>
          Resets in {formatDuration(run.limitWait.resetsInSeconds)}. {paused} agents are paused. The run carries on by
          itself, so this isn't stuck and there's nothing to do.
        </Text>
      </View>
    </View>
  );
}

function Counter({ label, value, theme, styles }: { label: string; value: number; theme: PluginTheme; styles: Styles }) {
  const color =
    value >= LOOP_CAP
      ? theme.colors.statusDanger
      : value > 0
        ? label === "fix"
          ? theme.colors.statusWarning
          : theme.colors.foreground
        : theme.colors.foregroundMuted;
  return (
    <Text style={[styles.counter, { color, borderColor: color }]}>
      {label} {value}/{LOOP_CAP}
    </Text>
  );
}

function Replies({ replies, specNumber, styles }: { replies: string[]; specNumber: number; styles: Styles }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.replyLabel}>Reply with a comment on spec #{specNumber}:</Text>
      <View style={styles.replies}>
        {replies.map((reply) => (
          <Text key={reply} style={styles.reply} selectable>
            {reply}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TicketCard({ ticket, run, theme, styles }: { ticket: Ticket; run: RunSnapshot; theme: PluginTheme; styles: Styles }) {
  const color = laneColor(ticket.state, theme);
  const tokens = ticket.agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const waitsOn = ticket.dependsOn.filter((number) => {
    const dependency = run.tickets.find((candidate) => candidate.number === number);
    return dependency !== undefined && dependency.state !== "done";
  });
  return (
    <View style={[styles.card, ticket.state === "stuck" ? styles.cardStuck : null]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardNumber}>#{ticket.number}</Text>
        {ticket.refactor ? <Text style={styles.tag}>refactor</Text> : null}
        <View style={styles.spacer} />
        <Text style={[styles.activity, { color, borderColor: color }]}>{ticket.activity}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {ticket.title}
      </Text>
      <Text style={styles.cardRole} numberOfLines={1}>
        {roleLine(ticket)}
      </Text>
      <View style={styles.counters}>
        <Counter label="fix" value={ticket.fix} theme={theme} styles={styles} />
        <Counter label="review" value={ticket.review} theme={theme} styles={styles} />
      </View>
      {ticket.tests && ticket.tests.failing > 0 && ticket.state !== "skipped" ? (
        <Text style={styles.danger}>
          {ticket.tests.failing} of {ticket.tests.total} tests failing
        </Text>
      ) : null}
      {ticket.findings && ticket.findings.blocker > 0 ? (
        <Text style={styles.warning}>{ticket.findings.blocker} blocker from ticket review</Text>
      ) : null}
      {ticket.state === "blocked" && waitsOn.length > 0 ? (
        <Text style={styles.cardMuted}>waits on {waitsOn.map((number) => `#${number}`).join(", ")}</Text>
      ) : null}
      {ticket.stuck ? (
        <View style={styles.stuckBox}>
          <Text style={styles.stuckReason}>{ticket.stuck.reason}</Text>
          {ticket.stuck.tried.map((line) => (
            <Text key={line} style={styles.tried}>
              · {line}
            </Text>
          ))}
          <Text style={styles.cardMuted}>waiting on you for {formatDuration(ticket.stuck.waitingSeconds)}</Text>
          <Replies replies={ticket.stuck.replies} specNumber={run.spec.number} styles={styles} />
        </View>
      ) : null}
      {ticket.note && ticket.state !== "blocked" ? <Text style={styles.cardMuted}>{ticket.note}</Text> : null}
      <Text style={styles.tokens}>
        {formatTokens(tokens)} tokens · {ticket.agents.length} agents
      </Text>
    </View>
  );
}

function Lane({
  lane,
  run,
  theme,
  styles,
}: {
  lane: (typeof LANES)[number];
  run: RunSnapshot;
  theme: PluginTheme;
  styles: Styles;
}) {
  const tickets = run.tickets.filter((ticket) => ticket.state === lane.state);
  const color = laneColor(lane.state, theme);
  return (
    <View style={styles.lane}>
      <View style={styles.laneHeader}>
        <Icon name={lane.icon} size={16} color={color} />
        <Text style={[styles.laneTitle, { color }]}>{lane.title}</Text>
        <Text style={styles.laneCount}>{tickets.length}</Text>
      </View>
      <Text style={styles.laneHint}>{lane.hint}</Text>
      {tickets.length === 0 ? <Text style={styles.laneEmpty}>none</Text> : null}
      {tickets.map((ticket) => (
        <TicketCard key={ticket.number} ticket={ticket} run={run} theme={theme} styles={styles} />
      ))}
    </View>
  );
}

function lensLine(lens: Lens): string {
  if (lens.state === "waiting") {
    return "waiting";
  }
  if (lens.state === "running") {
    return "reviewing…";
  }
  if (lens.state === "clean") {
    return "clean";
  }
  const parts = [
    lens.findings.blocker > 0 ? `${lens.findings.blocker} blocker` : null,
    lens.findings.shouldFix > 0 ? `${lens.findings.shouldFix} should-fix` : null,
    lens.findings.nit > 0 ? `${lens.findings.nit} nits` : null,
  ].filter((part) => part !== null);
  return parts.join(", ");
}

function lensColor(lens: Lens, theme: PluginTheme): string {
  if (lens.state === "clean") {
    return theme.colors.statusSuccess;
  }
  if (lens.state === "running") {
    return theme.colors.accent;
  }
  if (lens.state === "findings") {
    return lens.findings.blocker > 0 ? theme.colors.statusDanger : theme.colors.statusWarning;
  }
  return theme.colors.foregroundMuted;
}

function reviewStateLine(review: FinalReview): string {
  switch (review.state) {
    case "waiting":
      return "Starts when every ticket is done or skipped.";
    case "reviewing":
      return `Round ${review.round}/${LOOP_CAP}: 5 reviewers (GPT) read the whole branch.`;
    case "fixing":
      return `Round ${review.round}/${LOOP_CAP}, fix ${review.fix}/${LOOP_CAP}: the implementer (Claude) fixes the findings.`;
    case "escalated":
      return "The fix loop hit its cap. A stronger model (claude-opus) gets one more round.";
    case "stuck":
      return "Stuck: the fix loop and the stronger model couldn't clear the blocker.";
    case "passed":
      return "Passed. The pull request opens.";
  }
}

function FinalReviewStrip({ run, theme, styles }: { run: RunSnapshot; theme: PluginTheme; styles: Styles }) {
  const review = run.finalReview;
  return (
    <View style={[styles.strip, review.stuck ? styles.stripStuck : null]}>
      <View style={styles.laneHeader}>
        <Icon name="GitPullRequest" size={16} color={theme.colors.foreground} />
        <Text style={styles.stripTitle}>Final review · 5 lenses</Text>
        <View style={styles.spacer} />
        <Counter label="review" value={review.round} theme={theme} styles={styles} />
        <Counter label="fix" value={review.fix} theme={theme} styles={styles} />
      </View>
      <Text style={styles.stripState}>{reviewStateLine(review)}</Text>
      <View style={styles.lenses}>
        {review.lenses.map((lens) => {
          const color = lensColor(lens, theme);
          return (
            <View key={lens.name} style={[styles.lens, { borderColor: color }]}>
              <Text style={styles.lensName}>{lens.name}</Text>
              <Text style={[styles.lensState, { color }]}>{lensLine(lens)}</Text>
              {lens.note ? <Text style={styles.lensNote}>{lens.note}</Text> : null}
            </View>
          );
        })}
      </View>
      {review.stuck ? (
        <View style={styles.stuckBox}>
          <Text style={styles.stuckReason}>{review.stuck.reason}</Text>
          {review.stuck.tried.map((line) => (
            <Text key={line} style={styles.tried}>
              · {line}
            </Text>
          ))}
          <Text style={styles.cardMuted}>waiting on you for {formatDuration(review.stuck.waitingSeconds)}</Text>
          <Replies replies={review.stuck.replies} specNumber={run.spec.number} styles={styles} />
        </View>
      ) : null}
    </View>
  );
}

export function MissionControlSurface({ theme, layout }: PluginSurfaceProps) {
  const readBoard = useRpc(readBoardRpc);
  const board = useQuery({
    queryKey: ["luca-board-prototype", "run"],
    queryFn: () => readBoard({}),
    refetchInterval: POLL_MS,
  });
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const run = board.data;

  const lanes = run
    ? LANES.map((lane) => <Lane key={lane.state} lane={lane} run={run} theme={theme} styles={styles} />)
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <Text style={styles.badge}>PROTOTYPE</Text>
          <Text style={styles.title}>Luca board</Text>
          <Text style={styles.subtitle}>A · mission control</Text>
        </View>
        {layout.compact ? null : <View style={styles.spacer} />}
        <Text style={styles.debug}>
          {run
            ? `fake run · tick ${run.tick} · loop ${run.loop} · ${run.loopTick}/${run.loopLength} · scene ${run.scene} · polls every ${POLL_MS / 1000}s`
            : "fake run · waiting for the first poll"}
        </Text>
      </View>

      {run ? null : (
        <Text style={board.isError ? styles.danger : styles.muted}>
          {board.isError ? `Couldn't read the fake run: ${String(board.error)}` : "Loading the fake run…"}
        </Text>
      )}

      {run ? (
        <>
          <RunHeader run={run} theme={theme} styles={styles} />
          <LimitWaitBanner run={run} theme={theme} styles={styles} />
          {layout.compact ? (
            <View style={styles.lanesCompact}>{lanes}</View>
          ) : (
            <ScrollView horizontal contentContainerStyle={styles.lanesWide}>
              {lanes}
            </ScrollView>
          )}
          <FinalReviewStrip run={run} theme={theme} styles={styles} />
        </>
      ) : null}
    </ScrollView>
  );
}
