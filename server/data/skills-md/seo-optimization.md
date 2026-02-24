---
name: seo-optimization
description: SEO optimization checklist, keyword strategy, and technical SEO best practices
emoji: "\U0001F50E"
name_zh: SEO 优化
description_zh: 搜索引擎优化策略与实践
---

## SEO Optimization Guide

A practical checklist and strategy guide for improving search engine rankings and driving organic traffic.

## SEO Fundamentals

SEO has three pillars:

1. **Technical SEO**: Can search engines crawl and index your site?
2. **On-Page SEO**: Is your content relevant and well-optimized?
3. **Off-Page SEO**: Do other sites trust and link to yours?

## Technical SEO Checklist

### Crawlability & Indexing

- [ ] `robots.txt` is properly configured (not blocking important pages)
- [ ] XML sitemap is submitted to Google Search Console
- [ ] No orphan pages (every page is reachable via internal links)
- [ ] Canonical tags prevent duplicate content issues
- [ ] 301 redirects for changed URLs (no 404 chains)
- [ ] `noindex` tag on pages that shouldn't appear in search (admin, staging, thank-you pages)

```html
<!-- Canonical tag -->
<link rel="canonical" href="https://example.com/original-page" />

<!-- Noindex tag -->
<meta name="robots" content="noindex, nofollow" />
```

### Performance

- [ ] Page loads in under 2.5 seconds (Core Web Vitals LCP)
- [ ] First Input Delay under 100ms (Core Web Vitals FID / INP)
- [ ] Cumulative Layout Shift under 0.1 (Core Web Vitals CLS)
- [ ] Images are compressed and use modern formats (WebP, AVIF)
- [ ] CSS and JavaScript are minified and bundled
- [ ] Lazy loading for below-the-fold images
- [ ] CDN configured for static assets

### Mobile-Friendliness

- [ ] Responsive design (works on all screen sizes)
- [ ] Tap targets are at least 48x48px
- [ ] No horizontal scrolling on mobile
- [ ] Text is readable without zooming (16px+ font size)
- [ ] Test with Google's Mobile-Friendly Test tool

### Security & Infrastructure

- [ ] HTTPS enabled (SSL certificate installed)
- [ ] HSTS header configured
- [ ] Clean URL structure (no query parameters for important pages)

```
Good: example.com/blog/seo-guide
Bad:  example.com/post?id=123&cat=seo
```

## Keyword Research Process

### Step 1: Generate Seed Keywords

Start with topics your audience cares about:

```
Your product/service → related problems → questions people ask

Example for a project management tool:
- project management
- team collaboration
- task tracking
- remote team productivity
- sprint planning
```

### Step 2: Expand with Tools

Use keyword research tools (Google Keyword Planner, Ahrefs, SEMrush, Ubersuggest):

```
For each seed keyword, find:
- Search volume (monthly searches)
- Keyword difficulty (competition level)
- Related keywords and questions
- Long-tail variations

Prioritization matrix:
HIGH VALUE: High volume + Low difficulty (gold)
MEDIUM:     High volume + High difficulty (long-term target)
MEDIUM:     Low volume + Low difficulty (quick wins)
LOW:        Low volume + High difficulty (skip)
```

### Step 3: Map Keywords to Pages

```
| Target Keyword | Search Volume | Difficulty | Target Page |
|----------------|--------------|------------|-------------|
| project management software | 12,000 | High | /homepage |
| best project management tools | 8,000 | High | /blog/best-pm-tools |
| how to create a project plan | 3,500 | Medium | /blog/project-plan-guide |
| agile sprint planning template | 1,200 | Low | /templates/sprint-planning |
```

**Rule: One primary keyword per page.** Don't compete with yourself.

## On-Page SEO Checklist

### For Every Page

- [ ] **Title tag**: Includes primary keyword, under 60 characters
- [ ] **Meta description**: Includes keyword and CTA, under 155 characters
- [ ] **H1 tag**: One per page, contains primary keyword
- [ ] **URL**: Short, descriptive, contains keyword
- [ ] **First paragraph**: Primary keyword appears within first 100 words
- [ ] **Subheadings (H2/H3)**: Include secondary keywords naturally
- [ ] **Image alt text**: Descriptive, includes keywords where natural
- [ ] **Internal links**: 2-5 links to related content on your site
- [ ] **External links**: 1-2 links to authoritative external sources

### Content Quality Signals

- [ ] Content is comprehensive (covers the topic thoroughly)
- [ ] Answers the user's search intent (informational, navigational, transactional)
- [ ] Word count matches top-ranking competitors for the keyword
- [ ] Content is original (not copied or lightly rewritten)
- [ ] Updated date is recent (refresh old content regularly)
- [ ] Includes multimedia (images, videos, infographics)
- [ ] Structured data / schema markup where applicable

```html
<!-- Example: Article schema markup -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Complete Guide to SEO Optimization",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "2025-01-15",
  "dateModified": "2025-06-01"
}
</script>
```

## Search Intent Types

Match your content format to the user's intent:

| Intent | What They Want | Content Format |
|--------|---------------|----------------|
| Informational | Learn something | Blog post, guide, tutorial |
| Navigational | Find a specific site | Landing page, homepage |
| Commercial | Compare options | Comparison, review, list |
| Transactional | Buy/sign up | Product page, pricing page |

```
"what is project management" → Informational → write a guide
"asana vs monday" → Commercial → write a comparison
"asana pricing" → Navigational → optimize your pricing page
"buy project management software" → Transactional → optimize product page
```

## Link Building Strategies

### Ethical Link Building Methods

1. **Create linkable content**: Original research, data, tools, templates
2. **Guest posting**: Write for reputable sites in your niche
3. **Broken link building**: Find broken links on other sites, offer your content as replacement
4. **HARO / journalist requests**: Respond to journalist queries with expert quotes
5. **Partnerships**: Co-create content with complementary businesses
6. **Community participation**: Helpful answers on forums, Stack Overflow, Reddit (where relevant)

### Link Quality Factors

High-quality links come from:
- Relevant sites in your industry
- Sites with high domain authority
- Editorial (naturally placed, not paid)
- Diverse sources (not all from one site)
- Contextual (within content, not footer/sidebar)

## Content Refresh Strategy

Regularly update existing content to maintain rankings:

```
Monthly:
- Check Google Search Console for declining pages
- Update statistics and dates
- Add new sections for emerging subtopics
- Improve internal linking to new content

Quarterly:
- Audit all top-performing pages
- Update screenshots and examples
- Expand thin content
- Consolidate overlapping pages
```

## SEO Monitoring

### Key Metrics to Track

| Metric | Tool | Frequency |
|--------|------|-----------|
| Organic traffic | Google Analytics | Weekly |
| Keyword rankings | Ahrefs / SEMrush | Weekly |
| Click-through rate (CTR) | Google Search Console | Monthly |
| Core Web Vitals | PageSpeed Insights | Monthly |
| Backlink growth | Ahrefs / SEMrush | Monthly |
| Indexed pages | Google Search Console | Monthly |

### Google Search Console Actions

- Submit new sitemaps after major content changes
- Monitor for indexing errors and fix promptly
- Check mobile usability issues
- Review search queries driving impressions but low clicks (optimize titles/descriptions)
- Disavow toxic backlinks if necessary
