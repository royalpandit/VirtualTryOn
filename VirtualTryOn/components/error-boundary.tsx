import { useRouter } from 'expo-router';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors and shows a fallback UI instead of crashing.
 * Prevents "force closed due to internal error" on Android (e.g. Android 16).
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const router = useRouter();
  const handleGoBack = () => {
    try {
      if (router?.canGoBack?.()) router.back();
      else router?.replace?.('/(tabs)');
    } catch (_) {
      // Router may be broken; user can kill and reopen app
    }
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        We're sorry. The app encountered an error. Please try again or go back.
      </Text>
      {__DEV__ && error && (
        <Text style={styles.errorText} numberOfLines={5}>
          {error.message}
        </Text>
      )}
      <TouchableOpacity style={styles.primaryBtn} onPress={onRetry} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={handleGoBack} activeOpacity={0.8}>
        <Text style={styles.secondaryBtnText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  primaryBtn: {
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  secondaryBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
