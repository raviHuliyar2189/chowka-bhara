import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLanguage } from '../i18n/language';
import { translate } from '../i18n/strings';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Sits at the very top of the tree (see main.tsx) so that any render-time exception anywhere in
// the app — a genuine bug, a browser restricting an API the code assumed was available, whatever
// — shows a plain "something went wrong, reload" message instead of React's default behavior with
// no boundary: silently unmounting the whole tree, leaving a blank page with no visible error at
// all. Class component because React error boundaries have no hook equivalent.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Unhandled error in app render:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const lang = getLanguage();
      return (
        <div className="setup-inline">
          <div className="modal">
            <h2>{translate('error.title', lang)}</h2>
            <p>{translate('error.message', lang)}</p>
            <button className="action-btn btn-start" onClick={() => window.location.reload()}>
              {translate('error.reload', lang)}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
