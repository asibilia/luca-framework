import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  LOOP_CAP,
  POLL_MS,
  REFACTOR_SKIPS_STEPS,
  STEP_NAMES,
  readBoardRpc,
  type Agent,
  type FinalReview,
  type Lens,
  type LensState,
  type RunSnapshot,
  type Stuck,
  type Ticket,
  type TicketState,
} from "../shared/board";
import { usageColor } from "./usage-color";

/**
 * Variant B v2: a workspace tab that stacks the run by stage. "Needs you" is pinned on top,
 * then the ticket stages in workflow order, then the final review as a second stack whose
 * cards are the 5 lenses. Cards show step dots, flash briefly when they land in a new stage,
 * and expand on tap. C shares only the fake data and the usage colors.
 */

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const HIGHLIGHT_MS = 1500;
const DIMMED = 0.45;

type CardKey = string;
type StageKey = string;
type TicketStage = Exclude<TicketState, "stuck">;
type DotKind = "done" | "current" | "todo" | "skip" | "stopped";
type StylesFactory = typeof makeStyles;
type Styles = ReturnType<StylesFactory>;

const TICKET_STAGES: { stage: TicketStage; title: string; hint: string; icon: string; startsFolded: boolean }[] = [
  { stage: "blocked", title: "Blocked", hint: "waits on a ticket that isn't done", icon: "Lock", startsFolded: false },
  { stage: "building", title: "Building", hint: "tests, red check, code, checks", icon: "Hammer", startsFolded: false },
  { stage: "reviewing", title: "Reviewing", hint: "a fresh ticket review on the other family", icon: "ScanSearch", startsFolded: false },
  { stage: "done", title: "Done", hint: "committed and reviewed", icon: "CircleCheck", startsFolded: true },
  { stage: "skipped", title: "Skipped", hint: "left out of this run, stays open", icon: "SkipForward", startsFolded: true },
];

const LENS_STAGES: { stage: LensState; title: string; icon: string }[] = [
  { stage: "waiting", title: "Waiting", icon: "Clock" },
  { stage: "reviewing", title: "Reviewing", icon: "ScanSearch" },
  { stage: "fixing", title: "Fixing", icon: "Wrench" },
  { stage: "clean", title: "Clean", icon: "CircleCheck" },
];

function makeStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 10 : 16, gap: 8 },
    headRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    badge: {
      color: colors.statusWarning,
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
    },
    title: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
    subtitle: { color: colors.foregroundMuted, fontSize: 12 },
    spacer: { flex: 1 },
    debug: { color: colors.foregroundMuted, fontSize: 10, fontFamily: MONO },
    summary: { color: colors.foreground, fontSize: 13 },
    muted: { color: colors.foregroundMuted, fontSize: 12 },
    mono: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
    usageLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: compact ? 8 : 16 },
    limitLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    limitText: { color: colors.statusWarning, fontSize: 12, flexShrink: 1 },
    legend: { color: colors.foregroundMuted, fontSize: 11 },
    block: { gap: 6 },
    stageHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "transparent",
    },
    stageHeaderThin: { paddingVertical: 1 },
    stageHeaderLit: { borderColor: colors.accent, backgroundColor: colors.surface2 },
    stageTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
    stageCount: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
    stageHint: { color: colors.foregroundMuted, fontSize: 11, flexShrink: 1 },
    stageBody: { gap: 6, paddingLeft: compact ? 0 : 8 },
    card: {
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: compact ? 8 : 10,
      paddingVertical: compact ? 7 : 8,
      gap: 5,
    },
    cardStuck: { borderColor: colors.statusDanger, borderLeftWidth: 4 },
    cardLit: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.surface2 },
    cardPressed: { backgroundColor: colors.surface2 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    number: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "700", fontFamily: MONO },
    cardTitle: { color: colors.foreground, fontSize: 13, fontWeight: "600", flexShrink: 1 },
    tag: {
      color: colors.foregroundMuted,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 10,
    },
    landed: { color: colors.accent, fontSize: 10, fontWeight: "700" },
    pill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      fontSize: 11,
      fontWeight: "700",
    },
    row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: compact ? 6 : 10 },
    dots: { flexDirection: "row", alignItems: "center" },
    dotCell: { flexDirection: "row", alignItems: "center" },
    link: { width: compact ? 7 : 10, height: 2 },
    dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
    dotCurrent: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
    stepLabel: { fontSize: 12, fontWeight: "600", marginLeft: 6 },
    meta: { color: colors.foreground, fontSize: 12 },
    counter: {
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 5,
      fontSize: 11,
      fontFamily: MONO,
    },
    alert: { fontSize: 12 },
    stuckBox: { gap: 3, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 5 },
    label: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "700" },
    body: { color: colors.foreground, fontSize: 12 },
    replyRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 },
    reply: {
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      fontSize: 12,
      fontFamily: MONO,
    },
    detail: { gap: 3, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 5 },
    agentLine: { color: colors.foreground, fontSize: 11, fontFamily: MONO },
    sectionRule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    reviewHeader: { gap: 4 },
    reviewTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    reviewTitle: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    reviewStuck: {
      gap: 3,
      borderColor: colors.statusDanger,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: 8,
      padding: compact ? 8 : 10,
      backgroundColor: colors.surface1,
    },
    stuckTitle: { color: colors.statusDanger, fontSize: 13, fontWeight: "700" },
  });
}

function familyName(family: Agent["family"]): string {
  return family === "claude" ? "Claude" : "GPT";
}

function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function stageColor(stage: TicketStage | "needs-you", theme: PluginTheme): string {
  switch (stage) {
    case "needs-you":
      return theme.colors.statusDanger;
    case "building":
    case "reviewing":
      return theme.colors.accent;
    case "done":
      return theme.colors.statusSuccess;
    case "blocked":
    case "skipped":
      return theme.colors.foregroundMuted;
  }
}

function lensStageColor(stage: LensState, theme: PluginTheme): string {
  switch (stage) {
    case "waiting":
      return theme.colors.foregroundMuted;
    case "reviewing":
      return theme.colors.accent;
    case "fixing":
      return theme.colors.statusWarning;
    case "clean":
      return theme.colors.statusSuccess;
  }
}

/**
 * Keys of cards that landed in a new stage within the last HIGHLIGHT_MS. The first snapshot
 * only records where everything is, so nothing flashes when the panel opens.
 */
function useLanding(placements: readonly { key: CardKey; stage: StageKey }[] | null): ReadonlySet<CardKey> {
  const previous = useRef(null as Map<CardKey, StageKey> | null);
  const litUntil = useRef(new Map() as Map<CardKey, number>);
  const [, setWake] = useState(0);
  const signature = placements ? placements.map((entry) => `${entry.key}=${entry.stage}`).join("|") : "";
  useEffect(() => {
    if (!placements) {
      return;
    }
    const before = previous.current;
    previous.current = new Map(placements.map((entry) => [entry.key, entry.stage]));
    if (!before) {
      return;
    }
    const moved = placements.filter((entry) => before.has(entry.key) && before.get(entry.key) !== entry.stage);
    if (moved.length === 0) {
      return;
    }
    const expires = Date.now() + HIGHLIGHT_MS;
    for (const entry of moved) {
      litUntil.current.set(entry.key, expires);
    }
    setWake((value) => value + 1);
    // Re-render once more to drop the highlight. After unmount this is a no-op.
    setTimeout(() => setWake((value) => value + 1), HIGHLIGHT_MS + 50);
  }, [signature]);
  const now = Date.now();
  return new Set([...litUntil.current].filter(([, expires]) => expires > now).map(([key]) => key));
}

function toggled(current: ReadonlySet<StageKey>, key: StageKey): Set<StageKey> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

function dotKinds(ticket: Ticket): DotKind[] {
  return STEP_NAMES.map((_, index) => {
    if (ticket.refactor && index < REFACTOR_SKIPS_STEPS) {
      return "skip";
    }
    if (index < ticket.step) {
      return "done";
    }
    if (index === ticket.step) {
      return ticket.state === "skipped" ? "stopped" : "current";
    }
    return "todo";
  });
}

function stepLabel(ticket: Ticket): string {
  const name = STEP_NAMES[ticket.step];
  if (ticket.step >= STEP_NAMES.length) {
    return "all steps done";
  }
  if (!name) {
    return "not started";
  }
  if (ticket.state === "stuck") {
    return `stuck at ${name}`;
  }
  if (ticket.state === "skipped") {
    return `stopped at ${name}`;
  }
  return ticket.activity === "paused" ? `${name} (paused)` : name;
}

function currentColor(ticket: Ticket, theme: PluginTheme): string {
  if (ticket.state === "stuck") {
    return theme.colors.statusDanger;
  }
  return ticket.activity === "paused" ? theme.colors.statusWarning : theme.colors.accent;
}

function StepDots({ ticket, theme, styles }: { ticket: Ticket; theme: PluginTheme; styles: Styles }) {
  const kinds = dotKinds(ticket);
  const highlight = currentColor(ticket, theme);
  const labelColor =
    ticket.step >= STEP_NAMES.length
      ? theme.colors.statusSuccess
      : kinds.includes("current")
        ? highlight
        : theme.colors.foregroundMuted;
  const describe = STEP_NAMES.map((name, index) => `${name} ${kinds[index]}`).join(", ");
  return (
    <View style={styles.dots} accessible accessibilityLabel={`Steps: ${describe}`}>
      {kinds.map((kind, index) => {
        const reached = kind === "done" || kind === "current";
        const dotStyle =
          kind === "done"
            ? [styles.dot, { backgroundColor: theme.colors.statusSuccess, borderColor: theme.colors.statusSuccess }]
            : kind === "current"
              ? [styles.dotCurrent, { backgroundColor: highlight, borderColor: highlight }]
              : kind === "stopped"
                ? [styles.dotCurrent, { backgroundColor: theme.colors.surface2, borderColor: theme.colors.foregroundMuted }]
                : kind === "skip"
                  ? [styles.dot, { borderColor: theme.colors.border, borderStyle: "dashed" as const }]
                  : [styles.dot, { borderColor: theme.colors.foregroundMuted }];
        return (
          <View key={STEP_NAMES[index]} style={styles.dotCell}>
            {index > 0 ? (
              <View
                style={[styles.link, { backgroundColor: reached ? theme.colors.statusSuccess : theme.colors.border }]}
              />
            ) : null}
            <View style={dotStyle} />
          </View>
        );
      })}
      <Text style={[styles.stepLabel, { color: labelColor }]}>{stepLabel(ticket)}</Text>
    </View>
  );
}

function Counter({ label, value, theme, styles }: { label: string; value: number; theme: PluginTheme; styles: Styles }) {
  const color =
    value >= LOOP_CAP
      ? theme.colors.statusDanger
      : value > 0
        ? theme.colors.statusWarning
        : theme.colors.foregroundMuted;
  return (
    <Text style={[styles.counter, { color, borderColor: color }]}>
      {label} {value}/{LOOP_CAP}
    </Text>
  );
}

function Replies({ replies, specNumber, styles }: { replies: string[]; specNumber: number; styles: Styles }) {
  return (
    <View style={styles.replyRow}>
      <Text style={styles.label}>Reply on spec issue #{specNumber} with</Text>
      {replies.map((reply, index) => (
        <Text key={reply} style={styles.muted}>
          <Text style={styles.reply} selectable>
            {reply}
          </Text>
          {index === replies.length - 2 ? ", or" : index === replies.length - 1 ? "" : ","}
        </Text>
      ))}
    </View>
  );
}

function StuckDetail({ stuck, specNumber, styles }: { stuck: Stuck; specNumber: number; styles: Styles }) {
  return (
    <View style={styles.stuckBox}>
      <Text style={styles.body}>
        <Text style={styles.label}>Why </Text>
        {stuck.reason}
      </Text>
      <Text style={styles.label}>Tried</Text>
      {stuck.tried.map((line, index) => (
        <Text key={line} style={styles.muted}>
          {index + 1}. {line}
        </Text>
      ))}
      <Replies replies={stuck.replies} specNumber={specNumber} styles={styles} />
    </View>
  );
}

function roleLine(ticket: Ticket): string {
  if (ticket.activity === "red-check") {
    return "engine · red check";
  }
  if (ticket.activity === "gates") {
    return "engine · checks (tests, types)";
  }
  const active = [...ticket.agents]
    .reverse()
    .find((agent) => agent.state === "running" || agent.state === "paused" || agent.state === "idle");
  if (active) {
    return `${active.role} · ${familyName(active.family)} (${active.model})`;
  }
  const last = ticket.agents[ticket.agents.length - 1];
  return last ? `last: ${last.role} · ${familyName(last.family)} (${last.model})` : "no agent yet";
}

function TicketDetail({ ticket, run, styles }: { ticket: Ticket; run: RunSnapshot; styles: Styles }) {
  const kinds = dotKinds(ticket);
  const moves = run.journal.filter((entry) => entry.ticket === ticket.number).slice(-3);
  const dependsOn = ticket.dependsOn.map((number) => {
    const dependency = run.tickets.find((candidate) => candidate.number === number);
    return `#${number} ${dependency ? dependency.state : "?"}`;
  });
  return (
    <View style={styles.detail}>
      <Text style={styles.muted}>
        steps: {STEP_NAMES.map((name, index) => `${name} ${kinds[index] === "skip" ? "(not needed)" : kinds[index]}`).join(" → ")}
      </Text>
      <Text style={styles.muted}>depends on: {dependsOn.length > 0 ? dependsOn.join(", ") : "nothing"}</Text>
      {ticket.tests ? (
        <Text style={styles.muted}>
          last checks: {ticket.tests.failing > 0 ? `${ticket.tests.failing} of ${ticket.tests.total} tests failing` : `${ticket.tests.total} tests pass`}
        </Text>
      ) : null}
      {ticket.findings ? (
        <Text style={styles.muted}>
          findings: {ticket.findings.blocker} blocker · {ticket.findings.shouldFix} should-fix · {ticket.findings.nit} nit
        </Text>
      ) : null}
      {ticket.note ? <Text style={styles.muted}>{ticket.note}</Text> : null}
      <Text style={styles.label}>Agents</Text>
      {ticket.agents.length === 0 ? <Text style={styles.muted}>none yet</Text> : null}
      {ticket.agents.map((agent, index) => (
        <Text key={`${agent.role}-${index}`} style={styles.agentLine}>
          {agent.role.padEnd(11)} {familyName(agent.family).padEnd(6)} {agent.state.padEnd(7)} {formatTokens(agent.tokens).padStart(6)} · {agent.note}
        </Text>
      ))}
      {moves.length > 0 ? <Text style={styles.label}>Recent</Text> : null}
      {moves.map((entry) => (
        <Text key={`${entry.loopTick}-${entry.text}`} style={styles.muted}>
          {entry.clock} {entry.text}
        </Text>
      ))}
    </View>
  );
}

function TicketCard({
  ticket,
  run,
  open,
  lit,
  onToggle,
  theme,
  styles,
}: {
  ticket: Ticket;
  run: RunSnapshot;
  open: boolean;
  lit: boolean;
  onToggle: () => void;
  theme: PluginTheme;
  styles: Styles;
}) {
  const color = ticket.state === "stuck" ? theme.colors.statusDanger : stageColor(ticket.state, theme);
  const tokens = ticket.agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const failing = ticket.tests && ticket.tests.failing > 0 && ticket.state !== "skipped" && ticket.state !== "done" ? ticket.tests.failing : 0;
  const blockers = ticket.findings ? ticket.findings.blocker : 0;
  const waitsOn = ticket.dependsOn.filter((number) => {
    const dependency = run.tickets.find((candidate) => candidate.number === number);
    return dependency !== undefined && dependency.state !== "done";
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.number}, ${ticket.state}. ${open ? "Collapse" : "Expand"} details`}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.card,
        ticket.stuck ? styles.cardStuck : null,
        lit ? styles.cardLit : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.number}>#{ticket.number}</Text>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {ticket.title}
        </Text>
        {ticket.refactor ? <Text style={styles.tag}>refactor</Text> : null}
        {lit ? <Text style={styles.landed}>just moved here</Text> : null}
        <View style={styles.spacer} />
        <Text style={[styles.pill, { color, borderColor: color }]}>{ticket.activity}</Text>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
      </View>
      <View style={styles.row}>
        <StepDots ticket={ticket} theme={theme} styles={styles} />
        <Text style={styles.meta} numberOfLines={1}>
          {roleLine(ticket)}
        </Text>
      </View>
      <View style={styles.row}>
        <Counter label="fix" value={ticket.fix} theme={theme} styles={styles} />
        <Counter label="review" value={ticket.review} theme={theme} styles={styles} />
        <Text style={styles.mono}>{formatTokens(tokens)} tokens</Text>
        {failing > 0 ? (
          <Text style={[styles.alert, { color: theme.colors.statusDanger }]}>
            {failing} of {ticket.tests?.total} tests failing
          </Text>
        ) : null}
        {blockers > 0 && ticket.state !== "done" ? (
          <Text style={[styles.alert, { color: theme.colors.statusWarning }]}>{blockers} blocker from ticket review</Text>
        ) : null}
        {ticket.state === "blocked" && waitsOn.length > 0 ? (
          <Text style={styles.muted}>waits on {waitsOn.map((number) => `#${number}`).join(", ")}</Text>
        ) : null}
      </View>
      {ticket.stuck ? <StuckDetail stuck={ticket.stuck} specNumber={run.spec.number} styles={styles} /> : null}
      {open ? <TicketDetail ticket={ticket} run={run} styles={styles} /> : null}
    </Pressable>
  );
}

function StageHeader({
  title,
  hint,
  icon,
  count,
  color,
  folded,
  lit,
  onPress,
  theme,
  styles,
}: {
  title: string;
  hint: string;
  icon: string;
  count: number;
  color: string;
  folded: boolean | null;
  lit: boolean;
  onPress: (() => void) | null;
  theme: PluginTheme;
  styles: Styles;
}) {
  const empty = count === 0;
  const content = (
    <>
      <Icon name={icon} size={13} color={empty ? theme.colors.foregroundMuted : color} />
      <Text style={[styles.stageTitle, { color: empty ? theme.colors.foregroundMuted : color }]}>{title.toUpperCase()}</Text>
      <Text style={styles.stageCount}>{count}</Text>
      {empty ? null : <Text style={styles.stageHint} numberOfLines={1}>{hint}</Text>}
      {lit ? <Text style={styles.landed}>+ just landed</Text> : null}
      <View style={styles.spacer} />
      {folded === null || empty ? null : (
        <>
          <Text style={styles.stageCount}>{folded ? "tap to open" : ""}</Text>
          <Icon name={folded ? "ChevronRight" : "ChevronDown"} size={13} color={theme.colors.foregroundMuted} />
        </>
      )}
    </>
  );
  const style = [styles.stageHeader, empty ? [styles.stageHeaderThin, { opacity: DIMMED }] : null, lit ? styles.stageHeaderLit : null];
  if (!onPress || empty) {
    return <View style={style}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count} tickets. ${folded ? "Open" : "Fold"} this stage`}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  );
}

function lensColor(lens: Lens, review: FinalReview, theme: PluginTheme): string {
  if (lens.state === "fixing" && review.state === "stuck") {
    return theme.colors.statusDanger;
  }
  return lensStageColor(lens.state, theme);
}

function findingsLine(lens: Lens): string | null {
  const parts = [
    lens.findings.blocker > 0 ? `${lens.findings.blocker} blocker` : null,
    lens.findings.shouldFix > 0 ? `${lens.findings.shouldFix} should-fix` : null,
    lens.findings.nit > 0 ? `${lens.findings.nit} nits` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

function LensCard({
  lens,
  review,
  lit,
  theme,
  styles,
}: {
  lens: Lens;
  review: FinalReview;
  lit: boolean;
  theme: PluginTheme;
  styles: Styles;
}) {
  const color = lensColor(lens, review, theme);
  const stuck = lens.state === "fixing" && review.state === "stuck";
  const findings = findingsLine(lens);
  const inRound = lens.state === "reviewing" || lens.state === "fixing";
  return (
    <View style={[styles.card, stuck ? styles.cardStuck : null, lit ? styles.cardLit : null]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{lens.name}</Text>
        {lit ? <Text style={styles.landed}>just moved here</Text> : null}
        <View style={styles.spacer} />
        <Text style={[styles.pill, { color, borderColor: color }]}>{lens.activity}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.meta}>
          reviewer · {familyName(lens.family)} ({lens.model})
        </Text>
        {inRound ? <Counter label="round" value={review.round} theme={theme} styles={styles} /> : null}
        <Text style={styles.mono}>{formatTokens(lens.tokens)} tokens</Text>
        {findings ? (
          <Text style={[styles.alert, { color: lens.findings.blocker > 0 ? theme.colors.statusDanger : theme.colors.statusWarning }]}>
            {findings}
          </Text>
        ) : null}
      </View>
      {lens.note ? <Text style={styles.muted}>{lens.note}</Text> : null}
    </View>
  );
}

function reviewStateLine(review: FinalReview, openTickets: number): string {
  switch (review.state) {
    case "waiting":
      return openTickets > 0
        ? `Starts when every ticket is done or skipped (${openTickets} still open).`
        : "Every ticket is done or skipped. Starting…";
    case "reviewing":
      return `Round ${review.round}/${LOOP_CAP}: a fresh GPT reviewer per lens reads the whole branch.`;
    case "fixing":
      return `Fix ${review.fix}/${LOOP_CAP}: the implementer fixes what the lenses found.`;
    case "escalated":
      return "The fix loop hit its cap. A stronger model (claude-opus) gets one more round.";
    case "stuck":
      return "Stuck: 3 rounds and the stronger model couldn't clear the blocker. It needs your reply.";
    case "passed":
      return "Passed. The pull request opens.";
  }
}

function FinalReviewStack({
  run,
  lit,
  theme,
  styles,
}: {
  run: RunSnapshot;
  lit: ReadonlySet<CardKey>;
  theme: PluginTheme;
  styles: Styles;
}) {
  const review = run.finalReview;
  const openTickets = run.tickets.filter((ticket) => ticket.state !== "done" && ticket.state !== "skipped").length;
  const ready = openTickets === 0;
  const fixer = [...review.agents].reverse().find((agent) => agent.role === "implementer" && agent.state === "running");
  return (
    <View style={[styles.block, ready ? null : { opacity: DIMMED }]} aria-disabled={!ready}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewTitleRow}>
          <Icon name="GitPullRequest" size={15} color={theme.colors.foreground} />
          <Text style={styles.reviewTitle}>Final review · 5 lenses</Text>
          <View style={styles.spacer} />
          <Counter label="round" value={review.round} theme={theme} styles={styles} />
          <Counter label="fix" value={review.fix} theme={theme} styles={styles} />
        </View>
        <Text style={styles.muted}>{reviewStateLine(review, openTickets)}</Text>
        {fixer ? (
          <Text style={styles.meta}>
            now: {fixer.role} · {familyName(fixer.family)} ({fixer.model}) · {formatTokens(fixer.tokens)} tokens
          </Text>
        ) : null}
      </View>
      {review.stuck ? (
        <View style={styles.reviewStuck}>
          <Text style={styles.stuckTitle}>The final review is stuck · waiting on you {clock(review.stuck.waitingSeconds)}</Text>
          <StuckDetail stuck={review.stuck} specNumber={run.spec.number} styles={styles} />
        </View>
      ) : null}
      {LENS_STAGES.map((entry) => {
        const lenses = review.lenses.filter((lens) => lens.state === entry.stage);
        return (
          <View key={entry.stage} style={styles.block}>
            <StageHeader
              title={entry.title}
              hint={entry.stage === "fixing" ? "the implementer works on the findings" : ""}
              icon={entry.icon}
              count={lenses.length}
              color={lensStageColor(entry.stage, theme)}
              folded={null}
              lit={false}
              onPress={null}
              theme={theme}
              styles={styles}
            />
            {lenses.length > 0 ? (
              <View style={styles.stageBody}>
                {lenses.map((lens) => (
                  <LensCard
                    key={lens.name}
                    lens={lens}
                    review={review}
                    lit={lit.has(`lens-${lens.name}`)}
                    theme={theme}
                    styles={styles}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Section({ children, styles }: { children: ReactNode; styles: Styles }) {
  return <View style={styles.block}>{children}</View>;
}

export function StageStackPanel({ theme, layout }: PluginWorkspacePanelProps) {
  const readBoard = useRpc(readBoardRpc);
  const board = useQuery({
    queryKey: ["luca-board-prototype", "run"],
    queryFn: () => readBoard({}),
    refetchInterval: POLL_MS,
  });
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const [openCards, setOpenCards] = useState(() => new Set([] as CardKey[]));
  const [folded, setFolded] = useState(
    () => new Set(TICKET_STAGES.filter((entry) => entry.startsFolded).map((entry) => entry.stage as StageKey)),
  );
  const run = board.data ?? null;

  const placements = run
    ? [
        ...run.tickets.map((ticket) => ({
          key: `ticket-${ticket.number}`,
          stage: ticket.stuck ? "needs-you" : ticket.state,
        })),
        ...run.finalReview.lenses.map((lens) => ({ key: `lens-${lens.name}`, stage: lens.state })),
      ]
    : null;
  const lit = useLanding(placements);

  if (!run) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headRow}>
          <Text style={styles.badge}>PROTOTYPE</Text>
          <Text style={styles.title}>Luca board</Text>
        </View>
        <Text style={styles.muted}>
          {board.isError ? `Couldn't read the fake run: ${String(board.error)}` : "Loading the fake run…"}
        </Text>
      </ScrollView>
    );
  }

  const stuckTickets = run.tickets.filter((ticket) => ticket.stuck !== null);
  const needsYou = stuckTickets.length + (run.finalReview.stuck ? 1 : 0);
  const latest = run.journal[run.journal.length - 1];
  const card = (ticket: Ticket) => {
    const key = `ticket-${ticket.number}`;
    return (
      <TicketCard
        key={key}
        ticket={ticket}
        run={run}
        open={openCards.has(key)}
        lit={lit.has(key)}
        onToggle={() => setOpenCards((current) => toggled(current, key))}
        theme={theme}
        styles={styles}
      />
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headRow}>
        <Text style={styles.badge}>PROTOTYPE</Text>
        <Text style={styles.title}>Luca board</Text>
        <Text style={styles.subtitle}>B v2 · stage stack</Text>
        <View style={styles.spacer} />
        <Text style={styles.debug}>
          tick {run.tick} · {run.loopTick}/{run.loopLength} · scene {run.scene}
        </Text>
      </View>

      <Text style={styles.summary} numberOfLines={layout.compact ? 3 : 1}>
        Spec #{run.spec.number} · {run.spec.title}
        <Text style={styles.muted}>
          {" "}
          · run {clock(run.elapsedSeconds)} · {run.agentsRunning} agents running · {run.branch}
        </Text>
      </Text>
      <View style={styles.usageLine}>
        <Icon name="Gauge" size={13} color={theme.colors.foregroundMuted} />
        {run.usage.map((plan) => (
          <Text key={plan.plan} style={styles.mono}>
            {plan.plan} 5h <Text style={{ color: usageColor(plan.fiveHour, theme) }}>{plan.fiveHour}%</Text> · week{" "}
            <Text style={{ color: usageColor(plan.weekly, theme) }}>{plan.weekly}%</Text>
          </Text>
        ))}
      </View>
      {run.limitWait ? (
        <View style={styles.limitLine}>
          <Icon name="Hourglass" size={13} color={theme.colors.statusWarning} />
          <Text style={styles.limitText}>
            Limit wait · {run.limitWait.plan} {run.limitWait.window} at{" "}
            <Text style={{ color: usageColor(run.usage.find((plan) => plan.plan === run.limitWait?.plan)?.fiveHour ?? 100, theme) }}>
              {run.usage.find((plan) => plan.plan === run.limitWait?.plan)?.fiveHour ?? 100}%
            </Text>{" "}
            · resets in {clock(run.limitWait.resetsInSeconds)} · carries on by itself, so it isn't stuck
          </Text>
        </View>
      ) : null}
      <Text style={styles.legend}>Step dots: tests → red check → code → checks → review. Tap a card for agents and tokens.</Text>

      <Section styles={styles}>
        <StageHeader
          title="Needs you"
          hint="stuck work waiting for your reply on the spec issue"
          icon="OctagonAlert"
          count={needsYou}
          color={theme.colors.statusDanger}
          folded={null}
          lit={false}
          onPress={null}
          theme={theme}
          styles={styles}
        />
        {needsYou > 0 ? (
          <View style={styles.stageBody}>
            {stuckTickets.map(card)}
            {run.finalReview.stuck ? (
              <View style={[styles.card, styles.cardStuck]}>
                <Text style={styles.stuckTitle}>The final review is stuck (details below)</Text>
                <Replies replies={run.finalReview.stuck.replies} specNumber={run.spec.number} styles={styles} />
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>

      {TICKET_STAGES.map((entry) => {
        const tickets = run.tickets.filter((ticket) => ticket.stuck === null && ticket.state === entry.stage);
        const isFolded = folded.has(entry.stage);
        const landed = isFolded && tickets.some((ticket) => lit.has(`ticket-${ticket.number}`));
        return (
          <Section key={entry.stage} styles={styles}>
            <StageHeader
              title={entry.title}
              hint={entry.hint}
              icon={entry.icon}
              count={tickets.length}
              color={stageColor(entry.stage, theme)}
              folded={isFolded}
              lit={landed}
              onPress={() => setFolded((current) => toggled(current, entry.stage))}
              theme={theme}
              styles={styles}
            />
            {tickets.length > 0 && !isFolded ? <View style={styles.stageBody}>{tickets.map(card)}</View> : null}
          </Section>
        );
      })}

      <View style={styles.sectionRule} />
      <FinalReviewStack run={run} lit={lit} theme={theme} styles={styles} />

      <View style={styles.sectionRule} />
      <Text style={styles.debug}>
        fake run · tick {run.tick} · loop {run.loop} · {run.loopTick}/{run.loopLength} · polls every {POLL_MS / 1000}s
      </Text>
      {latest ? <Text style={styles.debug}>latest: {latest.text}</Text> : null}
    </ScrollView>
  );
}
