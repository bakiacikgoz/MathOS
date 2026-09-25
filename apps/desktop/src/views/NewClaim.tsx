import { useState } from "react"
import { useApp, type Claim } from "../lib/app.ts"
import { runJson } from "../lib/bridge.ts"
import { invalidate } from "../lib/query.ts"
import { useT } from "../lib/i18n.ts"
import { CLAIM_KINDS, kindLabel, type ClaimKind } from "../lib/status.ts"
import { Sheet } from "../components/Overlay.tsx"
import { Segmented } from "../components/Primitives.tsx"
import { errorText } from "../lib/cli-text.ts"
import { MathInput } from "../components/MathInput.tsx"

export function NewClaimSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp()
  const { t, lang } = useT()
  const [kind, setKind] = useState<ClaimKind>("conjecture")
  const [title, setTitle] = useState("")
  const [statement, setStatement] = useState("")
  const [objective, setObjective] = useState(false)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const valid = title.trim() && statement.trim()

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setTouched(true)
    if (!valid) return
    setBusy(true)
    try {
      const args = ["claim", "create", "--type", kind, "--title", title.trim(), "--statement", statement.trim()]
      if (objective) args.push("--objective")
      const created = await runJson<Claim>(app.workspace.root, args)
      invalidate(app.workspace.root)
      app.toast(`${created.id} ${t("claims.created")}`)
      app.selectClaim(created.id)
      app.navigate("claims")
      setTitle(""); setStatement(""); setObjective(false); setTouched(false)
      onClose()
    } catch (error) { app.toast(errorText(error, app.lang), "error") } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("claimForm.title")}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={() => submit()} disabled={busy}>{busy ? <span className="spinner" /> : t("claimForm.submit")}</button>
      </>}>
      <form onSubmit={submit} style={{ display: "contents" }} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit() }}>
        <div className="field">
          <span className="field-label">{t("claimForm.kind")}</span>
          <Segmented value={kind} onChange={setKind} options={CLAIM_KINDS.map((value) => ({ value, label: kindLabel(value, lang) }))} />
        </div>
        <label className="field">
          <span className="field-label">{t("claimForm.name")}</span>
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("claimForm.namePlaceholder")} />
          {touched && !title.trim() && <span className="field-error">{t("common.required")}</span>}
        </label>
        <div className="field">
          <span className="field-label">{t("claimForm.statement")}</span>
          <MathInput value={statement} onChange={setStatement} label={t("claimForm.statement")} placeholder={t("claimForm.statementPlaceholder")} />
          {touched && !statement.trim() && <span className="field-error">{t("common.required")}</span>}
        </div>
        <label className="check"><input type="checkbox" checked={objective} onChange={(event) => setObjective(event.target.checked)} />{t("claimForm.objective")}</label>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
