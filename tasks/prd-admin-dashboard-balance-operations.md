Fix: Admin: expose dashboard stats, user lookup, and audit APIs
File: tasks/prd-admin-dashboard-balance-operations.md

Requirements:
1. [ ] Stats endpoint supports `24h`, `7d`, and `30d` windows.
2. [ ] Stats include DAU, WAU, new users, match count, completed/active matches, queue size, bot fallback match count, payment count, Stars total, credited EML, refunds, failed payment/refund count where data exists, and total `paid_elm`/`demo_teml` balances.
3. [ ] User search supports exact Telegram ID, exact account ID, exact SpacetimeDB identity, and partial display name.
4. [ ] User detail returns account ID, linked player identity, display name, balance kind, current balance, rating, wins, losses, online state, active match/queue state, and last relevant activity timestamp when available.
5. [ ] Audit endpoint returns recent immutable audit rows with filters.
6. [ ] Endpoints return structured errors for unauthorized, forbidden, invalid input, not found, conflict, and backend unavailable.
7. [ ] Tests cover admin access, non-admin denial, stats shape, user lookup modes, and audit filters.

Implementation:
TODO: Implement based on requirements above
