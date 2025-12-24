## Daybreak Design System (Frontend)

This app uses **Tailwind v4 + CSS variables** as the design system foundation.

### Where to edit tokens

- **Palette, radii, shadows, fonts**: `src/styles/tokens.css`
  - Light mode is defined in `:root`
  - Dark mode overrides are in `.dark`
  - Fonts:
    - **Display**: Lora (serif) for headings (`font-display`)
    - **Body**: Geist Sans for UI text (`font-sans`)
    - **Mono**: Geist Mono for numeric-heavy UI (`text-numeric`)

Everything in the UI should consume **semantic tokens** via Tailwind utilities like:

- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `text-muted-foreground`, `border-border`
- `bg-primary`, `text-primary-foreground`

Changing tokens in `tokens.css` propagates across the app without touching components.

### Global base + typography

- **Base styles**: `src/styles/base.css`
  - Tailwind v4 `@theme` mapping lives here (semantic tokens + minimal shadow scale).
  - Sets default body typography (14px, modern dense UI) and ring/border defaults.

- **Typography rules & utilities**: `src/styles/typography.css`
  - Provides consistent heading defaults and small utilities like:
    - `text-title`, `text-subtitle`
    - `text-ui`, `text-ui-muted`, `text-caption`

### Dark mode

Dark mode is class-based (via `next-themes`):

- Provider: `src/ui/theme/ThemeProvider.tsx`
- Toggle: `src/ui/theme/ThemeToggle.tsx`

### Icons

We use **Phosphor** (not Lucide) for a cleaner, distinctive icon style:

- Wrapper helper: `src/ui/icon.tsx`
- Prefer using `Icon` for consistent sizing in product UI.

### Storybook / Next.js compatibility

- Tokens are pure CSS variables (framework-agnostic).
- Theme is class-based (works in Storybook decorators, Next.js, Vite).
- UI primitives are regular React components with no runtime coupling to a specific router.


