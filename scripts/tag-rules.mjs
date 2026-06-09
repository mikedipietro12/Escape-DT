/**
 * Canonical tag normalization and audit rules for Escape DT stops.
 * Used by cleanup-tags.mjs, admin-server save, and the stop editor UI.
 */

export const CANONICAL_CATEGORIES = [
  "coffee",
  "food",
  "drinks",
  "shopping",
  "hangout",
  "groceries",
];

/** lowercase variant → canonical tag, or null to drop */
export const TAG_ALIASES = {
  hangout: "hang out",
  clothes: "clothing",
  houseware: "housewares",
  collectables: "collectibles",
  skateboards: "skateboarding",
  latina: null,
  coloring: "colouring",
};

export const JUNK_TAGS = new Set(["existing", "commercial", "restaurant"]);

export const TAG_RULES_META = {
  aliases: TAG_ALIASES,
  junkTags: [...JUNK_TAGS],
  categoryTags: CANONICAL_CATEGORIES,
};

function dedupeTags(list) {
  const seen = new Set();
  return list.filter((t) => {
    const lower = t.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

function tagSet(list) {
  return new Set((list || []).map((t) => String(t).toLowerCase()));
}

function hasTag(set, tag) {
  return set.has(String(tag).toLowerCase());
}

export function normalizeTags(tags, categories = []) {
  let list = [...(tags || [])]
    .map((t) => String(t).trim())
    .filter(Boolean);
  const cats = new Set((categories || []).map((c) => String(c).toLowerCase()));

  list = list
    .map((t) => {
      const lower = t.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(TAG_ALIASES, lower)) {
        const canon = TAG_ALIASES[lower];
        return canon === null ? null : canon;
      }
      return t;
    })
    .filter(Boolean);

  list = list.filter((t) => !JUNK_TAGS.has(t.toLowerCase()));

  for (const cat of CANONICAL_CATEGORIES) {
    if (cats.has(cat)) {
      list = list.filter((t) => t.toLowerCase() !== cat);
    }
  }
  if (cats.has("groceries")) {
    list = list.filter((t) => !["grocery", "groceries"].includes(t.toLowerCase()));
  }

  let set = tagSet(list);

  if (hasTag(set, "art gallery")) {
    list = list.filter((t) => !["art", "gallery"].includes(t.toLowerCase()));
  }

  set = tagSet(list);
  if (
    ["pub", "dive bar", "sake bar", "natural wine", "sake"].some((t) => hasTag(set, t))
  ) {
    list = list.filter((t) => t.toLowerCase() !== "bar");
  }

  set = tagSet(list);
  if (hasTag(set, "beer")) {
    list = list.filter((t) => t.toLowerCase() !== "craft beer");
  }

  set = tagSet(list);
  if (hasTag(set, "grab and go")) {
    list = list.filter((t) => t.toLowerCase() !== "take out");
  }

  set = tagSet(list);
  if (hasTag(set, "baked goods")) {
    list = list.filter((t) => !["fresh bread", "bread"].includes(t.toLowerCase()));
  }

  set = tagSet(list);
  if (hasTag(set, "natural wine")) {
    list = list.filter((t) => t.toLowerCase() !== "wine");
  }

  set = tagSet(list);
  if (hasTag(set, "park")) {
    list = list.filter(
      (t) => !["tennis", "pickleball", "basketball"].includes(t.toLowerCase())
    );
  }

  return dedupeTags(list);
}

function tagsEqual(a, b) {
  const na = normalizeTags(a).map((t) => t.toLowerCase()).sort();
  const nb = normalizeTags(b).map((t) => t.toLowerCase()).sort();
  return na.length === nb.length && na.every((t, i) => t === nb[i]);
}

export function auditTags(tags, categories = []) {
  const list = [...(tags || [])]
    .map((t) => String(t).trim())
    .filter(Boolean);
  const cats = new Set((categories || []).map((c) => String(c).toLowerCase()));
  const normalized = normalizeTags(tags, categories);
  const warnings = [];
  const seen = new Set();

  function add(warning) {
    const key = `${warning.type}:${warning.tag}:${warning.suggest || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(warning);
  }

  for (const t of list) {
    const lower = t.toLowerCase();

    if (Object.prototype.hasOwnProperty.call(TAG_ALIASES, lower)) {
      const canon = TAG_ALIASES[lower];
      if (canon === null) {
        add({
          type: "remove",
          tag: t,
          message: `"${t}" is not a useful tag — remove it`,
        });
      } else if (canon !== lower) {
        add({
          type: "alias",
          tag: t,
          suggest: canon,
          message: `Use "${canon}" instead of "${t}"`,
        });
      }
    }

    if (JUNK_TAGS.has(lower)) {
      add({
        type: "junk",
        tag: t,
        message: `"${t}" is metadata, not a descriptive tag`,
      });
    }

    if (CANONICAL_CATEGORIES.includes(lower) && cats.has(lower)) {
      add({
        type: "category",
        tag: t,
        message: `"${t}" duplicates a category — use Categories, not tags`,
      });
    }

    if (lower === "grocery" && cats.has("groceries")) {
      add({
        type: "category",
        tag: t,
        message: `"grocery" duplicates the groceries category`,
      });
    }
  }

  const set = tagSet(list);

  if (hasTag(set, "art gallery")) {
    for (const t of ["art", "gallery"]) {
      if (hasTag(set, t)) {
        add({
          type: "redundant",
          tag: t,
          message: `"${t}" is redundant when "art gallery" is set`,
        });
      }
    }
  }

  if (
    ["pub", "dive bar", "sake bar", "natural wine", "sake"].some((t) => hasTag(set, t)) &&
    hasTag(set, "bar")
  ) {
    add({
      type: "redundant",
      tag: "bar",
      message: `"bar" is redundant with a more specific drinks tag`,
    });
  }

  if (hasTag(set, "beer") && hasTag(set, "craft beer")) {
    add({
      type: "redundant",
      tag: "craft beer",
      message: `Keep "beer" for filters — drop "craft beer"`,
    });
  }

  if (hasTag(set, "grab and go") && hasTag(set, "take out")) {
    add({
      type: "redundant",
      tag: "take out",
      message: `"take out" overlaps with "grab and go" — keep one`,
    });
  }

  if (hasTag(set, "baked goods")) {
    for (const t of ["fresh bread", "bread"]) {
      if (hasTag(set, t)) {
        add({
          type: "redundant",
          tag: t,
          message: `"${t}" is covered by "baked goods"`,
        });
      }
    }
  }

  if (hasTag(set, "natural wine") && hasTag(set, "wine")) {
    add({
      type: "redundant",
      tag: "wine",
      message: `"wine" is redundant when "natural wine" is set`,
    });
  }

  if (hasTag(set, "park")) {
    for (const t of ["tennis", "pickleball", "basketball"]) {
      if (hasTag(set, t)) {
        add({
          type: "redundant",
          tag: t,
          message: `"${t}" is optional — "park" (+ "activities") is enough for filters`,
        });
      }
    }
  }

  return {
    warnings,
    normalized,
    changed: !tagsEqual(list, normalized),
  };
}
