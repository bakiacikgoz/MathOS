# ADR-013: MathOS 1.0 migration renumbering

## Status

Accepted because the implementation repository is ahead of the plan discovery base.

## Context

The MathOS 1.0 plan reserved migration names `017_context_registry` through `026_plugins_and_projections`. At implementation start, MathOS 0.2 already occupied migrations 017–020 for experiment security, verification authority, and event projection health. Reusing those identifiers would silently skip new schema on upgraded workspaces.

## Decision

Preserve every existing migration and append the equivalent MathOS 1.0 sequence as 021–030. The subsystem order and table boundaries remain the same. No migration is renamed, deleted, or rewritten.

## Consequences

Schema epoch becomes 30 after Task 1.2. Epoch-16 and current epoch-20 workspaces upgrade forward through the same immutable sequence. Rollback remains backup/restore or forward-fix; destructive down migrations are not introduced.
