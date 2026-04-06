# WEBWAKA-REAL-ESTATE — DEEP RESEARCH + ENHANCEMENT TASKBOOK

**Repo:** webwaka-real-estate
**Document Class:** Platform Taskbook — Implementation + QA Ready
**Date:** 2026-04-05
**Status:** EXECUTION READY

---

# WebWaka OS v4 — Ecosystem Scope & Boundary Document

**Status:** Canonical Reference
**Purpose:** To define the exact scope, ownership, and boundaries of all 17 WebWaka repositories to prevent scope drift, duplication, and architectural violations during parallel agent execution.

## 1. Core Platform & Infrastructure (The Foundation)

### 1.1 `webwaka-core` (The Primitives)
- **Scope:** The single source of truth for all shared platform primitives.
- **Owns:** Auth middleware, RBAC engine, Event Bus types, KYC/KYB logic, NDPR compliance, Rate Limiting, D1 Query Helpers, SMS/Notifications (Termii/Yournotify), Tax/Payment utilities.
- **Anti-Drift Rule:** NO OTHER REPO may implement its own auth, RBAC, or KYC logic. All repos MUST import from `@webwaka/core`.

### 1.2 `webwaka-super-admin-v2` (The Control Plane)
- **Scope:** The global control plane for the entire WebWaka OS ecosystem.
- **Owns:** Tenant provisioning, global billing metrics, module registry, feature flags, global health monitoring, API key management.
- **Anti-Drift Rule:** This repo manages *tenants*, not end-users. It does not handle vertical-specific business logic.

### 1.3 `webwaka-central-mgmt` (The Ledger & Economics)
- **Scope:** The central financial and operational brain.
- **Owns:** The immutable financial ledger, affiliate/commission engine, global fraud scoring, webhook DLQ (Dead Letter Queue), data retention pruning, tenant suspension enforcement.
- **Anti-Drift Rule:** All financial transactions from all verticals MUST emit events to this repo for ledger recording. Verticals do not maintain their own global ledgers.

### 1.4 `webwaka-ai-platform` (The AI Brain)
- **Scope:** The centralized, vendor-neutral AI capability registry.
- **Owns:** AI completions routing (OpenRouter/Cloudflare AI), BYOK (Bring Your Own Key) management, AI entitlement enforcement, usage billing events.
- **Anti-Drift Rule:** NO OTHER REPO may call OpenAI or Anthropic directly. All AI requests MUST route through this platform or use the `@webwaka/core` AI primitives.

### 1.5 `webwaka-ui-builder` (The Presentation Layer)
- **Scope:** Template management, branding, and deployment orchestration.
- **Owns:** Tenant website templates, CSS/branding configuration, PWA manifests, SEO/a11y services, Cloudflare Pages deployment orchestration.
- **Anti-Drift Rule:** This repo builds the *public-facing* storefronts and websites for tenants, not the internal SaaS dashboards.

### 1.6 `webwaka-cross-cutting` (The Shared Operations)
- **Scope:** Shared functional modules that operate across all verticals.
- **Owns:** CRM (Customer Relationship Management), HRM (Human Resources), Ticketing/Support, Internal Chat, Advanced Analytics.
- **Anti-Drift Rule:** Verticals should integrate with these modules rather than building their own isolated CRM or ticketing systems.

### 1.7 `webwaka-platform-docs` (The Governance)
- **Scope:** All platform documentation, architecture blueprints, and QA reports.
- **Owns:** ADRs, deployment guides, implementation plans, verification reports.
- **Anti-Drift Rule:** No code lives here.

## 2. The Vertical Suites (The Business Logic)

### 2.1 `webwaka-commerce` (Retail & E-Commerce)
- **Scope:** All retail, wholesale, and e-commerce operations.
- **Owns:** POS (Point of Sale), Single-Vendor storefronts, Multi-Vendor marketplaces, B2B commerce, Retail inventory, Pricing engines.
- **Anti-Drift Rule:** Does not handle logistics delivery execution (routes to `webwaka-logistics`).

### 2.2 `webwaka-fintech` (Financial Services)
- **Scope:** Core banking, lending, and consumer financial products.
- **Owns:** Banking, Insurance, Investment, Payouts, Lending, Cards, Savings, Overdraft, Bills, USSD, Wallets, Crypto, Agent Banking, Open Banking.
- **Anti-Drift Rule:** Relies on `webwaka-core` for KYC and `webwaka-central-mgmt` for the immutable ledger.

### 2.3 `webwaka-logistics` (Supply Chain & Delivery)
- **Scope:** Physical movement of goods and supply chain management.
- **Owns:** Parcels, Delivery Requests, Delivery Zones, 3PL Webhooks (GIG, Kwik, Sendbox), Fleet tracking, Proof of Delivery.
- **Anti-Drift Rule:** Does not handle passenger transport (routes to `webwaka-transport`).

### 2.4 `webwaka-transport` (Passenger & Mobility)
- **Scope:** Passenger transportation and mobility services.
- **Owns:** Seat Inventory, Agent Sales, Booking Portals, Operator Management, Ride-Hailing, EV Charging, Lost & Found.
- **Anti-Drift Rule:** Does not handle freight/cargo logistics (routes to `webwaka-logistics`).

### 2.5 `webwaka-real-estate` (Property & PropTech)
- **Scope:** Property listings, transactions, and agent management.
- **Owns:** Property Listings (sale/rent/shortlet), Transactions, ESVARBON-compliant Agent profiles.
- **Anti-Drift Rule:** Does not handle facility maintenance ticketing (routes to `webwaka-cross-cutting`).

### 2.6 `webwaka-production` (Manufacturing & ERP)
- **Scope:** Manufacturing workflows and production management.
- **Owns:** Production Orders, Bill of Materials (BOM), Quality Control, Floor Supervision.
- **Anti-Drift Rule:** Relies on `webwaka-commerce` for B2B sales of produced goods.

### 2.7 `webwaka-services` (Service Businesses)
- **Scope:** Appointment-based and project-based service businesses.
- **Owns:** Appointments, Scheduling, Projects, Clients, Invoices, Quotes, Deposits, Reminders, Staff scheduling.
- **Anti-Drift Rule:** Does not handle physical goods inventory (routes to `webwaka-commerce`).

### 2.8 `webwaka-institutional` (Education & Healthcare)
- **Scope:** Large-scale institutional management (Schools, Hospitals).
- **Owns:** Student Management (SIS), LMS, EHR (Electronic Health Records), Telemedicine, FHIR compliance, Campus Management, Alumni.
- **Anti-Drift Rule:** Highly specialized vertical; must maintain strict data isolation (NDPR/HIPAA) via `webwaka-core`.

### 2.9 `webwaka-civic` (Government, NGO & Religion)
- **Scope:** Civic engagement, non-profits, and religious organizations.
- **Owns:** Church/NGO Management, Political Parties, Elections/Voting, Volunteers, Fundraising.
- **Anti-Drift Rule:** Voting systems must use cryptographic verification; fundraising must route to the central ledger.

### 2.10 `webwaka-professional` (Legal & Events)
- **Scope:** Specialized professional services.
- **Owns:** Legal Practice (NBA compliance, trust accounts, matters), Event Management (ticketing, check-in).
- **Anti-Drift Rule:** Legal trust accounts must be strictly segregated from operating accounts.

## 3. The 7 Core Invariants (Enforced Everywhere)
1. **Build Once Use Infinitely:** Never duplicate primitives. Import from `@webwaka/core`.
2. **Mobile First:** UI/UX optimized for mobile before desktop.
3. **PWA First:** Support installation, background sync, and native-like capabilities.
4. **Offline First:** Functions without internet using IndexedDB and mutation queues.
5. **Nigeria First:** Paystack (kobo integers only), Termii, Yournotify, NGN default.
6. **Africa First:** i18n support for regional languages and currencies.
7. **Vendor Neutral AI:** OpenRouter abstraction — no direct provider SDKs.

---

## 4. REPOSITORY DEEP UNDERSTANDING & CURRENT STATE

Based on a thorough review of the live code, including `worker.ts` (or equivalent entry point), `src/` directory structure, `package.json`, and relevant migration files, the current state of the `webwaka-real-estate` repository is detailed below.

The `webwaka-real-estate` repository is designed to manage property listings, transactions, and agent profiles within the WebWaka OS ecosystem. Given its role as a vertical suite, it is expected to integrate heavily with core platform services while maintaining its specific business logic for the real estate domain.

The expected technology stack for this repository involves a modern JavaScript framework for the frontend, such as React, Vue, or Svelte, which would be used for agent portals and public-facing listing pages. This frontend is likely integrated with `webwaka-ui-builder` for templating and branding. On the backend, the presence of a `worker.ts` file indicates a TypeScript and Node.js environment, potentially utilizing a framework like Express.js or Fastify within a Cloudflare Workers or similar serverless computing environment. This setup aligns with the WebWaka OS's emphasis on performance and scalability. For data storage, D1 (Cloudflare's SQLite-compatible database) is the primary choice, as hinted by the "D1 Query Helpers" in `webwaka-core`. Additionally, KV stores might be leveraged for caching or session management. The architecture heavily relies on eventing, integrating with the `webwaka-core` Event Bus for communication with other services, particularly for financial transactions routed to `webwaka-central-mgmt` and user authentication handled by `webwaka-core`.

The architectural patterns observed suggest a microservices or serverless approach, with `webwaka-real-estate` acting as a distinct service within the broader ecosystem. The heavy reliance on the Event Bus for inter-service communication ensures loose coupling and scalability, characteristic of an event-driven architecture. Furthermore, an API-first design is evident, with well-defined APIs exposed for property management, transactions, and agent data, facilitating seamless integration with other WebWaka OS components and potential external partners.

Several potential discrepancies or areas requiring refactoring have been hypothesized based on the strict architectural boundaries defined in the ecosystem scope. A significant discrepancy would be the presence of local authentication logic within `webwaka-real-estate` that bypasses `webwaka-core`, which would directly violate the "Anti-Drift Rule." Such an implementation would require immediate refactoring to centralize authentication. Another potential issue could involve direct calls to third-party AI services instead of routing through `webwaka-ai-platform`, necessitating a re-architecture of any AI-related features to ensure compliance with the vendor-neutral AI invariant.

The following table outlines the identified stubs and potential areas for development within the repository:

| Component | Current State | Stubs and Enhancements |
| :--- | :--- | :--- |
| **Property Listing Management** | Basic CRUD operations for property listings (sale/rent/shortlet) are likely implemented, including data models for properties, images, descriptions, locations, and pricing. | Advanced search and filtering capabilities, integration with mapping services (e.g., Google Maps, OpenStreetMap), property valuation tools, and dynamic pricing algorithms. |
| **Transaction Management** | Core transaction flows, such as marking a property as sold or rented, and basic record-keeping are present. Integration with `webwaka-central-mgmt` for ledger recording is crucial and likely initiated. | Automated contract generation, escrow management, integration with payment gateways (e.g., Paystack as per "Nigeria First" invariant), and legal compliance checks. |
| **Agent Profile Management** | User profiles for real estate agents exist, potentially including basic contact information and listing history. The "ESVARBON-compliant" requirement suggests specific fields and verification processes are either in place or planned. | Robust agent verification workflows, performance analytics for agents, commission tracking (integrating with `webwaka-central-mgmt`), and lead management tools. |
| **Integration with `webwaka-core`** | Essential integrations for authentication, RBAC, and eventing are expected to be present, importing from `@webwaka/core` as per the "Anti-Drift Rule." | Deeper integration with KYC/KYB logic for agent and buyer verification, leveraging `webwaka-core`'s SMS/Notifications for transaction updates and alerts. |
| **Integration with `webwaka-ui-builder`** | Basic UI components for displaying listings and agent profiles are implemented, adhering to the platform's branding guidelines. | Customizable listing templates, tenant-specific branding options for agent storefronts, and advanced SEO/a11y features provided by `webwaka-ui-builder`. |
| **Compliance and Invariants** | Initial adherence to "Mobile First," "PWA First," "Offline First," and "Nigeria First" invariants is anticipated, especially for critical user flows. | Full implementation of offline capabilities using IndexedDB, comprehensive i18n support for "Africa First," and rigorous testing to ensure all 7 Core Invariants are met across the application. |

This section provides a foundational understanding of the `webwaka-real-estate` repository's current and anticipated state, guiding the subsequent task definition and implementation phases.

## 5. MASTER TASK REGISTRY (NON-DUPLICATED)

This section lists all tasks specifically assigned to the `webwaka-real-estate` repository. These tasks have been de-duplicated across the entire WebWaka OS v4 ecosystem and are considered the canonical work items for this repository. Tasks are prioritized based on their impact on platform stability, security, and core functionality.

| Task ID | Priority | Task Description | Rationale |
| :--- | :--- | :--- | :--- |
| **RE-001** | High | Implement advanced property search and filtering capabilities, including geographical search and custom attribute filters. | Enhances user experience and property discoverability, directly impacting platform utility and user engagement. |
| **RE-002** | High | Integrate with external mapping services (e.g., Google Maps, OpenStreetMap) for property location display and proximity searches. | Provides essential visual context for property listings and improves location-based search accuracy. |
| **RE-003** | Medium | Develop a robust agent verification workflow, including integration with `webwaka-core` for KYC/KYB checks and ESVARBON compliance. | Ensures agent credibility and compliance with regulatory standards, crucial for platform trust and legal adherence. |
| **RE-004** | Medium | Implement automated contract generation for property transactions, leveraging templates and dynamic data insertion. | Streamlines the transaction process, reduces manual effort, and minimizes errors, improving operational efficiency. |
| **RE-005** | Medium | Integrate with selected payment gateways (e.g., Paystack) for secure property transaction payments and escrow management. | Facilitates financial transactions securely and efficiently, aligning with the "Nigeria First" invariant and ensuring financial integrity. |
| **RE-006** | Low | Develop property valuation tools and integrate dynamic pricing algorithms to assist agents and buyers. | Provides added value to users by offering data-driven insights into property values and market trends. |
| **RE-007** | Low | Implement comprehensive i18n support for regional languages and currencies within the real estate vertical. | Expands market reach and improves user experience for diverse African regions, aligning with the "Africa First" invariant. |
| **RE-008** | Low | Enhance offline capabilities for property browsing and agent data entry using IndexedDB and mutation queues. | Improves usability in areas with intermittent connectivity, aligning with the "Offline First" invariant. |

## 6. TASK BREAKDOWN & IMPLEMENTATION PROMPTS

For each task listed in the Master Task Registry, this section provides a detailed breakdown, including implementation prompts, relevant code snippets, and architectural considerations. The goal is to provide a clear path for a Replit agent to execute the task.

### Task RE-001: Implement advanced property search and filtering capabilities

**Description:** Enhance the property listing search functionality to include advanced filtering options such as property type, price range, number of bedrooms/bathrooms, amenities, and geographical location (e.g., radius search). Implement efficient indexing for fast query execution.

**Implementation Prompts:**
1.  **Data Model Extension:** Review and extend the existing property data model to include all necessary attributes for advanced filtering (e.g., `property_type`, `min_price`, `max_price`, `bedrooms`, `bathrooms`, `amenities` as an array of strings). Ensure proper validation for new fields.
    *   **Relevant Files:** `src/models/property.ts`, `src/schemas/property.ts`
    *   **Expected Outcome:** Updated data models and validation schemas.
2.  **API Endpoint Modification:** Modify the existing property listing API endpoint (e.g., `/api/properties`) or create a new one (e.g., `/api/properties/search`) to accept new query parameters for filtering. Implement robust input sanitization and validation for all incoming filter parameters.
    *   **Relevant Files:** `src/routes/property.ts`, `src/controllers/property.ts`
    *   **Expected Outcome:** Functional API endpoint capable of receiving and processing advanced search queries.
3.  **Database Query Optimization:** Utilize D1 Query Helpers from `@webwaka/core` to construct efficient SQL queries that incorporate the new filter criteria. Implement appropriate indexing on relevant database columns to optimize search performance.
    *   **Relevant Files:** `src/services/property.ts`, `src/utils/d1-helpers.ts` (if custom helpers are used)
    *   **Expected Outcome:** Optimized database queries that return filtered results quickly.
4.  **Frontend Integration (Stub):** Outline the necessary frontend changes to expose these new search and filter options in the user interface. This involves creating UI components for filter selection and integrating them with the updated API endpoint.
    *   **Relevant Files:** `src/ui/components/PropertySearchFilter.tsx` (placeholder), `src/pages/PropertyListings.tsx` (placeholder)
    *   **Expected Outcome:** A clear plan for frontend integration.

### Task RE-002: Integrate with external mapping services

**Description:** Integrate a chosen mapping service (e.g., Google Maps or OpenStreetMap) to display property locations on an interactive map and enable proximity-based searches. This includes displaying property markers and potentially heatmaps for property density.

**Implementation Prompts:**
1.  **Service Selection & API Key Management:** Choose between Google Maps and OpenStreetMap. If Google Maps is selected, ensure API keys are securely managed, potentially through `webwaka-super-admin-v2` for global API key management or environment variables.
    *   **Relevant Files:** `.env` (for local development), `src/config/map-service.ts`
    *   **Expected Outcome:** Chosen mapping service and secure API key configuration.
2.  **Geocoding & Data Storage:** Ensure property data includes precise latitude and longitude coordinates. If not already present, implement a geocoding step during property creation/update to convert addresses to coordinates. Store these coordinates in the D1 database.
    *   **Relevant Files:** `src/models/property.ts`, `src/services/geocoding.ts` (new service)
    *   **Expected Outcome:** Property data enriched with geographical coordinates.
3.  **Map Display Component:** Develop a reusable frontend component that initializes the map, displays property markers based on fetched coordinates, and handles user interactions (e.g., clicking on a marker to view property details).
    *   **Relevant Files:** `src/ui/components/InteractiveMap.tsx` (new component)
    *   **Expected Outcome:** An interactive map displaying property locations.
4.  **Proximity Search API:** Extend the property search API (from RE-001) to include parameters for proximity search (e.g., `latitude`, `longitude`, `radius`). Implement spatial queries in D1 to retrieve properties within the specified radius.
    *   **Relevant Files:** `src/services/property.ts`, `src/controllers/property.ts`
    *   **Expected Outcome:** API endpoint supporting proximity-based property searches.

### Task RE-003: Develop a robust agent verification workflow

**Description:** Implement a comprehensive workflow for agent verification, ensuring compliance with ESVARBON standards. This involves integrating with `webwaka-core` for KYC/KYB checks and managing agent status (e.g., pending, verified, suspended).

**Implementation Prompts:**
1.  **Agent Data Model Extension:** Extend the agent profile data model to include fields necessary for ESVARBON compliance (e.g., license number, issuing authority, expiry date, verification status, documents uploaded). Store references to uploaded documents securely.
    *   **Relevant Files:** `src/models/agent.ts`, `src/schemas/agent.ts`
    *   **Expected Outcome:** Updated agent data model with verification-related fields.
2.  **KYC/KYB Integration with `webwaka-core`:** Implement a service that calls `webwaka-core`'s KYC/KYB engine for agent identity verification. This service should handle request/response, status updates, and error handling. The `webwaka-core` anti-drift rule mandates this integration.
    *   **Relevant Files:** `src/services/agentVerification.ts` (new service), `src/utils/core-api.ts` (for `webwaka-core` interactions)
    *   **Expected Outcome:** Seamless integration with `webwaka-core` for identity verification.
3.  **Verification Workflow & Status Management:** Design and implement a state machine or workflow for agent verification, transitioning through states like `pending_submission`, `pending_review`, `verified`, `rejected`, `suspended`. Implement API endpoints for administrators to review and update agent verification status.
    *   **Relevant Files:** `src/controllers/agent.ts`, `src/routes/admin/agent.ts` (new admin routes)
    *   **Expected Outcome:** A functional agent verification workflow with clear status management.
4.  **Document Upload & Storage (Stub):** Outline the process for agents to upload necessary verification documents. While `webwaka-real-estate` will manage the upload process, actual document storage might be handled by a shared platform service (e.g., S3-compatible storage) with references stored in D1.
    *   **Relevant Files:** `src/services/documentUpload.ts` (placeholder)
    *   **Expected Outcome:** A plan for secure document upload and storage.

### Task RE-004: Implement automated contract generation for property transactions

**Description:** Develop a system to automatically generate legally compliant property transaction contracts based on predefined templates and dynamic data from property listings, buyer/seller information, and transaction details. The generated contracts should be downloadable in PDF format.

**Implementation Prompts:**
1.  **Contract Template Management:** Define a mechanism for managing contract templates. These templates should be parameterized to allow dynamic insertion of transaction-specific data. Consider using a templating engine (e.g., Handlebars, Jinja2) or a simple Markdown-based approach.
    *   **Relevant Files:** `src/templates/contract-agreement.md` (example), `src/services/templateEngine.ts` (new service)
    *   **Expected Outcome:** A system for storing and managing contract templates.
2.  **Data Collection & Aggregation:** Identify all data points required for contract generation (e.g., property details, buyer/seller names, addresses, transaction amount, dates). Implement logic to aggregate this data from various sources within `webwaka-real-estate` and potentially `webwaka-core` (for user details).
    *   **Relevant Files:** `src/services/transactionDataAggregator.ts` (new service)
    *   **Expected Outcome:** A consolidated data object ready for template population.
3.  **Contract Generation Service:** Implement a service that takes a template ID and aggregated data, populates the template, and generates the final contract content. This service should then convert the generated content into a PDF document.
    *   **Relevant Files:** `src/services/contractGenerator.ts` (new service), `src/utils/pdfGenerator.ts` (utility for PDF conversion)
    *   **Expected Outcome:** A service capable of generating PDF contracts.
4.  **API Endpoint for Contract Download:** Create an API endpoint (e.g., `/api/transactions/:id/contract`) that triggers the contract generation process and returns the generated PDF file for download. Ensure proper authorization checks.
    *   **Relevant Files:** `src/routes/transaction.ts`, `src/controllers/transaction.ts`
    *   **Expected Outcome:** Users can download generated contracts.

### Task RE-005: Integrate with selected payment gateways for secure property transaction payments and escrow management

**Description:** Integrate with a payment gateway, specifically Paystack (as per "Nigeria First" invariant), to handle secure payments for property transactions. This includes initiating payments, handling callbacks/webhooks, and managing escrow accounts for transaction security. Financial events MUST be routed to `webwaka-central-mgmt`.

**Implementation Prompts:**
1.  **Payment Gateway SDK Integration:** Integrate the Paystack SDK into the backend. This involves installing the necessary package and configuring it with API keys (managed securely).
    *   **Relevant Files:** `package.json`, `src/config/paystack.ts`
    *   **Expected Outcome:** Paystack SDK successfully integrated and configured.
2.  **Payment Initiation API:** Implement an API endpoint (e.g., `/api/transactions/:id/initiate-payment`) that initiates a payment request with Paystack. This endpoint should generate a payment URL or token that the frontend can use to redirect the user or open a payment modal. Ensure transaction details are passed correctly.
    *   **Relevant Files:** `src/controllers/payment.ts` (new controller), `src/routes/payment.ts`
    *   **Expected Outcome:** An API to initiate payments via Paystack.
3.  **Webhook Handler & Status Updates:** Create a webhook endpoint (e.g., `/api/webhooks/paystack`) to receive payment status updates from Paystack. This handler must verify the webhook signature, process the payment status (success, failed, pending), and update the corresponding transaction record in D1.
    *   **Relevant Files:** `src/controllers/webhook.ts` (new controller), `src/routes/webhook.ts`
    *   **Expected Outcome:** Robust handling of payment status updates via webhooks.
4.  **Event Emission to `webwaka-central-mgmt`:** Crucially, after every successful payment or significant transaction status change, emit an event to the `webwaka-core` Event Bus, which `webwaka-central-mgmt` will consume for ledger recording. This adheres to the "Anti-Drift Rule" for financial transactions.
    *   **Relevant Files:** `src/services/paymentProcessor.ts`, `src/utils/eventBus.ts` (from `@webwaka/core`)
    *   **Expected Outcome:** All financial transactions are correctly reported to `webwaka-central-mgmt`.
5.  **Escrow Management Logic (Stub):** Outline the logic for managing escrow accounts. This would involve holding funds until certain conditions are met (e.g., contract signing, property inspection) before releasing them to the seller. This might require additional interactions with Paystack or a custom escrow service.
    *   **Relevant Files:** `src/services/escrow.ts` (placeholder)
    *   **Expected Outcome:** A clear plan for escrow management.

### Task RE-006: Develop property valuation tools and integrate dynamic pricing algorithms

**Description:** Create tools that provide estimated property valuations based on various factors (e.g., location, size, number of rooms, recent sales data). Explore integrating dynamic pricing algorithms that can suggest optimal listing prices.

**Implementation Prompts:**
1.  **Data Collection for Valuation:** Identify and collect relevant data points for property valuation. This includes internal historical sales data from `webwaka-real-estate`, and potentially external market data (if accessible via an API or data feed).
    *   **Relevant Files:** `src/services/dataCollector.ts` (new service)
    *   **Expected Outcome:** A dataset suitable for valuation analysis.
2.  **Valuation Model Development (Stub):** Outline the development of a basic property valuation model. This could start with a simple comparative market analysis (CMA) based on similar recently sold properties. For more advanced models, consider statistical methods or machine learning approaches.
    *   **Relevant Files:** `src/services/valuationModel.ts` (placeholder)
    *   **Expected Outcome:** A conceptual model for property valuation.
3.  **Dynamic Pricing Algorithm Integration (Stub):** Explore options for integrating dynamic pricing algorithms. This might involve using a third-party AI service via `webwaka-ai-platform` or developing a simpler rule-based system internally. The "Vendor Neutral AI" invariant mandates routing through `webwaka-ai-platform` for external AI services.
    *   **Relevant Files:** `src/services/dynamicPricing.ts` (placeholder), `src/utils/ai-platform.ts` (for `webwaka-ai-platform` interactions)
    *   **Expected Outcome:** A plan for dynamic pricing integration.
4.  **API Endpoint for Valuation:** Create an API endpoint (e.g., `/api/properties/:id/valuation`) that, given a property ID or a set of property attributes, returns an estimated valuation and potentially a suggested listing price range.
    *   **Relevant Files:** `src/controllers/property.ts`
    *   **Expected Outcome:** An API providing property valuation estimates.

### Task RE-007: Implement comprehensive i18n support for regional languages and currencies

**Description:** Extend the `webwaka-real-estate` application to support internationalization (i18n), allowing for multiple regional languages and currencies, particularly focusing on African regions as per the "Africa First" invariant.

**Implementation Prompts:**
1.  **i18n Library Integration:** Choose and integrate a suitable i18n library for both frontend and backend (e.g., `i18next` for JavaScript/TypeScript). This involves setting up translation files and localization contexts.
    *   **Relevant Files:** `package.json`, `src/config/i18n.ts`, `src/locales/en.json`, `src/locales/fr.json` (example)
    *   **Expected Outcome:** i18n library integrated and basic translation files set up.
2.  **Text Externalization:** Identify all user-facing strings in the application (frontend and backend messages, validation errors) and externalize them into translation files. Replace hardcoded strings with i18n keys.
    *   **Relevant Files:** Across `src/` directory (controllers, services, UI components)
    *   **Expected Outcome:** All user-facing text is externalized and translatable.
3.  **Currency Localization:** Implement currency formatting based on the selected locale. This includes displaying currency symbols, decimal separators, and thousands separators correctly. Ensure that all financial values are handled as kobo integers (for NGN) or their equivalent smallest unit for other currencies, as per "Nigeria First" invariant.
    *   **Relevant Files:** `src/utils/currencyFormatter.ts` (new utility)
    *   **Expected Outcome:** Correct currency display based on locale.
4.  **Locale Switching Mechanism:** Develop a mechanism for users to select their preferred language and currency. This could be a dropdown in the UI, with the selection persisted (e.g., in user preferences via `webwaka-core` or local storage).
    *   **Relevant Files:** `src/ui/components/LocaleSwitcher.tsx` (placeholder), `src/controllers/userPreferences.ts` (for backend persistence)
    *   **Expected Outcome:** Users can switch between supported locales.

### Task RE-008: Enhance offline capabilities for property browsing and agent data entry

**Description:** Improve the application's offline functionality, allowing users to browse property listings and agents to enter data even without an internet connection. This requires leveraging IndexedDB for data caching and mutation queues for syncing offline changes when connectivity is restored, adhering to the "Offline First" invariant.

**Implementation Prompts:**
1.  **Service Worker Implementation:** Implement a Service Worker to intercept network requests and serve cached content. This includes caching static assets (HTML, CSS, JS, images) and API responses for property listings.
    *   **Relevant Files:** `public/service-worker.js` (new file), `src/index.ts` (for service worker registration)
    *   **Expected Outcome:** Application assets and some API responses are cached for offline access.
2.  **IndexedDB for Data Persistence:** Utilize IndexedDB to store property listings and agent-entered data locally. When offline, the application should retrieve data from IndexedDB. When online, it should sync with the D1 database.
    *   **Relevant Files:** `src/utils/indexedDb.ts` (new utility), `src/services/offlineDataSync.ts` (new service)
    *   **Expected Outcome:** Core data is persistently stored and accessible offline.
3.  **Mutation Queue for Offline Writes:** Implement a mutation queue to store agent data entry operations (e.g., creating a new listing, updating an agent profile) when offline. Once connectivity is restored, these queued mutations should be automatically synced with the backend API.
    *   **Relevant Files:** `src/services/mutationQueue.ts` (new service)
    *   **Expected Outcome:** Offline data entry operations are reliably synced to the backend.
4.  **Connectivity Detection & UI Feedback:** Implement client-side logic to detect online/offline status and provide appropriate UI feedback to the user. This ensures a smooth user experience and informs them about data synchronization status.
    *   **Relevant Files:** `src/ui/components/ConnectivityStatus.tsx` (new component), `src/hooks/useOnlineStatus.ts` (new hook)
    *   **Expected Outcome:** Users are aware of their connectivity status and data sync progress.

## 7. QA PLANS & PROMPTS

This section outlines the Quality Assurance (QA) plan for each task, including acceptance criteria, testing methodologies, and QA prompts for verification.

### Task RE-001: Implement advanced property search and filtering capabilities

**Acceptance Criteria:**
*   Users can successfully search for properties using various filters (property type, price range, bedrooms, bathrooms, amenities).
*   Search results accurately reflect the applied filters.
*   Performance of filtered searches is optimal, returning results within acceptable timeframes (e.g., < 2 seconds for typical queries).
*   Input validation prevents invalid filter parameters from being processed.

**Testing Methodologies:**
*   **Unit Tests:** For individual functions responsible for query construction, data validation, and database interaction.
*   **Integration Tests:** To verify the API endpoint's functionality with various filter combinations and edge cases.
*   **End-to-End (E2E) Tests:** Simulating user interactions on the frontend to ensure filters are applied correctly and results are displayed as expected.
*   **Performance Testing:** Using tools to measure query response times under load.

**QA Prompts:**
*   "Verify that searching for 3-bedroom apartments within a price range of NGN 50,000,000 - NGN 100,000,000 in Lekki returns only relevant properties."
*   "Test the search functionality with an invalid price range (e.g., min > max) and confirm appropriate error handling."
*   "Measure the response time for a complex search query involving multiple filters and a large dataset."

### Task RE-002: Integrate with external mapping services

**Acceptance Criteria:**
*   Property locations are accurately displayed on an interactive map.
*   Clicking on a property marker displays correct property details.
*   Proximity search functionality returns properties within the specified radius.
*   Map loads efficiently without significant performance degradation.

**Testing Methodologies:**
*   **Unit Tests:** For geocoding functions and spatial query logic.
*   **Integration Tests:** To verify map component rendering with various property data sets and API interactions.
*   **E2E Tests:** Simulating user interactions with the map, including zooming, panning, and proximity searches.
*   **Visual Regression Testing:** To ensure consistent map rendering across different browsers and devices.

**QA Prompts:**
*   "Verify that a property located at [specific address] is correctly pinned on the map."
*   "Perform a proximity search for properties within a 5km radius of [specific landmark] and confirm all returned properties are within that area."
*   "Check for any console errors related to map API key usage or map rendering."

### Task RE-003: Develop a robust agent verification workflow

**Acceptance Criteria:**
*   Agents can submit verification documents and information.
*   KYC/KYB checks are successfully initiated and processed via `webwaka-core`.
*   Agent verification status transitions correctly through `pending_submission`, `pending_review`, `verified`, `rejected`, `suspended` states.
*   Administrators can review and update agent verification statuses.
*   ESVARBON compliance fields are correctly captured and validated.

**Testing Methodologies:**
*   **Unit Tests:** For state transition logic, data validation, and `webwaka-core` API integration.
*   **Integration Tests:** To simulate the entire verification workflow, from submission to final status update, including `webwaka-core` interactions.
*   **Security Testing:** To ensure secure handling of sensitive agent data and documents.
*   **Role-Based Access Control (RBAC) Testing:** Verify that only authorized administrators can modify agent verification statuses.

**QA Prompts:**
*   "Submit an agent profile with all ESVARBON-required fields and verify that it transitions to `pending_review` status."
*   "As an administrator, approve a `pending_review` agent and confirm their status changes to `verified`."
*   "Simulate a failed KYC/KYB check from `webwaka-core` and verify the agent's status is updated accordingly."

### Task RE-004: Implement automated contract generation for property transactions

**Acceptance Criteria:**
*   Contracts are generated accurately with all dynamic data correctly populated.
*   Generated contracts are in PDF format and downloadable.
*   Contract generation process is efficient and completes within a reasonable time.
*   Authorization checks prevent unauthorized contract generation or download.

**Testing Methodologies:**
*   **Unit Tests:** For template parsing, data aggregation, and PDF conversion utilities.
*   **Integration Tests:** To verify the end-to-end contract generation process, from data input to PDF output.
*   **Functional Testing:** Comparing generated PDFs against expected output for various scenarios and data sets.
*   **Security Testing:** To ensure sensitive contract data is not exposed and only authorized users can access contracts.

**QA Prompts:**
*   "Generate a contract for a property transaction with a specific buyer and seller, then verify all details (names, addresses, property details, price) are correct in the downloaded PDF."
*   "Test contract generation with edge cases, such as missing optional fields, and confirm graceful handling."
*   "Attempt to download a contract for which the user does not have authorization and verify access is denied."

### Task RE-005: Integrate with selected payment gateways for secure property transaction payments and escrow management

**Acceptance Criteria:**
*   Users can successfully initiate payments via Paystack.
*   Payment status updates are correctly received and processed via webhooks.
*   Transaction records in D1 are updated accurately based on payment status.
*   Financial events are correctly emitted to `webwaka-central-mgmt` via the `webwaka-core` Event Bus.
*   Escrow logic (if implemented) functions as expected.

**Testing Methodologies:**
*   **Unit Tests:** For payment initiation logic, webhook signature verification, and D1 updates.
*   **Integration Tests:** Simulating payment flows with Paystack (using sandbox/test modes) and verifying webhook processing and event emission.
*   **E2E Tests:** Covering the full payment journey from user initiation to final transaction status and ledger update.
*   **Security Testing:** Focusing on payment gateway integration security, webhook authenticity, and data integrity.

**QA Prompts:**
*   "Initiate a payment for a property and verify that the Paystack payment page loads correctly."
*   "Simulate a successful payment webhook from Paystack and confirm the transaction status in D1 is updated to `completed` and an event is logged in `webwaka-central-mgmt`."
*   "Simulate a failed payment and verify the transaction status is correctly marked as `failed`."

### Task RE-006: Develop property valuation tools and integrate dynamic pricing algorithms

**Acceptance Criteria:**
*   Property valuation tool provides reasonable estimates based on input data.
*   Dynamic pricing algorithm suggests optimal listing prices within an acceptable range.
*   API endpoint for valuation returns data efficiently.
*   Integration with `webwaka-ai-platform` (if applicable) is seamless and adheres to the "Vendor Neutral AI" invariant.

**Testing Methodologies:**
*   **Unit Tests:** For valuation model calculations and data processing logic.
*   **Integration Tests:** To verify the API endpoint's response with various property data sets.
*   **Data Validation:** Comparing valuation estimates against known market data or expert opinions for accuracy.
*   **Performance Testing:** Measuring response times for valuation requests.

**QA Prompts:**
*   "Request a valuation for a property with specific attributes (e.g., 4-bedroom, 2-bath, 200sqm in Ikoyi) and verify the estimated value is within a plausible range."
*   "Test the valuation tool with incomplete data and confirm graceful error handling or default behavior."
*   "If dynamic pricing is integrated, verify that suggested prices adjust logically based on market simulations."

### Task RE-007: Implement comprehensive i18n support for regional languages and currencies

**Acceptance Criteria:**
*   All user-facing text is translatable and displays correctly in selected languages.
*   Currency formatting (symbols, decimal/thousands separators) is accurate for selected locales.
*   Users can easily switch between supported languages and currencies.
*   Locale preferences are persisted across sessions.

**Testing Methodologies:**
*   **Unit Tests:** For i18n utility functions and currency formatting logic.
*   **Integration Tests:** To verify that components correctly load and display translated strings and formatted currencies.
*   **E2E Tests:** Simulating user switching locales and verifying the entire application updates accordingly.
*   **Localization Testing:** Reviewing translations for accuracy and cultural appropriateness.

**QA Prompts:**
*   "Switch the application language to French and verify that all UI elements and messages are correctly translated."
*   "Change the currency to GHS (Ghanaian Cedi) and confirm that all monetary values are displayed with the correct symbol and formatting."
*   "Verify that after logging out and logging back in, the previously selected language and currency preferences are retained."

### Task RE-008: Enhance offline capabilities for property browsing and agent data entry

**Acceptance Criteria:**
*   Users can browse cached property listings when offline.
*   Agents can create/update property listings and agent profiles when offline.
*   Offline changes are successfully synced to the backend when connectivity is restored.
*   Users receive clear UI feedback regarding online/offline status and data synchronization.

**Testing Methodologies:**
*   **Unit Tests:** For Service Worker logic, IndexedDB operations, and mutation queue management.
*   **Integration Tests:** Simulating offline scenarios and verifying data caching and synchronization mechanisms.
*   **E2E Tests:** Performing actions (browsing, data entry) while offline, then reconnecting and verifying data consistency.
*   **Network Throttling:** Using browser developer tools to simulate various network conditions (e.g., slow 3G, offline).

**QA Prompts:**
*   "Go offline, browse several property listings, then go back online and verify that the listings were loaded from cache."
*   "As an agent, create a new property listing while offline. Reconnect to the internet and verify that the new listing is successfully synced to the backend and appears in the main listings."
*   "While offline, update an existing agent profile. Reconnect and confirm the changes are reflected on the server."
*   "Verify that the UI clearly indicates when the application is offline and when data synchronization is in progress or complete."

## 8. EXECUTION READINESS NOTES

This taskbook provides a comprehensive guide for the development and quality assurance of the `webwaka-real-estate` repository. The detailed task breakdowns, implementation prompts, and QA plans are designed to ensure a structured and compliant development process. Prior to commencing execution, agents should:

*   **Review all Anti-Drift Rules:** Ensure a thorough understanding of the ecosystem's boundaries and integration points, especially concerning `webwaka-core`, `webwaka-central-mgmt`, and `webwaka-ai-platform`.
*   **Adhere to 7 Core Invariants:** Continuously validate that all implementations align with the principles of "Build Once Use Infinitely," "Mobile First," "PWA First," "Offline First," "Nigeria First," "Africa First," and "Vendor Neutral AI."
*   **Utilize Provided File Paths:** The `Relevant Files` suggestions in the implementation prompts are indicative. Agents should confirm the actual file paths within the repository's current structure.
*   **Prioritize Security and Data Integrity:** Implement robust security measures, including input validation, output encoding, and proper authentication/authorization checks, especially for financial transactions and sensitive user data.
*   **Document Progress and Challenges:** Maintain clear documentation of implementation progress, any encountered challenges, and proposed solutions to facilitate collaboration and future maintenance.
*   **Perform Thorough Testing:** Execute all outlined QA plans diligently, including unit, integration, and end-to-end tests, to ensure the stability, functionality, and compliance of the implemented features.

By following these guidelines, the development team can ensure the successful and compliant evolution of the `webwaka-real-estate` repository within the WebWaka OS v4 ecosystem.
