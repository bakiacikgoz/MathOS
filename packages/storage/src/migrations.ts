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
]

export const SCHEMA_EPOCH = MIGRATIONS.length
