# Event consistency guarantee

SQLite `events` rows are the canonical event history. Recording an event commits its
SQLite row before attempting the `.mathos/events.jsonl` projection. A projection
append failure therefore does not turn a durable mutation into a reported failure;
it records `EVENT_PROJECTION_DEGRADED` and `mathos events rebuild` replaces JSONL
atomically from SQLite in durable `projection_order` (with `(timestamp, id)` as a
legacy fallback) order.

Canonical service state changes use `MutationRecorder.mutate`. The recorder places
all repository or orchestration-table writes for one semantic transition and its
primary SQLite event row in the same `DatabaseClient.unitOfWork`. This includes
research crash recovery and planner cursors, literature imports, team sessions,
round plans, execution leases, worker progress, and verified-artifact imports.
Consequently, a failed primary event insert rolls back its associated state change,
and a committed canonical state change has a committed semantic event.

Network, model, Lean, VCS, and other asynchronous provider calls occur outside the
SQLite unit of work. Their synchronous result-persistence transitions enter a new
short unit of work after the await completes. Secondary observational events may be
recorded after that commit. JSONL remains a rebuildable projection: a projection
failure can leave it behind SQLite, but cannot split canonical state from its primary
SQLite event.
