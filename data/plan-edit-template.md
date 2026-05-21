# Edit a pre-built plan

Copy one block below into chat when you want to populate or change a plan.
Use **stop names** (or `s1` IDs if you know them) in **visit order** — first = first stop after leaving the station.

---

```markdown
Update pre-built plan.

Plan: quick-sip-shop
(Or title: Quick Sip & Shop)

Title: Quick Sip & Shop
Duration: 45 mins
Description: [1–2 sentences in your voice — what this experience feels like]

Stops in order (visit order):
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
| `quick-sip-shop` | Quick Sip & Shop |
| `coffee-cookie-explore` | Coffee, Cookie, and Explore |
| `coffee-shop-lunch` | Coffee, Shop, Lunch |
| `all-day-experience` | Coffee, Shop, Lunch, Activity, Dinner |

---

## What you provide vs what the agent fills

| You provide | Agent fills |
|-------------|-------------|
| Plan key or title | Finds the right entry in `data/plans.json` |
| Title, duration, description (if changing) | Updates JSON strings |
| Stop names **in order** | Maps names → `s1`, `s2`, … from `data/stops.json`; fixes order along the Drive if needed |
| Optional vibe (“less walking”, “more shopping”) | Picks sensible stops from existing list |

You do **not** need: Maps links, lat/lng, tags, or photos for plans — only for **new** locations in `stops.json`.

---

## See all stop names

Path 3 in the app, or ask: “List all stops with ids from stops.json”.
