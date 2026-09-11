import React from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { log } from '../lib/log';

type S = { error: Error | null };

export class ErrorBoundary extends React.Component<React.PropsWithChildren, S> {
  state: S = { error: null };

  static getDerivedStateFromError(error: Error): S {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('react', `${error.message} :: ${String(info.componentStack ?? '').slice(0, 1200)}`);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 16, backgroundColor: '#300' }}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Crash złapany (widzisz to zamiast czerwonego ekranu):</Text>
          <ScrollView style={{ marginVertical: 12 }}>
            <Text style={{ color: '#fff' }}>{String(this.state.error?.message)}</Text>
            <Text style={{ color: '#ccc' }}>{String(this.state.error?.stack ?? '').slice(0, 2000)}</Text>
          </ScrollView>
          <Button title="Reset" onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}
