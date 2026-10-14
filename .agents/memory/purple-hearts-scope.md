---
name: Purple Hearts scope
description: Product boundaries and deferred integrations for the Purple Hearts backend.
---

Purple Hearts is an 18+ campus-focused dating PWA. This repository is exclusively the backend; the frontend is being developed separately.

Phase 0 is foundation only. Firebase Authentication, Cloudflare R2, Socket.IO, and Paystack are future architecture, not Phase 0 implementations. Do not add placeholder integrations that appear functional or claim external services are connected. Do not automatically create paid services.

**Why:** The user explicitly defined the backend-only boundary and deferred these services to later phases.

**How to apply:** Keep backend foundation work scoped to API, configuration, PostgreSQL/Prisma setup, security, logging, and tests. Before implementing a deferred integration, treat it as a distinct follow-up phase.
