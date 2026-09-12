# Hero Web Architecture

Enterprise Fleet & Machinery Platform rebuilt on:
- **Frontend**: React SPA (Vite + Axios + React Router v6)
- **Backend**: Django REST Framework + Django Channels + PostgreSQL + Redis
- **Multi-Tenant Isolation**: Vendor-scoped ORM querysets via `user.vendor`
- **Real-Time Telemetry**: WebSocket channel layer (`ws://.../ws/tracking/`)
- **FiberForce Integration**: External API synchronization client (`backend/apps/integrations/fiberforce/`)
