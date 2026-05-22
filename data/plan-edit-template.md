# Edit a pre-built plan

Copy one block below into chat when you want to populate or change a plan.
You can write a full **Introduction** in your voice; the agent extracts place names and builds the `stops` array. Add an explicit **Stops in order** line when names are ambiguous.

---

```markdown
Update pre-built plan.

Plan: quick-sip-shop
(Or title: Quick Sip & Shop)

Title: Quick Sip & Shop
Duration: 45 mins
Description: [1–2 sentences — short teaser for the picker card only]

Introduction:
[Multi-paragraph narrative — mention each stop you want on the route, in the order you have in mind]

Stops in order (optional — use when names are ambiguous):
1. JJ Bean — coffee + cookie first
2. Prado Cafe — sit and people-watch
3. Mintage — quick vintage browse

Optional notes:
- Drop any stop that doesn’t fit
- Prefer less walking / stay near station
```

---

## Plan keys (use one)

| Key | Current title |
|-----|----------------|
| `world-cup-day` | A World Cup Day on the Drive (Off Downtown) |
| `quick-sip-shop` | Quick Sip & Shop (Stay Close to Train) |
| `quick-sip-shop-2` | Quick Sip & Shop 2 (Start in the North) |
| `half-a-day-mid-morning` | Half A Day On Commercial (Food & Shopping) — Mid-Morning |
| `half-a-day-evening` | Half A Day On Commercial (Food & Shopping) — Evening |

---

## What you provide vs what the agent fills

| You provide | Agent fills |
|-------------|-------------|
| Plan key or title | Finds the right entry in `data/plans.json` |
| Title, duration, description (if changing) | Updates JSON strings |
| Introduction (prose) | `introduction` field; extracts stop names → `s1`, `s2`, … |
| Stop names **in order** (optional line) | Confirms or overrides order; fixes walk order along the Drive if needed |
| Optional vibe (“less walking”, “more shopping”) | Picks sensible stops from existing list |

You do **not** need: Maps links, lat/lng, tags, or photos for plans — only for **new** locations in `stops.json`.

---

## See all stop names

Path 3 in the app, or ask: “List all stops with ids from stops.json”.
