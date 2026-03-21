import { FontFamily } from '@/constants/theme';
import { getSession, logout } from '@/lib/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type UserInfo = { name?: string; email?: string; phone?: string };

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (session?.user) setUser({ name: session.user.name, email: session.user.email, phone: session.user.phone });
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  const menuSections = [
    {
      title: 'Shopping',
      items: [
        { icon: 'bag-handle-outline' as const, label: 'My Orders', onPress: () => router.push('/cart') },
        { icon: 'heart-outline' as const, label: 'Wishlist', onPress: () => router.push('/(tabs)/wishlist' as any) },
        { icon: 'grid-outline' as const, label: 'Collections', onPress: () => router.push('/collections' as any) },
      ],
    },
    /* Account section hidden for now
    {
      title: 'Account',
      items: [
        { icon: 'location-outline' as const, label: 'Addresses', onPress: () => Alert.alert('Addresses', 'Address management coming soon.') },
        { icon: 'card-outline' as const, label: 'Payment Methods', onPress: () => Alert.alert('Payments', 'Payment management coming soon.') },
        { icon: 'notifications-outline' as const, label: 'Notifications', onPress: () => Alert.alert('Notifications', 'Notification preferences coming soon.') },
      ],
    },
    */
    /* Support section hidden for now
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline' as const, label: 'Help & Support', onPress: () => Alert.alert('Help', 'Contact us at support@oui-atelier.com') },
        { icon: 'document-text-outline' as const, label: 'Terms & Conditions', onPress: () => Alert.alert('Terms', 'Visit our website for terms and conditions.') },
        { icon: 'shield-checkmark-outline' as const, label: 'Privacy Policy', onPress: () => Alert.alert('Privacy', 'Visit our website for our privacy policy.') },
      ],
    },
    */
  ];

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={st.header}>
          <Text style={st.headerTitle}>Profile</Text>
        </View>

        {/* Profile card */}
        <View style={st.profileCard}>
          <LinearGradient colors={['#575E7C', '#D5DBFF']} style={st.avatar}>
            <Text style={st.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={st.profileInfo}>
            <Text style={st.profileName}>{user?.name ?? 'User'}</Text>
            <Text style={st.profileEmail}>{user?.email ?? ''}</Text>
            {user?.phone ? <Text style={st.profilePhone}>{user.phone}</Text> : null}
          </View>
          {/* Edit button hidden for now */}
          {/* <TouchableOpacity
            style={st.editBtn}
            activeOpacity={0.85}
            onPress={() => Alert.alert('Edit Profile', 'Profile editing coming soon.')}
          >
            <Ionicons name="create-outline" size={18} color="#575E7C" />
          </TouchableOpacity> */}
        </View>

        {/* Quick actions */}
        <View style={st.quickActions}>
          <TouchableOpacity style={st.quickAction} activeOpacity={0.85} onPress={() => router.push('/cart')}>
            <View style={[st.quickIconWrap, { backgroundColor: '#D5DBFF' }]}>
              <Ionicons name="bag-handle-outline" size={20} color="#575E7C" />
            </View>
            <Text style={st.quickLabel}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.quickAction} activeOpacity={0.85} onPress={() => router.push('/(tabs)/wishlist' as any)}>
            <View style={[st.quickIconWrap, { backgroundColor: '#E1C4F4' }]}>
              <Ionicons name="heart-outline" size={20} color="#6D567E" />
            </View>
            <Text style={st.quickLabel}>Wishlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.quickAction} activeOpacity={0.85} onPress={() => router.push('/collections' as any)}>
            <View style={[st.quickIconWrap, { backgroundColor: '#FFE5E5' }]}>
              <Ionicons name="grid-outline" size={20} color="#A83836" />
            </View>
            <Text style={st.quickLabel}>Collections</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.quickAction} activeOpacity={0.85} onPress={() => router.push('/(tabs)/search' as any)}>
            <View style={[st.quickIconWrap, { backgroundColor: '#F1F4F5' }]}>
              <Ionicons name="search-outline" size={20} color="#2D3335" />
            </View>
            <Text style={st.quickLabel}>Search</Text>
          </TouchableOpacity>
        </View>

        {/* Menu sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={st.menuSection}>
            <Text style={st.menuSectionTitle}>{section.title}</Text>
            <View style={st.menuCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[st.menuItem, idx < section.items.length - 1 && st.menuItemBorder]}
                  onPress={item.onPress}
                  activeOpacity={0.8}
                >
                  <View style={st.menuIconWrap}>
                    <Ionicons name={item.icon} size={20} color="#575E7C" />
                  </View>
                  <Text style={st.menuLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#9BA1A6" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={st.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color="#A83836" />
          <Text style={st.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* App version */}
        <Text style={st.version}>Premium Store v1.0.0</Text>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { paddingBottom: 30 },

  /* header */
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  headerTitle: { fontSize: 26, fontFamily: FontFamily.headingExtra, color: '#2D3335' },

  /* profile card */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontFamily: FontFamily.headingExtra,
    color: '#fff',
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: '#2D3335',
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    marginTop: 2,
  },
  profilePhone: {
    fontSize: 13,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    marginTop: 1,
  },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* quick actions */
  quickActions: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 11,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
  },

  /* menu sections */
  menuSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  menuSectionTitle: {
    fontSize: 12,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F5',
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
  },

  /* logout */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 28,
    paddingVertical: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: FontFamily.heading,
    color: '#A83836',
  },

  /* version */
  version: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FontFamily.body,
    color: '#9BA1A6',
    marginTop: 20,
  },
});
