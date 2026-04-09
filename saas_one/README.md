# Autopilot — Facility Management Platform

> Facilities that run without constant follow-ups. Fewer complaints. Faster fixes. Clear accountability.
> The operating system for modern buildings.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [User Roles](#user-roles)
4. [Feature Modules](#feature-modules)
5. [Recent Updates](#recent-updates)
6. [Project Structure](#project-structure)
7. [Getting Started](#getting-started)

---

## Overview

Autopilot is a multi-tenant SaaS platform for end-to-end facility and property management. It supports multiple organizations, properties, and user roles — from Master Admins overseeing an entire portfolio to clients raising a single maintenance request.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (WebSocket) |
| Storage | Supabase Storage |
| Animations | Framer Motion |
| Charts | Recharts, Chart.js |
| PWA | Serwist (Service Worker) |
| Bundler | Webpack (production), Turbopack (dev) |

---

## User Roles

| Role | Description |
|---|---|
| **Master Admin** | System-wide oversight, org & user management, AI insights |
| **Org Super Admin** | Organization-level management across all properties |
| **Org Admin** | Organization configuration, reports, invitations |
| **Property Admin** | Full control of a single property |
| **Soft Service Manager** | Stock, SOP, QR code scanning |
| **MST (Maintenance Staff)** | Ticket execution, shift tracking, workload view |
| **Client** | Raise requests, track status, book rooms |
| **Super-Tenant** | Cross-property request tracking and analytics |
| **Staff (Operations)** | Visitor check-in, utility logging, request creation |
| **Security** | Visitor management, check-in/check-out |
| **Food Vendor** | Daily revenue entry, commission tracking |

---

## Feature Modules

### 1. Request & Ticket Management

- Full ticket lifecycle: Open → Assigned → In Progress → Resolved → Closed
- Priority levels: Low, Medium, High, Urgent
- SLA tracking with breach/risk alerts and pause functionality
- AI-powered automatic categorization with confidence scoring
- Department routing: Technical, Plumbing, Soft Services, Housekeeping, Vendor
- Before/After media uploads (photos and videos)
- Real-time commenting and activity log
- Post-completion star ratings and feedback
- Bulk CSV import and bulk assignment
- Snag/defect list bulk import with validation preview
- Floor hint in all description fields — users are prompted to include their floor number (e.g. *"Leaking tap in kitchenette, 2nd floor"*)

### 2. Flow Map (Kanban Board)

- Drag-and-drop ticket assignment across MST team lanes
- Waitlist, Technical, Plumbing, Housekeeping department lanes
- Real-time MST availability and workload indicators
- Ticket detail side panel with quick status updates
- MST history drawer with resolver performance stats

### 3. Maintenance Staff (MST) Management

- Three-view system: My Work | Department | All Requests
- Real-time check-in/check-out with heartbeat session management
- Resolver load scoring and intelligent task distribution
- Shift status indicator in navigation bar
- Workload visualization and performance metrics

### 4. Visitor Management System (VMS)

- Visitor check-in/check-out with real-time status
- Categories: employees, contractors, vendors, guests
- Contact capture, "coming from" and "whom to meet" fields
- Admin SPOC multi-property visitor overview
- Date-range filtering: today, week, month, custom
- Kiosk mode for self-service lobby check-in
- Organization-level VMS analytics

### 5. Diesel / Generator Management

- Daily fuel level logging (opening/closing hours, litres added)
- Multiple generators per property with capacity tracking
- Automatic consumption and cost calculation
- Tariff rate management per property
- Analytics: 7-day and 30-day trends, cost breakdown by generator
- Simplified staff logging interface
- CSV/PDF export for compliance reporting

### 6. Electricity Management

- Multiple electricity meters per property with multiplier support
- Daily meter reading logging with date tracking
- Grid tariff configuration and cost calculation
- Analytics: unit consumption and cost trends
- Combined electricity + diesel utilities dashboard
- Simplified staff logging interface
- Data export for billing and analysis

### 7. Stock & Inventory Management

- Full inventory CRUD: item code, name, quantity, unit, minimum threshold
- Intake/outflow movement tracking with user attribution and notes
- Low-stock alerts and threshold management
- QR Code generation and scanning for inventory items (camera integration)
- Bulk item import with validation
- Inventory valuation reports
- Movement history with time-range filters (today, this month, all time)

### 8. Cafeteria & Vendor Revenue

- Vendor profile management: shop name, owner, commission rate
- Daily revenue entry and submission by vendors
- Automatic commission calculation per revenue cycle
- Commission cycle management (start/end dates, payment tracking)
- Last Entry date column showing the most recent revenue entry per vendor
- Vendor self-service portal for revenue and commission history
- Organization-level revenue table: Property/Shop, Vendor, Comm %, Revenue, Last Entry, Commission
- CSV/PDF export with date-range and property filters

### 9. Standard Operating Procedures (SOP)

- Template management with checklist-based step structure
- Interactive checklist runner with step-by-step completion tracking
- Photo/video capture during SOP execution
- Comments on individual steps
- Completion history with ratings and quality feedback
- Role-based access: Admins manage templates, staff execute and view history

### 10. Meeting Rooms & Bookings

- Room CRUD: photo, location, capacity, size, amenities, status
- Booking calendar with availability checking
- Client-facing booking interface
- Admin booking management and cancellation
- Booking history per room and per user

### 11. Analytics & Reporting

| Report | Scope |
|---|---|
| Requests Report | Tickets by status, priority, department, time range |
| Diesel Report | Fuel consumption, cost trends, generator breakdown |
| Electricity Report | Unit consumption, cost trends, meter breakdown |
| Stock Report | Inventory valuation, movement history |
| Vendor Revenue Report | Revenue and commission analytics |
| Snag Report | Import batch tracking and ticket generation history |

All reports support CSV and PDF export with property and date-range filters.

### 12. Notification System

- Real-time in-app notification bell
- SLA breach and risk alerts
- Ticket assignment and status change notifications
- Web Push Notifications (browser-level) with subscription management
- App Permissions settings panel — users can enable/revoke notification and camera permissions from Settings, with step-by-step browser instructions for revoking

### 13. Authentication & Security

- Supabase Auth with session management
- Password reset and recovery flow
- Role-Based Access Control (RBAC) with 10+ roles
- PostgreSQL Row-Level Security (RLS) for multi-tenant data isolation
- Property-level and organization-level access enforcement

### 14. User & Organization Management

- User CRUD with role assignment per organization and property
- Email-based invitations and shareable invite links
- Property-code based self-service onboarding
- Multi-property user assignments
- Organization branding (logo, settings)
- Module availability toggle per property

### 15. Issue Configuration (AI Categorization)

- Category keyword management and confidence scoring
- Vague ticket detection tuning
- Issue code management with bulk seeding
- Per-property category configuration

### 16. Theme & Design

- Dark / Light mode toggle (persisted across sessions)
- Glassmorphism UI with Framer Motion animations
- Responsive design: desktop sidebar + mobile hamburger nav
- Custom HSL color palette (Emerald, Amber, Rose)
- Touch-optimized scroll and interactions for mobile
- PWA support (installable, service worker, offline-ready)

---

## Recent Updates

| # | Change | Details |
|---|---|---|
| 1 | **QR Code rename** | All UI labels changed from "Barcode" to "QR Code" across stock management |
| 2 | **This Month filter** | Dashboard filter renamed from "30 Days" to "This Month"; filtering now uses start of current calendar month instead of rolling 30 days |
| 3 | **App Permissions in Settings** | Notification and camera permission controls added to Settings page for all account types. Shows Enable / Enabled+Revoke / Blocked states with inline step-by-step browser instructions |
| 4 | **Floor hint in request boxes** | All request/ticket description textareas now prompt users to include their floor number (e.g. *"Example: Leaking tap in kitchenette, 2nd floor"*) |
| 5 | **Cafeteria last entry date** | Organization-level cafeteria revenue table now shows the most recent revenue entry date per vendor |
| 6 | **Client label on onboarding** | "Tenant" role renamed to "Client" on the onboarding role-selection screen |
| 7 | **SuperTenant request filters** | All/Mine toggle and status dropdown filters are now functional in the SuperTenant requests tab |
| 8 | **Build fix (Webpack)** | Production build switched from Turbopack to Webpack (`next build --webpack`) to resolve `next/font/google` and `@serwist/next` compatibility issues |

---

## Project Structure

```
saas_testing/
├── app/                          # Next.js App Router pages & API routes
│   ├── (dashboard)/              # Dashboard route group
│   ├── api/                      # Backend API routes
│   │   ├── tickets/
│   │   ├── properties/
│   │   ├── organizations/
│   │   ├── vms/
│   │   ├── vendors/
│   │   ├── stock/
│   │   ├── sop/
│   │   ├── meeting-rooms/
│   │   ├── web-push/
│   │   └── cron/
│   ├── login/
│   ├── onboarding/
│   ├── org/[orgId]/
│   └── property/[propertyId]/
│
├── frontend/
│   ├── components/
│   │   ├── dashboard/            # Role-specific dashboards
│   │   ├── tickets/              # Ticket create, list, detail components
│   │   ├── stock/                # Inventory & QR code components
│   │   ├── sop/                  # SOP templates & runner
│   │   ├── vms/                  # Visitor management
│   │   ├── analytics/            # Session tracking, cookie consent
│   │   ├── layout/               # Sidebar, navbar, context bar
│   │   ├── ops/                  # Notifications, flow map
│   │   └── ui/                   # Shared UI primitives
│   ├── context/                  # React contexts (Auth, Global, Theme, DataCache)
│   └── utils/                    # Supabase client, helpers
│
├── backend/
│   └── db/
│       ├── schema/               # SQL schema definitions
│       └── migrations/           # Database migrations
│
├── public/                       # Static assets, manifest, icons
├── next.config.ts
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with schema applied)
- Environment variables configured

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, etc.

# Start development server (Turbopack)
npm run dev

# Production build (Webpack)
npm run build
npm run start
```

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

*Built with Next.js · Supabase · Tailwind CSS · Framer Motion*
