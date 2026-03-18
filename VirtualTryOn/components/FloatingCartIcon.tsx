import { useKioskCart } from '@/context/KioskCartContext';
import { useRouter, useSegments } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function FloatingCartIcon() {
  const router = useRouter();
  const segments = useSegments();
  const { itemCount } = useKioskCart();

  const isCartScreen = segments.join('/').includes('cart');
  if (isCartScreen) return null;

  const onPress = () => router.push('/cart');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.fab}
      accessibilityLabel="Cart"
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>🛒</Text>
        {itemCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {itemCount > 99 ? '99+' : itemCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 20,
    right: 20,
    zIndex: 999,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6B4EAA',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 6 },
    }),
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 26,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#6B4EAA',
    fontSize: 11,
    fontWeight: '800',
  },
});
