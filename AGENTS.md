# Project Engineering Rules

- Outbound Discord alerts may target only validated HTTPS webhook URLs on `discord.com`; this prevents user-controlled server requests to arbitrary hosts.
- Copilot chat requests accept one user message per turn, while model roles and instructions remain server-owned; this prevents callers from forging assistant history.