#!/usr/bin/env bash
# statusline.sh -- Claude Code status line with real-time context metrics
#
# NOT a lifecycle hook. Called by Claude Code after every API response.
# Receives full session JSON on stdin, outputs a formatted status line,
# and writes real token metrics to .planning/.context-metrics.json.
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code passes JSON with multiple top-level fields:
# {
#   "context_window": {
#     "total_input_tokens": 15234,
#     "total_output_tokens": 4521,
#     "context_window_size": 200000,
#     "used_percentage": 8,
#     "remaining_percentage": 92,
#     "current_usage": { ... }
#   },
#   "workspace": { "current_dir": "/path/to/project" },
#   "model": { "display_name": "Opus 4.6 (1M context)" },
#   "vim": { "mode": "NORMAL" },
#   "session_name": "my-session"
# }
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# A single line of ANSI-colored text for the Claude Code terminal:
#   ~/Github/project  |  main  |  Opus 4.6 (1M context)  |  ctx:18%
# ─── SIDE EFFECTS ────────────────────────────────────────────────────
# Writes .planning/.context-metrics.json with real token data.
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (status line must never fail visibly)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

HOOK_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}" \
HOOK_HOME="${HOME:-}" \
bun -e "
  const projectDir = process.env.HOOK_PROJECT_DIR || '.';
  const home = process.env.HOOK_HOME || '';

  // --- Read stdin ---
  let input;
  try {
    input = JSON.parse(await Bun.stdin.text());
  } catch {
    process.exit(0);
  }

  // --- ANSI helpers ---
  const c = (code, text) => '\x1b[' + code + 'm' + text + '\x1b[0m';
  const cyan = (t) => c('36', t);
  const yellow = (t) => c('33', t);
  const magenta = (t) => c('35', t);
  const green = (t) => c('32', t);
  const red = (t) => c('31', t);
  const blue = (t) => c('34', t);
  const gray = (t) => c('90', t);

  // --- Parse fields ---
  const cwd = input?.workspace?.current_dir || input?.cwd || '';
  const model = input?.model?.display_name || '';
  const usedPct = input?.context_window?.used_percentage;
  const vimMode = input?.vim?.mode || '';
  const sessionName = input?.session_name || '';

  // --- Write context metrics (side effect) ---
  const cw = input?.context_window;
  if (cw && typeof cw.used_percentage === 'number') {
    const usedPercent = Math.round(cw.used_percentage);
    const windowSize = cw.context_window_size || 0;
    const totalInput = cw.total_input_tokens || 0;
    const totalOutput = cw.total_output_tokens || 0;
    const currentUsage = cw.current_usage || {};
    const cacheRead = currentUsage.cache_read_input_tokens || 0;

    let zone = 'peak';
    if (usedPercent >= 70) zone = 'stop';
    else if (usedPercent >= 50) zone = 'degrading';
    else if (usedPercent >= 30) zone = 'good';

    const metrics = {
      zone,
      usage_percent: usedPercent,
      context_window_size: windowSize,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      cache_read_input_tokens: cacheRead,
      checked_at: new Date().toISOString(),
      source: 'statusline',
    };

    try {
      await Bun.write(
        projectDir + '/.planning/.context-metrics.json',
        JSON.stringify(metrics, null, 2) + '\n'
      );
    } catch {
      // .planning/ may not exist — skip metrics write
    }
  }

  // --- Git branch ---
  let gitBranch = '';
  if (cwd) {
    try {
      const result = Bun.spawnSync(['git', '-C', cwd, 'symbolic-ref', '--short', 'HEAD'], {
        stdout: 'pipe', stderr: 'pipe',
      });
      if (result.exitCode === 0) {
        gitBranch = result.stdout.toString().trim();
      } else {
        const fallback = Bun.spawnSync(['git', '-C', cwd, 'rev-parse', '--short', 'HEAD'], {
          stdout: 'pipe', stderr: 'pipe',
        });
        if (fallback.exitCode === 0) gitBranch = fallback.stdout.toString().trim();
      }
    } catch { /* not a git repo */ }
  }

  // --- Directory display: shorten home to ~ ---
  let dirDisplay = cwd;
  if (home && cwd.startsWith(home)) {
    dirDisplay = '~' + cwd.slice(home.length);
  }

  // --- Context segment with color ---
  let ctxSegment = '';
  if (typeof usedPct === 'number') {
    const pct = Math.round(usedPct);
    const colorFn = pct >= 70 ? red : pct >= 50 ? yellow : green;
    ctxSegment = colorFn('ctx:' + pct + '%');
  }

  // --- Vim mode ---
  let vimSegment = '';
  if (vimMode) {
    vimSegment = vimMode === 'NORMAL' ? blue('NORMAL') : cyan('INSERT');
  }

  // --- Assemble segments ---
  const parts = [];
  if (dirDisplay) parts.push(cyan(dirDisplay));
  if (gitBranch) parts.push(yellow(gitBranch));
  if (model) parts.push(magenta(model));
  if (ctxSegment) parts.push(ctxSegment);
  if (vimSegment) parts.push(vimSegment);
  if (sessionName) parts.push(gray('[' + sessionName + ']'));

  process.stdout.write(parts.join('  |  '));
" 2>/dev/null || true

exit 0
