---
version: alpha
colors:
  midnight: "#0D1722"
  deepBlue: "#15232F"
  gold: "#C9A24B"
  goldLight: "#E3C979"
  white: "#FFFFFF"
  ice: "#D9EEF5"
  canvas: "#F3F9FD"
  ink: "#1D2733"
typography:
  sans:
    fontFamily: '"Cairo", "Segoe UI", Tahoma, Arial, sans-serif'
    lineHeight: "1.55"
  display:
    fontFamily: '"Cairo", "Segoe UI", Tahoma, Arial, sans-serif'
    lineHeight: "1.15"
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
rounded:
  control: "0.75rem"
  card: "1.25rem"
  feature: "2rem"
spacing:
  control: "0.75rem"
  section: "4rem"
components:
  button:
    minHeight: "2.75rem"
    focusRing: "2px solid #D9EEF5"
  productCard:
    imageAspectRatio: "4 / 5"
    radius: "1.25rem"
  swatch:
    size: "2.5rem"
    selectedRing: "2px solid #C9A24B"
---

## Overview

MIDO OPTICS serves eyewear shoppers in Egypt through an Arabic-first, mobile-first experience. The storefront is a hybrid surface: the home page and campaign areas can feel cinematic, while catalog, variant selection, checkout, account, and admin tasks prioritize clarity and confidence. Arabic is the default locale and uses RTL; English uses LTR. The existing operations dashboard remains a distinct product surface.

The reference is a quiet optical atelier: a dark exhibition room, precise brass details, icy daylight, and generous space around real eyewear photography. The memorable signature is a fine orbital lens line framing one hero image or campaign title. Do not repeat it as decoration on every card. Avoid generic marketplace layouts, neon gradients, fake product photography, and dense admin UI styled like a fashion campaign.

## Colors

Use midnight and deep blue for dark surfaces, white and canvas for light surfaces, and ink for readable text. Gold is the brand accent for selected states, key actions, and fine details; it is not a substitute for text contrast. Ice blue supports lens/optical detail and focus treatment. Status colors keep their conventional meaning and always include text or an icon.

Light and dark themes preserve the same semantic hierarchy. Product imagery supplies most of the color and should remain the visual focus. Do not tint product photos with brand overlays.

## Typography

Cairo is the shared face for Arabic and English UI, preserving the existing application font and reliable RTL shaping. Use a restrained display scale and stronger weight for campaign headings; use regular text for product descriptions, forms, prices, and order status. Use tabular numerals for EGP amounts and order IDs. Never force all-uppercase styling on Arabic text.

## Layout

Use an editorial storefront header, a high-impact but compact hero, clearly separated product categories, and product galleries with a 4:5 image frame. Keep primary shopping actions reachable on mobile. Catalog filters and forms reflow without horizontal page scrolling. Use the existing Tailwind spacing vocabulary and CSS variables as the runtime source of truth; keep long admin forms in natural document flow.

## Elevation & Depth

Use restrained surface contrast and soft shadows only where they clarify a card, popover, or dialog. Avoid glassmorphism on product information and checkout. Keep modal backdrops legible in both themes.

## Shapes

Use rounded controls and cards with the values in the frontmatter. Reserve the larger feature radius for hero imagery or a major campaign panel. Prefer thin borders and deliberate whitespace over nested cards.

## Components

- Product cards show a real product image, name, price, and availability; show color options only when that product has valid variants.
- Variant swatches are buttons with localized accessible names, visible selection, and disabled unavailable states. Selecting a swatch changes the active image gallery and price/availability.
- Gold primary buttons have explicit hover, pressed, disabled, and busy states. Focus is always visible.
- Forms use visible labels, inline validation, and stable geometry. Financial or inventory-sensitive actions wait for server confirmation.
- Motion uses the existing `motion` package and supports `prefers-reduced-motion`. Keep the first content render useful without animation.

## Do's and Don'ts

- Use real catalog images from Firebase Storage. When media is absent, use a neutral optical frame placeholder and explain that no image is available.
- Keep the brand's gold, white, and light blue in both themes without sacrificing readable contrast.
- Keep admin forms and tables task-focused, with clear status, ownership, and recovery states.
- Do not invent reviews, stock, discounts, payment success, product records, or storefront contact details.
- Do not install GSAP or Lenis for routine transitions; use the existing motion library unless a concrete experience requires another tool.
