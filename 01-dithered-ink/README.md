# Ink & Marginalia

This directory contains the visual assets and the original static reference pages for Template 01. The publishable Markdown project now lives one directory above, at the `blog-templates` root.

## Write and preview

From the project root:

```bash
npm install
npm run dev
```

Create articles in `site/posts/` by copying `post-template.md`. One Markdown file is rendered into both:

- `01-dithered-ink/posts/<slug>/`
- `02-blue-notebook/posts/<slug>/`

The generated static site is written to `_site/`. Do not edit files inside `_site/`; they are recreated on every build.

## Personalize

- Site names and descriptions: `site/_data/sites.js`
- Template 01 page layouts: `site/_includes/layouts/01-shell.njk` and `site/01-dithered-ink/`
- Banner scenes: this directory's `assets/scene-*.js`
- Typography and colors: this directory's `assets/style.css`

## Banner scenes

- The first page opened in a tab chooses `rain`, `clouds`, or `willow`.
- Navigation inside the site keeps that choice; a full reload chooses again.
- `?scene=rain|clouds|willow` forces a scene for previewing.
- Rain intensity can be forced with `&rain=drizzle|light|heavy|storm`.
- Reduced-motion remains supported.

## Publish

Push the complete project root to a GitHub repository, then choose **GitHub Actions** under **Settings → Pages → Build and deployment**. The root workflow builds `_site/` and deploys it automatically.
