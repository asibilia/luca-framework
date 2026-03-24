# Improving Skill Creator: Test, Measure, and Refine Agent Skills

## Source

- **URL**: https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills
- **Fetched**: 2026-03-22
- **Relevance**: HIGH

## Summary

Skill Creator enables non-engineers (subject matter experts) to author and maintain agent skills with confidence. The core problem: most skill authors know their workflows but lack tools to verify skills still work as models evolve, trigger appropriately, or actually improve after edits. The solution introduces evals (automated tests), benchmark mode (standardized assessments tracking pass rate, elapsed time, token usage), and comparator agents (blind A/B testing between skill versions).

The post distinguishes two skill categories: "capability uplift" skills (techniques helping Claude do something the base model cannot) and "encoded preference" skills (documented workflows sequencing Claude's existing abilities). This distinction drives different improvement strategies. Capability uplift skills may become unnecessary as base models improve -- if the base model passes evals without the skill loaded, the skill's techniques may have been incorporated. Encoded preference skills are more durable, improved through description refinement.

A description optimizer analyzes current skill descriptions against sample prompts and suggests edits to reduce false positives and false negatives. Testing across Anthropic's document-creation skills improved triggering in 5 of 6 public skills. The post hints at a future where natural-language descriptions replace detailed implementations: "Eventually, a natural-language description of what the skill should do may be enough."

## Key Patterns Relevant to Luca v2

### Eval-Based Skill Validation

- **What**: Define test prompts, describe success criteria, run automated verification. Evals turn "seems to work" into "known to work."
- **How it applies to v2**: MuninnDB engrams (graduated from research) should have associated quality signals. When a pattern or pitfall is recalled and applied, track whether it helped or hurt the outcome. Over time, low-value engrams can be demoted or forgotten.
- **Confidence**: HIGH

### Capability Uplift vs. Encoded Preference Distinction

- **What**: Skills that teach the model new capabilities vs. skills that encode specific workflow preferences. Different improvement strategies for each.
- **How it applies to v2**: MuninnDB memory types map to this: `pattern:*` memories are capability uplift (generalizable techniques), `preference:*` memories are encoded preferences (user-specific workflows). Graduation criteria should differ: patterns graduate when validated across multiple tasks, preferences graduate when explicitly confirmed by the user.
- **Confidence**: HIGH

### Comparator Agents for A/B Testing

- **What**: Two agents evaluate outputs blindly -- comparing skill versions or skill vs. baseline. Eliminates evaluation bias.
- **How it applies to v2**: Review loops could use comparator-style evaluation. When a research finding is questioned, have two agents independently assess it -- one arguing for inclusion, one arguing against. Blind evaluation prevents anchoring.
- **Confidence**: MEDIUM

### Description Optimization for Triggering

- **What**: Analyzer examines skill descriptions against sample prompts, suggests edits to reduce false positives and false negatives.
- **How it applies to v2**: MuninnDB concept naming is analogous to skill descriptions -- it determines recall relevance. Periodically optimizing concept names and content to improve recall precision is a maintenance task v2 should support.
- **Confidence**: MEDIUM

### Multi-Agent Eval Isolation

- **What**: Independent agents run evals in parallel, each in clean context with isolated token/timing metrics. Eliminates context bleed between test runs.
- **How it applies to v2**: Parallel research agents must have fully isolated contexts. No shared conversation history, no context bleed. Each agent produces independent findings that are aggregated externally.
- **Confidence**: HIGH

## Specific Techniques to Adopt

- **Benchmark mode with standardized metrics**: Track eval pass rate, elapsed time, and token usage for research quality and review convergence. This enables objective comparison across workflow iterations
- **Regression detection on model updates**: When the underlying model changes, re-run research quality evals to detect degradation early
- **No-code eval definition**: Research quality criteria should be expressible in natural language, not code. "Does this research cite actual sources?" "Does it cover all requested aspects?"
- **Local-first eval storage**: Evals and results stay local -- integrable with dashboards or CI. MuninnDB already provides this for memory; extend to research quality metrics
- **Skill graduation signal**: When base model capabilities make a skill unnecessary, detect and signal it. Analogously, when a MuninnDB pattern is so well-established that the model follows it without recall, consider archiving

## Specific Techniques to Avoid

- **Over-automation of skill creation**: Skills (and by extension, MuninnDB engrams) should be authored with human oversight. Fully automated memory graduation risks storing low-quality patterns
- **Assuming skills are permanent**: Skills degrade as models evolve. MuninnDB engrams should have staleness detection -- patterns not recalled or applied in N sessions may need review
- **Single-metric evaluation**: Don't reduce research quality to a single score. Track multiple dimensions: source grounding, completeness, actionability, accuracy

## Quotes / Key Excerpts

> "Most authors are subject matter experts, not engineers. They know their workflows but don't have the tools to tell whether a skill still works with a new model."

> "Testing turns a skill that seems to work into one you know works."

> "If the base model starts passing your evals without the skill loaded, that's a signal the skill's techniques may have been incorporated."

> "Your evals and results stay with you. Store them locally, integrate them with a dashboard, or plug them into a CI system."

> "Eventually, that description may be the skill itself."
