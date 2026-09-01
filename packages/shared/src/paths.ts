import { join } from "node:path"

export const MATHOS_DIR = ".mathos"
export const CONFIG_FILE = "mathos.toml"
export const CHARTER_FILE = "MATH.md"
export const DATABASE_FILE = "mathos.db"
export const EVENT_LOG_FILE = "events.jsonl"
export const DEBUG_LOG_FILE = "debug.log"

export function mathosDir(root: string): string {
  return join(root, MATHOS_DIR)
}

export function databasePath(root: string): string {
  return join(root, MATHOS_DIR, DATABASE_FILE)
}

export function eventLogPath(root: string): string {
  return join(root, MATHOS_DIR, EVENT_LOG_FILE)
}

export function debugLogPath(root: string): string {
  return join(root, MATHOS_DIR, DEBUG_LOG_FILE)
}

export function configPath(root: string): string {
  return join(root, CONFIG_FILE)
}

export function charterPath(root: string): string {
  return join(root, CHARTER_FILE)
}

export const WORKSPACE_DIRECTORIES = [
  "research",
  "research/notes",
  "formal",
  "experiments",
  "literature",
  "exports",
  MATHOS_DIR,
  `${MATHOS_DIR}/sessions`,
  `${MATHOS_DIR}/checkpoints`,
  `${MATHOS_DIR}/branches`,
  `${MATHOS_DIR}/tmp`,
  `${MATHOS_DIR}/index`,
  `${MATHOS_DIR}/logs`,
  `${MATHOS_DIR}/worktrees`,
] as const
