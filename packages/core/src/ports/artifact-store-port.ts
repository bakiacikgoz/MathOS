export interface ArtifactStorePort {
  put(key: string, value: Uint8Array): string
  get(key: string): Uint8Array | null
  exists(key: string): boolean
}
