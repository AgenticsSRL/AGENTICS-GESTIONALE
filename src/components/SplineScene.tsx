import { Component, memo, type ReactNode } from 'react'
import Spline from '@splinetool/react-spline'

class SplineErrorBoundary extends Component<
  { children: ReactNode; className?: string },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
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

const StableSpline = memo(({ scene, className }: SplineSceneProps) => (
  <Spline scene={scene} className={className} />
))

export function SplineScene({ scene, className = '' }: SplineSceneProps) {
  return (
    <SplineErrorBoundary key={`spline-${scene}`} className={className}>
      <StableSpline scene={scene} className={className} />
    </SplineErrorBoundary>
  )
}
