import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { log } from '../lib/log';
import { UdLogo } from './UD';
import { ud } from '../theme';

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
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 24, backgroundColor: ud.surfaceLow, alignItems: 'center', justifyContent: 'center' }}>
          <UdLogo height={32} />
          <Text style={{ fontFamily: ud.fontDisplay, fontSize: 22, color: ud.heading, marginTop: 24, textAlign: 'center' }}>Coś poszło nie tak</Text>
          <Text style={{ fontFamily: ud.fontBody, fontSize: 15, color: ud.text, marginTop: 8, textAlign: 'center' }}>
            Aplikacja napotkała nieoczekiwany błąd. Twoje zgłoszenia są bezpieczne – spróbuj ponownie.
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            accessibilityRole="button"
            style={{ backgroundColor: ud.primary, borderRadius: ud.radiusButton, paddingVertical: 14, paddingHorizontal: 28, marginTop: 24 }}
          >
            <Text style={{ color: '#fff', fontFamily: ud.fontBodyBold, fontSize: 16 }}>Spróbuj ponownie</Text>
          </Pressable>
          {__DEV__ ? (
            <ScrollView style={{ marginTop: 16, maxHeight: 220, alignSelf: 'stretch' }}>
              <Text style={{ color: ud.plateVerified }}>{String(this.state.error?.message)}</Text>
              <Text style={{ color: ud.muted }}>{String(this.state.error?.stack ?? '').slice(0, 2000)}</Text>
            </ScrollView>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}
