# Videx Component Specifications

> **Note:** This document was originally created as a pre-migration Figma/Pencil design reference. Color values and component names have been updated to reflect the current implementation. For the live design system, see `src/styles/globals.css`.

## Design Foundation

### Typography
- **Font Family:** DM Sans (via Google Fonts CDN) — weights 400, 500, 600, 700
- **Base Unit:** 4px grid system
- **Font sizes:** Set via `text-[Xpx]` Tailwind classes with inline `style={{ fontWeight }}` for precise control

### Color Palette (Dark Theme)
| Token | CSS Variable | Value | Usage |
|-------|-------------|-------|-------|
| Background | --background | #0a0a0f | Screen background |
| Secondary | --secondary | #1e1e2a | Elevated surfaces, cards |
| Card | --card | #12121a | Card backgrounds |
| Foreground | --foreground | #f0f0f5 | Primary text |
| Muted Foreground | --muted-foreground | #8585a0 | Secondary text |
| Primary | --primary | coral | Accent, buttons, highlights |
| Border | --border | #2a2a3a | Borders |
| Border Subtle | --border-subtle | #1e1e2e | Subtle dividers |

---

## Component Inventory (23 Components)

### Layout Components

#### GlassContainer
Glass morphism container with blur effect.

| Property | Value |
|----------|-------|
| Background | rgba(255, 255, 255, 0.05) |
| Border | 1px rgba(255, 255, 255, 0.15) |
| Border Radius | 12px (medium) |
| Blur Intensity | 80 |
| Padding | 16px |

#### GlassHeader
Header with gradient background and safe area.

| Property | Value |
|----------|-------|
| Height | 56px + safe area |
| Background | Linear gradient (transparent to black) |
| Blur | Yes |

#### BottomSheet
Modal that slides up from bottom.

| Property | Value |
|----------|-------|
| Background | #121212 |
| Border Radius (top) | 16px |
| Handle | 40x4px, #666666, centered |
| Max Height | 80% screen |

---

### Content Components

#### ContentCard
Movie/TV show poster card for horizontal lists.

| Property | Value |
|----------|-------|
| Width | 40% screen width |
| Aspect Ratio | 2:3 (poster) |
| Border Radius | 12px |
| Background | #1E1E1E |
| Shadow | 0 4px 12px rgba(0,0,0,0.3) |
| Title | Caption style, 2 lines max |
| Platform Badges | Bottom left, stacked |

**States:**
- Default: Static
- Pressed: scale(0.95), opacity(0.9)
- Loading: Skeleton shimmer

#### ServiceCard
Streaming service selection card.

| Property | Value |
|----------|-------|
| Size | Flexible, min 80px |
| Border Radius | 12px |
| Background (unselected) | #1E1E1E |
| Background (selected) | Platform color @ 15% opacity |
| Border (selected) | 2px platform color |
| Logo | Centered, 40px |

#### PlatformChip
Small platform indicator chip.

| Property | Value |
|----------|-------|
| Height | 28px |
| Padding | 8px 12px |
| Border Radius | 20px (pill) |
| Background | rgba(255, 255, 255, 0.1) |
| Border | 1px rgba(255, 255, 255, 0.15) |
| Text | Caption, 13px |
| Cost Badge (optional) | Right side, muted text |

#### PlatformBadge
Minimal platform indicator.

| Property | Value |
|----------|-------|
| Size | 28x28px |
| Border Radius | 6px |
| Background | Platform color |
| Content | Logo or first initial |

#### ProfileAvatar
User avatar with initials.

| Property | Value |
|----------|-------|
| Size | 80px (default), configurable |
| Shape | Circle |
| Background | Accent gradient |
| Text | Initials, white, bold |

---

### Filter & Search Components

#### SearchBar
Search input with clear button.

| Property | Value |
|----------|-------|
| Height | 44px |
| Border Radius | 12px |
| Background | rgba(255, 255, 255, 0.05) |
| Border | 1px rgba(255, 255, 255, 0.1) |
| Icon | Ionicons search, 20px, #666666 |
| Placeholder | #666666 |
| Text | #FFFFFF |
| Clear Button | X icon when has text |

#### FilterChip
Selectable filter tag.

| Property | Value |
|----------|-------|
| Height | 36px |
| Padding | 0 16px |
| Border Radius | 20px (pill) |
| Background (inactive) | #1E1E1E |
| Background (active) | #FF6B35 |
| Border | 1px rgba(255, 255, 255, 0.15) |
| Text (inactive) | #B3B3B3 |
| Text (active) | #000000 |
| Glow (active) | 0 0 10px rgba(255,107,53,0.4) |

#### FilterModal
Full-screen filter overlay.

| Property | Value |
|----------|-------|
| Layout | Bottom sheet pattern |
| Sections | Genre grid, Platform list, Rating slider, Cost toggle |
| Apply Button | Full width, accent color |
| Clear Button | Text button |

#### FilterSwitch
Toggle switch component.

| Property | Value |
|----------|-------|
| Track Size | 51x31px |
| Thumb Size | 27px circle |
| Track (off) | #3A3A3A |
| Track (on) | #FF6B35 |
| Thumb | #FFFFFF |
| Animation | 150ms ease |

#### RatingSlider
Rating filter with custom thumb.

| Property | Value |
|----------|-------|
| Track Height | 4px |
| Track (inactive) | #3A3A3A |
| Track (active) | #FF6B35 |
| Thumb | 24px circle, white |
| Labels | 0-10, metadata style |

---

### Display Components

#### RatingBadge
Score display for IMDb/Rotten Tomatoes.

| Property | Value |
|----------|-------|
| Height | 28px |
| Padding | 4px 8px |
| Border Radius | 6px |
| Background | #1E1E1E |
| Icon | Source logo (RT tomato, IMDb) |
| Text | Score + %, bold |

**Variants:**
- RT Fresh: Green tint
- RT Rotten: Red tint
- IMDb: Yellow tint

#### ProgressIndicator
Progress display (linear/circular/steps).

| Property | Value |
|----------|-------|
| Track | 4px, #3A3A3A |
| Fill | #FF6B35 |
| Linear Width | Full |
| Circular Size | 40px |

#### ProgressiveImage
Lazy-loaded image with placeholder.

| Property | Value |
|----------|-------|
| Placeholder | Blurred thumbnail |
| Transition | 200ms fade |
| Border Radius | Inherits from parent |

#### SkeletonLoader
Animated loading placeholder.

| Property | Value |
|----------|-------|
| Background | #1E1E1E |
| Shimmer | Linear gradient animation |
| Shimmer Color | rgba(255,255,255,0.1) |
| Animation | 1.5s infinite |

#### Toast
Non-blocking notification.

| Property | Value |
|----------|-------|
| Position | Bottom, 80px from edge |
| Background | #1E1E1E |
| Border Radius | 12px |
| Padding | 16px |
| Shadow | Elevated shadow |
| Animation | Slide up + fade |
| Auto-dismiss | 3 seconds |

---

### Error & Feedback Components

#### ErrorBoundary
Full-screen error catch display.

| Property | Value |
|----------|-------|
| Icon | Alert circle, 48px, #FF453A |
| Title | h3, centered |
| Message | body, #B3B3B3 |
| Retry Button | Primary button style |

#### ErrorMessage
Inline error display with retry.

| Property | Value |
|----------|-------|
| Container | GlassContainer |
| Icon | Alert circle, 48px, #FF453A |
| Title | h4, centered |
| Message | body, #B3B3B3, centered |
| Button | Accent, "Try Again" |

#### EmptyState
No content/results display.

| Property | Value |
|----------|-------|
| Icon | Context-appropriate, 64px, #666666 |
| Title | h3, centered |
| Subtitle | body, #B3B3B3, centered |
| Action (optional) | Secondary button |

#### EditableField
Inline editable text field.

| Property | Value |
|----------|-------|
| Display Mode | Label + Value |
| Edit Affordance | Pencil icon or tap indicator |
| Edit Mode | TextInput with save/cancel |

---

## Animation Specifications

### Press Feedback
```
Duration: 100ms
Scale: 0.95
Opacity: 0.9
Easing: ease-out
```

### Page Transitions
```
Duration: 300ms
Type: Slide from right
Easing: ease-in-out
```

### Modal Animations
```
Duration: 250ms
Type: Slide up + fade
Backdrop: Fade to rgba(0,0,0,0.7)
```

### Loading States
```
Skeleton shimmer: 1.5s infinite
Spinner: Native activity indicator
Pulse: 1s infinite opacity
```

---

## Responsive Breakpoints

| Device | Width | Columns |
|--------|-------|---------|
| iPhone SE | 375px | 2 |
| iPhone 14 | 390px | 2 |
| iPhone 14 Pro Max | 430px | 2 |
| iPad Mini | 744px | 3-4 |
| iPad Pro | 1024px | 4-6 |

---

## Export Notes for Pencil/Figma

1. **Fonts**: DM Sans via Google Fonts CDN (400, 500, 600, 700)
2. **Colors**: Use CSS variables defined in `src/styles/globals.css`
3. **Components**: Build as Figma components with variants
4. **Auto Layout**: Use for all containers (matches Flexbox)
5. **Constraints**: Set for responsive behavior
6. **Interactions**: Add press states in prototype mode
7. **Icons**: Lucide React icon set + custom SVGs in `icons.tsx`
