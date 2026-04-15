import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
  info: ErrorInfo | null
}

export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 font-mono text-xs text-destructive">
          <div className="font-semibold mb-1">
            {this.props.label ?? 'Error'}: {this.state.error.message}
          </div>
          <pre className="whitespace-pre-wrap text-[10px] opacity-80">
            {this.state.error.stack}
          </pre>
          {this.state.info && (
            <pre className="whitespace-pre-wrap text-[10px] opacity-80 mt-2">
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
