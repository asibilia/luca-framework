# Content System

This section defines the voice, structure, and writing patterns that make the site feel cohesive. The intent is to blend engineering credibility (clear, concrete, tool-like copy) with cinematic chapter energy (short declarative headings, dossier-like framing) without drifting into gimmick.

---

## 1. Content Principles

1. **Clarity first, style second.** Every section should answer: What is this? Why should I care? What should I do next?

2. **Short headings, concrete subheads.** Headings are declarative and punchy. Subheads provide the meaning.

3. **Show proof, not adjectives.** Replace "beautiful / scalable / cutting-edge" with what you shipped, measured, or learned.

4. **System language is a seasoning.** "CASE FILE," "RUN LOG," "STATUS" adds identity, but should not dominate.

5. **One primary action per section.** Every section should have a single "best next click."

---

## 2. Voice and Tone

### Voice Attributes

- **Precise** - Say exactly what you mean
- **Confident** - State facts, don't hedge
- **Minimal** - Cut unnecessary words
- **Outcome-oriented** - Focus on results

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Default | Professional, direct | "I build products with a bias toward clean UI and performance." |
| Experiments | Curious, honest, crisp | "This broke three times before it worked. Here's what I learned." |
| Failures | Factual, reflective | "The approach didn't scale. We pivoted to X." |
| Errors | Factual, helpful | "Message not sent. Check your connection and try again." |
| Loading | Informative, brief | "Loading projects..." |
| Empty states | Helpful, neutral | "No notes yet. Next entry ships soon." |

**Avoid:**
- Apologetic language ("Oops!", "Sorry!")
- Excessive enthusiasm ("Amazing!", "Incredible!")
- Vague buzzwords without justification

### Diction Guidelines

**Prefer verbs:** Built, shipped, reduced, measured, redesigned, automated, implemented, launched.

**Prefer specific nouns:** Build pipeline, RLS policy, scene graph, latency, LCP, cache layer, API endpoint.

**Avoid buzzwords** unless immediately justified:
- Not: "Cutting-edge AI solution"
- Yes: "GPT-4 integration that reduced response time by 40%"

---

## 3. Typographic Voice Mapping

Use the typography system to reinforce meaning:

| Font | Voice | Use For |
|------|-------|---------|
| Sora | Editorial statements | Headlines, section titles, narrative emphasis |
| Inter | Explanation and persuasion | Body copy, descriptions, CTAs |
| IBM Plex Mono | System truth | Metadata, logs, status, IDs, timestamps |
| Silkscreen | Identity stamp | Brand moments only (hero, rare emphasis) |

**Rule:** Never use Silkscreen for paragraphs. It's a stamp, not a voice.

---

## 4. Structural Templates

These templates provide consistent patterns for common content blocks.

### A. Hero Template

*Layout: Use "Editorial + Artifact" pattern*

**Kicker** (IBM Plex Mono)
```
// ROLE • FOCUS • LOCATION • STATUS
```

**Headline** (Sora or Silkscreen)
A short declarative claim (2-6 words):
- "I BUILD PRODUCTS THAT SHIP."
- "TOOLS, WORLDS, SYSTEMS."
- "ENGINEERING WITH TASTE."

**Subhead** (Inter)
One sentence that clarifies the claim (80-120 characters):
- "I design and build web and interactive products, focusing on performance, systems, and clean UI."

**Primary CTA**
- "VIEW WORK" / "OPEN CASE FILES" / "CONTACT"

**Secondary CTA**
- "READ NOTES" / "GITHUB" / "DOWNLOAD RESUME"

### B. Chapter Header Template

*Layout: Use section header pattern*

**Eyebrow** (IBM Plex Mono)
```
CHAPTER 01  or  / WORK
```

**Title** (Sora)
2-5 words, declarative:
- "SHIPPED WORK"
- "SYSTEMS I TRUST"
- "CURRENT BUILD"

**Descriptor** (Inter)
One sentence (60-100 characters):
- "Selected projects with outcomes, constraints, and implementation notes."

### C. Project Summary Template

*Layout: Use "Featured Grid" pattern*

**Title** (Sora)
Project name

**One-line summary** (Inter)
What it is + who it's for (60-100 characters):
- "A build-and-observability platform for X."

**Proof bullets** (Inter, 2-3 max)
Each bullet 50-80 characters:
- "Reduced build time from X to Y."
- "Implemented RLS policies for multi-tenant data isolation."
- "Shipped v1 in N weeks."

**Stack line** (IBM Plex Mono)
```
STACK: Next.js • Postgres • Convex • Tailwind
```

**Links** (Inter)
- "VIEW" / "WRITEUP" / "GITHUB"

### D. Case Study Template

*Layout: Use "Editorial + Artifact" and "Timeline" patterns*

| Section | Content |
|---------|---------|
| **Context** | What problem existed and why it mattered |
| **Role & Timeline** | Your role, team size, duration |
| **Constraints** | Time, performance, platform, team, budget |
| **Approach** | The decisions you made and why |
| **Outcome** | Measurable results, learnings, what you'd do next |
| **Artifacts** | Console log, diagrams, screenshots, code excerpts |
| **Links** | Live demo, GitHub, related posts |

**Keep each section tight—no long essays.**

### E. About Template

Use "proof-first" structure:

1. **What you do now** (1 sentence)
2. **What you've shipped** (2-3 proof points)
3. **What you care about** (values, 1-2 sentences)
4. **What you're looking for** (if applicable)
5. **Human detail** (one line—not a biography)

**Human detail examples:**
- "Based in NYC. I run best after mass amounts of coffee."
- "Currently obsessed with mechanical keyboards and build systems."

**Avoid:** Life story, excessive personal details, cliche interests.

### F. Contact Template

**Headline** (Sora)
- "LET'S BUILD SOMETHING"
- "GET IN TOUCH"

**Subhead** (Inter, 60-100 characters)
- "If you want to collaborate on product or systems work, reach out."

**Availability status** (IBM Plex Mono)
```
STATUS: AVAILABLE FOR PROJECTS
```

**Form fields:**
- Name (required)
- Email (required)
- Message (required)

**Helper text** (Inter)
- "I read every message. Expect a reply within a day or two."

**Primary CTA:** "SEND MESSAGE"

**Alternative contacts:**
- "Or email directly: [email]"
- "Find me on [LinkedIn] / [GitHub]"

---

## 5. System Language Guidelines

This is the signature layer. Use it consistently, but **sparingly**.

### Approved System Labels

| Label | Use Case |
|-------|----------|
| `CASE FILE` | Project detail pages |
| `RUN LOG` | Technical output displays |
| `BUILD OUTPUT` | Console blocks |
| `STATUS: SHIPPING` | Active/complete projects |
| `STATUS: EXPERIMENTAL` | In-progress experiments |
| `STATUS: MAINTENANCE` | Stable, not actively developed |
| `MODE: PRODUCTION` | Live systems |
| `MODE: PROTOTYPE` | Early-stage work |
| `ID: ...` / `VERSION: ...` | Technical identifiers |

### Usage Rules

1. Use system labels **only** for:
   - Section eyebrows
   - Metadata rails
   - Console components
   - Featured module headers

2. **Do not** write whole paragraphs in system voice

3. Keep labels in IBM Plex Mono, uppercase, short

4. **Maximum usage:**
   - 1 system label per section header
   - 3 STATUS/MODE indicators per viewport maximum
   - Never 2+ consecutive system-styled elements

### Semantic Implementation

```tsx
// Decorative label (hidden from screen readers)
<span className="font-mono text-xs uppercase" aria-hidden="true">
    CASE FILE
</span>
<h2>Project Name</h2>

// Informational label (visible to screen readers)
<dl className="font-mono text-xs">
    <dt className="sr-only">Status</dt>
    <dd>STATUS: SHIPPING</dd>
</dl>
```

### Example Transformation

**Instead of:**
> "I'm passionate about building innovative experiences..."

**Use:**
```
STATUS: SHIPPING
"I build products with a bias toward clean UI, performance, and systems that don't break at scale."
```

---

## 6. Content Types and Standards

### A. Project Content (Portfolio)

**Minimum fields per project:**
- What it is (1 line)
- Your role
- Stack
- 2-3 outcomes
- One artifact (image, demo, console block, diagram)

**Quality bar:**
- If a project has no outcomes, frame it as an experiment with learnings
- Every project needs at least one measurable or observable result

### B. Notes / Writing

**Note types:**

| Type | Structure |
|------|-----------|
| Technical note | Problem → Approach → Code → Outcome |
| Learning log | Context → What I tried → What worked → Takeaways |
| Link roundup | Theme → 3-5 links with 1-sentence commentary each |

**Standard format:**
- Short title (50-80 characters)
- Date in ISO format or relative ("2 weeks ago")
- 1-2 paragraph summary
- Bullets for takeaways
- Optional "Links / references" at bottom

**Avoid:** Long, unfocused posts unless the goal is thought leadership.

### C. About

See About Template above.

### D. Contact

See Contact Template above.

---

## 7. Microcopy Standards

### Buttons

Use verb + object:
- "VIEW WORK"
- "OPEN CASE FILE"
- "COPY LOG"
- "SEND MESSAGE"

### Empty States

Be helpful, not cute:
- "No notes yet. Next entry ships soon."
- "No projects match this filter."

### Loading States

Be informative, brief:
- "Loading projects..."
- "Fetching data..."

For skeletons, no text needed—the visual pattern communicates loading.

### Error States

Be factual, helpful, not apologetic:

| Type | Pattern |
|------|---------|
| Inline | "Email must include @" |
| Form-level | "Please fix the errors above." |
| Page-level | "Something went wrong. Try refreshing." |
| Network | "Can't connect. Check your network." |
| 404 | "Page not found. It may have moved or been removed." |

### Success States

Be brief, confirming:
- "Message sent."
- "Copied to clipboard."
- "Saved."

### Tooltips

Keep tooltips factual:
- "Copies the command to clipboard."
- "Opens in new tab."

### Form Helper Text

Make it reassuring and clear:
- "I read every message. Expect a reply within a day or two."
- "We'll never share your email."

---

## 8. Accessibility Standards

### Alt Text

**Describe function, not just appearance:**
- Not: "Screenshot of dashboard"
- Yes: "Dashboard showing build status and deployment history"

**For decorative images:** Use `alt=""` or `aria-hidden="true"`

### Link Text

**Must be meaningful in isolation:**
- Not: "Click here" or "Read more"
- Yes: "View Acme Dashboard project" or "Read the full case study"

**For short CTAs, add context:**
```tsx
<a href="/projects/acme">
    VIEW
    <span className="sr-only"> Acme Dashboard project</span>
</a>
```

Or use aria-label:
```tsx
<a href="/projects/acme" aria-label="View Acme Dashboard project">
    VIEW
</a>
```

### Headings

**Maintain logical hierarchy:**
- One `<h1>` per page (page title)
- `<h2>` for major sections
- `<h3>` for subsections
- Never skip levels (h1 → h3)

### System Labels

**If decorative:** Use `aria-hidden="true"`
**If informational:** Use proper semantic markup (`<dl>`, `<dt>`, `<dd>`)

### Screen Reader Announcements

**For dynamic content:**
```tsx
<div role="status" aria-live="polite">
    Message sent successfully.
</div>
```

---

## 9. Content Density Rules

To keep the site crisp, enforce these limits:

| Element | Limit |
|---------|-------|
| Hero subhead | 80-120 characters |
| Section descriptor | 60-100 characters |
| Project bullets | 50-80 characters each |
| Paragraph blocks | 150-250 words max before visual break |
| Lists | 2-5 items preferred |
| Featured narratives | One per section |

**Line length:** Body text should be constrained to 65-75 characters per line (`max-w-prose`).

---

## 10. Canonical Copy Blocks

Use these as fill-in templates.

### Capability Block

```
I build [type of product] with a focus on [two priorities].

Typical work: [3 bullet items]

Recent outcomes: [1-2 measurable results]
```

### Current Build Block

```
STATUS: ACTIVE

I'm currently building [project] to solve [problem].
The next milestone is [milestone].
```

### Contact Block

```
If you want to collaborate on [type of work], reach out.

Primary CTA: SEND MESSAGE
Secondary: EMAIL / LINKEDIN
```

---

## 11. Quality Checklist

Apply before publishing any content:

### Clarity
- [ ] Does every section say what it is in the first 2 lines?
- [ ] Are claims backed by specifics (outcomes, constraints, artifacts)?
- [ ] Are headings short and consistent in style?

### Voice
- [ ] Is "system language" used as accents, not the whole voice?
- [ ] Does the copy still read professionally without the stylistic labels?
- [ ] Is tone appropriate for context (no "Oops!" in errors)?

### Structure
- [ ] Is there one clear CTA per section?
- [ ] Are density limits respected (character counts)?
- [ ] Is content scannable with clear hierarchy?

### Accessibility
- [ ] Do all images have descriptive alt text?
- [ ] Are link texts meaningful in isolation?
- [ ] Does heading structure follow logical hierarchy (h1 → h2 → h3)?
- [ ] Are decorative system labels hidden from assistive tech?
- [ ] Do CTAs have sufficient context (aria-label or sr-only text)?
