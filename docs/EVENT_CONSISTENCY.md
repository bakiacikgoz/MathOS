# Event consistency guarantee

SQLite `events` rows are the canonical event history. Recording an event commits its
SQLite row before attempting the `.mathos/events.jsonl` projection. A projection
append failure therefore does not turn a durable mutation into a reported failure;
it records `EVENT_PROJECTION_DEGRADED` and `mathos events rebuild` replaces JSONL
atomically from SQLite in durable `projection_order` (with `(timestamp, id)` as a
legacy fallback) order.

The current service layer does not yet place every domain mutation and its event row
in one SQLite transaction. A crash between those operations can leave a mutation
without its event, while a crash after the event row can leave JSONL behind (which is
detectable and rebuildable). New or migrated mutation paths should use a single
`DatabaseClient.unitOfWork` for the domain write and canonical event
insert, then project JSONL only after commit. This release guarantees DB-event-first
projection durability; it does not claim universal mutation/event atomicity.
