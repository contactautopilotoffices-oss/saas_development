# TICKET CARD CONTRACT

**Document Version:** 1.0  
**Status:** ENFORCED  
**Owner:** Senior Engineering

## 1. What TicketCard Is
`TicketCard` is the **single source of truth** for representing a ticket in any list or dashboard view across the Autopilot platform. It is a containerized, responsive element designed for rapid information scanning.

## 2. What TicketCard Is Not
- It is **not** a detailed view (no logs, no full history).
- It is **not** a complex interaction hub (no inline editing, no multiple checkboxes).
- It is **not** a layout container (it should not dictate the width of the screen).

## 3. Mandatory Content (The "Contract")
Every `TicketCard` must display exactly the following, in the prescribed hierarchy:

1.  **Title:** Primary identifier. Max 2 lines. Line-clamped.
2.  **Priority Badge:** (LOW, MEDIUM, HIGH, CRITICAL). Standardized color mapping.
3.  **Status Badge:** (OPEN, ASSIGNED, IN_PROGRESS, COMPLETED).
4.  **Assignee:** The full name of the current handler (if assigned).
5.  **Metadata:**
    *   Ticket ID (e.g., TKT-1234)
    *   Created Date (e.g., 03 Feb 2026)
6.  **Primary CTA:** Exactly **one** "View Ticket" button.

## 4. Forbidden Content
- ❌ **No Absolute Positioning:** Visual elements must not float over other content.
- ❌ **No Secondary Buttons:** No "Edit", "Quick Resolve", or "Pause" buttons in list view.
- ❌ **No Floating Icons:** No status circles or alert icons outside the badge system.
- ❌ **No Duplicate Descriptions:** Do not repeat the title content in a secondary text block.

## 5. Responsive Behavior

### Mobile (< 768px)
- Width: `w-full`.
- Layout: Vertical stack.
- Padding: `p-4`.
- Touch target for the button must be at least 44px height.

### Tablet (768px - 1024px)
- Usually rendered in a grid (2 columns) or full-width list.
- Component scales width to container.

### Desktop (> 1024px)
- Rendered in a grid (3+ columns) or constrained list.
- Maximum width should be dictated by the parent container, not the card itself.

---

## 6. Global Layout Enforcement
- **No Overflows:** Any ticket list that causes horizontal scrolling is a layout violation.
- **Single Action:** Clicking the card OR the "View Ticket" button performs the same action: navigating to the ticket detail view.

---
**Enforcement Rule:** Any PR introducing a new ticket card variant or modifying the `TicketCard` structure in violation of this contract will be **auto-rejected**.
