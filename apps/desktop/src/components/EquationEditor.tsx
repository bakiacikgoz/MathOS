import { useEffect, useRef, useState } from "react"
import { MathfieldElement } from "mathlive"
import "mathlive/fonts.css"
import { useT } from "../lib/i18n.ts"
import { Sheet } from "./Overlay.tsx"

// Fonts come bundled through fonts.css (no network, CSP-safe); no keyboard sounds.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX { interface IntrinsicElements { "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement> } }
}

/** A visual equation editor (MathLive): type x^2 or pick from the on-screen keyboard and see the formula as you go. */
export default function EquationEditor({ onInsert, onClose, initial = "" }: { onInsert: (latex: string) => void; onClose: () => void; initial?: string }) {
  const { t, lang } = useT()
  const field = useRef<MathfieldElement>(null)
  const [latex, setLatex] = useState(initial)

  useEffect(() => {
    const node = field.current
    if (!node) return
    MathfieldElement.locale = lang
    node.mathVirtualKeyboardPolicy = "manual"
    node.smartFence = true
    node.value = initial
    const onInput = () => setLatex(node.getValue("latex"))
    node.addEventListener("input", onInput)
    requestAnimationFrame(() => node.focus())
    return () => { node.removeEventListener("input", onInput); window.mathVirtualKeyboard?.hide() }
  }, [initial, lang])


  return (
    <Sheet open onClose={onClose} title={t("math.visualTitle")} footer={<>
      <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
      <button className="btn btn-primary" onClick={() => onInsert(latex.trim())} disabled={!latex.trim()}>{t("math.insert")}</button>
    </>}>
      <p className="subtitle" style={{ margin: 0 }}>{t("math.visualHint")}</p>
      <div className="equation-field">
        <math-field ref={field} aria-label={t("math.visualTitle")} />
      </div>
      <code className="command selectable small">{latex ? `$${latex}$` : "—"}</code>
    </Sheet>
  )
}
