import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  LOOP_CAP,
  POLL_MS,
  readBoardRpc,
  type Agent,
  type FinalReview,
  type RunSnapshot,
  type Stuck,
  type Ticket,
  type TicketState,
} from "../shared/board";

/**
 * Variant B: a dense list in a workspace tab. One row per ticket, stuck work pinned on top
 * with its reason, what was tried, and the exact reply. Rows expand on tap. Its layout is
 * its own; A and C share only the fake data.
 */

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

type RowKey = string;
type StylesFactory = typeof makeStyles;
type Styles = ReturnType<StylesFactory>;

function makeStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 10 : 14, gap: 8 },
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
    title: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
    subtitle: { color: colors.foregroundMuted, fontSize: 12 },
    spacer: { flex: 1 },
    debug: { color: colors.foregroundMuted, fontSize: 10, fontFamily: MONO },
    summary: { color: colors.foreground, fontSize: 13 },
    summaryMuted: { color: colors.foregroundMuted, fontSize: 13 },
    usageLine: { flexDirection: "row", flexWrap: "wrap", gap: compact ? 8 : 14, alignItems: "center" },
    usageText: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
    limitLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderColor: colors.statusWarning,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    limitText: { color: colors.statusWarning, fontSize: 12, flexShrink: 1 },
    sectionTitle: {
      color: colors.foregroundMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      marginTop: 6,
    },
    pinned: {
      borderColor: colors.statusDanger,
      borderWidth: 1,
      borderLeftWidth: 4,
      borderRadius: 6,
      padding: compact ? 8 : 10,
      gap: 4,
      backgroundColor: colors.surface1,
    },
    pinnedTitle: { color: colors.statusDanger, fontSize: 13, fontWeight: "700" },
    label: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "700" },
    body: { color: colors.foreground, fontSize: 12 },
    bodyMuted: { color: colors.foregroundMuted, fontSize: 12 },
    replyRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
    reply: {
      color: colors.foreground,
      backgroundColor: colors.surface2,
      borderRadius: 4,
      paddingHorizontal: 5,
      fontSize: 12,
      fontFamily: MONO,
    },
    list: { borderColor: colors.border, borderWidth: 1, borderRadius: 6, overflow: "hidden" },
    columns: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.surface1,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
    },
    columnText: { color: colors.foregroundMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
    row: {
      paddingHorizontal: 8,
      paddingVertical: compact ? 6 : 5,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      gap: 2,
    },
    rowPressed: { backgroundColor: colors.surface1 },
    rowLine: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    number: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO, width: 28 },
    rowTitle: { color: colors.foreground, fontSize: 13, flex: 1 },
    cell: { color: colors.foreground, fontSize: 12 },
    cellMuted: { color: colors.foregroundMuted, fontSize: 12 },
    cellMono: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
    colState: { width: 72 },
    colAgent: { width: 150 },
    colActivity: { width: 64 },
    colLoops: { width: 96 },
    colTokens: { width: 52, textAlign: "right" },
    subLine: { color: colors.foregroundMuted, fontSize: 12, paddingLeft: 16 },
    detail: {
      marginTop: 4,
      marginLeft: compact ? 0 : 16,
      padding: 8,
      gap: 3,
      borderRadius: 6,
      backgroundColor: colors.surface1,
    },
    agentLine: { color: colors.foreground, fontSize: 12, fontFamily: MONO },
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

function toneColor(tone: string, theme: PluginTheme): string {
  if (tone === "success") {
    return theme.colors.statusSuccess;
  }
  if (tone === "warning") {
    return theme.colors.statusWarning;
  }
  if (tone === "danger") {
    return theme.colors.statusDanger;
  }
  return theme.colors.foregroundMuted;
}

function percentColor(percent: number, theme: PluginTheme): string {
  if (percent >= 90) {
    return theme.colors.statusDanger;
  }
  if (percent >= 70) {
    return theme.colors.statusWarning;
  }
  return theme.colors.foreground;
}

function family(agentFamily: Agent["family"]): string {
  return agentFamily === "claude" ? "Claude" : "GPT";
}

function tokens(count: number): string {
  return count >= 1000 ? `${Math.round(count / 100) / 10}k` : String(count);
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function agentCell(ticket: Ticket): string {
  if (ticket.activity === "red-check") {
    return "engine · red check";
  }
  if (ticket.activity === "gates") {
    return "engine · gates";
  }
  const active = [...ticket.agents]
    .reverse()
    .find((agent) => agent.state === "running" || agent.state === "paused" || agent.state === "idle");
  return active ? `${active.role} · ${family(active.family)}` : "—";
}

function loopsCell(fix: number, review: number): string {
  return `fix ${fix}/${LOOP_CAP} · rev ${review}/${LOOP_CAP}`;
}

function PinnedStuck({
  title,
  stuck,
  specNumber,
  styles,
}: {
  title: string;
  stuck: Stuck;
  specNumber: number;
  styles: Styles;
}) {
  return (
    <View style={styles.pinned}>
      <Text style={styles.pinnedTitle}>
        {title} · waiting on you {clock(stuck.waitingSeconds)}
      </Text>
      <Text style={styles.body}>
        <Text style={styles.label}>Why </Text>
        {stuck.reason}
      </Text>
      <Text style={styles.label}>Tried</Text>
      {stuck.tried.map((line, index) => (
        <Text key={line} style={styles.bodyMuted}>
          {index + 1}. {line}
        </Text>
      ))}
      <View style={styles.replyRow}>
        <Text style={styles.label}>Reply on spec issue #{specNumber} with</Text>
        {stuck.replies.map((reply, index) => (
          <Text key={reply} style={styles.bodyMuted}>
            <Text style={styles.reply} selectable>
              {reply}
            </Text>
            {index === stuck.replies.length - 2 ? ", or" : index === stuck.replies.length - 1 ? "" : ","}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TicketDetail({ ticket, run, styles }: { ticket: Ticket; run: RunSnapshot; styles: Styles }) {
  const moves = run.journal.filter((entry) => entry.ticket === ticket.number).slice(-3);
  const dependsOn = ticket.dependsOn.map((number) => {
    const dependency = run.tickets.find((candidate) => candidate.number === number);
    return `#${number} ${dependency ? dependency.state : "?"}`;
  });
  return (
    <View style={styles.detail}>
      {ticket.refactor ? <Text style={styles.bodyMuted}>Refactor ticket: no red check.</Text> : null}
      <Text style={styles.bodyMuted}>depends on: {dependsOn.length > 0 ? dependsOn.join(", ") : "nothing"}</Text>
      {ticket.tests ? (
        <Text style={styles.bodyMuted}>
          last gate run: {ticket.tests.failing > 0 ? `${ticket.tests.failing} of ${ticket.tests.total} tests failing` : `${ticket.tests.total} tests pass`}
        </Text>
      ) : null}
      {ticket.findings ? (
        <Text style={styles.bodyMuted}>
          findings: {ticket.findings.blocker} blocker · {ticket.findings.shouldFix} should-fix · {ticket.findings.nit} nit
        </Text>
      ) : null}
      {ticket.note ? <Text style={styles.bodyMuted}>{ticket.note}</Text> : null}
      <Text style={styles.label}>Agents</Text>
      {ticket.agents.length === 0 ? <Text style={styles.bodyMuted}>none yet</Text> : null}
      {ticket.agents.map((agent, index) => (
        <Text key={`${agent.role}-${index}`} style={styles.agentLine}>
          {agent.role.padEnd(11)} {family(agent.family).padEnd(6)} {agent.state.padEnd(7)} {tokens(agent.tokens).padStart(6)} · {agent.note}
        </Text>
      ))}
      {moves.length > 0 ? <Text style={styles.label}>Recent</Text> : null}
      {moves.map((entry) => (
        <Text key={`${entry.loopTick}-${entry.text}`} style={styles.bodyMuted}>
          {entry.clock} {entry.text}
        </Text>
      ))}
    </View>
  );
}

function TicketRow({
  ticket,
  run,
  open,
  onToggle,
  compact,
  theme,
  styles,
}: {
  ticket: Ticket;
  run: RunSnapshot;
  open: boolean;
  onToggle: () => void;
  compact: boolean;
  theme: PluginTheme;
  styles: Styles;
}) {
  const color = stateColor(ticket.state, theme);
  const total = ticket.agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const failing = ticket.tests && ticket.tests.failing > 0 && ticket.state !== "skipped" ? ticket.tests.failing : 0;
  const blockers = ticket.findings ? ticket.findings.blocker : 0;
  const extra = [
    failing > 0 ? `${failing} failing` : null,
    blockers > 0 ? `${blockers} blocker` : null,
    ticket.state === "blocked" ? `waits on ${ticket.dependsOn.map((number) => `#${number}`).join(", ")}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.number}, ${ticket.state}. ${open ? "Collapse" : "Expand"} details`}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowLine}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.number}>#{ticket.number}</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {ticket.title}
        </Text>
        {compact ? null : (
          <>
            <Text style={[styles.cell, styles.colState, { color }]}>{ticket.state}</Text>
            <Text style={[styles.cell, styles.colAgent]} numberOfLines={1}>
              {agentCell(ticket)}
            </Text>
            <Text style={[styles.cellMuted, styles.colActivity]}>{ticket.activity}</Text>
            <Text style={[styles.cellMono, styles.colLoops]}>{loopsCell(ticket.fix, ticket.review)}</Text>
            <Text style={[styles.cellMono, styles.colTokens]}>{tokens(total)}</Text>
          </>
        )}
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
      </View>
      {compact ? (
        <Text style={styles.subLine} numberOfLines={1}>
          <Text style={{ color }}>{ticket.state}</Text> · {agentCell(ticket)} · {ticket.activity} ·{" "}
          {loopsCell(ticket.fix, ticket.review)} · {tokens(total)}
        </Text>
      ) : null}
      {extra ? (
        <Text style={[styles.subLine, { color: failing > 0 || blockers > 0 ? theme.colors.statusWarning : theme.colors.foregroundMuted }]}>
          {extra}
        </Text>
      ) : null}
      {open ? <TicketDetail ticket={ticket} run={run} styles={styles} /> : null}
    </Pressable>
  );
}

function FinalReviewRow({
  review,
  open,
  onToggle,
  compact,
  theme,
  styles,
}: {
  review: FinalReview;
  open: boolean;
  onToggle: () => void;
  compact: boolean;
  theme: PluginTheme;
  styles: Styles;
}) {
  const color =
    review.state === "stuck"
      ? theme.colors.statusDanger
      : review.state === "waiting"
        ? theme.colors.foregroundMuted
        : theme.colors.accent;
  const reported = review.lenses.filter((lens) => lens.state === "clean" || lens.state === "findings").length;
  const blockers = review.lenses.reduce((sum, lens) => sum + lens.findings.blocker, 0);
  const lensTokens = review.agents.reduce((sum, agent) => sum + agent.tokens, 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Final review, ${review.state}. ${open ? "Collapse" : "Expand"} lenses`}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowLine}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.number}>—</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>
          Final review · {reported}/5 lenses reported{blockers > 0 ? ` · ${blockers} blocker` : ""}
        </Text>
        {compact ? null : (
          <>
            <Text style={[styles.cell, styles.colState, { color }]}>{review.state}</Text>
            <Text style={[styles.cell, styles.colAgent]}>reviewers · GPT</Text>
            <Text style={[styles.cellMuted, styles.colActivity]}>{review.state === "waiting" ? "—" : review.state}</Text>
            <Text style={[styles.cellMono, styles.colLoops]}>{loopsCell(review.fix, review.round)}</Text>
            <Text style={[styles.cellMono, styles.colTokens]}>{tokens(lensTokens)}</Text>
          </>
        )}
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
      </View>
      {compact ? (
        <Text style={styles.subLine} numberOfLines={1}>
          <Text style={{ color }}>{review.state}</Text> · {loopsCell(review.fix, review.round)} · {tokens(lensTokens)}
        </Text>
      ) : null}
      {open ? (
        <View style={styles.detail}>
          {review.lenses.map((lens) => (
            <Text key={lens.name} style={styles.agentLine}>
              {lens.name.padEnd(15)} {lens.state.padEnd(8)} {lens.findings.blocker}b {lens.findings.shouldFix}s {lens.findings.nit}n
              {lens.note ? ` · ${lens.note}` : ""}
            </Text>
          ))}
          {review.agents.length > 0 ? <Text style={styles.label}>Agents</Text> : null}
          {review.agents.map((agent, index) => (
            <Text key={`${agent.note}-${index}`} style={styles.agentLine}>
              {agent.role.padEnd(11)} {family(agent.family).padEnd(6)} {agent.state.padEnd(7)} {tokens(agent.tokens).padStart(6)} · {agent.note}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export function DenseListPanel({ theme, layout }: PluginWorkspacePanelProps) {
  const readBoard = useRpc(readBoardRpc);
  const board = useQuery({
    queryKey: ["luca-board-prototype", "run"],
    queryFn: () => readBoard({}),
    refetchInterval: POLL_MS,
  });
  const [openRows, setOpenRows] = useState(() => new Set<RowKey>());
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const run = board.data;

  const toggle = (key: RowKey) => {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const stuckTickets = run ? run.tickets.filter((ticket) => ticket.stuck !== null) : [];
  const listed = run ? run.tickets.filter((ticket) => ticket.stuck === null) : [];
  const pinnedCount = stuckTickets.length + (run && run.finalReview.stuck ? 1 : 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headRow}>
        <Text style={styles.badge}>PROTOTYPE</Text>
        <Text style={styles.title}>Luca board</Text>
        <Text style={styles.subtitle}>B · dense list</Text>
        <View style={styles.spacer} />
        <Text style={styles.debug}>
          {run ? `tick ${run.tick} · ${run.loopTick}/${run.loopLength} · scene ${run.scene}` : "tick —"}
        </Text>
      </View>

      {run ? null : (
        <Text style={styles.summaryMuted}>
          {board.isError ? `Couldn't read the fake run: ${String(board.error)}` : "Loading the fake run…"}
        </Text>
      )}

      {run ? (
        <>
          <Text style={styles.summary} numberOfLines={layout.compact ? 2 : 1}>
            Spec #{run.spec.number} · {run.spec.title}
            <Text style={styles.summaryMuted}>
              {" "}
              · run {clock(run.elapsedSeconds)} · {run.agentsRunning} agents running · {run.branch}
            </Text>
          </Text>
          <View style={styles.usageLine}>
            <Icon name="Gauge" size={13} color={theme.colors.foregroundMuted} />
            {run.usage.map((plan) => (
              <Text key={plan.plan} style={styles.usageText}>
                {plan.plan} 5h <Text style={{ color: percentColor(plan.fiveHour, theme) }}>{plan.fiveHour}%</Text> · week{" "}
                <Text style={{ color: percentColor(plan.weekly, theme) }}>{plan.weekly}%</Text>
              </Text>
            ))}
          </View>
          {run.limitWait ? (
            <View style={styles.limitLine}>
              <Icon name="Hourglass" size={13} color={theme.colors.statusWarning} />
              <Text style={styles.limitText}>
                Limit wait · {run.limitWait.plan} {run.limitWait.window} used up · resets in {clock(run.limitWait.resetsInSeconds)} ·
                carries on by itself (not stuck)
              </Text>
            </View>
          ) : null}

          {pinnedCount > 0 ? <Text style={styles.sectionTitle}>NEEDS YOU ({pinnedCount})</Text> : null}
          {stuckTickets.map((ticket) =>
            ticket.stuck ? (
              <PinnedStuck
                key={ticket.number}
                title={`#${ticket.number} ${ticket.title}`}
                stuck={ticket.stuck}
                specNumber={run.spec.number}
                styles={styles}
              />
            ) : null,
          )}
          {run.finalReview.stuck ? (
            <PinnedStuck
              title="Final review"
              stuck={run.finalReview.stuck}
              specNumber={run.spec.number}
              styles={styles}
            />
          ) : null}

          <Text style={styles.sectionTitle}>
            TICKETS ({listed.length}
            {stuckTickets.length > 0 ? ` + ${stuckTickets.length} pinned` : ""})
          </Text>
          <View style={styles.list}>
            {layout.compact ? null : (
              <View style={styles.columns}>
                <Text style={[styles.columnText, { width: 44 }]}>#</Text>
                <Text style={[styles.columnText, { flex: 1 }]}>TICKET</Text>
                <Text style={[styles.columnText, styles.colState]}>STATE</Text>
                <Text style={[styles.columnText, styles.colAgent]}>ROLE · FAMILY</Text>
                <Text style={[styles.columnText, styles.colActivity]}>DOING</Text>
                <Text style={[styles.columnText, styles.colLoops]}>LOOPS</Text>
                <Text style={[styles.columnText, styles.colTokens]}>TOKENS</Text>
                <View style={{ width: 14 }} />
              </View>
            )}
            {listed.map((ticket) => (
              <TicketRow
                key={ticket.number}
                ticket={ticket}
                run={run}
                open={openRows.has(`ticket-${ticket.number}`)}
                onToggle={() => toggle(`ticket-${ticket.number}`)}
                compact={layout.compact}
                theme={theme}
                styles={styles}
              />
            ))}
            <FinalReviewRow
              review={run.finalReview}
              open={openRows.has("final-review")}
              onToggle={() => toggle("final-review")}
              compact={layout.compact}
              theme={theme}
              styles={styles}
            />
          </View>
          <Text style={styles.debug}>
            fake run · tick {run.tick} · loop {run.loop} · polls every {POLL_MS / 1000}s · tap a row for agents, tokens and
            recent moves
          </Text>
          {run.journal.length > 0 ? (
            <Text style={[styles.debug, { color: toneColor(run.journal[run.journal.length - 1]?.tone ?? "info", theme) }]}>
              latest: {run.journal[run.journal.length - 1]?.text}
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
