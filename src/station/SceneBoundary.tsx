import { Component, type ReactNode } from "react";

// React catches render and effect setup errors here; runtime/context failures are
// reported by StationScene itself through the same onFailure callback.
export default class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
