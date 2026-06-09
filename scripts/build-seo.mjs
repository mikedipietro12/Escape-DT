import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "seo.config.json");
const stopsPath = path.join(root, "data", "stops.json");
const indexPath = path.join(root, "index.html");

const MARKER_START = "<!-- build:seo-head -->";
const MARKER_END = "<!-- /build:seo-head -->";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function buildHomeHead(config, stops) {
  const { siteUrl, title, description, locale, ogImage, siteName, publisherName, publisherUrl } =
    config;
  const canonical = absoluteUrl(siteUrl, "/");
  const ogImageUrl = absoluteUrl(siteUrl, ogImage);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Commercial Drive spots",
    itemListElement: stops.map((stop, i) => {
      const entry = {
        "@type": "ListItem",
        position: i + 1,
        name: stop.name,
      };
      if (config.pilotSpotSlugs?.includes(stop.slug)) {
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

function buildPlanPage(planKey, plan, stops, config) {
  const { siteUrl, siteName, publisherUrl, pilotSpotSlugs = [] } = config;
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
      if (pilotSpotSlugs.includes(stop.slug)) {
        entry.item = absoluteUrl(siteUrl, `/spots/${stop.slug}/`);
      }
      return entry;
    }),
  };

  const jsonLd = JSON.stringify(itemList, null, 2).replace(/</g, "\\u003c");

  const stopsList = routeStops
    .map((stop, i) => {
      const spotUrl = pilotSpotSlugs.includes(stop.slug)
        ? absoluteUrl(siteUrl, `/spots/${stop.slug}/`)
        : null;
      const label = spotUrl
        ? `<a href="${escapeHtml(spotUrl)}">${escapeHtml(stop.name)}</a>`
        : escapeHtml(stop.name);
      const cross = stop.crossStreet ? ` <span class="stop-meta">(${escapeHtml(stop.crossStreet)})</span>` : "";
      return `      <li>${label}${cross}</li>`;
    })
    .join("\n");

  const introBlock = introParagraphsHtml(plan.introduction);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="../../assets/favicon.png" type="image/png" sizes="64x64">
  <title>${escapeHtml(title)}</title>
${buildGoogleAnalyticsTag(config.gaMeasurementId)}
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(absoluteUrl(siteUrl, config.ogImage))}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  <meta name="twitter:image" content="${escapeHtml(absoluteUrl(siteUrl, config.ogImage))}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Futura, "Futura PT", "Century Gothic", "Trebuchet MS", sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.5;
      padding: 2rem 1.5rem 3rem;
      max-width: 42rem;
      margin: 0 auto;
    }
    .back { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2rem; }
    .back a { color: #000; }
    h1 { font-size: 1.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .meta { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; margin-bottom: 1.25rem; }
    p { margin-bottom: 1rem; }
    ol.stops { margin: 0 0 1.5rem 1.25rem; }
    ol.stops li { margin-bottom: 0.5rem; }
    .stop-meta { font-size: 0.85em; opacity: 0.75; text-transform: none; letter-spacing: 0; }
    .cta {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.25rem;
      background: #000;
      color: #fff;
      text-decoration: none;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      border-radius: 8px;
    }
    .cta:hover { opacity: 0.85; }
    .footnote { margin-top: 2rem; font-size: 0.85rem; opacity: 0.7; }
    .footnote a { color: inherit; }
  </style>
</head>
<body>
  <p class="back"><a href="${escapeHtml(guideUrl)}">← ${escapeHtml(siteName)}</a></p>
  <article>
    <h1>${escapeHtml(plan.title)}</h1>
    <p class="meta">${duration ? `${escapeHtml(duration)} · ` : ""}${routeStops.length} stops · Commercial Drive, Vancouver</p>
${introBlock}
    <h2 style="font-size:1rem;text-transform:uppercase;letter-spacing:0.08em;margin:1.5rem 0 0.75rem;">Stops in order</h2>
    <ol class="stops">
${stopsList}
    </ol>
    <a class="cta" href="${escapeHtml(guideUrl)}">Open interactive guide</a>
  </article>
  <p class="footnote">Part of <a href="${escapeHtml(guideUrl)}">${escapeHtml(siteName)}</a> · <a href="${escapeHtml(publisherUrl)}" rel="noopener noreferrer">Seasons of East Van</a></p>
</body>
</html>
`;
}

function buildSitemap(config, stops, plans) {
  const urls = [
    { loc: absoluteUrl(config.siteUrl, "/"), changefreq: "weekly", priority: "1.0" },
  ];
  for (const planKey of config.seoPlanSlugs || []) {
    if (!plans?.plans?.[planKey]) {
      console.warn("seo plan slug not in plans.json:", planKey);
      continue;
    }
    urls.push({
      loc: absoluteUrl(config.siteUrl, `/plans/${planKey}/`),
      changefreq: "monthly",
      priority: "0.9",
    });
  }
  for (const slug of config.pilotSpotSlugs || []) {
    const stop = stops.find((s) => s.slug === slug);
    if (!stop) {
      console.warn("pilot slug not in stops.json:", slug);
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

function buildSpotPage(stop, config) {
  const { siteUrl, siteName, publisherUrl } = config;
  const pageUrl = absoluteUrl(siteUrl, `/spots/${stop.slug}/`);
  const guideUrl = absoluteUrl(siteUrl, "/");
  const metaDesc = truncateMeta(
    `${stop.name} on Commercial Drive — ${stop.description}`
  );
  const title = `${stop.name} · Commercial Drive · ${siteName}`;
  const img = heroImage(stop);
  const imgUrl = img ? absoluteUrl(siteUrl, img) : absoluteUrl(siteUrl, config.ogImage);
  const categories = (stop.categories || []).join(", ");
  const cost = formatCost(stop.cost);

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

  const jsonLd = JSON.stringify(localBusiness, null, 2).replace(/</g, "\\u003c");

  const heroFocusCss = heroFocusObjectPosition(stop);
  const imageBlock = img
    ? `      <img src="../../${img}" alt="${escapeHtml(stop.name)} on Commercial Drive" width="800" height="600" style="max-width:100%;height:auto;border-radius:8px;object-fit:cover;${heroFocusCss}">`
    : `      <div class="placeholder" style="background:#${stop.placeholderColor || "cccccc"};aspect-ratio:4/3;border-radius:8px;" aria-hidden="true"></div>`;

  const gotoText = stop.goto ? String(stop.goto).trim() : "";
  const gotoBlock = gotoText
    ? `    <p class="goto"><strong>My go-to:</strong> ${escapeHtml(gotoText)}</p>\n`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="../../assets/favicon.png" type="image/png" sizes="64x64">
  <title>${escapeHtml(title)}</title>
${buildGoogleAnalyticsTag(config.gaMeasurementId)}
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(imgUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  <meta name="twitter:image" content="${escapeHtml(imgUrl)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Futura, "Futura PT", "Century Gothic", "Trebuchet MS", sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.5;
      padding: 2rem 1.5rem 3rem;
      max-width: 42rem;
      margin: 0 auto;
    }
    .back { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2rem; }
    .back a { color: #000; }
    h1 { font-size: 1.75rem; text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .meta { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; margin-bottom: 1.25rem; }
    p { margin-bottom: 1rem; }
    .goto strong { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85em; }
    .cta {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.25rem;
      background: #000;
      color: #fff;
      text-decoration: none;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      border-radius: 8px;
    }
    .cta:hover { opacity: 0.85; }
    .footnote { margin-top: 2rem; font-size: 0.85rem; opacity: 0.7; }
    .footnote a { color: inherit; }
  </style>
</head>
<body>
  <p class="back"><a href="${escapeHtml(guideUrl)}">← ${escapeHtml(siteName)}</a></p>
  <article>
    <h1>${escapeHtml(stop.name)}</h1>
    <p class="meta">${escapeHtml(stop.crossStreet)}${cost ? ` · ${escapeHtml(cost)}` : ""}${categories ? ` · ${escapeHtml(categories)}` : ""}</p>
    <figure style="margin-bottom:1.25rem;">
${imageBlock}
    </figure>
    <p>${escapeHtml(stop.description)}</p>
${gotoBlock}    <a class="cta" href="${escapeHtml(guideUrl)}">Open interactive guide</a>
  </article>
  <p class="footnote">Part of <a href="${escapeHtml(guideUrl)}">${escapeHtml(siteName)}</a> · <a href="${escapeHtml(publisherUrl)}" rel="noopener noreferrer">Seasons of East Van</a></p>
</body>
</html>
`;
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

// --- main ---
const plansPath = path.join(root, "data", "plans.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const { stops } = JSON.parse(fs.readFileSync(stopsPath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const pilotSlugs = config.pilotSpotSlugs || [];
const seoPlanSlugs = config.seoPlanSlugs || [];

fs.writeFileSync(path.join(root, "robots.txt"), buildRobotsTxt(config.siteUrl));
fs.writeFileSync(path.join(root, "sitemap.xml"), buildSitemap(config, stops, plans));

const headBlock = buildHomeHead(config, stops);
let indexHtml = fs.readFileSync(indexPath, "utf8");
indexHtml = injectHomeHead(indexHtml, headBlock);
fs.writeFileSync(indexPath, indexHtml);

for (const slug of pilotSlugs) {
  const stop = stops.find((s) => s.slug === slug);
  if (!stop) {
    console.warn("skip spot page — unknown slug:", slug);
    continue;
  }
  const dir = path.join(root, "spots", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), buildSpotPage(stop, config));
  console.log("wrote spots/" + slug + "/index.html");
}

for (const planKey of seoPlanSlugs) {
  const plan = plans.plans?.[planKey];
  if (!plan) {
    console.warn("skip plan page — unknown key:", planKey);
    continue;
  }
  const dir = path.join(root, "plans", planKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), buildPlanPage(planKey, plan, stops, config));
  console.log("wrote plans/" + planKey + "/index.html");
}

console.log("wrote robots.txt, sitemap.xml");
console.log("updated index.html SEO head");
