// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// If Node < 18, uncomment next line and use fetch from node-fetch
// import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const GOLDPRICEZ_API_KEY = process.env.GOLDPRICEZ_API_KEY;

if (!GOLDPRICEZ_API_KEY) {
  console.warn(
    "⚠️ GOLDPRICEZ_API_KEY missing. Set it in .env before calling /api/rates"
  );
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  })
);

// Simple health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * GET /api/rates?currency=usd|inr
 * Proxies GoldPriceZ API and returns simplified gold & silver prices.
 */
app.get("/api/rates", async (req, res) => {
  const currency = (req.query.currency || "usd").toLowerCase();

  console.log(`[/api/rates] Incoming request - currency=${currency} from ${req.ip}`);

  if (!GOLDPRICEZ_API_KEY) {
    console.warn("[/api/rates] GOLDPRICEZ_API_KEY not set in environment");
    return res.status(500).json({
      error: "Server not configured with GOLDPRICEZ_API_KEY",
      hint: "Set GOLDPRICEZ_API_KEY in the server .env file",
    });
  }

  try {
    // Example from docs: https://goldpricez.com/api/rates/currency/usd/measure/all
    const url = `https://goldpricez.com/api/rates/currency/${currency}/measure/gram/metal/all`;

    console.log(`[/api/rates] Fetching external API: ${url}`);

    let response;
    try {
      response = await fetch(url, {
        headers: {
          "X-API-KEY": GOLDPRICEZ_API_KEY,
        },
      });
    } catch (fetchErr) {
      console.error("[/api/rates] Network error while fetching GoldPriceZ:", fetchErr);
      return res.status(502).json({ error: "Network error fetching GoldPriceZ" });
    }

    console.log(`[/api/rates] GoldPriceZ responded with status ${response.status}`);

    if (!response.ok) {
      const text = await response.text().catch(() => "<no body>");
      console.error("[/api/rates] GoldPriceZ API error:", response.status, text);
      return res.status(502).json({
        error: "Failed to fetch data from GoldPriceZ",
        status: response.status,
        details: text,
      });
    }

    let data = await response.json().catch((e) => {
      console.error("[/api/rates] Failed to parse JSON from GoldPriceZ:", e);
      return null;
    });

    if (!data) {
      return res.status(502).json({ error: "Invalid JSON from GoldPriceZ" });
    }

    // Support responses that wrap actual payload in a `data` field
    if (data.data && typeof data.data === "object") {
      console.log("[/api/rates] Detected top-level `data` field; using payload inside it");
      data = data.data;
    }

    // If API returned an array (observed as keys '0','1',..), merge objects inside
    if (Array.isArray(data)) {
      console.log("[/api/rates] External API returned an Array. Merging array entries into a single object.");
      const merged = data.reduce((acc, item, idx) => {
        if (item && typeof item === "object") {
          Object.assign(acc, item);
        } else {
          acc[idx] = item;
        }
        return acc;
      }, {});
      // keep a small sample log
      console.log("[/api/rates] Sample array[0]:", JSON.stringify(data[0]).slice(0, 500));
      data = merged;
    }

    console.log("[/api/rates] External API keys:", Object.keys(data).slice(0, 20));

    // Robust extractor: flatten the payload and search for likely gold/silver values.
    // Parse numeric values: accept numbers or numeric strings (e.g. "11662.889...")
    const parseNumber = (v) => {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string') {
        const s = v.trim();
        if (s === '') return null;
        const n = Number(s);
        if (!Number.isNaN(n)) return n;
      }
      return null;
    };

    const flatten = (obj, prefix = '') => {
      const out = [];
      const helper = (val, path) => {
        // If value is a JSON string, try parsing and recurse into it
        if (typeof val === 'string') {
          const s = val.trim();
          if ((s.startsWith('{') || s.startsWith('['))) {
            try {
              const parsed = JSON.parse(s);
              helper(parsed, path);
              return;
            } catch (e) {
              // not JSON, continue to treat as primitive
            }
          }
        }

        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            val.forEach((item, i) => helper(item, `${path}[${i}]`));
          } else {
            Object.keys(val).forEach((k) => helper(val[k], path ? `${path}.${k}` : k));
          }
        } else {
          out.push({ path, key: path ? path.split('.').pop() : '', value: val });
        }
      };
      helper(obj, prefix);
      return out;
    };

    const entries = flatten(data);
    // Log a few entries to help debugging
    console.log('[/api/rates] sample flattened entries:', entries.slice(0, 10));

    const lc = (s) => (s ? String(s).toLowerCase() : '');

    const pickByKeyIncludes = (substrings) => {
      return entries.find(e => {
        const key = lc(e.key);
        return substrings.every(sub => key.includes(sub));
      });
    };

    // Try several heuristics
    let goldPerGram = null;
    let silverPerGram = null;
    let gramToOunce = null;

    // 1) direct keys containing 'gold'+'gram' or 'silver'+'gram'
    const g1 = pickByKeyIncludes(['gold','gram']);
    const s1 = pickByKeyIncludes(['silver','gram']);
    if (g1) {
      const n = parseNumber(g1.value);
      if (n != null) goldPerGram = n;
    }
    if (s1) {
      const n = parseNumber(s1.value);
      if (n != null) silverPerGram = n;
    }

    // 2) country-specific keys like gram_in_inr etc.
    if (goldPerGram == null) {
      const key = `gram_in_${currency}`;
      const found = entries.find(e => lc(e.key) === key || lc(e.path).endsWith(`.${key}`));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) goldPerGram = n;
      }
    }
    if (silverPerGram == null) {
      const key = `silver_gram_in_${currency}`;
      const found = entries.find(e => lc(e.key) === key || lc(e.path).endsWith(`.${key}`));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) silverPerGram = n;
      }
    }

    // 3) generic 'gram' keys
    if (goldPerGram == null) {
      const found = entries.find(e => lc(e.key) === 'gram' || lc(e.key).includes('gram_in'));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) goldPerGram = n;
      }
    }
    if (silverPerGram == null) {
      const found = entries.find(e => lc(e.key) === 'silver' || lc(e.key).includes('silver_gram'));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) silverPerGram = n;
      }
    }

    // 4) look for keys containing 'xau' (gold) or 'xag' (silver)
    if (goldPerGram == null) {
      const found = entries.find(e => lc(e.key).includes('xau') || lc(e.path).includes('xau'));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) goldPerGram = n;
      }
    }
    if (silverPerGram == null) {
      const found = entries.find(e => lc(e.key).includes('xag') || lc(e.path).includes('xag'));
      if (found) {
        const n = parseNumber(found.value);
        if (n != null) silverPerGram = n;
      }
    }

    // 5) fallback: find numeric 'gram' candidates and pick top two (gold is usually larger than silver)
    if (goldPerGram == null || silverPerGram == null) {
      const gramCandidates = entries
        .filter(e => lc(e.key).includes('gram') && parseNumber(e.value) != null && (currency === 'usd' || !lc(e.key).includes('usd')))
        .map(e => ({...e, num: parseNumber(e.value)}))
        .sort((a,b) => b.num - a.num);
      if (gramCandidates.length >= 1 && goldPerGram == null) goldPerGram = gramCandidates[0].num;
      if (gramCandidates.length >= 2 && silverPerGram == null) silverPerGram = gramCandidates[1].num;
    }

    // 6) if still missing, try picking two largest numeric values (excluding timestamps)
    if (goldPerGram == null || silverPerGram == null) {
      const numericEntries = entries
        .filter(e => parseNumber(e.value) != null && !lc(e.key).includes('gmt') && !lc(e.key).includes('updated') && !lc(e.key).includes('time') && (currency === 'usd' || !lc(e.key).includes('usd')))
        .map(e => ({...e, num: parseNumber(e.value)}))
        .sort((a,b) => b.num - a.num);
      if (numericEntries.length >= 1 && goldPerGram == null) goldPerGram = numericEntries[0].num;
      if (numericEntries.length >= 2 && silverPerGram == null) silverPerGram = numericEntries[1].num;
    }

    // gramToOunce search
    const gto = entries.find(e => lc(e.key).includes('gram_to_ounce') || lc(e.key).includes('gram_to_ounce_formula'));
    if (gto) {
      const n = parseNumber(gto.value);
      if (n != null) gramToOunce = n;
    }

    // Additional heuristics: compute per-gram from per-ounce in target currency
    const findKey = (k) => entries.find(e => lc(e.key) === k || lc(e.path).endsWith(`.${k}`));
    const usdToLocalEntry = findKey(`usd_to_${currency}`) || entries.find(e => lc(e.key) === 'usd_to_inr' || lc(e.key) === 'usd_to_usd');
    const usdToLocal = usdToLocalEntry ? parseNumber(usdToLocalEntry.value) : null;
    // Compute per-gram from per-ounce values (in target currency) when available
    const sOunceKey = `silver_ounce_in_${currency}`;
    const sOunce = findKey(sOunceKey) || entries.find(e => lc(e.key).includes('silver_ounce') && lc(e.key).includes(currency));
    const silverFromOunce = (sOunce && parseNumber(sOunce.value) != null && gramToOunce) ? parseNumber(sOunce.value) * gramToOunce : null;

    const gOunceKey = `ounce_in_${currency}`;
    const gOunce = findKey(gOunceKey) || entries.find(e => lc(e.key).includes('ounce') && lc(e.key).includes(currency));
    const goldFromOunce = (gOunce && parseNumber(gOunce.value) != null && gramToOunce) ? parseNumber(gOunce.value) * gramToOunce : null;

    // Prefer per-ounce-in-target-currency conversion when the request is for a local currency (e.g., INR)
    if (currency !== 'usd') {
      if (silverFromOunce != null) silverPerGram = silverFromOunce;
      if (goldFromOunce != null) goldPerGram = goldFromOunce;
    } else {
      // For USD requests, if only per-ounce in USD is available and gram missing, compute it
      if (silverPerGram == null && silverFromOunce != null) silverPerGram = silverFromOunce;
      if (goldPerGram == null && goldFromOunce != null) goldPerGram = goldFromOunce;
    }

    // Do not convert USD-denominated per-gram rates into local currency.
    // Prefer direct INR (or requested currency) fields only. If no INR fields exist,
    // the previous fallbacks (per-ounce-in-target-currency) will be used.
    if (gramToOunce == null) gramToOunce = data.gram_to_ounce_formula ?? data.gram_to_ounce ?? 0.0321507;

    console.log(`[/api/rates] Extracted goldPerGram=${goldPerGram} silverPerGram=${silverPerGram} gramToOunce=${gramToOunce}`);

    if (goldPerGram == null || silverPerGram == null) {
      console.error("[/api/rates] Unable to extract gold/silver from response; keys:", Object.keys(data).slice(0,50));
      return res.status(502).json({
        error: "Unexpected response format from GoldPriceZ",
        keys: Object.keys(data).slice(0,50),
      });
    }

    // Convert using formulas:
    // 1 gram = gram_to_ounce_formula * ounce
    // => ounce price = gram price / gram_to_ounce_formula
    const goldPerOunce = goldPerGram / gramToOunce;
    const silverPerOunce = silverPerGram / gramToOunce;

    const goldPerKg = goldPerGram * 1000;
    const silverPerKg = silverPerGram * 1000;

    // Last updated info (if present)
    const updatedUsd = data.gmt_ounce_price_usd_updated || null;
    const updatedFx = data[`gmt_${currency}_updated`] || null;

    res.json({
      currency: currency.toUpperCase(),
      gold: {
        perGram: goldPerGram,
        perOunce: goldPerOunce,
        perKg: goldPerKg,
      },
      silver: {
        perGram: silverPerGram,
        perOunce: silverPerOunce,
        perKg: silverPerKg,
      },
      meta: {
        source: "GoldPriceZ.com",
        updated: updatedFx || updatedUsd,
      },
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Only start listening when running as a standalone server (not in Vercel serverless)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

export default app;
