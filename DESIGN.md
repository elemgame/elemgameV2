# Design

## Theme

Elmental uses a dark volumetric fantasy-game theme. The physical scene is a player holding a phone during a short evening PvP session, with the arena glowing through layered game UI, so the app favors obsidian panels, readable warm text, and elemental highlights instead of white cards or flat neon.

## Color

Use OKLCH-first colors for new CSS tokens where practical.

- Surface base: obsidian blue-black, never pure black.
- Surface elevated: dark carved stone and smoky crystal plates.
- Text primary: warm ivory, never pure white.
- Accent primary: water blue for main actions and focus.
- Accent reward: warm gold for balance, rating, and premium actions.
- State success: verdant green.
- State danger: ember red.
- Element colors: earth ochre, fire ember, water blue, enhanced gold.

## Typography

Use Inter/system sans for the product UI. Keep labels compact, use tabular numbers for balances, timers, scores, and energy, and reserve large heavy type for result moments and the main play action.

## Raster Assets

- `apps/tma/src/assets/backgrounds/home-arena.png`: generated volumetric floating arena for home, matchmaking, profile, and settings atmosphere.
- `apps/tma/src/assets/backgrounds/match-board.png`: generated tactical board for the active match screen.
- Existing card PNG assets remain the move art source.

## Components

- Buttons use an 8 to 14px radius range, strong depth, and clear pressed states.
- Panels should feel like dark carved game UI plates, not white cards or generic glass.
- Segmented controls show selected state with border, background tint, and icon color.
- Match cards use real raster move art, stable dimensions, and visible cost labels.
- Loading and matchmaking use ambient arena motion, not abstract spinners.
- Balance actions are mobile-first and number-adjacent: top-up opens from a compact icon+label chip placed beside the balance digits, never as a detached bottom floating button.

## Layout

Design for a 430px-wide Telegram Mini App shell first. Keep vertical rhythm compact enough for small phones, but avoid cramped touch targets. Main actions sit near the thumb zone. Match state stays anchored at the top; move decisions stay stable in the lower half.

## Motion

Use short 150 to 250ms transitions for UI state. Longer ambient motion is allowed only for matchmaking or result celebration. Avoid layout animation that causes controls to jump.
