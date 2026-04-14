---
title: "Investigate Mastra support for array-form system prompts and cache_control"
area: architecture
created: 2026-04-14
priority: medium
source: research
---

## Task

Investigate Mastra support for array-form system prompts and cache_control

## Context

Research for the cache boundary feature (Sprint 5) identified that Mastra may not support array-form system prompts needed to split instructions into static (1-hour TTL) and dynamic (5-minute TTL) cache blocks. This is a blocking dependency for the cache boundary todo.

Additionally, it's unknown whether Mastra passes through `cache_control` to the Claude API, and whether tool result interception is possible for progressive compaction Levels 1-2.

## Investigation Needed

1. Check Mastra docs/source for `Agent.instructions` type — does it accept `string[]` or `{ text: string, cache_control: object }[]`?
2. Check if `@mastra/core` passes through Anthropic-specific `cache_control` metadata
3. Check if Mastra provides hooks for tool result interception/modification

## MuninnDB Recall

For full research context, search MuninnDB for 'research:sprint-dependency-graph' or recall tag 'research'.
