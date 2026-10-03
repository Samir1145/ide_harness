# Specification: Super Admin Control Center & Telemetry Portal

- **Date:** 2026-10-02
- **Status:** Approved for Implementation Planning
- **Target Stack:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui, Lucide Icons, TanStack Table, Drizzle ORM, Neon Serverless PostgreSQL (`@neondatabase/serverless`), Vercel Deployment

---

## 1. Executive Summary

This specification defines the architecture, database schema, user interface, and security model for the **Hayagriva Super Admin Control Center**. 

The Super Admin Control Center serves as the central operational cockpit for the Hayagriva platform. It allows the Super Admin to monitor software downloads, manage registered advocates and law chambers, track billing and invoices, inspect real-time system/API logs, resolve support tickets, and execute user lifecycle actions (role changes, password resets, account suspension, and soft-deletion) backed by an immutable audit trail.

---

## 2. Platform Architecture & Ecosystem Data Flow

```mermaid
graph TD
    subgraph Client Journey
        Web[Public Web Portal<br/>Registration & App Download] -->|Registers Account| NeonDB[(Neon PostgreSQL Serverless)]
        Web -->|Downloads IDE Installer| Telemetry[Download Telemetry Tracker]
        Telemetry -->|Records OS, Version, Geo| NeonDB
        Laptop[Advocate Laptop App<br/>Hayagriva Desktop IDE] -->|Authenticates /api/auth/login| NeonDB
    end

    subgraph Super Admin Control Center (Vercel)
        Admin[Super Admin User] -->|Authenticates as SUPER_ADMIN| Guard[RBAC Middleware]
        Guard --> Dash[1. Dashboard /admin/dashboard]
        Guard --> Users[2. Users Directory /admin/users]
        Guard --> Logs[3. Overall Logs /admin/logs]
        Guard --> Invoices[4. Overall Invoices /admin/invoices]
        Guard --> Downloads[5. Download Analytics /admin/downloads]
        Guard --> Support[6. Support Tickets /admin/support]
        Guard --> Profile[7. Admin Profile /admin/profile]
        
        Dash --> Drizzle[Drizzle ORM Engine]
        Users --> Drizzle
        Logs --> Drizzle
        Invoices --> Drizzle
        Downloads --> Drizzle
        Support --> Drizzle
        Profile --> Drizzle
        Drizzle --> NeonDB
    end
```

---

## 3. Database Schema (PostgreSQL via Drizzle ORM)

### 3.1 `users` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `text` / `uuid` | Primary Key | Unique user identifier (e.g. `usr_98472`) |
| `name` | `varchar(255)` | Not Null | Advocate / User full name |
| `email` | `varchar(255)` | Not Null, Unique, Indexed | User email address (**Immutable after creation**) |
| `password_hash` | `text` | Not Null | SHA-256 / Bcrypt salted password hash |
| `role` | `varchar(50)` | Default `'ADVOCATE'` | `SUPER_ADMIN`, `ADMIN`, `ADVOCATE`, `CLIENT` |
| `status` | `varchar(50)` | Default `'ACTIVE'` | `ACTIVE`, `SUSPENDED`, `DEACTIVATED` |
| `plan` | `varchar(50)` | Default `'STARTER'` | `STARTER`, `PROFESSIONAL`, `ENTERPRISE` |
| `org` | `varchar(255)` | Nullable | Law Firm / Chamber Name |
| `avatar_url` | `text` | Nullable | Profile avatar URL or generated initials |
| `is_deleted` | `boolean` | Default `false` | Soft-deletion flag |
| `deleted_at` | `timestamp` | Nullable | Soft-deletion timestamp |
| `deleted_by` | `text` | Nullable | Admin ID who initiated soft-deletion |
| `created_at` | `timestamp` | Default `now()` | Registration timestamp |
| `updated_at` | `timestamp` | Default `now()` | Last modification timestamp |

### 3.2 `system_logs` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key | Auto-increment log ID |
| `user_id` | `text` | Nullable, Indexed | Associated user ID (if authenticated) |
| `method` | `varchar(10)` | Not Null | HTTP Method (`GET`, `POST`, `PUT`, `DELETE`) |
| `endpoint` | `varchar(255)` | Not Null | API Endpoint path |
| `status_code` | `integer` | Not Null, Indexed | HTTP Status Code (200, 400, 401, 500) |
| `response_time_ms` | `integer` | Not Null | Execution duration in milliseconds |
| `ip_address` | `varchar(45)` | Not Null | Client IP address |
| `user_agent` | `text` | Nullable | Client user agent string |
| `created_at` | `timestamp` | Default `now()`, Indexed | Timestamp of API event |

### 3.3 `invoices` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `text` | Primary Key | Invoice ID (e.g. `INV-2026-0042`) |
| `user_id` | `text` | Not Null, Indexed | Reference to `users.id` |
| `user_name` | `varchar(255)` | Not Null | Denormalized user name |
| `user_email` | `varchar(255)` | Not Null | Denormalized user email |
| `amount_inr` | `numeric(10,2)` | Not Null | Total invoice amount in INR |
| `status` | `varchar(50)` | Default `'PAID'` | `PAID`, `PENDING`, `OVERDUE`, `REFUNDED` |
| `plan_tier` | `varchar(50)` | Not Null | Associated plan tier |
| `pdf_url` | `text` | Nullable | Download link for invoice PDF |
| `issued_at` | `timestamp` | Default `now()` | Date invoice was generated |
| `paid_at` | `timestamp` | Nullable | Date payment was settled |

### 3.4 `download_telemetry` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key | Telemetry record ID |
| `platform` | `varchar(50)` | Not Null, Indexed | `MACOS_ARM64`, `MACOS_X64`, `WINDOWS_X64`, `LINUX_X64` |
| `app_version` | `varchar(50)` | Not Null, Indexed | Version downloaded (e.g. `1.2.0`, `1.2.1`) |
| `country_code` | `varchar(10)` | Default `'IN'` | ISO country code |
| `city` | `varchar(100)` | Nullable | City / Region |
| `ip_hash` | `varchar(64)` | Not Null | Anonymized IP hash |
| `downloaded_at` | `timestamp` | Default `now()`, Indexed | Timestamp of download |

### 3.5 `support_tickets` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `text` | Primary Key | Ticket ID (e.g. `TCK-1082`) |
| `user_id` | `text` | Not Null, Indexed | Submitting user ID |
| `user_name` | `varchar(255)` | Not Null | Submitter name |
| `user_email` | `varchar(255)` | Not Null | Submitter email |
| `subject` | `varchar(255)` | Not Null | Ticket headline |
| `description` | `text` | Not Null | Issue description |
| `priority` | `varchar(50)` | Default `'MEDIUM'` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `status` | `varchar(50)` | Default `'OPEN'` | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `created_at` | `timestamp` | Default `now()` | Created timestamp |
| `updated_at` | `timestamp` | Default `now()` | Last updated timestamp |

### 3.6 `admin_audit_logs` Table (Immutable Security Ledger)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key | Audit entry ID |
| `admin_id` | `text` | Not Null, Indexed | Super Admin user ID |
| `admin_email` | `varchar(255)` | Not Null | Super Admin email |
| `action` | `varchar(100)` | Not Null | Action name (e.g. `USER_SUSPENDED`, `USER_SOFT_DELETED`) |
| `target_user_id` | `text` | Nullable, Indexed | Affected user ID |
| `previous_state` | `jsonb` | Nullable | Snapshot before action |
| `new_state` | `jsonb` | Nullable | Snapshot after action |
| `ip_address` | `varchar(45)` | Not Null | Admin IP address |
| `created_at` | `timestamp` | Default `now()`, Indexed | Timestamp of audit entry |

---

## 4. UI Page Specifications & Feature Breakdown

### 4.1 Global Layout & Shell
- **Sidebar (`w-64`):**
  - Hayagriva Gold Stallion emblem + Title *"Control Center"*.
  - 7 Primary Navigation Links with route active highlights and badge counts:
    1. `Dashboard` (`/admin/dashboard`)
    2. `Users Management` (`/admin/users`)
    3. `Overall Logs` (`/admin/logs`)
    4. `Overall Invoices` (`/admin/invoices`)
    5. `Download Analytics` (`/admin/downloads`)
    6. `Support Tickets` (`/admin/support`)
    7. `Profile & Security` (`/admin/profile`)
  - Bottom Footer: Live database connection badge (`🟢 Neon PostgreSQL Connected`) + Light/Dark mode toggle (`next-themes`).
- **Top Header Bar (`h-14`):**
  - Global Search Input (quick search by user name, email, invoice ID, or ticket).
  - Notifications Bell Drawer with unread alert badge.
  - Super Admin profile pill with role badge (`SUPER_ADMIN`) and Sign Out menu.

### 4.2 Page Details
1. **Executive Dashboard (`/admin/dashboard`):**
   - **Download Counter Card:** Total downloads count, breakdown by OS, and +14.2% growth badge.
   - **Active Users Card:** Total active user count, breakdown bar (Active / Suspended / Deactivated).
   - **Revenue Card:** Total revenue in INR (`₹XX,XX,XXX`) with 30-day interactive sparkline trend.
   - **Quick Activity Stream:** Real-time feed of recent signups, failed logins, and administrative interventions.
2. **Users Management (`/admin/users` & `/admin/users/[id]/edit`):**
   - **Directory Datatable (`/admin/users`):**
     - Powered by `@tanstack/react-table`.
     - Global fuzzy search across names, emails, and chamber organizations.
     - Faceted column filters: Status (`Active`, `Suspended`, `Deactivated`), Role, Plan Tier.
     - Sorting on all columns and configurable pagination (10, 25, 50, 100 rows).
     - Row Action 1 (*View*): Opens slide-over drawer with user telemetry, recent activity, and linked invoices.
     - Row Action 2 (*Edit*): Navigates to `/admin/users/[id]/edit`.
     - Row Action 3 (*Delete*): Soft-deletion modal prompt confirming deletion, setting `is_deleted = true`, and writing to `admin_audit_logs`.
   - **Edit User Page (`/admin/users/[id]/edit`):**
     - **Email Field:** Disabled and locked with a lock badge (*"Email address is immutable for security"*).
     - **Editable Fields:** Name, Role dropdown, Account Status dropdown.
     - **Quick Status Toggle:** Instant Suspend / Reactivate button with confirmation modal.
     - **Password Reset:** Generates a secure temporary password / one-time reset link with audit trail capture.
3. **Overall Logs (`/admin/logs`):**
   - Filterable table by HTTP status code (`200 OK`, `400 Bad Request`, `401 Unauthorized`, `500 Server Error`), HTTP Method (`GET`, `POST`, `PUT`, `DELETE`), User ID, and date range.
   - Visual telemetry summary: Requests/minute, peak traffic time, top API consumers.
4. **Overall Invoices (`/admin/invoices`):**
   - Invoices datatable with filters for Status (`PAID`, `PENDING`, `OVERDUE`, `REFUNDED`), Date range, and User.
   - 1-Click PDF download and invoice inspection modal.
5. **Apps Download Analytics (`/admin/downloads`):**
   - Platform distribution chart: macOS Apple Silicon (ARM64), macOS Intel (x64), Windows x64, Linux x64.
   - Version adoption bar chart: Tracking release adoption across versions.
   - Geographic distribution map/table.
6. **Support Tickets Desk (`/admin/support`):**
   - Ticket management view with Priority tags (`Urgent`, `High`, `Medium`, `Low`) and Status workflows (`Open` -> `In Progress` -> `Resolved` -> `Closed`).
   - Quick reply and ticket resolution drawer.
7. **Super Admin Profile (`/admin/profile`):**
   - Admin account details, 2FA toggle, active session device list, and immutable audit logs table.

---

## 5. Security, RBAC & Vercel/Neon Compatibility

1. **RBAC Middleware (`middleware.ts`):**
   - Restricts all `/admin/*` and `/api/admin/*` routes to authenticated requests carrying `role === 'SUPER_ADMIN'`.
   - Unauthorized requests are redirected to `/login` with an error toast.
2. **Serverless Neon PostgreSQL Integration:**
   - Powered by `@neondatabase/serverless` and Drizzle ORM HTTP adapter (`drizzle-orm/neon-http`).
   - Zero persistent TCP connection exhaustion on Vercel serverless free tier functions.
   - Built-in in-memory fallback seed database for offline local development and test runs.

---

## 6. Automated Testing & Verification Strategy

1. **API & Database Integration Tests (`tests/api_admin.test.ts`):**
   - Verifies users CRUD, pagination, locked email immutability, soft-deletion, and password reset.
   - Verifies audit log capture upon every administrative modification.
   - Verifies logs, invoices, download analytics, and support tickets endpoints.
2. **Playwright E2E Browser Test Suite (`tests/admin_e2e.spec.ts`):**
   - Tests navigation across all 7 sidebar views.
   - Tests TanStack table search, column filters, and pagination.
   - Tests soft-delete modal and edit user form controls.
   - Tests dark/light theme switching.
   - Captures high-resolution visual evidence of all views.
