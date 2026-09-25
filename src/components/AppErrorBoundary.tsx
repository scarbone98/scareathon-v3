import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

// Catches a page that throws while rendering, so one broken page shows a way
// out instead of blanking the whole site. Wraps the routes only, so the nav
// still works, and going to another page (a new resetKey) clears the error.

// A tab opened before a deploy asks for page files that no longer exist
function isStaleBuildError(error: Error) {
  return /dynamically imported module|Importing a module script failed|Expected the result of a dynamic import|Unable to preload CSS/i.test(
    error.message
  );
}

type State = { error: Error | null };

type Props = { children: ReactNode; resetKey: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isStaleBuildError(error);
    return (
      <div className="flex min-h-screen-dynamic items-center justify-center bg-[#0f0c10] px-4 font-sans">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-7 text-center">
          <h1 className="font-scooby text-3xl text-stone-50">
            {stale ? "There's a new version" : "Something went wrong"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-400">
            {stale
              ? "The site was updated while this tab was open. Reload to get the latest."
              : "This page hit a snag. Reloading usually fixes it."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-full bg-amber-200 px-5 py-3 font-semibold text-stone-900 transition hover:bg-amber-100"
          >
            Reload
          </button>
          <Link
            to="/"
            className="mt-4 inline-block text-sm text-stone-400 underline decoration-stone-600 underline-offset-4 hover:text-stone-200"
          >
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }
}
