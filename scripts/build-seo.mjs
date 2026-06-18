import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "seo.config.json");
const stopsPath = path.join(root, "data", "stops.json");
const neighborhoodsPath = path.join(root, "data", "neighborhoods.json");
const indexPath = path.join(root, "index.html");

const MARKER_START = "<!-- build:seo-head -->";
const MARKER_END = "<!-- /build:seo-head -->";
const FOOTER_MARKER_START = "<!-- build:seo-footer -->";
const FOOTER_MARKER_END = "<!-- /build:seo-footer -->";

const PLAN_FOOTER_LABELS = {
  "quick-sip-shop": "Quick Sip &amp; Shop (near SkyTrain)",
  "quick-sip-shop-2": "Quick Sip &amp; Shop 2 (north end)",
  "half-a-day-mid-morning": "Half a day on the Drive — morning",
  "half-a-day-evening": "Half a day on the Drive — evening",
  "world-cup-day": "World Cup day on the Drive",
  "mp-full-day-main": "Full day on Main Street",
  "mp-kids-afternoon-main": "Kids afternoon on Main",
  "mp-afternoon-main": "Quick afternoon on Main",
  "mp-evening-main": "Evening on Main Street",
  "chinatown-pre-post-match": "Chinatown pre &amp; post-match",
  "early-start-in-chinatown": "Early start in Chinatown",
};

const AREA_SHORT_LABELS = {
  commercial: "Commercial Drive",
  "hastings-sunrise": "Hastings-Sunrise",
  "mount-pleasant": "Mount Pleasant",
  chinatown: "Chinatown",
};

function stopNeighborhoodId(stop) {
  return (stop?.neighborhood || "commercial").toLowerCase();
}

function neighborhoodRecord(neighborhoodsData, id) {
  return neighborhoodsData?.neighborhoods?.[id] || neighborhoodsData?.neighborhoods?.commercial;
}

function areaShortLabel(neighborhoodsData, neighborhoodId) {
  return (
    AREA_SHORT_LABELS[neighborhoodId] ||
    neighborhoodRecord(neighborhoodsData, neighborhoodId)?.title ||
    "Commercial Drive"
  );
}

function stationWalkLabel(neighborhoodsData, stopsData, neighborhoodId) {
  if (neighborhoodRecord(neighborhoodsData, neighborhoodId)?.usesSkytrainStation === false) {
    return null;
  }
  if (neighborhoodId === "commercial" && stopsData?.station?.name) {
    return String(stopsData.station.name).replace(/ Station$/i, "");
  }
  const station = neighborhoodRecord(neighborhoodsData, neighborhoodId)?.station;
  if (station?.name) return String(station.name).replace(/ Station$/i, "");
  return null;
}

function planNeighborhoodId(plan, routeStops, neighborhoodsData) {
  if (plan?.neighborhood) return String(plan.neighborhood).toLowerCase();
  const first = routeStops[0];
  return first ? stopNeighborhoodId(first) : "commercial";
}

/** Every stop in stops.json gets a static page; config lists are optional overrides for footer curation only. */
function resolveSpotSlugs(stops) {
  return stops.map((s) => s.slug).filter(Boolean);
}

function resolvePlanKeys(plans, config) {
  if (plans?.planOrder?.length) return plans.planOrder;
  if (config.seoPlanSlugs?.length) return config.seoPlanSlugs;
  return Object.keys(plans?.plans || {});
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function googleMapsLatLng(stop) {
  return `${stop.lat},${stop.lng}`;
}

function googleMapsPointQuery(stop) {
  return stop?.googlePlaceId && stop?.name ? stop.name : googleMapsLatLng(stop);
}

function buildGoogleMapsSearchUrl(stop) {
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("query", googleMapsPointQuery(stop));
  if (stop?.googlePlaceId) {
    params.set("query_place_id", stop.googlePlaceId);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function truncateMeta(text, max = 155) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function absoluteUrl(siteUrl, pathname) {
  const base = siteUrl.replace(/\/$/, "");
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

function categorySchemaType(categories) {
  const cats = categories || [];
  if (cats.includes("coffee")) return "CafeOrCoffeeShop";
  if (cats.includes("food")) return "Restaurant";
  if (cats.includes("drinks")) return "BarOrPub";
  return "LocalBusiness";
}

function heroImage(stop) {
  if (stop.images?.length) return stop.images[0];
  if (stop.image) return stop.image;
  return null;
}

function galleryImages(stop, max = 2) {
  if (stop.images?.length) return stop.images.slice(0, max);
  if (stop.image) return [stop.image];
  return [];
}

function firstStopWithImage(stops) {
  return stops.find((s) => heroImage(s)) || null;
}

function spotDeepLink(siteUrl, stop) {
  return absoluteUrl(siteUrl, `/?route=${encodeURIComponent(stop.id)}&rs=station&re=station`);
}

function planDeepLink(siteUrl, planKey, plan) {
  const ids = (plan.stops || []).join(",");
  return absoluteUrl(
    siteUrl,
    `/?plan=${encodeURIComponent(planKey)}&route=${encodeURIComponent(ids)}&rs=station&re=station`
  );
}

function planHasNarrative(plan) {
  return Array.isArray(plan?.narrative) && plan.narrative.length > 0;
}

function buildStaticNarrativeCardHtml(stop, idx, spotUrl) {
  const img = heroImage(stop);
  const imgSrc = img ? `../../${img}` : "";
  const focusCss = heroFocusObjectPosition(stop);
  const label =
    typeof idx === "number" && idx >= 0
      ? `${idx + 1}. ${escapeHtml(stop.name)}`
      : escapeHtml(stop.name);
  const imgTag = imgSrc
    ? `<img src="${imgSrc}" alt="${escapeHtml(stop.name)}" width="84" height="84" loading="lazy" decoding="async" style="${focusCss}">`
    : `<div style="width:5.25rem;min-width:5.25rem;height:5.25rem;background:#${stop.placeholderColor || "cccccc"};border-right:1px solid #000;"></div>`;
  const card = `<div class="route-card route-card--narrative">${imgTag}<div class="content"><h3>${label}</h3></div></div>`;
  if (spotUrl) {
    return `<a class="static-route-card-link" href="${escapeHtml(spotUrl)}">${card}</a>`;
  }
  return card;
}

function buildPlanNarrativeHtml(plan, stops, config, spotSlugSet) {
  const { siteUrl } = config;
  const routeIndexById = new Map((plan.stops || []).map((id, i) => [id, i]));

  if (!planHasNarrative(plan)) {
    const intro = String(plan.introduction || plan.description || "").trim();
    const introBlock = intro
      ? `<div class="plan-intro-fallback">${escapeHtml(intro)}</div>`
      : "";
    const list = (plan.stops || [])
      .map((id) => stops.find((s) => s.id === id))
      .filter(Boolean)
      .map((stop) => {
        const spotUrl = spotSlugSet.has(stop.slug)
          ? absoluteUrl(siteUrl, `/spots/${stop.slug}/`)
          : null;
        const label = spotUrl
          ? `<a href="${escapeHtml(spotUrl)}">${escapeHtml(stop.name)}</a>`
          : escapeHtml(stop.name);
        const cross = stop.crossStreet
          ? ` <span class="static-stop-meta">(${escapeHtml(stop.crossStreet)})</span>`
          : "";
        return `<li>${label}${cross}</li>`;
      })
      .join("\n");
    return `${introBlock}${list ? `<ol class="static-stops-fallback">${list}</ol>` : ""}`;
  }

  const parts = ['<div class="plan-narrative">'];
  for (const segment of plan.narrative) {
    if (!segment || typeof segment !== "object") continue;
    if (segment.type === "prose" && segment.text) {
      parts.push(
        `<p class="plan-narrative__prose">${escapeHtml(String(segment.text).trim())}</p>`
      );
      continue;
    }
    if (segment.type === "stops" && Array.isArray(segment.ids)) {
      const segStops = segment.ids
        .map((id) => stops.find((s) => s.id === id))
        .filter(Boolean);
      if (!segStops.length) continue;
      const isOrGroup = segment.layout === "or" && segStops.length > 1;
      const cards = segStops.map((stop) => {
        const spotUrl = spotSlugSet.has(stop.slug)
          ? absoluteUrl(siteUrl, `/spots/${stop.slug}/`)
          : null;
        const idx = routeIndexById.get(stop.id);
        return buildStaticNarrativeCardHtml(stop, idx, spotUrl);
      });
      const groupClass = isOrGroup
        ? "plan-narrative__stops plan-narrative__stops--or"
        : "plan-narrative__stops";
      const hint = isOrGroup
        ? '<p class="plan-narrative__or-hint">Either works — pick one in the guide</p>'
        : "";
      const body = cards.reduce((html, card, i) => {
        if (i > 0 && isOrGroup) {
          html += '<span class="plan-narrative__or" aria-hidden="true">or</span>';
        }
        return html + card;
      }, "");
      parts.push(`<div class="${groupClass}">${hint}${body}</div>`);
    }
  }
  parts.push("</div>");
  return parts.join("\n");
}

function buildStaticPhotoGalleryHtml(stop, galleryId) {
  const images = galleryImages(stop, 99);
  const focusCss = heroFocusObjectPosition(stop);
  if (images.length <= 1) {
    const src = images[0];
    if (!src) {
      return `<div class="static-placeholder" style="background:#${stop.placeholderColor || "cccccc"};" aria-hidden="true"></div>`;
    }
    return `<img src="../../${src}" alt="${escapeHtml(stop.name)}" width="800" height="533" decoding="async" style="${focusCss}">`;
  }
  const slides = images
    .map(
      (src, i) => `<div class="photo-gallery__slide">
          <img src="../../${src}" alt="${escapeHtml(stop.name)} — photo ${i + 1}" width="800" height="533" loading="${i === 0 ? "eager" : "lazy"}" decoding="async" style="${focusCss}">
        </div>`
    )
    .join("");
  const dots = images
    .map(
      (_, i) =>
        `<button type="button" class="photo-gallery__dot${i === 0 ? " is-active" : ""}" aria-label="Photo ${i + 1}" data-index="${i}"></button>`
    )
    .join("");
  return `<div class="photo-gallery" data-gallery-id="${escapeHtml(galleryId)}">
      <div class="photo-gallery__track">${slides}</div>
      <button type="button" class="photo-gallery__arrow photo-gallery__arrow--prev" aria-label="Previous photo">&#8249;</button>
      <button type="button" class="photo-gallery__arrow photo-gallery__arrow--next" aria-label="Next photo">&#8250;</button>
      <div class="photo-gallery__dots">${dots}</div>
    </div>`;
}

function buildStaticSpotTagsHtml(stop, neighborhoodsData, stopsData) {
  const tags = (stop.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`);
  const cost = formatCost(stop.cost);
  if (cost && cost !== "Free") tags.push(`<span class="tag">${escapeHtml(cost)}</span>`);
  (stop.categories || []).forEach((c) => {
    if (!(stop.tags || []).includes(c)) {
      tags.push(`<span class="tag">${escapeHtml(c)}</span>`);
    }
  });
  const nbh = stopNeighborhoodId(stop);
  const station = stationWalkLabel(neighborhoodsData, stopsData, nbh);
  if (station && stop.walkFromStation != null && stop.walkFromStation !== "") {
    tags.push(
      `<span class="tag">${escapeHtml(String(stop.walkFromStation))} min from ${escapeHtml(station)}</span>`
    );
  }
  return tags.join("");
}

function buildStaticSpotWalkLine(stop, neighborhoodsData, stopsData) {
  const cost = formatCost(stop.cost);
  const costPart = cost && cost !== "Free" ? `${escapeHtml(cost)} · ` : "";
  const nbh = stopNeighborhoodId(stop);
  const station = stationWalkLabel(neighborhoodsData, stopsData, nbh);
  if (station && stop.walkFromStation != null && stop.walkFromStation !== "") {
    return `<div class="p3-card__expand-meta walk-line">${costPart}~${escapeHtml(String(stop.walkFromStation))} min walk from ${escapeHtml(station)} SkyTrain</div>`;
  }
  if (costPart) {
    return `<div class="p3-card__expand-meta walk-line">${costPart.trim().replace(/ · $/, "")}</div>`;
  }
  return "";
}

function stopBySlug(stops, slug) {
  return stops.find((s) => s.slug === slug);
}

function resolveSeoFooter(config, neighborhoodId) {
  const base = config.seoFooter || {};
  const nbh = (neighborhoodId || "commercial").toLowerCase();
  const override = nbh === "landing" ? base.landing : base.neighborhoods?.[nbh];
  const merged = override
    ? {
        toggleLabel: override.toggleLabel ?? base.toggleLabel,
        ariaLabel: override.ariaLabel ?? base.ariaLabel,
        lead: override.lead ?? base.lead,
        routeSlugs: override.routeSlugs ?? base.routeSlugs,
        columns: override.columns ?? base.columns,
      }
    : { ...base };
  if (!merged.ariaLabel) {
    merged.ariaLabel = `${AREA_SHORT_LABELS[nbh] || "Commercial Drive"} guide`;
  }
  if (!merged.toggleLabel) merged.toggleLabel = "More info";
  if (!merged.lead) {
    merged.lead =
      "East Vancouver restaurants, bars & coffee on Commercial Drive — curated by a local photographer";
  }
  if (!Array.isArray(merged.routeSlugs)) merged.routeSlugs = config.seoPlanSlugs || [];
  return merged;
}

function footerNeighborhoodIds(config) {
  const ids = new Set(["landing", "commercial"]);
  Object.keys(config.seoFooter?.neighborhoods || {}).forEach((id) => ids.add(id));
  return [...ids];
}

function buildPlanListItems(routeSlugs, hrefForPlan) {
  return (routeSlugs || [])
    .map((key) => {
      const label = PLAN_FOOTER_LABELS[key] || escapeHtml(key);
      return `          <li><a href="${escapeHtml(hrefForPlan(key))}">${label}</a></li>`;
    })
    .join("\n");
}

function buildFooterGridHtml(footer, config, stops, hrefForPlan, hrefForSpot) {
  const routeSlugs = footer.routeSlugs || config.seoPlanSlugs || [];
  const planItems = buildPlanListItems(routeSlugs, hrefForPlan);

  const columns = (footer?.columns || [])
    .map((col) => {
      const spotItems = (col.spotSlugs || [])
        .map((slug) => {
          const stop = stopBySlug(stops, slug);
          if (!stop) {
            console.warn("footer: unknown slug:", slug);
            return "";
          }
          return `          <li><a href="${escapeHtml(hrefForSpot(slug))}">${escapeHtml(stop.name)}</a></li>`;
        })
        .filter(Boolean)
        .join("\n");
      const routeItems = buildPlanListItems(col.routeSlugs || [], hrefForPlan);
      const linkItems = (col.links || [])
        .map((link) => {
          if (!link?.href || !link?.label) return "";
          return `          <li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`;
        })
        .filter(Boolean)
        .join("\n");
      const items = [routeItems, spotItems, linkItems].filter(Boolean).join("\n");
      if (!items) return "";
      return `      <nav aria-label="${escapeHtml(col.ariaLabel || col.heading)}">
        <h2>${escapeHtml(col.heading)}</h2>
        <ul>
${items}
        </ul>
      </nav>`;
    })
    .filter(Boolean)
    .join("\n");

  const routes = planItems
    ? `      <nav aria-label="Curated walking routes">
        <h2>Curated routes</h2>
        <ul>
${planItems}
        </ul>
      </nav>`
    : "";

  return [routes, columns].filter(Boolean).join("\n");
}

function buildFooterNeighborhoodPayload(config, stops, neighborhoodId, hrefForPlan, hrefForSpot) {
  const footer = resolveSeoFooter(config, neighborhoodId);
  const gridHtml = buildFooterGridHtml(footer, config, stops, hrefForPlan, hrefForSpot);
  return {
    ariaLabel: footer.ariaLabel,
    toggleLabel: footer.toggleLabel,
    lead: footer.lead,
    gridHtml,
  };
}

function buildHomeSeoFooter(config, stops) {
  const footer = resolveSeoFooter(config, "landing");
  const publisherUrl = config.publisherUrl || "https://www.seasonsofeastvan.com";
  const grid = buildFooterGridHtml(
    footer,
    config,
    stops,
    (key) => `/plans/${key}/`,
    (slug) => `/spots/${slug}/`
  );
  const footerByNeighborhood = Object.fromEntries(
    footerNeighborhoodIds(config).map((id) => [
      id,
      buildFooterNeighborhoodPayload(
        config,
        stops,
        id,
        (key) => `/plans/${key}/`,
        (slug) => `/spots/${slug}/`
      ),
    ])
  );
  const footerDataJson = JSON.stringify(footerByNeighborhood).replace(/</g, "\\u003c");

  return `${FOOTER_MARKER_START}
  <script type="application/json" id="seo-footer-by-neighborhood">${footerDataJson}</script>
  <footer id="site-seo-footer" class="site-seo-footer" aria-label="${escapeHtml(footer.ariaLabel)}">
    <details class="site-seo-footer__details">
      <summary class="site-seo-footer__toggle">${escapeHtml(footer.toggleLabel)}</summary>
      <div class="site-seo-footer__panel">
        <p class="site-seo-footer__lead">${escapeHtml(footer.lead)}</p>
        <div class="site-seo-footer__grid">
${grid}
        </div>
      </div>
    </details>
    <p class="site-seo-footer__credit">Part of <a href="${escapeHtml(publisherUrl)}" rel="noopener noreferrer">Seasons of East Van</a> · <a href="/sitemap.xml">Sitemap</a></p>
  </footer>
${FOOTER_MARKER_END}`;
}

function buildStaticFooter(config, guideUrl, publisherUrl, stops, neighborhoodId = "commercial") {
  const footer = resolveSeoFooter(config, neighborhoodId);
  const grid = buildFooterGridHtml(
    footer,
    config,
    stops,
    (key) => absoluteUrl(config.siteUrl, `/plans/${key}/`),
    (slug) => absoluteUrl(config.siteUrl, `/spots/${slug}/`)
  );

  return `  <footer class="static-footer" aria-label="${escapeHtml(footer.ariaLabel)}">
    <div class="static-footer__inner">
      <details class="static-footer__details">
        <summary class="static-footer__toggle">${escapeHtml(footer.toggleLabel)}</summary>
        <div class="static-footer__panel">
          <p class="static-footer__lead">${escapeHtml(footer.lead)}</p>
          <div class="static-footer__grid">
${grid}
          </div>
        </div>
      </details>
      <p class="static-footer__credit">Part of <a href="${escapeHtml(guideUrl)}">${escapeHtml(config.siteName)}</a> · <a href="${escapeHtml(publisherUrl)}" rel="noopener noreferrer">Seasons of East Van</a> · <a href="${escapeHtml(absoluteUrl(config.siteUrl, "/sitemap.xml"))}">Sitemap</a></p>
    </div>
  </footer>`;
}

function buildStaticPageShell({
  title,
  metaDesc,
  pageUrl,
  ogImageUrl,
  ogType,
  jsonLd,
  config,
  body,
  guideUrl,
  publisherUrl,
  stops,
  neighborhoodId = "commercial",
}) {
  const analytics = buildGoogleAnalyticsTag(config.gaMeasurementId);
  const ld = JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="../../assets/favicon.png" type="image/png" sizes="64x64">
  <title>${escapeHtml(title)}</title>
${analytics}
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <script src="../../js/season-theme.js"></script>
  <link rel="stylesheet" href="../../css/static-page.css">
  <script type="application/ld+json">${ld}</script>
</head>
<body class="static-page">
  <header class="static-header">
    <a class="static-back" href="${escapeHtml(guideUrl)}">← ${escapeHtml(config.siteName)}</a>
    <a class="static-brand" href="${escapeHtml(guideUrl)}" aria-label="${escapeHtml(config.siteName)} home">
      <img id="static-hero-logo" src="../../assets/hero/shy-summer.png" alt="" width="72" height="72" decoding="async">
    </a>
  </header>
  <main class="static-main">
${body}
  </main>
${buildStaticFooter(config, guideUrl, publisherUrl, stops, neighborhoodId)}
  <script>(function(){var img=document.getElementById("static-hero-logo");var logo=document.documentElement.dataset.heroLogo;if(logo&&img)img.src="../../"+logo.replace(/^\\//,"");})();</script>
  <script src="../../js/static-gallery.js"></script>
</body>
</html>`;
}

function heroFocusObjectPosition(stop) {
  const raw = stop?.heroFocus;
  if (!raw || typeof raw !== "object") return "";
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  const cx = Math.min(100, Math.max(0, x));
  const cy = Math.min(100, Math.max(0, y));
  if (cx === 50 && cy === 50) return "";
  return `object-position:${cx}% ${cy}%;`;
}

function buildGoogleAnalyticsTag(measurementId) {
  if (!measurementId) return "";
  const id = escapeHtml(measurementId);
  return `  <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id}');
  </script>`;
}

function buildHomeHead(config, stops, spotSlugSet) {
  const { siteUrl, title, description, locale, ogImage, siteName, publisherName, publisherUrl } =
    config;
  const canonical = absoluteUrl(siteUrl, "/");
  const ogImageUrl = absoluteUrl(siteUrl, ogImage);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "East Vancouver spots",
    itemListElement: stops.map((stop, i) => {
      const entry = {
        "@type": "ListItem",
        position: i + 1,
        name: stop.name,
      };
      if (spotSlugSet.has(stop.slug)) {
        entry.item = absoluteUrl(siteUrl, `/spots/${stop.slug}/`);
      }
      return entry;
    }),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: canonical,
    description,
    inLanguage: locale.replace("_", "-"),
    publisher: {
      "@type": "Organization",
      name: publisherName,
      url: publisherUrl,
    },
  };

  const jsonLd = JSON.stringify([website, itemList], null, 2)
    .replace(/</g, "\\u003c");

  const analytics = buildGoogleAnalyticsTag(config.gaMeasurementId);

  return `  ${MARKER_START}
${analytics}
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:locale" content="${escapeHtml(locale)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <script type="application/ld+json">${jsonLd}</script>
  ${MARKER_END}`;
}

function buildRobotsTxt(siteUrl) {
  return `User-agent: *
Allow: /

Sitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}
`;
}

function introParagraphsHtml(introduction) {
  const parts = String(introduction || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => `    <p>${escapeHtml(p)}</p>`).join("\n");
}

function buildPlanPage(planKey, plan, stops, config, spotSlugSet, neighborhoodsData) {
  const { siteUrl, siteName, publisherUrl } = config;
  const pageUrl = absoluteUrl(siteUrl, `/plans/${planKey}/`);
  const guideUrl = absoluteUrl(siteUrl, "/");
  const metaDesc = truncateMeta(
    plan.description || plan.introduction || plan.title
  );
  const title = `${plan.title} · ${siteName}`;
  const duration = plan.duration ? String(plan.duration) : "";
  const routeStops = (plan.stops || [])
    .map((id) => stops.find((s) => s.id === id))
    .filter(Boolean);
  const areaLabel = areaShortLabel(
    neighborhoodsData,
    planNeighborhoodId(plan, routeStops, neighborhoodsData)
  );

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: plan.title,
    description: plan.description || metaDesc,
    itemListElement: routeStops.map((stop, i) => {
      const entry = {
        "@type": "ListItem",
        position: i + 1,
        name: stop.name,
      };
      if (spotSlugSet.has(stop.slug)) {
        entry.item = absoluteUrl(siteUrl, `/spots/${stop.slug}/`);
      }
      return entry;
    }),
  };

  const heroStop = firstStopWithImage(routeStops);
  const heroImg = heroStop ? heroImage(heroStop) : null;
  const ogImageUrl = heroImg
    ? absoluteUrl(siteUrl, heroImg)
    : absoluteUrl(siteUrl, config.ogImage);
  const ctaUrl = planDeepLink(siteUrl, planKey, plan);
  const narrativeHtml = buildPlanNarrativeHtml(plan, stops, config, spotSlugSet);
  const customizeHint = planHasNarrative(plan)
    ? `<p class="plan-customize-hint">Tap a stop to read more — open the guide to customize this route.</p>`
    : "";

  const body = `    <article class="static-plan">
      <header class="plan-detail-header">
        <h1>${escapeHtml(plan.title)}</h1>
        <p class="plan-detail-meta">${duration ? `${escapeHtml(duration.toUpperCase())} · ` : ""}${routeStops.length} STOP${routeStops.length === 1 ? "" : "S"} · ${escapeHtml(areaLabel.toUpperCase())}, VANCOUVER</p>
${customizeHint}
      </header>
${narrativeHtml}
      <a class="static-cta" href="${escapeHtml(ctaUrl)}">Build this route in the guide</a>
    </article>`;

  return buildStaticPageShell({
    title,
    metaDesc,
    pageUrl,
    ogImageUrl,
    ogType: "article",
    jsonLd: itemList,
    config,
    body,
    guideUrl,
    publisherUrl,
    stops,
    neighborhoodId: planNeighborhoodId(plan, routeStops, neighborhoodsData),
  });
}

function buildSitemap(config, stops, plans, spotSlugs, planKeys) {
  const urls = [
    { loc: absoluteUrl(config.siteUrl, "/"), changefreq: "weekly", priority: "1.0" },
  ];
  for (const planKey of planKeys) {
    if (!plans?.plans?.[planKey]) {
      console.warn("plan key not in plans.json:", planKey);
      continue;
    }
    urls.push({
      loc: absoluteUrl(config.siteUrl, `/plans/${planKey}/`),
      changefreq: "monthly",
      priority: "0.9",
    });
  }
  for (const slug of spotSlugs) {
    const stop = stops.find((s) => s.slug === slug);
    if (!stop) {
      console.warn("spot slug not in stops.json:", slug);
      continue;
    }
    urls.push({
      loc: absoluteUrl(config.siteUrl, `/spots/${slug}/`),
      changefreq: "monthly",
      priority: "0.8",
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function formatCost(cost) {
  if (cost == null || cost === "") return "Free";
  if (typeof cost === "string") return cost.toLowerCase() === "free" ? "Free" : cost;
  if (cost && typeof cost === "object" && cost.min) return `${cost.min}–${cost.max || cost.min}`;
  if (Array.isArray(cost)) return cost.join("–");
  return "";
}

function buildSpotPage(stop, config, allStops, neighborhoodsData, stopsData) {
  const { siteUrl, publisherUrl } = config;
  const pageUrl = absoluteUrl(siteUrl, `/spots/${stop.slug}/`);
  const guideUrl = absoluteUrl(siteUrl, "/");
  const areaLabel = areaShortLabel(neighborhoodsData, stopNeighborhoodId(stop));
  const metaDesc = truncateMeta(
    `${stop.name} on ${areaLabel} — ${stop.description}`
  );
  const title = `${stop.name} · ${areaLabel} · ${config.siteName}`;
  const img = heroImage(stop);
  const imgUrl = img ? absoluteUrl(siteUrl, img) : absoluteUrl(siteUrl, config.ogImage);

  const localBusiness = {
    "@context": "https://schema.org",
    "@type": categorySchemaType(stop.categories),
    name: stop.name,
    description: stop.description,
    url: pageUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: stop.crossStreet,
      addressLocality: "Vancouver",
      addressRegion: "BC",
      addressCountry: "CA",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: stop.lat,
      longitude: stop.lng,
    },
  };
  if (img) localBusiness.image = absoluteUrl(siteUrl, img);

  const gotoText = stop.goto ? String(stop.goto).trim() : "";
  const gotoBlock = gotoText
    ? `        <p class="goto"><strong>My go-to:</strong> ${escapeHtml(gotoText)}</p>\n`
    : "";
  const ctaUrl = spotDeepLink(siteUrl, stop);
  const mapsUrl = buildGoogleMapsSearchUrl(stop);
  const galleryHtml = buildStaticPhotoGalleryHtml(stop, `static-${stop.slug}`);
  const tagsHtml = buildStaticSpotTagsHtml(stop, neighborhoodsData, stopsData);
  const walkLine = buildStaticSpotWalkLine(stop, neighborhoodsData, stopsData);
  const crossMeta = stop.crossStreet
    ? `        <div class="p3-card__expand-meta">${escapeHtml(stop.crossStreet)} · ${escapeHtml(areaLabel)}, Vancouver</div>\n`
    : "";

  const body = `    <div class="p3-card is-expanded static-spot-card">
      <div class="p3-card__summary">
        <div class="p3-card__body">
          <h1 class="choice-title">${escapeHtml(stop.name)}</h1>
          ${stop.crossStreet ? `<div class="meta choice-desc">${escapeHtml(stop.crossStreet)}</div>` : ""}
        </div>
      </div>
      <div class="p3-card__expand-panel">
        <div class="p3-card__gallery">${galleryHtml}</div>
        <div class="p3-card__expand-body">
          <div class="tags">${tagsHtml}</div>
          <p class="description">${escapeHtml(stop.description || "")}</p>
${gotoBlock}${crossMeta}${walkLine}
        </div>
        <div class="p3-card__actions">
          <a href="${escapeHtml(mapsUrl)}" rel="noopener noreferrer" target="_blank">See in Google Maps</a>
          <a class="p3-route-btn" href="${escapeHtml(ctaUrl)}">Add to route in guide</a>
        </div>
      </div>
    </div>`;

  return buildStaticPageShell({
    title,
    metaDesc,
    pageUrl,
    ogImageUrl: imgUrl,
    ogType: "website",
    jsonLd: localBusiness,
    config,
    body,
    guideUrl,
    publisherUrl,
    stops: allStops,
    neighborhoodId: stopNeighborhoodId(stop),
  });
}

function injectHomeTitle(indexHtml, title) {
  if (!/<title>[\s\S]*?<\/title>/.test(indexHtml)) {
    throw new Error("Could not find <title> in index.html");
  }
  return indexHtml.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function injectHomeHead(indexHtml, headBlock) {
  if (indexHtml.includes(MARKER_START)) {
    const re = new RegExp(
      `\\s*${MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "m"
    );
    return indexHtml.replace(re, `\n${headBlock}\n`);
  }
  const insertAfter = "<title>Escape the Downtown | Commercial Drive</title>";
  if (!indexHtml.includes(insertAfter)) {
    throw new Error("Could not find <title> in index.html — add build:seo-head markers or fix title.");
  }
  return indexHtml.replace(insertAfter, `${insertAfter}\n${headBlock}`);
}

function injectHomeFooter(indexHtml, footerBlock) {
  if (indexHtml.includes(FOOTER_MARKER_START)) {
    const re = new RegExp(
      `\\s*${FOOTER_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${FOOTER_MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "m"
    );
    return indexHtml.replace(re, `\n${footerBlock}\n`);
  }
  throw new Error("Could not find build:seo-footer markers in index.html");
}

// --- main ---
const plansPath = path.join(root, "data", "plans.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const stopsData = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
const { stops } = stopsData;
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const neighborhoodsData = JSON.parse(fs.readFileSync(neighborhoodsPath, "utf8"));
const spotSlugs = resolveSpotSlugs(stops);
const spotSlugSet = new Set(spotSlugs);
const planKeys = resolvePlanKeys(plans, config);

fs.writeFileSync(path.join(root, "robots.txt"), buildRobotsTxt(config.siteUrl));
fs.writeFileSync(
  path.join(root, "sitemap.xml"),
  buildSitemap(config, stops, plans, spotSlugs, planKeys)
);

const headBlock = buildHomeHead(config, stops, spotSlugSet);
const footerBlock = buildHomeSeoFooter(config, stops);
let indexHtml = fs.readFileSync(indexPath, "utf8");
indexHtml = injectHomeTitle(indexHtml, config.title);
indexHtml = injectHomeHead(indexHtml, headBlock);
indexHtml = injectHomeFooter(indexHtml, footerBlock);
fs.writeFileSync(indexPath, indexHtml);

for (const slug of spotSlugs) {
  const stop = stops.find((s) => s.slug === slug);
  if (!stop) {
    console.warn("skip spot page — unknown slug:", slug);
    continue;
  }
  const dir = path.join(root, "spots", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    buildSpotPage(stop, config, stops, neighborhoodsData, stopsData)
  );
  console.log("wrote spots/" + slug + "/index.html");
}

for (const planKey of planKeys) {
  const plan = plans.plans?.[planKey];
  if (!plan) {
    console.warn("skip plan page — unknown key:", planKey);
    continue;
  }
  const dir = path.join(root, "plans", planKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.html"),
    buildPlanPage(planKey, plan, stops, config, spotSlugSet, neighborhoodsData)
  );
  console.log("wrote plans/" + planKey + "/index.html");
}

console.log("wrote robots.txt, sitemap.xml");
console.log("updated index.html SEO head and footer");
