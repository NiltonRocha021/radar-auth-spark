# Architecture rules

- Every LIVE mode transition or financial execution must call the shared server-side safety guard, because UI checks are bypassable.
- Financial records and API credentials are written only by authenticated server functions using narrowly scoped privileged access, because browser writes are revoked.