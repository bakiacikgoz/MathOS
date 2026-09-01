export type MutationEvent = { target?: string | null; metadata?: Record<string, unknown> }
export interface MutationRecorder {
  record(action: string, event?: MutationEvent): void
  mutate<T>(action: string, event: MutationEvent, mutation: () => T): T
}
