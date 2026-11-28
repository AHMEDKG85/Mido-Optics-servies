---
name: cinematic-frontend
description: Design, implement, or review the MIDO OPTICS storefront and customer-facing UI with a premium cinematic visual direction, responsive product experiences, and accessible motion.
---

# Cinematic Frontend

Use this skill for storefront pages, product detail and gallery work, responsive styling, or frontend motion. Read the repository `AGENTS.md` and inspect the existing framework, design tokens, assets, routes, and components before changing UI. Extend the current stack and component patterns where they work.

The supplied source snapshot is an Arabic-first, right-to-left operations app with Cairo typography, a light/dark theme, Tailwind CSS 4, and the `motion` package. Keep the cinematic dark-editorial direction for customer-facing storefront and brand surfaces; do not impose it on dense admin workflows, forms, or thermal receipts when it harms clarity or RTL usability. GSAP, ScrollTrigger, and Lenis are not present in that snapshot. Prefer the installed `motion` package for ordinary UI transitions and add another animation library only when the requested experience needs it.

## Art direction

- Build a premium optical retail experience for MIDO OPTICS. Use a dark editorial foundation with purposeful gold accents, white typography, and light blue optical details. Keep text contrast strong and avoid using gold for small low-contrast copy.
- Treat the logo as a text-only wordmark. Do not invent an icon or replace the brand name with a generic mark.
- Create a specific visual hierarchy with considered type, scale, whitespace, photography, and transitions. Avoid generic ecommerce templates and repetitive card grids. Make product imagery and editorial storytelling do useful work.
- Use the real project assets and products when available. Do not present invented products, reviews, prices, stock states, or promotions as real.

## Implementation

- Preserve existing routes, working interactions, and shared components. Check dependencies and data flow before replacing a component or adding a package.
- Make layouts work at mobile, tablet, and desktop widths. Prioritize the smallest viewport for navigation, product galleries, variant selection, forms, and checkout controls.
- Use semantic elements, keyboard-operable controls, visible focus states, descriptive labels, meaningful image alternatives, and accessible status feedback. Preserve adequate contrast and touch target sizes.
- Load images at appropriate sizes and aspect ratios. Set intrinsic dimensions to avoid layout shifts, use responsive sources when supported, lazy-load below-the-fold media, and prioritize the actual above-the-fold hero image. Do not let decorative motion or oversized media delay core content.

## Motion and scrolling

- Prefer the animation tools already installed. Use GSAP and ScrollTrigger when they fit the current app; scope animations to their component or route and clean up timelines, listeners, and triggers on teardown.
- Add Lenis only when it is compatible with the app's routing, focus handling, keyboard scrolling, native links, and ScrollTrigger setup. Keep native scrolling if smooth scrolling would make these behaviors less reliable.
- Make the content understandable and usable without animation. Respect `prefers-reduced-motion`, offer reduced or immediate transitions, and avoid scroll hijacking, motion that blocks interaction, or animation on every element.

## Finish

Check the changed views at representative mobile and desktop sizes. Run the relevant existing checks for the work performed, and report any unverified behavior or remaining visual defects accurately.
