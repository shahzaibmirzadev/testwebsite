# Vercel Growth Checklist

This project now has:
- Vercel Web Analytics enabled
- Custom event tracking (`search_submit`, `click_apply`, filter/sort events, etc.)
- Vercel Speed Insights enabled
- SEO metadata + JSON-LD + sitemap/robots

Use this checklist weekly to turn data into growth.

## 1) Web Analytics (traffic + behavior)

Vercel dashboard -> project `droneroles` -> Analytics:
- Review top pages by views
- Review referrers (where traffic comes from)
- Review countries/devices
- Review custom events:
  - `search_submit`
  - `click_apply`
  - `view_job_details`
  - `open_filters`

Questions to answer:
- Which pages attract users but low `click_apply`?
- Which filters are used most?
- Are mobile users converting worse than desktop?

## 2) Speed Insights (performance)

Vercel dashboard -> project `droneroles` -> Speed Insights:
- Track Core Web Vitals:
  - LCP
  - INP
  - CLS
- Segment by mobile first.

Targets:
- LCP under 2.5s
- INP under 200ms
- CLS under 0.1

If metrics regress after a deploy, compare release timestamps.

## 3) Search visibility

Google Search Console:
- Verify `https://droneroles.com`
- Submit `https://droneroles.com/sitemap.xml`
- Use URL Inspection for:
  - `/`
  - `/companies`
  - 5-10 strong `/jobs/[slug]` pages

Weekly checks:
- Queries with high impressions but low CTR (improve title/description templates)
- Pages discovered but not indexed (check quality/canonical)
- Mobile usability issues

## 4) Deployment safety

- Keep production branch as `main`
- Review Analytics + Speed Insights after each major UI/data change
- If traffic drops:
  1. Check DNS
  2. Check Vercel deployment errors/logs
  3. Check env vars
  4. Check Search Console coverage
