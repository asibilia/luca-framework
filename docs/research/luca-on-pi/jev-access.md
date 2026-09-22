# How do we get Jev access and call it from TypeScript?

> Research for the wayfinder ticket "How do we get Jev access and call it from TypeScript?" on "Map: Luca v1 on Pi". Date: 2026-09-22.

## Answer

- Three paths reach Jev: TypeSafe's own API, Vercel AI Gateway, and Cloudflare Workers AI. All three send `state` + typed `questions`, and return typed answers with a probability/confidence.
- Gateway and Cloudflare need **no new signup** — existing keys work today. TypeSafe's blog calls launch-day (2026-09-15) access waitlist-gated; its X account and secondary sources say the waitlist dropped ~09-20/21, unconfirmed on typesafe.ai/docs.typesafe.ai itself (see Unverified).
- Official TS SDK: `@typesafe-ai/sdk` (GitHub `typesafe-ai/typesafe-sdk-js`), a thin wrapper over `POST https://api.typesafe.ai/v1/systemone`.
- Pi's model layer (`pi-ai`) is built for chat-shaped providers: messages in, text/tool-calls out. Jev's shape doesn't fit. A direct `fetch`, or the SDK, is simpler than a `pi-ai` provider wrapper.
- Independent, reproducible benchmarks put accuracy at 62–98%, task-dependent, and find Jev's own confidence score reliably flags its errors. TypeSafe's own 4-workflow suite reports 67.8% average.

## Access paths

| Path | Waitlist? | Auth | Price | Limits |
|---|---|---|---|---|
| TypeSafe direct (`api.typesafe.ai/v1/systemone`) | Waitlisted at 09-15 launch (blog); X account + secondary sources say opened ~09-20/21 (unverified on typesafe.ai/docs) | Bearer key from `console.typesafe.ai/keys` | $0.042/M input tokens, output free | 255 options/choice; 2–10 levels/score; 429/529 + backoff; no published RPM/RPS |
| Vercel AI Gateway (`typesafe-ai/jev`) | No — existing Gateway key works | Gateway key, via AI SDK 7's `experimental_evaluate` | Free through 09-25 (promo); list price otherwise $0.042/M input | 32K context; same caps as direct |
| Cloudflare Workers AI (`typesafe/jev`) | No — existing Cloudflare account works | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, via `env.AI.run()` | Cloudflare dashboard (not on model page) | 32K context |

## Call shape

Official SDK (`npm install @typesafe-ai/sdk`, Node ≥ 20, reads `TYPESAFE_API_KEY`):

```typescript
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const res = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", { billing: null, technical: null, other: null }),
  },
});
res.answers.category.choice;         // selected option, probabilities, confidence
```

`score` and `noul`, raw REST shape (`docs.typesafe.ai/primitives`):

```typescript
questions: {
  urgency: { type: "score", instructions: "Rate urgency", criteria: ["low", "medium", "high"] },
  // -> score, legend, probabilities, confidence
  is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
  // -> one probability (0-1), no confidence field
}
```

Vercel AI Gateway (`experimental_evaluate`) — spells the boolean type `"boolean"`, not `"noul"` (see Unverified):

```typescript
import { experimental_evaluate as evaluate } from "ai";

const result = await evaluate({
  model: "typesafe-ai/jev",
  state: "The support agent issued a full refund to the customer.",
  questions: { refunded: { type: "boolean", instructions: "Was a refund issued?" } },
});
result.answers.refunded;
```

## Findings

- Launch blog: waitlist-gated access, $0.042/MTok input, free output, 70–500ms, "40x–200x faster" claimed; no endpoint/JSON shown. [typesafe.ai/blog]
- Endpoint `POST https://api.typesafe.ai/v1/systemone`, Bearer key from `console.typesafe.ai/keys`. Login page (checked 09-22) offers only Google/email-code sign-in, no waitlist text. [docs.typesafe.ai/quickstart, console.typesafe.ai]
- TypeSafe's X account: "available to everyone. No waitlist" (found via search; X blocked direct fetch, HTTP 402). CryptoBriefing corroborates removal ~09-20; several low-trust SEO sites repeat an identical "$5 credit / ~120M tokens" claim on 09-21 — unverified. [x.com/typesafeai, cryptobriefing.com]
- SDK `@typesafe-ai/sdk` (Node ≥ 20) reads `TYPESAFE_API_KEY`; `systemOne()` takes `state` + `questions` built with `choice()`/`score()`/`noul()`. [github.com/typesafe-ai/typesafe-sdk-js]
- Schema: `choice` needs `criteria` (options map, max 255), returns `choice`/`probabilities`/`confidence`. `score` needs ordered `criteria` (2–10 levels), returns `score`/`legend`/`probabilities`/`confidence`. `noul` needs only `instructions`, returns one probability, no confidence field. Rate limits: only "handle 429/529 with backoff" — no RPM/RPS published. [docs.typesafe.ai/primitives, /api]
- Vercel added Jev to AI Gateway 09-16, free through 09-25; existing Gateway key works via `experimental_evaluate`. Cloudflare Workers AI separately lists `typesafe/jev` (32K context) via `env.AI.run()` with existing credentials — a third no-signup path. [vercel.com/changelog, /ai-gateway/models/jev, developers.cloudflare.com/ai/models/typesafe/jev]
- Pi's provider abstraction (`pi.registerProvider`, `@earendil-works/pi-ai`) expects chat messages in, assistant content/tool-calls out. Jev's batch-questions-with-probabilities shape needs real wrapper logic to fit. [github.com/earendil-works/pi/.../custom-provider.md]
- TypeSafe's own eval suite: 4 workflows, 67.8% average accuracy, $0.0004/decision, 0.4s — range 61.7% to 76.0%. [evals.typesafe.ai]
- Simon Willison: Jev is a "black box," just a float with no reasoning trace; warns against high-stakes use without independent evals; an anecdotal test showed apparent bias. [simonwillison.net]
- Independent test 1 (130 hand-labeled Chinese samples, 4 tasks, temp=0, data published): 97.7% at ~890ms, ties GLM-5.3-flash, beats DeepSeek-flash (96.2%); all 3 misses under 0.7 confidence; deterministic across 3 runs. [github.com/typesafe-ai/skills/issues/3]
- Independent test 2 (60 tool-call-risk cases, reproducible repo): 91.7% overall (100% clear, 71.4% ambiguous, 91.7% adversarial); every wrong answer carried hedged confidence, no frontier-LLM baseline tested. [github.com/themsquared/jev-benchmark]
- Independent test 3 (LiteLLM Auto Router, 80 cases × 3, scripts published): Jev matched labels on 95.00% vs Claude Haiku 4.5's 73.75%; 5.43x faster at median, 96.1% cheaper. [docs.litellm.ai/blog/jev-auto-router-benchmark]
- LangChain blog: Python-only example (`langchain_typesafe`), no TS/JS, no limits/pricing; repeats vendor's "200x/400x" claim unverified. [langchain.com/blog]

## Unverified / open

- Full direct-API waitlist removal: no confirmation on typesafe.ai or docs.typesafe.ai; rests on an X post (not re-fetched) plus mixed-trust secondary sources.
- "$5 credit / ~120M tokens": only on low-trust SEO domains (jevmodel.org, jev-ai.live, jevaiguide.com, explainx.ai) that surfaced within days of launch with near-identical phrasing — a content-farm pattern. Confirm in-console before relying on it.
- Whether Gateway's `type: "boolean"` is a real rename of `noul`, or a fetch-summary artifact — check the `ai` package's shipped types.
- No RPM/RPS numbers published on any of the three paths; Cloudflare's per-token price defers to its dashboard.
- Vendor's 67.8% average is TypeSafe's own benchmark, not independently reproduced at that scale.

## Human checklist

Only the direct-API key needs a human (Gateway and Cloudflare reuse existing project credentials):

1. Go to `https://console.typesafe.ai`.
2. Sign in with Google, or "Email me a code." No waitlist/invite field appeared as of 2026-09-22.
3. Open API keys (`console.typesafe.ai/keys`) and create a key.
4. Store it as `TYPESAFE_API_KEY` in the project secret manager — never commit it.
5. Confirm in-console that signup is truly self-serve and note the price/credit shown — this research could not confirm those on a TypeSafe-owned page.
6. If a waitlist message appears instead, skip this path for now — use Vercel AI Gateway or Cloudflare Workers AI, which need no new signup.

## Sources

- [TypeSafe blog — Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [TypeSafe Quickstart](https://docs.typesafe.ai/introduction/quickstart.md)
- [TypeSafe Primitives reference](https://docs.typesafe.ai/primitives)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [TypeSafe console](https://console.typesafe.ai)
- [TypeSafe evals site](https://evals.typesafe.ai)
- [typesafe-sdk-js — official TS/JS SDK](https://github.com/typesafe-ai/typesafe-sdk-js)
- [typesafe-ai/skills issue #3 — Chinese-classification eval](https://github.com/typesafe-ai/skills/issues/3)
- [themsquared/jev-benchmark — tool-call risk benchmark](https://github.com/themsquared/jev-benchmark)
- [LiteLLM blog — JEV vs Haiku benchmark](https://docs.litellm.ai/blog/jev-auto-router-benchmark)
- [Simon Willison — Jev](https://simonwillison.net/2026/Sep/21/jev/)
- [LangChain blog — Building a harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev)
- [Vercel AI Gateway — Jev model page](https://vercel.com/ai-gateway/models/jev)
- [Vercel changelog — Jev on AI Gateway](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway)
- [Cloudflare Workers AI — Jev model docs](https://developers.cloudflare.com/ai/models/typesafe/jev/)
- [earendil-works/pi — custom-provider.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/custom-provider.md)
- [TypeSafe AI on X — "no waitlist" (via search, not re-fetched)](https://x.com/typesafeai/status/2101786156572823624)
- [CryptoBriefing — TypeSafe opens Jev AI to public](https://cryptobriefing.com/typesafe-jev-ai-public-access/)
