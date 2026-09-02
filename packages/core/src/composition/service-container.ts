import type { Database } from "bun:sqlite"
import {
  AgendaItemRepository, AlignmentFindingRepository, CapsuleRecordRepository, ConjectureProposalRepository,
  ConjectureTriageRepository, ContextItemRepository, ContextRevisionRepository, FailureFingerprintRepository,
  FailureOccurrenceRepository, FormalAlignmentRepository, NotebookSyncRepository, PluginRecordRepository,
  ProjectionRecordRepository, ProofCandidateRepository, ProofJobRepository, ProofPortfolioRepository,
  ProofRepairAttemptRepository, PublicationRecordRepository, ResearchBlockRepository, ResearchDocumentRepository,
  ReviewAttestationRepository, ReviewFindingRepository, ReviewPacketRepository, SolverJobRepository,
  SolverResultRepository, StaleMarkerRepository, StatementRevisionRepository,
  ClaimRepository, DependencyRepository, FormalStatementRepository,
} from "@mathos/storage"
import type { ClaimReadPort } from "../ports/claim-read-port.ts"
import type { FormalReadPort } from "../ports/formal-read-port.ts"
import type { GraphReadPort } from "../ports/graph-read-port.ts"
import type { ArtifactStorePort } from "../ports/artifact-store-port.ts"
import type { ClockPort } from "../ports/clock-port.ts"
import { claimReadAdapter, FileArtifactStore, formalReadAdapter, graphReadAdapter, systemClock } from "./built-in-adapters.ts"
import { MathematicalContextService } from "../services/mathematical-context-service.ts"
import { ResearchNotebookService } from "../services/research-notebook-service.ts"
import { StatementRevisionService } from "../services/statement-revision-service.ts"
import { AlignmentService } from "../services/alignment-service.ts"

export interface ServiceContainerOverrides { clock: ClockPort; artifacts: ArtifactStorePort; claims: ClaimReadPort; formals: FormalReadPort; graph: GraphReadPort }
export interface ServiceContainer {
  clock: ClockPort; artifacts: ArtifactStorePort; claims: ClaimReadPort; formals: FormalReadPort; graph: GraphReadPort
  repositories: ReturnType<typeof createV1Repositories>
  mathematicalContext: MathematicalContextService
  researchNotebook: ResearchNotebookService
  statementRevisions: StatementRevisionService
  alignment:AlignmentService
}

function createV1Repositories(db: Database) {
  return {
    contextItems: new ContextItemRepository(db), contextRevisions: new ContextRevisionRepository(db),
    researchDocuments: new ResearchDocumentRepository(db), researchBlocks: new ResearchBlockRepository(db), notebookSync: new NotebookSyncRepository(db),
    statementRevisions: new StatementRevisionRepository(db), formalAlignments: new FormalAlignmentRepository(db), alignmentFindings: new AlignmentFindingRepository(db), staleMarkers: new StaleMarkerRepository(db),
    proofPortfolios: new ProofPortfolioRepository(db), proofJobs: new ProofJobRepository(db), proofCandidates: new ProofCandidateRepository(db), proofRepairAttempts: new ProofRepairAttemptRepository(db),
    solverJobs: new SolverJobRepository(db), solverResults: new SolverResultRepository(db),
    conjectureProposals: new ConjectureProposalRepository(db), conjectureTriage: new ConjectureTriageRepository(db), agendaItems: new AgendaItemRepository(db),
    failureFingerprints: new FailureFingerprintRepository(db), failureOccurrences: new FailureOccurrenceRepository(db),
    reviewPackets: new ReviewPacketRepository(db), reviewFindings: new ReviewFindingRepository(db), reviewAttestations: new ReviewAttestationRepository(db),
    capsules: new CapsuleRecordRepository(db), publications: new PublicationRecordRepository(db), plugins: new PluginRecordRepository(db), projections: new ProjectionRecordRepository(db),
  }
}

export function createServiceContainer(root: string, db: Database, overrides: Partial<ServiceContainerOverrides> = {}): ServiceContainer {
  const clock = overrides.clock ?? systemClock
  const repositories = createV1Repositories(db)
  let sequence = 0
  const statementRevisions=new StatementRevisionService({revisions:repositories.statementRevisions,clock,nextId:()=>`SR-${clock.now().replace(/\D/g,"")}-${++sequence}`,writeEvent:()=>{}})
  const claimRepository=new ClaimRepository(db),formalRepository=new FormalStatementRepository(db)
  for(const {id} of db.query<{id:string},[]>("SELECT id FROM workspaces").all())statementRevisions.backfillLegacy(claimRepository.list(id),formalRepository.list(id),"CR-LEGACY")
  const container = {
    clock,
    artifacts: overrides.artifacts ?? new FileArtifactStore(root),
    claims: overrides.claims ?? claimReadAdapter(new ClaimRepository(db)),
    formals: overrides.formals ?? formalReadAdapter(new FormalStatementRepository(db)),
    graph: overrides.graph ?? graphReadAdapter(new DependencyRepository(db)),
    repositories,
    mathematicalContext: new MathematicalContextService({ items: repositories.contextItems, revisions: repositories.contextRevisions, clock, nextId: (prefix) => `${prefix}-${clock.now().replace(/\D/g, "")}-${++sequence}`, writeEvent: () => {} }),
    researchNotebook: new ResearchNotebookService({ root, documents:repositories.researchDocuments, blocks:repositories.researchBlocks, clock, unitOfWork:(work) => db.transaction(work)(), entityExists:(type,id) => type === "claim" ? Boolean(new ClaimRepository(db).get(id)) : true }),
    statementRevisions,
    alignment:new AlignmentService({revisions:repositories.statementRevisions,alignments:repositories.formalAlignments,findings:repositories.alignmentFindings,clock,nextId:(prefix)=>`${prefix}-${clock.now().replace(/\D/g,"")}-${++sequence}`}),
  }
  return container
}
