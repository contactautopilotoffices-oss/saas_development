# Component Contract & Layout Rules

> **Last Updated:** 2026-02-03  
> **Status:** ENFORCED - All PRs must comply

## 🎯 Purpose

This document defines **non-negotiable architectural rules** for component design and layout in this Next.js web application. These rules prevent layout bleed, ensure responsive design, and maintain consistent UI patterns.

---

## 📐 Core Layout Laws

### Law #1: Viewport Containment (CRITICAL)

**Rule:** Components MUST NEVER exceed viewport dimensions.

```tsx
// ❌ FORBIDDEN
<div style={{ width: '1200px' }}>  // Fixed width
<div className="w-[800px]">        // Fixed Tailwind width

// ✅ REQUIRED
<div className="w-full max-w-7xl mx-auto">  // Responsive with max-width
<div className="flex-1">                     // Flex-based sizing
```

**Enforcement:**
- No fixed `width` or `height` values except for:
  - Icons (w-4, w-5, etc.)
  - Avatars (w-10, w-12, etc.)
  - Media thumbnails (w-16, w-24, etc.)
- All containers use `max-width: 100%`
- Root elements use `overflow-x: hidden`

**Testing Requirement:**
Every component MUST be tested on:
- Small phone (375px width)
- Standard phone (414px width)
- Tablet (768px width)
- Desktop (1024px+ width)

Any horizontal scroll = **PR REJECTED**.

---

### Law #2: Full-Height Navigation (CRITICAL)

**Rule:** Navigation elements (sidebars, drawers) MUST span full viewport height.

```tsx
// ❌ FORBIDDEN
<aside className="h-auto">              // Content-based height
<aside style={{ height: '600px' }}>    // Fixed height

// ✅ REQUIRED
<aside className="h-screen sticky top-0">  // Full viewport height
<aside className="min-h-screen">           // Minimum full height
```

**Specific Requirements:**
- Sidebars: `h-screen` or `min-h-screen`
- Must use `position: sticky` with `top: 0`
- Background overlays: `fixed inset-0`
- No visible gaps at bottom of viewport

---

### Law #3: Responsive Design First (CRITICAL)

**Rule:** All layouts MUST be mobile-first with progressive enhancement.

```tsx
// ❌ FORBIDDEN - Desktop-first
<div className="grid grid-cols-4 md:grid-cols-2">

// ✅ REQUIRED - Mobile-first
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

**Breakpoint Usage:**
- `sm:` - 640px (small tablets)
- `md:` - 768px (tablets)
- `lg:` - 1024px (laptops)
- `xl:` - 1280px (desktops)
- `2xl:` - 1536px (large desktops)

---

## 🎫 Ticket Card Component Contract

### Standard Ticket Card Structure

**Purpose:** Display ticket information in list/grid views across all dashboards.

**Required Elements (in order):**

1. **Title** (max 2 lines, truncated)
2. **Priority Badge** (high/medium/low)
3. **Status Badge** (assigned/in_progress/completed)
4. **Assignee Info** (avatar + name, optional)
5. **Metadata Line** (ticket ID + date)
6. **Primary CTA** (View Ticket button)

**Forbidden Elements:**
- ❌ Duplicate descriptions
- ❌ Multiple CTAs on card face
- ❌ Debug information
- ❌ Secondary action buttons (use dropdown/modal)

### Component Variants

#### 1. **TicketListItem** (Standard)
**Use Case:** List view in dashboards (MST, Staff, Tenant, Property Admin)

```tsx
interface TicketListItemProps {
  ticket: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    ticket_number: string;
    created_at: string;
    assigned_to?: string;
    assignee?: { full_name: string };
    photo_before_url?: string;
  };
  currentUserId: string;
  onClick: (id: string) => void;
  onEdit?: (e: React.MouseEvent, ticket: Ticket) => void;
  isCompleted?: boolean;
}
```

**Layout:**
- Horizontal card with photo thumbnail (if available)
- Title + badges on top row
- Description (2 lines max)
- Metadata footer
- View button (right-aligned)

#### 2. **TicketCard** (Compact)
**Use Case:** Flow map, kanban boards, drag-and-drop interfaces

```tsx
interface TicketCardProps {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  assignedToName?: string;
  createdAt: string;
  skillTag?: 'technical' | 'electrical' | 'plumbing' | 'soft_services';
  onClick: () => void;
}
```

**Layout:**
- Vertical compact card
- ID + skill tag + priority (top row)
- Title (1 line)
- Time + assignee (bottom row)

#### 3. **ActiveTicketCard** (Detailed)
**Use Case:** MST active work view, detailed ticket display

```tsx
interface ActiveTicketCardProps {
  ticket: MstTicketView;
  onStartWork: () => Promise<void>;
  onPauseWork: () => void;
  onComplete: () => Promise<void>;
  onViewDetails: () => void;
  isLoading?: boolean;
}
```

**Layout:**
- Large card with status banner
- Full description
- Photo previews (before/after)
- Creator info
- Action buttons (Start/Pause/Complete)

---

## 🎨 Design System Rules

### Color Usage

**Priority Colors:**
```tsx
const priorityConfig = {
  low: { color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
  medium: { color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
  high: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
  critical: { color: 'text-error', bg: 'bg-error/10', border: 'border-error/20' },
};
```

**Status Colors:**
- `assigned` - Primary blue
- `in_progress` - Success green
- `paused` - Warning amber
- `completed/resolved` - Success green (muted)
- `waitlist/open` - Warning amber

### Typography

**Title Hierarchy:**
- List item title: `text-sm font-semibold`
- Card title: `text-sm font-semibold`
- Active card title: `text-xl font-bold`
- Modal title: `text-2xl font-bold`

**Description:**
- Always `text-xs` or `text-sm`
- Always `text-text-secondary` or `text-text-tertiary`
- Always `line-clamp-2` (2 lines max)

### Spacing

**Card Padding:**
- List item: `p-3`
- Compact card: `p-3`
- Active card: `p-5`

**Gap Between Elements:**
- Horizontal: `gap-2` or `gap-3`
- Vertical: `space-y-2` or `space-y-4`

---

## 🚫 Forbidden Patterns

### 1. Inline Component Definitions

**❌ FORBIDDEN:**
```tsx
// Inside MstDashboard.tsx
const TicketRow = ({ ticket }) => (
  <div>...</div>
);
```

**✅ REQUIRED:**
```tsx
// In shared/TicketListItem.tsx
export default function TicketListItem({ ticket }) {
  return <div>...</div>;
}

// In MstDashboard.tsx
import TicketListItem from '@/frontend/components/shared/TicketListItem';
```

### 2. Duplicate Component Logic

**❌ FORBIDDEN:**
- Same component defined in multiple files
- Copy-pasted JSX across dashboards

**✅ REQUIRED:**
- Single source of truth in `/frontend/components/shared/`
- Import and reuse

### 3. Fixed Dimensions

**❌ FORBIDDEN:**
```tsx
<div style={{ width: 800, height: 600 }}>
<div className="w-[1200px]">
```

**✅ REQUIRED:**
```tsx
<div className="w-full max-w-4xl">
<div className="h-screen">
```

---

## 📁 File Structure

```
frontend/components/
├── shared/                    # Shared components (NEW)
│   ├── TicketListItem.tsx    # Standard list view
│   ├── TicketCard.tsx        # Compact card (flow map)
│   └── ActiveTicketCard.tsx  # Detailed card (MST)
├── dashboard/
│   ├── MstDashboard.tsx
│   ├── StaffDashboard.tsx
│   ├── TenantDashboard.tsx
│   └── PropertyAdminDashboard.tsx
├── ops/
│   └── TicketFlowMap.tsx
└── mst/
    └── MstTicketDashboard.tsx
```

---

## ✅ PR Checklist

Before merging any component changes:

- [ ] No fixed widths/heights (except icons, avatars, thumbnails)
- [ ] All screens use `flex-1` or `h-screen`
- [ ] Navigation spans full viewport height
- [ ] No horizontal scroll on any device size
- [ ] Tested on small phone (375px)
- [ ] Tested on tablet (768px)
- [ ] Tested on desktop (1024px+)
- [ ] No duplicate component definitions
- [ ] Follows ticket card contract
- [ ] Uses design system colors/typography
- [ ] No inline styles (use Tailwind classes)

---

## 🔒 Enforcement

**Violations = Auto-Reject:**
1. Any viewport bleed
2. Fixed dimensions on layout elements
3. Sidebar not spanning full height
4. Duplicate component definitions
5. Non-responsive design

**Review Process:**
1. Automated checks (ESLint rules)
2. Visual regression testing
3. Manual device testing
4. Code review approval required

---

## 📚 References

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Next.js Best Practices](https://nextjs.org/docs)
- [Responsive Design Principles](https://web.dev/responsive-web-design-basics/)

---

**Document Owner:** Engineering Team  
**Last Review:** 2026-02-03  
**Next Review:** Monthly
