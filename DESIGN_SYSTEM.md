# avanderw Design-System Integration

## Current Integration

Graph Edit uses the public [avanderw design system](https://avanderw.co.za/design-system). There are no build dependencies, filesystem imports, symlinks, or runtime requests to a local copy of the website.

| Responsibility | Implementation |
| --- | --- |
| Published components | [index.html](index.html) loads `https://avanderw.co.za/ui-components.js` using a deferred classic script. |
| Site header and footer | [src/components/SiteChrome.svelte](src/components/SiteChrome.svelte) renders the actual `site-header` and `site-footer` custom elements. |
| Editor theme | [src/theme.css](src/theme.css) contains a small portable adapter based on the site's published-source tokens, plus graph-specific semantic colors. |
| Fonts | ET Book roman, italic, and bold WOFF2 files are loaded from `https://avanderw.co.za/fonts/`, with Palatino/Georgia fallbacks. |
| Theme selection | The site's header controls the root `data-theme` attribute and the `theme` localStorage preference. All editor surfaces inherit the same light/dark selection. |
| Icons | Lucide icons replace the previous text glyphs, matching the library used by the site. |
| Deployment | Vite builds with relative asset paths, supporting root or project-subdirectory hosting. Public site resources always use absolute HTTPS URLs. |

The token palette follows the site's white/charcoal surfaces, sea-green accent, restrained borders, and ET Book serif typography. Monospace is reserved for literal numeric controls and values. Source, process, and sink colors are editor-specific semantic extensions, not a replacement palette. SVG canvas sizes and strokes remain graph-owned, so the site's generic SVG rules cannot resize grid or connection layers.

The contact footer is inside a collapsed disclosure to preserve workspace height. On mobile, node creation and simulation controls remain available above the canvas. Nodes still expand to contain their inventory, recipes, and performance metrics.

## Theme and Loading Behavior

The header and footer use their own shadow DOM. Global app styles do not reach into or override their internals. The editor reacts through inherited CSS custom properties and the document's theme attribute, without duplicating a theme toggle or running theme polling.

An early script reads the saved theme before the app starts; absent an explicit preference, colors follow the operating system. A blocked localStorage read does not prevent the editor from starting. Preferences are origin-scoped: a choice made on a separately hosted editor is not automatically shared with the main domain.

Space is reserved for undefined custom elements. A plain link remains as fallback content if the component script cannot load. Fonts use `font-display: swap`, so unavailable fonts fall back rather than hiding text. An external component script or font outage does not become a local build dependency; the editor's controls and simulation are bundled independently.

Hosted JavaScript is an executable third-party-origin dependency, even though it is published by the same site owner. The documented public URL is currently a rolling release: the next site deployment can change it without rebuilding this app. Production deployments that need strict reproducibility should use upstream versioned bundles and integrity hashes once those are provided.

## Why a Compatibility Adapter Exists

The current component's `links` attribute controls the location trail, not its hard-coded primary navigation. Internal links such as `/stream`, `/books`, `/principles`, and the footer's `/design-system` would otherwise resolve against the editor's origin.

`SiteChrome.svelte` waits for registration and resolves those root-relative links to `https://avanderw.co.za`. A scoped MutationObserver catches links created when the mobile menu opens. It observes child changes, not attributes, so rewriting links does not trigger a mutation loop. The observer is disconnected on component teardown. This is a compatibility layer for the currently published bundle, not a reason to copy the website into this repository.

## Recommended Upstream Modularity

The existing site is modular enough to integrate today; no upstream rebuild, framework migration, or large refactor is required for this editor. These focused changes would make future reuse substantially cleaner:

1. **Publish a theme contract.** Export a versioned tokens stylesheet and font stylesheet alongside the component bundle. Avoid bundling page layout, fluid article sizing, generic SVG resets, or markdown styling into that shared contract. Font URLs should resolve correctly when the stylesheet is consumed from another origin. This lets this app import shared tokens instead of maintaining a small copy.
2. **Configure navigation origins and items.** Add a `site-origin` or `base-url` attribute and a separate `navigation` JSON attribute. Apply them to desktop navigation, mobile navigation, and footer links. Keep location-trail links independently configurable. This removes the shadow-DOM link adapter.
3. **Expose chrome styling hooks.** Consume inherited semantic variables or expose stable CSS parts for surface, text, accent, spacing, and maximum content width. The current components redefine colors internally and fix the inner width to 60%, which prevents a consuming tool from aligning chrome with its own workspace without depending on private shadow markup.
4. **Offer a compact footer.** Make contact copy and links configurable, with a compact variant suitable for full-height tools. The current footer is intentionally personal and is therefore collapsed here rather than occupying permanent workspace space.
5. **Version the distributed assets.** Publish matching component/token versions, document supported attributes and events, and provide cache/integrity guidance. Add cross-origin integration checks covering theme switching, mobile navigation, link destinations, and keyboard dismissal. During this integration check, the mobile menu's explicit Close control worked, but Escape did not dismiss it reliably; that belongs in the upstream component's keyboard tests.

These changes should live in the website's design-system boundary, not in its page routes or in the graph simulation. No upstream files were modified for this task.

## Dependency Compatibility

The published custom elements bundle their own Svelte runtime, so Graph Edit can continue using Svelte 4 while the website uses Svelte 5. The current icon dependency is `lucide-svelte` 0.525, matching the reference site's version. That package is deprecated; the replacement `@lucide/svelte` currently requires Svelte 5. Migrating the app and icon package should be a separate compatibility task rather than a styling prerequisite.

Installing the icon package reported seven dependency vulnerabilities (six moderate and one high) in the current dependency tree. No forced upgrades were applied. Review `npm audit` and schedule a separate toolchain/security update rather than silently upgrading Svelte/Vite across major versions here.

## Verification

- `npm run build` compiles the editor and custom-element integration.
- `npm test` passes all 62 simulation tests; simulation logic was not changed by the styling work.
- Public component, favicon, and all three font URLs returned HTTP 200 with suitable content types. Fonts permit cross-origin requests.
- Browser checks used the already-running server at `http://localhost:5174`, without starting another server.
- Desktop checks at 1440 x 1000 covered three sample nodes, four links, loaded ET Book fonts, light/dark toggle behavior, screenshots, and node-boundary checks.
- Mobile checks at 390 x 844 covered accessible creation controls, a fitting node-creation dialog, working navigation Close controls, public link resolution, footer rendering, and absence of page-level horizontal overflow.

The public design-system page and the website's source repository were used as references. The site's custom code is published under MIT terms, and ET Book is the site's MIT-licensed typeface. This integration loads its public assets instead of redistributing the website or font files.