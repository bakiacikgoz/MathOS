import { lazy, Suspense } from "react"
import type { MathComposerProps } from "./MathComposer.tsx"

const MathComposer = lazy(() => import("./MathComposer.tsx"))

/** The math editor, loaded on first use (MathLive is large); until then a plain text box keeps typing possible. */
export function MathEditor(props: MathComposerProps) {
  return (
    <Suspense fallback={<textarea className="textarea" value={props.value} onChange={(event) => props.onChange(event.target.value)} aria-label={props.label} placeholder={props.placeholder} style={{ minHeight: props.minHeight ?? 96 }} />}>
      <MathComposer {...props} />
    </Suspense>
  )
}
