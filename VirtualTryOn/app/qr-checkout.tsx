import { FontFamily } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const QR_SIZE = Math.min(SCREEN_WIDTH - 100, 240);

export default function QrCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceUrl?: string }>();
  const invoiceUrl = params.invoiceUrl ?? '';

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#2D3335" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>QR Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={st.content}>
        {/* Brand */}
        <Text style={st.brand}>OUI</Text>
        <Text style={st.brandTag}>ATELIER</Text>

        {/* QR Code Card */}
        <View style={st.qrCard}>
          {invoiceUrl ? (
            <QRCode value={invoiceUrl} size={QR_SIZE} />
          ) : (
            <View style={[st.qrPlaceholder, { width: QR_SIZE, height: QR_SIZE }]}>
              <Ionicons name="qr-code-outline" size={64} color="#E5E9EB" />
              <Text style={st.qrPlaceholderText}>No invoice available</Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        <Text style={st.instruction}>
          Scan this QR code to view your invoice and complete checkout on any device.
        </Text>

        {/* Info cards */}
        <View style={st.infoRow}>
          <View style={st.infoCard}>
            <Ionicons name="phone-portrait-outline" size={20} color="#575E7C" />
            <Text style={st.infoText}>Open your phone camera</Text>
          </View>
          <View style={st.infoCard}>
            <Ionicons name="scan-outline" size={20} color="#575E7C" />
            <Text style={st.infoText}>Point at the QR code</Text>
          </View>
        </View>

        {/* Done button */}
        <TouchableOpacity style={st.doneBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={st.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F4',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
  },

  /* content */
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  brand: {
    fontSize: 42,
    fontFamily: FontFamily.brand,
    color: '#2D3335',
    letterSpacing: 4,
  },
  brandTag: {
    fontSize: 11,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    letterSpacing: 5,
    marginBottom: 28,
  },

  /* QR */
  qrCard: {
    backgroundColor: '#fff',
    padding: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    marginBottom: 24,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrPlaceholderText: {
    fontSize: 14,
    fontFamily: FontFamily.bodyMedium,
    color: '#9BA1A6',
  },

  /* instruction */
  instruction: {
    fontSize: 14,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 10,
  },

  /* info */
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    fontFamily: FontFamily.bodyMedium,
    color: '#2D3335',
    textAlign: 'center',
  },

  /* done */
  doneBtn: {
    backgroundColor: '#2D3335',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FontFamily.heading,
  },
});
