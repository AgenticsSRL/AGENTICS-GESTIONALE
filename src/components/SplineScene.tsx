import { Component, type ReactNode } from 'react'
import Spline from '@splinetool/react-spline'

class SplineErrorBoundary extends Component<
  { children: ReactNode; className?: string },
  { hasError: boolean; retryKey: number }
> {
  state = { hasError: false, retryKey: 0 }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    setTimeout(() => {
      this.setState(s => ({ hasError: false, retryKey: s.retryKey + 1 }))
    }, 3000)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className = '' }: SplineSceneProps) {
  return (
    <SplineErrorBoundary key={`spline-${scene}`} className={className}>
      <Spline scene={scene} className={className} />
    </SplineErrorBoundary>
  )
}
