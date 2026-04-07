const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const { getRootDomain, getSubdomain, normalizeUrl, parseSitemap, parseRobotsTxt, discoverFromPage } = require('./discovery');
const { extractPageData, closeBrowser } = require('./extractor');
const { validatePage } = require('./validator');
const { calculateScore } = require('./scorer');

// Crawl state
const crawlState = {};

/**
 * Phase 1: Start Discovery (Runs when user clicks Audit) 
 */
async function startCrawl(targetUrl, sessionId, options = {}) {
  const rootDomain = getRootDomain(targetUrl);
  const maxPages = options.maxPages || 500;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Crawler] Starting discovery session: ${sessionId}`);
  console.log(`[Crawler] Target: ${targetUrl}`);
  console.log(`${'='.repeat(60)}\n`);

  crawlState[sessionId] = {
    status: 'running',
    phase: 'discovery',
    discovered: new Set(),
    crawled: new Set(),
    errors: 0,
    startTime: Date.now()
  };

  try {
    console.log('[Crawler] Phase 1: URL Discovery');
    const robots = await parseRobotsTxt(targetUrl);
    const sitemapUrls = await parseSitemap(targetUrl);
    
    for (const url of sitemapUrls) {
      if (crawlState[sessionId].discovered.size < maxPages) crawlState[sessionId].discovered.add(url);
    }

    if (robots.sitemaps.length > 0) {
      for (const smUrl of robots.sitemaps) {
        try {
          const extraUrls = await parseSitemap(smUrl);
          for (const url of extraUrls) {
            if (crawlState[sessionId].discovered.size < maxPages) crawlState[sessionId].discovered.add(url);
          }
        } catch (e) { /* skip */ }
      }
    }

    const normalizedTarget = normalizeUrl(targetUrl, targetUrl);
    if (normalizedTarget) crawlState[sessionId].discovered.add(normalizedTarget);

    console.log('[Crawler] Discovering links from pages (fast scan)...');
    const discoveryQueue = [normalizedTarget];
    const discoveredFromPages = new Set();
    let discoveredCount = 0;

    // Keep discovery short to avoid hitting Vercel 10s limit
    while (discoveryQueue.length > 0 && discoveredCount < 10) {
      const pageUrl = discoveryQueue.shift();
      if (discoveredFromPages.has(pageUrl)) continue;
      discoveredFromPages.add(pageUrl);
      discoveredCount++;

      const links = await discoverFromPage(pageUrl, rootDomain);
      for (const link of links) {
        if (!crawlState[sessionId].discovered.has(link) && crawlState[sessionId].discovered.size < maxPages) {
          crawlState[sessionId].discovered.add(link);
          if (!discoveredFromPages.has(link)) discoveryQueue.push(link);
        }
      }
    }

    console.log(`\n[Crawler] Total discovered: ${crawlState[sessionId].discovered.size} URLs\n`);

    // Insert all discovered URLs into database
    for (const url of crawlState[sessionId].discovered) {
      const subdomain = getSubdomain(url);
      const domain = getRootDomain(url);
      await db.insertPage(sessionId, url, domain, subdomain);
    }

    await db.updateSession(sessionId, {
      total_discovered: crawlState[sessionId].discovered.size
    });

  } catch (e) {
    console.error(`[Crawler] Discovery error: ${e.message}`);
    await db.updateSession(sessionId, { status: 'error' });
  }

  // Phase 1 finished! The frontend polling will handle Phase 2.
  return sessionId;
}

/**
 * Phase 2: Process One Batch (Triggered continuously by frontend API polling)
 */
async function processOneBatch(sessionId) {
  // Grab exactly 1 page to process so we don't timeout the Vercel function
  const pending = await db.getPendingPages(sessionId, 1); 
  
  if (pending.length === 0) {
    // No more pages? Crawl is officially complete!
    const finalStats = await db.getSessionStats(sessionId);
    await db.updateSession(sessionId, {
      status: 'completed',
      avg_score: Math.round(finalStats.avg_score || 0),
      completed_at: new Date().toISOString()
    });
    return;
  }

  const page = pending[0];
  console.log(`[Extracting] ${page.original_url}`);

  try {
    const data = await extractPageData(page.original_url);

    const issues = validatePage({
      title: data.title, titleLength: data.titleLength,
      metaDescription: data.metaDescription, metaDescriptionLength: data.metaDescriptionLength,
      h1Text: data.h1Text, h1Count: data.h1Count,
      canonicalUrl: data.canonicalUrl, wordCount: data.wordCount,
      schemaJson: data.schemaJson, ogTags: data.ogTags,
      internalLinksCount: data.internalLinksCount, externalLinksCount: data.externalLinksCount,
      loadTimeMs: data.loadTimeMs, statusCode: data.statusCode,
      finalUrl: data.finalUrl, originalUrl: page.original_url
    });

    const scoreResult = calculateScore({ ...data, originalUrl: page.original_url }, issues);

    await db.updatePage(sessionId, page.original_url, {
      final_url: data.finalUrl, status_code: data.statusCode,
      is_redirect: data.isRedirect ? 1 : 0, 
      redirect_chain: data.redirectChain.length > 0 ? JSON.stringify(data.redirectChain) : null,
      title: data.title, title_length: data.titleLength,
      meta_description: data.metaDescription, meta_description_length: data.metaDescriptionLength,
      h1_text: data.h1Text, h1_count: data.h1Count,
      canonical_url: data.canonicalUrl, word_count: data.wordCount,
      schema_json: data.schemaJson ? JSON.stringify(data.schemaJson) : null,
      og_tags: data.ogTags ? JSON.stringify(data.ogTags) : null,
      internal_links_count: data.internalLinksCount, external_links_count: data.externalLinksCount,
      load_time_ms: data.loadTimeMs, score: scoreResult.total,
      score_breakdown: JSON.stringify(scoreResult.breakdown), issues: JSON.stringify(issues),
      crawl_status: 'done', last_crawled: new Date().toISOString()
    });

  } catch (e) {
    console.error(`[Extract] Error: ${e.message}`);
    await db.updatePage(sessionId, page.original_url, {
      crawl_status: 'error', error_message: e.message
    });
  }

  // Update session stats dynamically
  const stats = await db.getSessionStats(sessionId);
  await db.updateSession(sessionId, {
    total_crawled: stats.total_pages,
    avg_score: Math.round(stats.avg_score || 0)
  });
  
  // Close the extracted playwright browser context per batch
  await closeBrowser();
}

function getCrawlState(sessionId) {
  const state = crawlState[sessionId];
  if (!state) return null;
  return {
    status: state.status, phase: state.phase, discovered: state.discovered.size,
    crawled: state.crawled.size, errors: state.errors, elapsed: 0
  };
}

module.exports = { startCrawl, processOneBatch, getCrawlState };
