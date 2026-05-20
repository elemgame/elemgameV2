# Product

## Register

product

## Users

Telegram and web players testing a fast PvP elemental game on mobile. They open the app for short sessions, often on a phone, and need to understand their balance, match stake, game mode, energy state, opponent pressure, and next action without reading documentation.

## Product Purpose

Elmental is a public mechanics-testing instance for real-player PvP matchmaking. The interface should make elemental strategy feel tactile and premium while keeping the SpacetimeDB multiplayer flow clear: join queue, commit and reveal moves, read energy, finish the match, and inspect results.

## Brand Personality

Tactical, elemental, premium. The product should feel like a polished mobile card battler with clear game-state feedback, not a crypto dashboard or generic SaaS app.

## Anti-references

Avoid terminal-like Web3 dashboards, dark neon casino UI, flat placeholder cards, glassmorphism-heavy panels, tiny unreadable stats, decorative motion that hides state, and marketing landing-page composition inside the app.

## Design Principles

- Make the arena the stage: use raster game art and layered depth behind the main flow.
- Keep decisions legible: score, timer, energy, phase, and move cost must remain readable at phone size.
- One interaction vocabulary: buttons, toggles, segmented controls, cards, and states should look related across screens.
- Game polish serves state: motion, glow, and texture should communicate selection, pressure, result, or affordance.
- Backend trust stays visible: client UI waits for subscribed match updates and does not invent outcomes.

## Accessibility & Inclusion

Target strong mobile contrast and readable type at small sizes. Do not depend only on hue for critical state; pair color with labels, icons, and layout. Motion should be short and state-driven so reduced-motion users are not blocked.
