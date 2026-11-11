# Intention SEO — agent guide

Grav **2.x** plugin for indexing, titles, descriptions, and share tags. Workspace root is this directory only.

## Scope

- Edit **only** files under this plugin tree.
- Do **not** change `user/config/`, `user/pages/`, themes, other plugins, or parent Grav site `.cursor/`.
- Plugin enablement and site config: **describe steps for the user**; do not apply them here.

See [`.cursor/rules/scope-intention-seo.mdc`](.cursor/rules/scope-intention-seo.mdc).

The live theme still owns the document `<title>` line in `partials/base.html.twig`. Describe that change for the Grav site workspace; do not edit the theme from here.

## Skills

Before implementation that touches API routes, Admin2, or `admin-next/`, read [`.cursor/skills/`](.cursor/skills/) and follow the matching skill:

| Task | Skill |
|------|--------|
| REST API only | `grav-api-integration.md` |
| Admin2 / `onApi*` / `admin-next/` / widgets / plugin pages | `grav-api-admin-next-integration.md` |

## What this plugin does

- Sidebar settings: site index/noindex, and fallback Open Graph title, description, and image.
- A warning on every admin screen, and a `noindex` sidebar badge, while the site is noindex.
- An SEO tab on page edit: indexing, meta title, meta description, word count, Open Graph title, description, and page image.
- Title, description, and index marks on the pages list.
- Front-end robots meta, Open Graph, and Twitter cards. The theme prints the document title.
- Noindex URLs are removed from the existing sitemap, including `llms.txt`.

Badger Builder is not required. When a page has `header.sections`, those fields are read for the share image and the word count.

## Layout

| Path | Role |
|------|------|
| [`intention-seo.php`](intention-seo.php) | Events |
| [`classes/SeoResolver.php`](classes/SeoResolver.php) | Resolution rules |
| [`classes/Api/IntentionSeoApiController.php`](classes/Api/IntentionSeoApiController.php) | Status and page summary |
| [`blueprints.yaml`](blueprints.yaml) | Settings form |
| [`admin-next/fields/`](admin-next/fields/) | Length, word count, and warning fields |
| [`admin-next/widgets/intention-seo.js`](admin-next/widgets/intention-seo.js) | Banner and pages-list marks |
| [`templates/partials/opengraph.html.twig`](templates/partials/opengraph.html.twig) | Share tags |

## Conventions

See [`.cursor/rules/conventions.mdc`](.cursor/rules/conventions.mdc). Class prefix: `iseo-`. No native `confirm()` in Admin Next — use `__GRAV_DIALOGS`.

## Plans

Write plans in [`.cursor/plans/`](.cursor/plans/). If Cursor saves a plan under the home directory, move it here before the planning turn ends.

## Changelog

After completing a task, prepend two lines to [`.cursor/notes/changelog.md`](.cursor/notes/changelog.md) (date + ≤30-word summary). Do **not** write to the parent Grav site changelog.
