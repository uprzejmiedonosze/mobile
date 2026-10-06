import React from 'react';
import * as Sentry from '@sentry/react-native';
import { log } from '../lib/log';
import { ErrorScreen } from './ErrorScreen';

type S = { error: Error | null };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, S> {
  state: S = { error: null };

  static getDerivedStateFromError(error: Error): S {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('react', `${error.message} :: ${String(info.componentStack ?? '').slice(0, 1200)}`);
    Sentry.captureException(error, { extra: { componentStack: String(info.componentStack ?? '').slice(0, 2000) } });
  }

  render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
