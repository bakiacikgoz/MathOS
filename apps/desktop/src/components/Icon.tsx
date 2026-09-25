import { MarkGlyph } from "./Brand.tsx"
import type { ReactElement } from "react"

const paths: Record<string, ReactElement> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  claims: <><path d="M17 4.5H7l5.5 7.5L7 19.5h10" /></>,
  branch: <><circle cx="6.5" cy="5.5" r="2" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="17.5" cy="8.5" r="2" /><path d="M6.5 7.5v9M17.5 10.5c0 4-11 2-11 6" /></>,
  health: <><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></>,
  console: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="m7.5 10 3 2.5-3 2.5M12.5 15.5h4" /></>,
  settings: <><path d="M10.3 3.2a1.7 1.7 0 0 1 3.4 0l.1.7a1.7 1.7 0 0 0 2.5 1.1l.6-.3a1.7 1.7 0 0 1 2.3 2.4l-.4.6a1.7 1.7 0 0 0 1 2.5l.7.1a1.7 1.7 0 0 1 0 3.4l-.7.1a1.7 1.7 0 0 0-1 2.5l.4.6a1.7 1.7 0 0 1-2.3 2.4l-.6-.3a1.7 1.7 0 0 0-2.5 1.1l-.1.7a1.7 1.7 0 0 1-3.4 0l-.1-.7a1.7 1.7 0 0 0-2.5-1.1l-.6.3a1.7 1.7 0 0 1-2.3-2.4l.4-.6a1.7 1.7 0 0 0-1-2.5l-.7-.1a1.7 1.7 0 0 1 0-3.4l.7-.1a1.7 1.7 0 0 0 1-2.5l-.4-.6a1.7 1.7 0 0 1 2.3-2.4l.6.3a1.7 1.7 0 0 0 2.5-1.1Z" /><circle cx="12" cy="12" r="3" /></>,
  chevrons: <><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9.5 4v16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" /></>,
  moon: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></>,
  system: <><rect x="3" y="4.5" width="18" height="12" rx="2.5" /><path d="M9 20h6M12 16.5V20" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  plug: <><path d="M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0v-3ZM12 16v4.5" /></>,
  folder: <><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /></>,
  sparkles: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9Z" /><path d="M19 3v3M17.5 4.5h3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  x: <><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 19.5h14" /></>,
  swap: <><path d="M7 7.5h12M15.5 4l3.5 3.5-3.5 3.5M17 16.5H5M8.5 20 5 16.5 8.5 13" /></>,
  command: <><path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0h-6m6 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15Zm-6 0H6.5A2.5 2.5 0 1 0 9 17.5V15Z" /></>,
  book: <><path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v14H6.5a2 2 0 0 0-2 2Z" /><path d="M4.5 19.5a2 2 0 0 0 2 1H19M8.5 7.5h6" /></>,
  graph: <><circle cx="5.5" cy="6" r="2.2" /><circle cx="5.5" cy="18" r="2.2" /><circle cx="18.5" cy="12" r="2.2" /><path d="M7.6 6.8 16.4 11M7.6 17.2l8.8-4.2" /></>,
  chat: <><path d="M4.5 6.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H11l-4.5 4v-4h0a2 2 0 0 1-2-2Z" /><path d="M9 9.5h6M9 12.5h3.5" /></>,
  paperclip: <><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></>,
  send: <><path d="M12 19V5M6 11l6-6 6 6" /></>,
  stop: <><rect x="7" y="7" width="10" height="10" rx="2" /></>,
  file: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></>,
  pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7" /></>,
  brain: <><path d="M9.5 4.5a3 3 0 0 0-3 3v.2A3 3 0 0 0 4.5 12a3 3 0 0 0 2 2.8V16a3.5 3.5 0 0 0 6 2.4V5.8a3 3 0 0 0-3-1.3ZM14.5 4.5a3 3 0 0 1 3 3v.2a3 3 0 0 1 2 4.3 3 3 0 0 1-2 2.8V16a3.5 3.5 0 0 1-5.5 2.9" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  down: <><path d="m6 9 6 6 6-6" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M18 13.5h.01M8.5 14h7" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z" /></>,
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, stroke = 1.7 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** The app mark: the logo's "O" on an ink tile, as in the app icon. */
export function Mark({ size = 28 }: { size?: number }) {
  return <span className="app-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }} aria-hidden="true"><MarkGlyph size={Math.round(size * 0.82)} /></span>
}
