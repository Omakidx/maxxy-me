# Performance Audit — Analysis Tool

Structured procedure for auditing web application performance.

---

## Audit Procedure

### Phase 1: Core Web Vitals Measurement

```bash
# Lighthouse CLI (quick audit)
npx lighthouse https://example.com --output=json --output-path=./audit.json --chrome-flags="--headless"

# Lighthouse CI (in pipeline)
npx lhci autorun --collect.url=https://example.com --assert.preset=lighthouse:recommended
```

| Metric | Good | Needs Work | Poor | What It Measures |
|--------|------|------------|------|-----------------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | ≤ 4.0s | > 4.0s | Loading speed |
| **INP** (Interaction to Next Paint) | ≤ 200ms | ≤ 500ms | > 500ms | Responsiveness |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 | Visual stability |
| **FCP** (First Contentful Paint) | ≤ 1.8s | ≤ 3.0s | > 3.0s | Initial render |
| **TTFB** (Time to First Byte) | ≤ 800ms | ≤ 1.8s | > 1.8s | Server response |

### Phase 2: Bundle Analysis

```bash
# Next.js
ANALYZE=true npx next build

# Webpack (standalone)
npx webpack-bundle-analyzer ./dist/stats.json

# Vite
npx vite-bundle-visualizer

# Generic: source-map-explorer
npx source-map-explorer dist/**/*.js
```

**Check for:**
- [ ] Bundle size < 200KB gzipped (initial load)
- [ ] No duplicate dependencies (e.g., two versions of lodash)
- [ ] Heavy libs loaded lazily (moment.js, chart.js, etc.)
- [ ] Tree-shaking working (no dead code in bundle)
- [ ] Code splitting on route boundaries

### Phase 3: Runtime Profiling

**Chrome DevTools Performance tab:**
1. Open DevTools → Performance tab
2. Click Record → interact with the page → Stop
3. Analyze:
   - **Main thread** — long tasks (> 50ms) block interaction
   - **Layout shifts** — look for layout recalculations
   - **Paint events** — excessive repaints indicate DOM thrashing

**React-specific:**
```bash
# React DevTools Profiler
# Enable "Record why each component rendered"
# Look for: unnecessary re-renders, expensive components

# Why Did You Render (development only)
npm i -D @welldone-software/why-did-you-render
```

### Phase 4: Network Analysis

```bash
# Check compression
curl -sI -H "Accept-Encoding: gzip, br" https://example.com | grep -i content-encoding
# Should show: content-encoding: br (or gzip)

# Check caching headers
curl -sI https://example.com/static/main.js | grep -i cache-control
# Should show: cache-control: public, max-age=31536000, immutable
```

| Resource Type | Cache Strategy | Max-Age |
|--------------|---------------|---------|
| HTML | `no-cache` or short TTL | 0-300s |
| CSS/JS (hashed) | `immutable` | 1 year |
| Images (hashed) | `immutable` | 1 year |
| API responses | `no-store` or short TTL | 0-60s |
| Fonts | `immutable` | 1 year |

---

## Common Performance Fixes

### Images
```html
<!-- Lazy load below-fold images -->
<img src="photo.jpg" alt="..." loading="lazy" decoding="async" />

<!-- Responsive images -->
<img
  srcset="photo-400.webp 400w, photo-800.webp 800w, photo-1200.webp 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  src="photo-800.webp"
  alt="..."
/>

<!-- Next.js Image (auto-optimized) -->
<Image src="/photo.jpg" alt="..." width={800} height={600} priority={false} />
```

### Code Splitting
```typescript
// React lazy loading
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Route-level splitting (Next.js does this automatically)
// Dynamic imports for heavy components
const Chart = dynamic(() => import('./components/Chart'), {
  loading: () => <Skeleton />,
  ssr: false,
});
```

### Font Loading
```html
<!-- Preload critical fonts -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />

<!-- Font display swap (prevent FOIT) -->
<style>
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter.woff2') format('woff2');
  font-display: swap;
}
</style>
```

### Critical CSS
```html
<!-- Inline critical CSS -->
<style>
  /* Above-the-fold styles inlined here */
</style>

<!-- Defer non-critical CSS -->
<link rel="preload" href="/styles/main.css" as="style" onload="this.onload=null;this.rel='stylesheet'" />
```

### Database Query Optimization
```sql
-- Identify slow queries (PostgreSQL)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check for missing indexes
SELECT schemaname, tablename, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan AND seq_tup_read > 10000
ORDER BY seq_tup_read DESC;
```

---

## Performance Budget

| Metric | Budget |
|--------|--------|
| Initial JS bundle (gzipped) | < 200KB |
| Total page weight | < 1.5MB |
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| Time to Interactive | < 3.5s |
| Number of HTTP requests | < 50 |
| Third-party JS | < 100KB |

---

## Output Format

```
PERFORMANCE AUDIT
════════════════════════════════════════

Target:         <URL or app name>
Date:           <date>
Tool:           Lighthouse / DevTools / Custom

Core Web Vitals:
  LCP:    <value> — <GOOD / NEEDS WORK / POOR>
  INP:    <value> — <GOOD / NEEDS WORK / POOR>
  CLS:    <value> — <GOOD / NEEDS WORK / POOR>

Bundle:
  Initial JS:   <size> gzipped
  Total:        <size>
  Top packages: <list of heaviest dependencies>

Issues Found:
  P0 (Critical):
    • <issue> — <fix>
  P1 (Important):
    • <issue> — <fix>
  P2 (Nice to have):
    • <issue> — <fix>

Quick Wins:
  1. <easiest high-impact fix>
  2. <next easiest>
  3. <next>
```
