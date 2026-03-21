import { useKioskCart } from '@/context/KioskCartContext';
import { getOuiAssetUrl } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import type { KioskCartItem } from '@/lib/kioskApi';

function getItemImageUrl(item: KioskCartItem): string | null {
  const img = item.image;
  if (!img) return null;
  if (typeof img === 'string' && img.startsWith('http')) return img;
  return getOuiAssetUrl(img) ?? null;
}

export default function CartScreen() {
  const router = useRouter();
  const { items, loading, error, cartId, cartUuid, qrToken, invoiceUrl, refreshCart, removeFromCart, addToCart, resetCart } = useKioskCart();

  const [sendFormOpen, setSendFormOpen] = useState(false);
  const [sendName, setSendName] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  const canSendToStore = useMemo(() => Boolean(cartUuid && cartUuid.length > 0), [cartUuid]);

  async function sendToStoreApi(args: {
    cartUuid: string;
    name: string;
    phone: string;
    email?: string;
  }) {
    const response = await fetch('https://oui.corescent.in/api/kiosk/proceed-to-store', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cart_uuid: args.cartUuid,
        name: args.name,
        phone: args.phone,
        email: args.email,
      }),
    });

    if (!response.ok) {
      let message = 'Could not submit request.';
      try {
        const data = await response.json();
        message =
          (typeof data?.message === 'string' && data.message) ||
          (typeof data?.error === 'string' && data.error) ||
          message;
      } catch (_) {}
      throw new Error(message);
    }

    return response.json().catch(() => ({ ok: true }));
  }

  const handleSubmitSendToStore = async () => {
    if (!canSendToStore) {
      Alert.alert('Cart not ready', 'Try again in a moment.');
      return;
    }
    const name = sendName.trim();
    const phone = sendPhone.replace(/\s/g, '').trim();
    const email = sendEmail.trim();

    if (!name) {
      Alert.alert('Missing name', 'Please enter your name.');
      return;
    }
    if (!phone || phone.length < 8) {
      Alert.alert('Missing phone', 'Please enter a valid phone number.');
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address (or leave it empty).');
      return;
    }

    try {
      setSendLoading(true);
      await sendToStoreApi({
        cartUuid: cartUuid as string,
        name,
        phone,
        email: email || undefined,
      });
      Alert.alert(
        'Sent to store',
        email ? 'Invoice will be sent to your email.' : 'Request saved. Our store will contact you.'
      );
      setSendFormOpen(false);
      setSendLoading(false);
      setSendName('');
      setSendPhone('');
      setSendEmail('');
    } catch (e: unknown) {
      setSendLoading(false);
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not submit request.');
    }
  };

  const closeSendForm = () => {
    setSendFormOpen(false);
    setSendLoading(false);
  };

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const resolvedInvoiceUrl =
    invoiceUrl ||
    (qrToken ? `https://oui.corescent.in/kiosk/invoice/${encodeURIComponent(qrToken)}` : null);

  const handleRemove = (productId: number) => {
    Alert.alert('Remove item', 'Remove this product from cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFromCart(productId) },
    ]);
  };

  const handleQuantityMinus = async (item: KioskCartItem) => {
    const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 1;
    if (qty <= 1) {
      handleRemove(item.product_id);
      return;
    }
    await removeFromCart(item.product_id, 1);
  };

  const handleQuantityPlus = async (item: KioskCartItem) => {
    await addToCart(item.product_id, 1);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={24} color="#1a1a2e" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cart</Text>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Start new cart', 'Create a fresh cart for a new user?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Create', onPress: () => resetCart() },
            ]);
          }}
          style={styles.refreshBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.refreshBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6B4EAA" />
          <Text style={styles.loadingText}>Loading cart…</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Your cart is empty</Text>
              <Text style={styles.emptySub}>Add items from Try-on or Home to see them here.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/home' as any)} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Browse products</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Items ({items.length})</Text>
                {items.map((item, index) => {
                  const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 1;
                  const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0)) || 0;
                  const total = typeof item.total === 'number' ? item.total : price * qty;
                  const imageUrl = getItemImageUrl(item);
                  const name = item.name || `Product #${item.product_id}`;
                  return (
                    <View key={`cart-${index}-${item.product_id}-${item.id ?? ''}`} style={styles.itemCard}>
                      <View style={styles.itemImageWrap}>
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={styles.itemImage} contentFit="cover" />
                        ) : (
                          <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                            <Ionicons name="shirt-outline" size={32} color="#999" />
                          </View>
                        )}
                      </View>
                      <View style={styles.itemDetails}>
                        <Text style={styles.itemName} numberOfLines={2}>{name}</Text>
                        {price > 0 && (
                          <Text style={styles.itemPrice}>₹{total.toFixed(0)} {qty > 1 ? `(${price} × ${qty})` : ''}</Text>
                        )}
                        <View style={styles.quantityRow}>
                          <View style={styles.quantityControls}>
                            <TouchableOpacity
                              onPress={() => handleQuantityMinus(item)}
                              style={styles.qtyBtn}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="remove" size={20} color="#1a1a2e" />
                            </TouchableOpacity>
                            <Text style={styles.qtyValue}>{qty}</Text>
                            <TouchableOpacity
                              onPress={() => handleQuantityPlus(item)}
                              style={styles.qtyBtn}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="add" size={20} color="#1a1a2e" />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemove(item.product_id)}
                            style={styles.removeBtn}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="trash-outline" size={20} color="#b71c1c" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              {qrToken && resolvedInvoiceUrl ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Invoice</Text>
                  <Text style={styles.qrHint}>Scan this QR to open your invoice on any device.</Text>
                  <View style={styles.qrWrap}>
                    <QRCode value={resolvedInvoiceUrl} size={200} />
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      if (!canSendToStore || sendLoading) return;
                      setSendFormOpen(true);
                    }}
                    activeOpacity={0.9}
                    disabled={!canSendToStore}
                    style={styles.sendStoreBtn}
                  >
                    {sendLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendStoreBtnText}>Send to Store</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      <Modal transparent visible={sendFormOpen} animationType="fade" onRequestClose={closeSendForm}>
        <View style={styles.modalRoot}>
          <View style={styles.modalBlueOverlay} />
          <Pressable style={styles.modalBackdrop} onPress={closeSendForm} />
          <View style={styles.modalCard}>
            <Text style={styles.sendFormTitle}>Send invoice to store</Text>
            <Text style={styles.modalHint}>Name, phone required. Email optional (invoice will be emailed).</Text>

            <Text style={styles.sendLabel}>Name</Text>
            <TextInput
              value={sendName}
              onChangeText={setSendName}
              placeholder="Enter your name"
              placeholderTextColor="#9aa3b2"
              style={styles.input}
              autoCapitalize="words"
              editable={!sendLoading}
            />

            <Text style={styles.sendLabel}>Phone</Text>
            <TextInput
              value={sendPhone}
              onChangeText={setSendPhone}
              placeholder="Enter phone number"
              placeholderTextColor="#9aa3b2"
              style={styles.input}
              keyboardType="phone-pad"
              editable={!sendLoading}
            />

            <Text style={styles.sendLabel}>Email (Optional)</Text>
            <TextInput
              value={sendEmail}
              onChangeText={setSendEmail}
              placeholder="Enter email (optional)"
              placeholderTextColor="#9aa3b2"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!sendLoading}
            />

            <View style={styles.sendActions}>
              <TouchableOpacity
                onPress={closeSendForm}
                activeOpacity={0.85}
                style={styles.secondaryBtn}
                disabled={sendLoading}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitSendToStore}
                activeOpacity={0.9}
                style={[styles.primaryBtn2, sendLoading && { opacity: 0.7 }]}
                disabled={sendLoading}
              >
                {sendLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtn2Text}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  backText: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  title: { fontSize: 20, fontWeight: '800', color: '#1a1a2e' },
  refreshBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6B4EAA',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  errorBanner: { backgroundColor: '#fef2f2', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 12 },
  errorText: { color: '#b91c1c', fontSize: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 16 },
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySub: { fontSize: 15, color: '#666', marginBottom: 24 },
  primaryBtn: { backgroundColor: '#6B4EAA', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  itemImageWrap: { width: 88, height: 88, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  itemImage: { width: '100%', height: '100%' },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemDetails: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#6B4EAA', marginBottom: 8 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quantityControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10 },
  qtyBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', minWidth: 24, textAlign: 'center' },
  removeBtn: { padding: 8 },
  qrHint: { fontSize: 14, color: '#666', marginBottom: 14 },
  qrWrap: { alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },

  sendStoreBtn: {
    marginTop: 14,
    backgroundColor: '#6B4EAA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendStoreBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  sendForm: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  sendFormTitle: { fontSize: 14, fontWeight: '900', color: '#1a1a2e', marginBottom: 12 },
  sendLabel: { fontSize: 12, fontWeight: '800', color: '#4b5563', marginBottom: 6, marginTop: 10 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30,64,175,0.28)',
    paddingHorizontal: 18,
  },
  modalBlueOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,99,235,0.20)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,99,235,0.35)',
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    zIndex: 2,
  },
  modalHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    color: '#111827',
  },
  sendActions: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'space-between' },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6B4EAA',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#6B4EAA', fontWeight: '800', fontSize: 15 },
  primaryBtn2: { flex: 1, backgroundColor: '#6B4EAA', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtn2Text: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
