export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        main_objective_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        UNIQUE (workspace_id, name)
      );

      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        natural_statement TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      );

      CREATE TABLE IF NOT EXISTS dependencies (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        from_claim_id TEXT NOT NULL,
        to_claim_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (from_claim_id) REFERENCES claims(id),
        FOREIGN KEY (to_claim_id) REFERENCES claims(id)
      );

      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        artifact_ref TEXT,
        reproducible INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );

      CREATE TABLE IF NOT EXISTS blockers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        target_claim_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (target_claim_id) REFERENCES claims(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE INDEX IF NOT EXISTS idx_claims_workspace ON claims(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_deps_from ON dependencies(from_claim_id);
      CREATE INDEX IF NOT EXISTS idx_blockers_workspace ON blockers(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_events_workspace ON events(workspace_id, timestamp);
    `,
  },
  {
    id: "002_claim_provenance",
    sql: `
      ALTER TABLE claims ADD COLUMN original_input TEXT;
      ALTER TABLE claims ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE claims ADD COLUMN provider TEXT;
      ALTER TABLE claims ADD COLUMN model_name TEXT;
    `,
  },
  {
    id: "003_formal_layer",
    sql: `
      CREATE TABLE IF NOT EXISTS formal_statements (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'lean4',
        declaration_name TEXT NOT NULL,
        source_text TEXT NOT NULL,
        file_path TEXT,
        is_current INTEGER NOT NULL DEFAULT 1,
        verification_status TEXT NOT NULL,
        fidelity_status TEXT NOT NULL,
        created_by TEXT NOT NULL DEFAULT 'model',
        provider TEXT,
        model_name TEXT,
        lean_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );

      CREATE TABLE IF NOT EXISTS fidelity_reviews (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        formal_statement_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        findings_json TEXT NOT NULL DEFAULT '[]',
        natural_summary TEXT NOT NULL DEFAULT '',
        formal_back_translation TEXT NOT NULL DEFAULT '',
        reviewer_type TEXT NOT NULL DEFAULT 'model',
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (claim_id) REFERENCES claims(id),
        FOREIGN KEY (formal_statement_id) REFERENCES formal_statements(id)
      );

      CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        formal_statement_id TEXT NOT NULL,
        result TEXT NOT NULL,
        lean_version TEXT,
        toolchain TEXT,
        diagnostics_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (formal_statement_id) REFERENCES formal_statements(id)
      );

      CREATE INDEX IF NOT EXISTS idx_formal_claim ON formal_statements(claim_id, is_current);
      CREATE INDEX IF NOT EXISTS idx_fidelity_formal ON fidelity_reviews(formal_statement_id);
    `,
  },
  {
    id: "004_proof_attempts",
    sql: `
      CREATE TABLE IF NOT EXISTS proof_attempts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        formal_statement_id TEXT NOT NULL,
        status TEXT NOT NULL,
        proof_source TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        provider TEXT,
        model_name TEXT,
        lean_version TEXT,
        diagnostics_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (claim_id) REFERENCES claims(id),
        FOREIGN KEY (formal_statement_id) REFERENCES formal_statements(id)
      );

      ALTER TABLE verification_runs ADD COLUMN claim_id TEXT;
      ALTER TABLE verification_runs ADD COLUMN proof_attempt_id TEXT;
      ALTER TABLE verification_runs ADD COLUMN axioms_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_runs ADD COLUMN forbidden_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE verification_runs ADD COLUMN fidelity_status TEXT;
      ALTER TABLE verification_runs ADD COLUMN gate_json TEXT NOT NULL DEFAULT '[]';

      CREATE INDEX IF NOT EXISTS idx_proof_claim ON proof_attempts(claim_id, created_at);
    `,
  },
  {
    id: "005_proof_retrieval",
    sql: `
      ALTER TABLE proof_attempts ADD COLUMN retrieval_query TEXT;
      ALTER TABLE proof_attempts ADD COLUMN candidate_names_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE proof_attempts ADD COLUMN index_revision TEXT;
    `,
  },
  {
    id: "006_retrieval_mode",
    sql: `
      ALTER TABLE proof_attempts ADD COLUMN retrieval_mode TEXT;
    `,
  },
  {
    id: "007_retrieval_selection_provenance",
    sql: `
      ALTER TABLE proof_attempts ADD COLUMN retrieval_provenance_json TEXT;
    `,
  },
  {
    id: "008_research_branches",
    sql: `
      ALTER TABLE branches ADD COLUMN slug TEXT;
      ALTER TABLE branches ADD COLUMN parent_branch_id TEXT;
      ALTER TABLE branches ADD COLUMN purpose TEXT;
      ALTER TABLE branches ADD COLUMN updated_at TEXT;
      ALTER TABLE branches ADD COLUMN created_from_event_id TEXT;
      ALTER TABLE branches ADD COLUMN git_ref TEXT;
      ALTER TABLE branches ADD COLUMN worktree_path TEXT;
      ALTER TABLE branches ADD COLUMN stale_base INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE branches ADD COLUMN setup_state TEXT NOT NULL DEFAULT 'READY';

      CREATE TABLE IF NOT EXISTS claim_branch_visibility (
        branch_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (branch_id, claim_id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (claim_id) REFERENCES claims(id)
      );

      CREATE INDEX IF NOT EXISTS idx_visibility_branch ON claim_branch_visibility(branch_id);
      CREATE INDEX IF NOT EXISTS idx_branches_current ON branches(workspace_id, is_current);
    `,
  },
  {
    id: "009_research_loop",
    sql: `
      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        objective_claim_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT,
        stopped_at TEXT,
        current_step INTEGER NOT NULL DEFAULT 0,
        limits_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        stop_reason TEXT,
        strategy_json TEXT NOT NULL DEFAULT '{}',
        agent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS research_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        action TEXT NOT NULL,
        input_json TEXT NOT NULL DEFAULT '[]',
        result_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        summary TEXT,
        failure_class TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (run_id, sequence),
        UNIQUE (idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS research_blockers (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        claim_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_by_step_id TEXT,
        resolved_by_step_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS research_decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      ALTER TABLE claims ADD COLUMN created_by_run_id TEXT;
      ALTER TABLE claims ADD COLUMN created_by_step_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_runs_branch ON research_runs(workspace_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_steps_run ON research_steps(run_id, sequence);
    `,
  },
  {
    id: "010_research_hardening",
    sql: `
      ALTER TABLE research_blockers ADD COLUMN human_response TEXT;
      ALTER TABLE research_blockers ADD COLUMN resolved_by_human_at TEXT;
    `,
  },
  {
    id: "011_multi_agent_research",
    sql: `
      CREATE TABLE IF NOT EXISTS multi_agent_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_branch_id TEXT NOT NULL,
        source_revision TEXT,
        objective_claim_id TEXT NOT NULL,
        status TEXT NOT NULL,
        strategy TEXT NOT NULL,
        limits_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        current_round INTEGER NOT NULL DEFAULT 0,
        source_stale INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        stopped_at TEXT,
        stop_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS research_agents (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        research_run_id TEXT NOT NULL,
        local_claim_id TEXT NOT NULL,
        status TEXT NOT NULL,
        assignment_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS multi_agent_rounds (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        UNIQUE (session_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS solution_candidates (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        verification_run_id TEXT,
        formal_revision TEXT,
        discovered_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shared_digests (
        session_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        digest_json TEXT NOT NULL,
        PRIMARY KEY (session_id, round)
      );

      CREATE TABLE IF NOT EXISTS agent_round_progress (
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        PRIMARY KEY (session_id, sequence, agent_id)
      );
    `,
  },
  {
    id: "012_multi_agent_hardening",
    sql: `
      CREATE TABLE IF NOT EXISTS run_planners (
        run_id TEXT PRIMARY KEY,
        descriptor_json TEXT NOT NULL,
        cursor INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS verified_artifact_imports (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        source_agent_id TEXT NOT NULL,
        source_branch_id TEXT NOT NULL,
        target_agent_id TEXT NOT NULL,
        target_branch_id TEXT NOT NULL,
        source_claim_id TEXT NOT NULL,
        target_claim_id TEXT,
        source_verification_run_id TEXT,
        source_formal_revision TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_code TEXT,
        created_at TEXT NOT NULL,
        approved_at TEXT,
        applied_at TEXT
      );

      CREATE TABLE IF NOT EXISTS import_dependencies (
        import_id TEXT NOT NULL,
        claim_id TEXT NOT NULL,
        PRIMARY KEY (import_id, claim_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_solutions_agent ON solution_candidates(session_id, agent_id);
    `,
  },
  {
    id: "013_bounded_parallel_execution",
    sql: `
      ALTER TABLE multi_agent_sessions ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'SEQUENTIAL';
      ALTER TABLE multi_agent_sessions ADD COLUMN max_parallel_workers INTEGER NOT NULL DEFAULT 2;
      ALTER TABLE multi_agent_sessions ADD COLUMN pause_requested INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS id_allocators (
        prefix TEXT PRIMARY KEY,
        next_value INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_leases (
        lease_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        round_sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_active ON execution_leases(run_id) WHERE status IN ('RESERVED', 'RUNNING');

      CREATE TABLE IF NOT EXISTS budget_reservations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        amount INTEGER NOT NULL,
        round_sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS round_plans (
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        plan_json TEXT NOT NULL,
        PRIMARY KEY (session_id, sequence)
      );
    `,
  },
  {
    id: "014_computational_experiments",
    sql: `
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        claim_id TEXT,
        research_run_id TEXT,
        research_step_id TEXT,
        agent_id TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        hypothesis TEXT,
        runtime_json TEXT NOT NULL,
        code_artifact_id TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_experiments_branch ON experiments(branch_id);
      CREATE INDEX IF NOT EXISTS idx_experiments_claim ON experiments(claim_id);

      CREATE TABLE IF NOT EXISTS experiment_results (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        summary TEXT NOT NULL,
        structured_json TEXT NOT NULL,
        stdout_artifact_id TEXT,
        stderr_artifact_id TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        runtime_fingerprint TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        exact_arithmetic INTEGER NOT NULL,
        deterministic INTEGER NOT NULL,
        stdout_truncated INTEGER NOT NULL,
        stderr_truncated INTEGER NOT NULL,
        random_seed TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_experiment_results_exp ON experiment_results(experiment_id);
    `,
  },
  {
    id: "015_literature_sources",
    sql: `
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        authors_json TEXT NOT NULL,
        year INTEGER,
        venue TEXT,
        doi TEXT,
        arxiv_id TEXT,
        isbn TEXT,
        url TEXT,
        status TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        local_path TEXT,
        provider TEXT,
        provider_id TEXT,
        version TEXT,
        retrieved_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_fingerprint ON sources(workspace_id, fingerprint);

      CREATE TABLE IF NOT EXISTS source_excerpts (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        locator_json TEXT,
        text TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        extraction_method TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS external_results (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        excerpt_id TEXT,
        kind TEXT NOT NULL,
        name TEXT,
        statement_summary TEXT NOT NULL,
        statement_mode TEXT NOT NULL,
        locator_json TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_external_results_branch ON external_results(branch_id);

      CREATE TABLE IF NOT EXISTS citations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        claim_id TEXT,
        evidence_id TEXT,
        blocker_id TEXT,
        decision_id TEXT,
        research_run_id TEXT,
        research_step_id TEXT,
        external_result_id TEXT,
        excerpt_id TEXT,
        locator_json TEXT,
        purpose TEXT NOT NULL,
        invalidated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_citations_branch ON citations(branch_id);

      CREATE TABLE IF NOT EXISTS literature_searches (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        query TEXT NOT NULL,
        query_fingerprint TEXT NOT NULL,
        provider TEXT NOT NULL,
        target_claim_id TEXT,
        research_run_id TEXT,
        research_step_id TEXT,
        agent_id TEXT,
        result_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS literature_search_results (
        search_id TEXT NOT NULL,
        result_index INTEGER NOT NULL,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        authors_json TEXT NOT NULL,
        year INTEGER,
        doi TEXT,
        arxiv_id TEXT,
        url TEXT,
        abstract TEXT,
        score REAL,
        PRIMARY KEY (search_id, result_index)
      );
    `,
  },
  {
    id: "016_release_meta",
    sql: `
      CREATE TABLE IF NOT EXISTS mathos_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    id: "017_experiment_security",
    sql: `
      ALTER TABLE experiments ADD COLUMN origin TEXT NOT NULL DEFAULT 'MODEL_GENERATED';
      ALTER TABLE experiments ADD COLUMN sandbox_mode TEXT;
      ALTER TABLE experiments ADD COLUMN network_policy TEXT;
      ALTER TABLE experiments ADD COLUMN execution_policy_version TEXT;
    `,
  },
  {
    id: "018_kernel_verification_integrity",
    sql: `
      UPDATE claims
      SET status = 'FORMALIZED_UNVERIFIED'
      WHERE status = 'KERNEL_VERIFIED'
        AND NOT EXISTS (
          SELECT 1
          FROM verification_runs vr
          JOIN formal_statements fs ON fs.id = vr.formal_statement_id
          JOIN proof_attempts pa ON pa.id = vr.proof_attempt_id
          WHERE vr.claim_id = claims.id
            AND vr.result = 'KERNEL_ACCEPTED'
            AND length(trim(vr.gate_json)) > 2
            AND length(trim(vr.lean_version)) > 0 AND length(trim(vr.toolchain)) > 0
            AND vr.fidelity_status = 'HUMAN_APPROVED'
            AND fs.claim_id = claims.id AND fs.is_current = 1 AND fs.fidelity_status = 'HUMAN_APPROVED'
            AND pa.claim_id = claims.id AND pa.formal_statement_id = fs.id AND pa.status = 'KERNEL_ACCEPTED'
            AND NOT EXISTS (
              SELECT 1 FROM (
                SELECT 'current revision' AS name UNION ALL SELECT 'fidelity' UNION ALL
                SELECT 'proof compiles' UNION ALL SELECT 'forbidden constructs' UNION ALL
                SELECT 'custom axioms' UNION ALL SELECT 'Lean version' UNION ALL SELECT 'toolchain pinned'
              ) required
              WHERE NOT EXISTS (
                SELECT 1 FROM json_each(vr.gate_json) check_row
                WHERE json_extract(check_row.value, '$.name') = required.name
                  AND json_extract(check_row.value, '$.status') = 'PASS'
              )
            )
        );

      CREATE TRIGGER IF NOT EXISTS claims_kernel_verified_insert_guard
      BEFORE INSERT ON claims
      WHEN NEW.status = 'KERNEL_VERIFIED'
      BEGIN
        SELECT RAISE(ABORT, 'KERNEL_VERIFIED requires persisted VerificationGate evidence');
      END;

      CREATE TRIGGER IF NOT EXISTS claims_kernel_verified_update_guard
      BEFORE UPDATE OF status ON claims
      WHEN NEW.status = 'KERNEL_VERIFIED' AND OLD.status <> 'KERNEL_VERIFIED'
        AND NOT EXISTS (
          SELECT 1
          FROM verification_runs vr
          JOIN formal_statements fs ON fs.id = vr.formal_statement_id
          JOIN proof_attempts pa ON pa.id = vr.proof_attempt_id
          WHERE vr.claim_id = NEW.id
            AND vr.result = 'KERNEL_ACCEPTED'
            AND length(trim(vr.gate_json)) > 2
            AND length(trim(vr.lean_version)) > 0 AND length(trim(vr.toolchain)) > 0
            AND vr.fidelity_status = 'HUMAN_APPROVED'
            AND fs.claim_id = NEW.id AND fs.is_current = 1 AND fs.fidelity_status = 'HUMAN_APPROVED'
            AND pa.claim_id = NEW.id AND pa.formal_statement_id = fs.id AND pa.status = 'KERNEL_ACCEPTED'
            AND NOT EXISTS (
              SELECT 1 FROM (
                SELECT 'current revision' AS name UNION ALL SELECT 'fidelity' UNION ALL
                SELECT 'proof compiles' UNION ALL SELECT 'forbidden constructs' UNION ALL
                SELECT 'custom axioms' UNION ALL SELECT 'Lean version' UNION ALL SELECT 'toolchain pinned'
              ) required
              WHERE NOT EXISTS (
                SELECT 1 FROM json_each(vr.gate_json) check_row
                WHERE json_extract(check_row.value, '$.name') = required.name
                  AND json_extract(check_row.value, '$.status') = 'PASS'
              )
            )
        )
      BEGIN
        SELECT RAISE(ABORT, 'KERNEL_VERIFIED requires persisted VerificationGate evidence');
      END;
    `,
  },
  {
    id: "019_kernel_evidence_immutability",
    sql: `
      CREATE TRIGGER IF NOT EXISTS verified_claim_verification_run_update_guard
      BEFORE UPDATE ON verification_runs
      WHEN EXISTS (SELECT 1 FROM claims c WHERE c.id = OLD.claim_id AND c.status = 'KERNEL_VERIFIED')
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before mutating verification evidence'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_verification_run_delete_guard
      BEFORE DELETE ON verification_runs
      WHEN EXISTS (SELECT 1 FROM claims c WHERE c.id = OLD.claim_id AND c.status = 'KERNEL_VERIFIED')
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before deleting verification evidence'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_proof_update_guard
      BEFORE UPDATE ON proof_attempts
      WHEN EXISTS (
        SELECT 1 FROM verification_runs vr JOIN claims c ON c.id = vr.claim_id
        WHERE vr.proof_attempt_id = OLD.id AND vr.result = 'KERNEL_ACCEPTED' AND c.status = 'KERNEL_VERIFIED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before mutating accepted proof'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_proof_delete_guard
      BEFORE DELETE ON proof_attempts
      WHEN EXISTS (
        SELECT 1 FROM verification_runs vr JOIN claims c ON c.id = vr.claim_id
        WHERE vr.proof_attempt_id = OLD.id AND vr.result = 'KERNEL_ACCEPTED' AND c.status = 'KERNEL_VERIFIED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before deleting accepted proof'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_formal_update_guard
      BEFORE UPDATE ON formal_statements
      WHEN EXISTS (
        SELECT 1 FROM verification_runs vr JOIN claims c ON c.id = vr.claim_id
        WHERE vr.formal_statement_id = OLD.id AND vr.result = 'KERNEL_ACCEPTED' AND c.status = 'KERNEL_VERIFIED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before mutating current formal'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_formal_delete_guard
      BEFORE DELETE ON formal_statements
      WHEN EXISTS (
        SELECT 1 FROM verification_runs vr JOIN claims c ON c.id = vr.claim_id
        WHERE vr.formal_statement_id = OLD.id AND vr.result = 'KERNEL_ACCEPTED' AND c.status = 'KERNEL_VERIFIED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before deleting current formal'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_fidelity_update_guard
      BEFORE UPDATE ON fidelity_reviews
      WHEN EXISTS (
        SELECT 1 FROM claims c JOIN formal_statements fs ON fs.claim_id = c.id
        WHERE c.id = OLD.claim_id AND c.status = 'KERNEL_VERIFIED'
          AND fs.id = OLD.formal_statement_id AND fs.is_current = 1 AND fs.fidelity_status = 'HUMAN_APPROVED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before mutating fidelity evidence'); END;

      CREATE TRIGGER IF NOT EXISTS verified_claim_fidelity_delete_guard
      BEFORE DELETE ON fidelity_reviews
      WHEN EXISTS (
        SELECT 1 FROM claims c JOIN formal_statements fs ON fs.claim_id = c.id
        WHERE c.id = OLD.claim_id AND c.status = 'KERNEL_VERIFIED'
          AND fs.id = OLD.formal_statement_id AND fs.is_current = 1 AND fs.fidelity_status = 'HUMAN_APPROVED'
      )
      BEGIN SELECT RAISE(ABORT, 'downgrade KERNEL_VERIFIED claim before deleting fidelity evidence'); END;
    `,
  },
  {
    id: "020_event_projection_health",
    sql: `
      ALTER TABLE events ADD COLUMN projection_order INTEGER;
      UPDATE events SET projection_order = rowid WHERE projection_order IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_projection_order ON events(workspace_id, projection_order);
      CREATE TABLE IF NOT EXISTS event_projection_health (
        workspace_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        detail TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );
    `,
  },
  {
    id: "021_context_registry",
    sql: `
      CREATE TABLE context_items (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, scope_kind TEXT NOT NULL, scope_id TEXT NOT NULL, kind TEXT NOT NULL, canonical_name TEXT NOT NULL, display_text TEXT NOT NULL, normalized_value TEXT NOT NULL DEFAULT '', lean_expression TEXT, source_claim_id TEXT, status TEXT NOT NULL, origin TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_context_active_name ON context_items(scope_kind, scope_id, kind, canonical_name) WHERE status='ACTIVE';
      CREATE INDEX idx_context_scope ON context_items(workspace_id, branch_id, scope_kind, scope_id, status);
      CREATE INDEX idx_context_name ON context_items(workspace_id, canonical_name, status);
      CREATE TABLE context_revisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL, parent_revision_id TEXT, changed_item_ids_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
    `,
  },
  {
    id: "022_research_notebooks",
    sql: `
      CREATE TABLE research_documents (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL, source_path TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, branch_id, slug));
      CREATE TABLE research_blocks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, parent_block_id TEXT, sequence INTEGER NOT NULL, kind TEXT NOT NULL, markdown TEXT NOT NULL, entity_type TEXT, entity_id TEXT, attributes_json TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(document_id, sequence));
      CREATE INDEX idx_research_blocks_entity ON research_blocks(entity_type, entity_id);
      CREATE TABLE notebook_sync_records (id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, source_id TEXT NOT NULL, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, source_revision INTEGER NOT NULL, target_revision INTEGER NOT NULL, source_hash TEXT NOT NULL, target_hash TEXT NOT NULL, direction TEXT NOT NULL, status TEXT NOT NULL, diff_summary TEXT NOT NULL, created_at TEXT NOT NULL, applied_at TEXT);
    `,
  },
  {
    id: "023_alignment_and_staleness",
    sql: `
      CREATE TABLE statement_revisions (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, kind TEXT NOT NULL, source_entity_id TEXT NOT NULL, text TEXT NOT NULL, context_revision_id TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(claim_id, kind, revision));
      CREATE TABLE formal_alignments (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, natural_revision_id TEXT NOT NULL, formal_revision_id TEXT NOT NULL, context_revision_id TEXT NOT NULL, status TEXT NOT NULL, verdict TEXT NOT NULL, back_translation TEXT NOT NULL, symbol_mapping_json TEXT NOT NULL, auditor_provider TEXT, auditor_model TEXT, prompt_hash TEXT, created_at TEXT NOT NULL, decided_at TEXT);
      CREATE INDEX idx_alignments_claim ON formal_alignments(claim_id, created_at);
      CREATE TABLE alignment_findings (id TEXT PRIMARY KEY, alignment_id TEXT NOT NULL, dimension TEXT NOT NULL, severity TEXT NOT NULL, natural_fragment TEXT NOT NULL, formal_fragment TEXT NOT NULL, message TEXT NOT NULL, resolution_status TEXT NOT NULL, reviewer_note TEXT);
      CREATE TABLE stale_markers (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, reason_code TEXT NOT NULL, detected_at TEXT NOT NULL, resolved_at TEXT, required_action TEXT NOT NULL, previous_status TEXT, projection_status TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_stale_unresolved ON stale_markers(target_type,target_id,source_type,source_id,reason_code) WHERE resolved_at IS NULL;
    `,
  },
  {
    id: "024_proof_portfolios",
    sql: `
      CREATE TABLE proof_portfolios (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, formal_statement_id TEXT NOT NULL, formal_revision_hash TEXT NOT NULL, branch_id TEXT NOT NULL, status TEXT NOT NULL, selection_policy_json TEXT NOT NULL, limits_json TEXT NOT NULL, usage_json TEXT NOT NULL, retrieval_index_revision TEXT, context_revision_id TEXT, winner_candidate_id TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, started_at TEXT, stopped_at TEXT, stop_reason TEXT);
      CREATE TABLE proof_jobs (id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL, adapter_id TEXT NOT NULL, adapter_version TEXT NOT NULL, strategy TEXT NOT NULL, worker_branch_id TEXT, worktree_path TEXT, status TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, budget_json TEXT NOT NULL, provider TEXT, model TEXT, prompt_hash TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, error_code TEXT);
      CREATE TABLE proof_candidates (id TEXT PRIMARY KEY, proof_job_id TEXT NOT NULL, source_artifact_id TEXT NOT NULL, normalized_proof_hash TEXT NOT NULL, declaration_hash TEXT NOT NULL, compile_result TEXT NOT NULL, diagnostics_json TEXT NOT NULL, axioms_json TEXT NOT NULL, forbidden_json TEXT NOT NULL, verification_report_id TEXT, status TEXT NOT NULL, score REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX idx_proof_candidate_dedup ON proof_candidates(proof_job_id, normalized_proof_hash);
      CREATE TABLE proof_repair_attempts (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, failure_fingerprint_id TEXT, attempt_number INTEGER NOT NULL, input_artifact_hash TEXT NOT NULL, output_artifact_hash TEXT, status TEXT NOT NULL, prompt_hash TEXT, diagnostics_delta_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(candidate_id, attempt_number));
    `,
  },
  {
    id: "025_failure_memory",
    sql: `
      CREATE TABLE failure_fingerprints (id TEXT PRIMARY KEY, domain TEXT NOT NULL, goal_hash TEXT, context_hash TEXT, failure_class TEXT NOT NULL, normalized_diagnostic TEXT NOT NULL, attempted_approach TEXT NOT NULL, premise_set_hash TEXT, fingerprint TEXT NOT NULL UNIQUE, occurrence_count INTEGER NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
      CREATE TABLE failure_occurrences (id TEXT PRIMARY KEY, failure_id TEXT NOT NULL, run_id TEXT, job_id TEXT, step_id TEXT, candidate_id TEXT, artifact_refs_json TEXT NOT NULL, environment_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX idx_failure_lookup ON failure_fingerprints(domain, goal_hash, context_hash, last_seen_at);
    `,
  },
  {
    id: "026_solver_lab",
    sql: `
      CREATE TABLE solver_jobs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, claim_id TEXT, solver_id TEXT NOT NULL, solver_version TEXT, problem_kind TEXT NOT NULL, request_artifact_id TEXT NOT NULL, status TEXT NOT NULL, policy_snapshot_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT);
      CREATE TABLE solver_results (id TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE, outcome TEXT NOT NULL, trust_class TEXT NOT NULL, structured_json TEXT NOT NULL, witness_artifact_id TEXT, certificate_artifact_id TEXT, replay_status TEXT NOT NULL, exact INTEGER NOT NULL, deterministic INTEGER NOT NULL, runtime_fingerprint TEXT NOT NULL, input_hash TEXT NOT NULL, output_hash TEXT NOT NULL, evidence_id TEXT, created_at TEXT NOT NULL);
    `,
  },
  {
    id: "027_literature_ingestion",
    sql: `
      ALTER TABLE sources ADD COLUMN file_hash TEXT;
      ALTER TABLE sources ADD COLUMN media_type TEXT;
      ALTER TABLE sources ADD COLUMN ingestion_status TEXT;
      ALTER TABLE sources ADD COLUMN extraction_version TEXT;
      ALTER TABLE sources ADD COLUMN page_count INTEGER;
      ALTER TABLE sources ADD COLUMN language TEXT;
      ALTER TABLE sources ADD COLUMN license_note TEXT;
      ALTER TABLE sources ADD COLUMN attachment_policy TEXT;
      CREATE TABLE source_document_pages (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, page_number INTEGER NOT NULL, text TEXT NOT NULL, text_hash TEXT NOT NULL, extraction_method TEXT NOT NULL, char_count INTEGER NOT NULL, extraction_confidence REAL NOT NULL, UNIQUE(source_id,page_number));
      CREATE TABLE extraction_candidates (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, excerpt_id TEXT, page_locator TEXT, kind TEXT NOT NULL, name TEXT, raw_statement TEXT NOT NULL, normalized_summary TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, model TEXT, prompt_hash TEXT, duplication_target_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE claim_source_assessments (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, source_id TEXT NOT NULL, external_result_id TEXT, relation TEXT NOT NULL, strength TEXT NOT NULL, human_reviewed INTEGER NOT NULL, rationale TEXT NOT NULL, invalidated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    `,
  },
  {
    id: "028_conjectures_and_agenda",
    sql: `
      CREATE TABLE conjecture_proposals (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, generator TEXT NOT NULL, source_entity_ids_json TEXT NOT NULL, natural_statement TEXT NOT NULL, rationale TEXT NOT NULL, context_revision_id TEXT NOT NULL, status TEXT NOT NULL, formal_candidate_id TEXT, created_claim_id TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, decided_at TEXT);
      CREATE TABLE conjecture_triage_results (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, gate TEXT NOT NULL, result TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE agenda_items (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL, expected_information_gain TEXT NOT NULL, estimated_cost TEXT NOT NULL, claim_id TEXT, run_id TEXT, dependency_ids_json TEXT NOT NULL, owner_type TEXT, owner_id TEXT, due_at TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT);
      CREATE INDEX idx_agenda_status ON agenda_items(workspace_id,branch_id,status,priority);
    `,
  },
  {
    id: "029_review_capsules_publications",
    sql: `
      CREATE TABLE review_packets (id TEXT PRIMARY KEY, source_branch_id TEXT NOT NULL, target_branch_id TEXT NOT NULL, source_revision TEXT NOT NULL, target_revision TEXT NOT NULL, semantic_diff_hash TEXT NOT NULL, included_entities_json TEXT NOT NULL, status TEXT NOT NULL, generated_by TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE review_findings (id TEXT PRIMARY KEY, packet_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, entity_revision INTEGER NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, reviewer_identity TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE review_attestations (id TEXT PRIMARY KEY, packet_id TEXT NOT NULL, packet_hash TEXT NOT NULL, reviewer_identity_id TEXT NOT NULL, decision TEXT NOT NULL, signature_mode TEXT, note TEXT, created_at TEXT NOT NULL);
      CREATE TABLE capsule_records (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, artifact_path TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, verified_at TEXT);
      CREATE TABLE publication_records (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, formats_json TEXT NOT NULL, artifact_paths_json TEXT NOT NULL, warnings_json TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    `,
  },
  {
    id: "030_plugins_and_projections",
    sql: `
      CREATE TABLE plugin_records (id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, protocol TEXT NOT NULL, kind TEXT NOT NULL, manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DISABLED', violation_count INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE projection_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, workspace_id TEXT NOT NULL, branch_id TEXT NOT NULL, schema_version TEXT NOT NULL, source_event_sequence INTEGER NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL, generated_at TEXT NOT NULL, UNIQUE(kind,workspace_id,branch_id));
    `,
  },
]

export const SCHEMA_EPOCH = MIGRATIONS.length
