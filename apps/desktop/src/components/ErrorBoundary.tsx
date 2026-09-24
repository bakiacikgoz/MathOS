import { Component, type ReactNode } from "react"

interface Props { title: string; detail: string; resetLabel: string; onReset: () => void; children: ReactNode }

/** Keeps a render error in one screen from blanking the whole window, and offers a way back. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error("MathOS desktop view crashed", error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page"><div className="page-inner"><div className="error-box" role="alert">
        <div style={{ flex: 1 }}>
          <strong>{this.props.title}</strong>
          <div className="selectable">{this.props.detail}</div>
          <div className="selectable" style={{ opacity: 0.7, marginTop: 4 }}>{this.state.error.message}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => { this.setState({ error: null }); this.props.onReset() }}>{this.props.resetLabel}</button>
      </div></div></div>
    )
  }
}
