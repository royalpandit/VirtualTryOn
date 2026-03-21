import { FontFamily } from '@/constants/theme';
import { useKioskCart } from '@/context/KioskCartContext';
import type { KioskCartItem } from '@/lib/kioskApi';
import { getOuiAssetUrl } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SIDE_PAD = 20;

function getItemImageUrl(item: KioskCartItem): string | null {
  const img = item.image;
  if (!img) return null;
  if (typeof img === 'string' && img.startsWith('http')) return img;
  return getOuiAssetUrl(img) ?? null;
}

export default function CartScreen() {
  const router = useRouter();
  const {
    items, loading, error, cartUuid, qrToken, invoiceUrl,
    refreshCart, removeFromCart, addToCart, resetCart,
  } = useKioskCart();

  const [sendFormOpen, setSendFormOpen] = useState(false);
  const [sendName, setSendName] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  const canSendToStore = useMemo(() => Boolean(cartUuid && cartUuid.length > 0), [cartUuid]);

  async function sendToStoreApi(args: { cartUuid: string; name: string; phone: string; email?: string }) {
    const response = await fetch('https://oui.corescent.in/api/kiosk/proceed-to-store', {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_uuid: args.cartUuid, name: args.name, phone: args.phone, email: args.email }),
    });
    if (!response.ok) {
      let message = 'Could not submit request.';
      try { const data = await response.json(); message = data?.message || data?.error || message; } catch {}
      throw new Error(message);
    }
    return response.json().catch(() => ({ ok: true }));
  }

  const handleSubmitSendToStore = async () => {
    if (!canSendToStore) { Alert.alert('Cart not ready', 'Try again in a moment.'); return; }
    const name = sendName.trim();
    const phone = sendPhone.replace(/\s/g, '').trim();
    const email = sendEmail.trim();
    if (!name) { Alert.alert('Missing name', 'Please enter your name.'); return; }
    if (!phone || phone.length < 8) { Alert.alert('Missing phone', 'Please enter a valid phone number.'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { Alert.alert('Invalid email', 'Please enter a valid email.'); return; }
    try {
      setSendLoading(true);
      await sendToStoreApi({ cartUuid: cartUuid as string, name, phone, email: email || undefined });
      Alert.alert('Sent to store', email ? 'Invoice will be sent to your email.' : 'Request saved. Our store will contact you.');
      setSendFormOpen(false); setSendLoading(false);
      setSendName(''); setSendPhone(''); setSendEmail('');
    } catch (e: unknown) {
      setSendLoading(false);
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not submit request.');
    }
  };

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const resolvedInvoiceUrl =
    invoiceUrl || (qrToken ? `https://oui.corescent.in/kiosk/invoice/${encodeURIComponent(qrToken)}` : null);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0)) || 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 1;
      return sum + price * qty;
    }, 0);
  }, [items]);

  const handleRemove = (productId: number) => {
    Alert.alert('Remove item', 'Remove this product from cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFromCart(productId) },
    ]);
  };

  const handleQuantityMinus = async (item: KioskCartItem) => {
    const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 1;
    if (qty <= 1) { handleRemove(item.product_id); return; }
    await removeFromCart(item.product_id, 1);
  };

  const handleQuantityPlus = async (item: KioskCartItem) => {
    await addToCart(item.product_id, 1);
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#2D3335" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Shopping Bag</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('New Cart', 'Create a fresh cart?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create', onPress: () => resetCart() },
          ])}
          style={st.newCartBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh" size={16} color="#575E7C" />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={st.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#A83836" />
          <Text style={st.errorText}>{error}</Text>
        </View>
      )}

      {loading && items.length === 0 ? (
        <View style={st.centerWrap}>
          <ActivityIndicator size="large" color="#2D3335" />
          <Text style={st.loadingText}>Loading your bag…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={st.centerWrap}>
          <View style={st.emptyIconWrap}>
            <Ionicons name="bag-outline" size={48} color="#E5E9EB" />
          </View>
          <Text style={st.emptyTitle}>Your bag is empty</Text>
          <Text style={st.emptySub}>Add items from the shop to see them here.</Text>
          <TouchableOpacity
            style={st.browseBtnOuter}
            activeOpacity={0.85}
            onPress={() => router.replace('/(tabs)/home' as any)}
          >
            <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.browseBtn}>
              <Text style={st.browseBtnText}>Browse Products</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Item cards */}
            {items.map((item, index) => {
              const qty = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10) || 1;
              const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0)) || 0;
              const total = typeof item.total === 'number' ? item.total : price * qty;
              const imageUrl = getItemImageUrl(item);
              const name = item.name || `Product #${item.product_id}`;
              return (
                <View key={`cart-${index}-${item.product_id}`} style={st.itemCard}>
                  <View style={st.itemImgWrap}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={st.itemImg} contentFit="cover" />
                    ) : (
                      <View style={[st.itemImg, st.itemImgPlaceholder]}>
                        <Ionicons name="shirt-outline" size={28} color="#9BA1A6" />
                      </View>
                    )}
                  </View>
                  <View style={st.itemInfo}>
                    <Text style={st.itemName} numberOfLines={2}>{name}</Text>
                    {price > 0 && <Text style={st.itemPrice}>₹{total.toFixed(0)}</Text>}
                    <View style={st.qtyRow}>
                      <View style={st.stepper}>
                        <TouchableOpacity onPress={() => handleQuantityMinus(item)} style={st.stepperBtn} activeOpacity={0.8}>
                          <Ionicons name="remove" size={16} color="#2D3335" />
                        </TouchableOpacity>
                        <Text style={st.stepperVal}>{qty}</Text>
                        <TouchableOpacity onPress={() => handleQuantityPlus(item)} style={st.stepperBtn} activeOpacity={0.8}>
                          <Ionicons name="add" size={16} color="#2D3335" />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => handleRemove(item.product_id)} style={st.removeBtn} activeOpacity={0.8}>
                        <Ionicons name="trash-outline" size={18} color="#A83836" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Order Summary */}
            <View style={st.summaryCard}>
              <Text style={st.summaryTitle}>Order Summary</Text>
              <View style={st.summaryRow}>
                <Text style={st.summaryLabel}>Subtotal ({items.length} {items.length === 1 ? 'item' : 'items'})</Text>
                <Text style={st.summaryValue}>₹{subtotal.toFixed(0)}</Text>
              </View>
              <View style={st.summaryRow}>
                <Text style={st.summaryLabel}>Delivery</Text>
                <Text style={[st.summaryValue, { color: '#2D8653' }]}>Free</Text>
              </View>
              <View style={st.summaryDivider} />
              <View style={st.summaryRow}>
                <Text style={st.summaryTotal}>Total</Text>
                <Text style={st.summaryTotal}>₹{subtotal.toFixed(0)}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom checkout actions */}
          <View style={st.bottomBar}>
            {resolvedInvoiceUrl ? (
              <View style={st.bottomActions}>
                <TouchableOpacity
                  style={st.qrCheckoutBtnOuter}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/qr-checkout', params: { invoiceUrl: resolvedInvoiceUrl } } as any)}
                >
                  <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.checkoutBtn}>
                    <Ionicons name="qr-code-outline" size={18} color="#fff" />
                    <Text style={st.checkoutBtnText}>View QR Invoice</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.sendStoreBtn}
                  activeOpacity={0.85}
                  onPress={() => setSendFormOpen(true)}
                >
                  <Text style={st.sendStoreBtnText}>Send to Store</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={st.checkoutBtnOuter} activeOpacity={0.85} onPress={() => {
                if (canSendToStore) setSendFormOpen(true);
                else Alert.alert('Cart not ready', 'Please wait a moment while we prepare your cart.');
              }}>
                <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.checkoutBtn}>
                  <Text style={st.checkoutBtnText}>Proceed to Checkout</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Send to Store Modal */}
      <Modal transparent visible={sendFormOpen} animationType="fade" onRequestClose={() => setSendFormOpen(false)}>
        <View style={st.modalRoot}>
          <Pressable style={st.modalBackdrop} onPress={() => { if (!sendLoading) setSendFormOpen(false); }} />
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>Send to Store</Text>
            <Text style={st.modalHint}>Name and phone required. Email optional (invoice will be emailed).</Text>

            <Text style={st.fieldLabel}>Name</Text>
            <TextInput
              value={sendName} onChangeText={setSendName}
              placeholder="Enter your name" placeholderTextColor="#9BA1A6"
              style={st.modalInput} autoCapitalize="words" editable={!sendLoading}
            />
            <Text style={st.fieldLabel}>Phone</Text>
            <TextInput
              value={sendPhone} onChangeText={setSendPhone}
              placeholder="Enter phone number" placeholderTextColor="#9BA1A6"
              style={st.modalInput} keyboardType="phone-pad" editable={!sendLoading}
            />
            <Text style={st.fieldLabel}>Email (Optional)</Text>
            <TextInput
              value={sendEmail} onChangeText={setSendEmail}
              placeholder="Enter email" placeholderTextColor="#9BA1A6"
              style={st.modalInput} keyboardType="email-address" autoCapitalize="none" editable={!sendLoading}
            />

            <View style={st.modalActions}>
              <TouchableOpacity style={st.modalCancelBtn} activeOpacity={0.85} onPress={() => setSendFormOpen(false)} disabled={sendLoading}>
                <Text style={st.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.modalSubmitBtnOuter} activeOpacity={0.85} onPress={handleSubmitSendToStore} disabled={sendLoading}>
                <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.modalSubmitBtn}>
                  {sendLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.modalSubmitText}>Submit</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F1F4F5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18, fontFamily: FontFamily.headingExtra, color: '#2D3335',
  },
  newCartBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F1F4F5', alignItems: 'center', justifyContent: 'center',
  },

  /* error */
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', marginHorizontal: SIDE_PAD, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: FontFamily.bodyMedium, color: '#A83836' },

  /* empty/loading states */
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, fontFamily: FontFamily.bodyMedium, color: '#5A6062' },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F1F4F5', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontFamily: FontFamily.headingExtra, color: '#2D3335', marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: FontFamily.body, color: '#5A6062', textAlign: 'center', marginBottom: 24 },
  browseBtnOuter: { borderRadius: 14, overflow: 'hidden' },
  browseBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  browseBtnText: { color: '#fff', fontSize: 15, fontFamily: FontFamily.heading },

  /* scroll & items */
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SIDE_PAD, paddingTop: 16, paddingBottom: 20 },
  itemCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    marginBottom: 12, padding: 12, borderWidth: 1, borderColor: '#EEF1F4',
  },
  itemImgWrap: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F1F4F5' },
  itemImg: { width: '100%', height: '100%' },
  itemImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  itemBrand: { fontSize: 9, fontFamily: FontFamily.bodySemiBold, color: '#9BA1A6', letterSpacing: 1.5, marginBottom: 2 },
  itemName: { fontSize: 15, fontFamily: FontFamily.heading, color: '#2D3335', marginBottom: 4 },
  itemPrice: { fontSize: 15, fontFamily: FontFamily.bodyBold, color: '#575E7C', marginBottom: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F4F5', borderRadius: 10,
  },
  stepperBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 14, fontFamily: FontFamily.heading, color: '#2D3335', minWidth: 24, textAlign: 'center' },
  removeBtn: { padding: 6 },

  /* summary */
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#EEF1F4', marginTop: 8,
  },
  summaryTitle: { fontSize: 16, fontFamily: FontFamily.headingExtra, color: '#2D3335', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, fontFamily: FontFamily.body, color: '#5A6062' },
  summaryValue: { fontSize: 14, fontFamily: FontFamily.bodySemiBold, color: '#2D3335' },
  summaryDivider: { height: 1, backgroundColor: '#EEF1F4', marginVertical: 10 },
  summaryTotal: { fontSize: 16, fontFamily: FontFamily.headingExtra, color: '#2D3335' },

  /* bottom bar */
  bottomBar: {
    paddingHorizontal: SIDE_PAD, paddingVertical: 14,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEF1F4',
  },
  bottomActions: { gap: 10 },
  checkoutBtnOuter: { borderRadius: 14, overflow: 'hidden' },
  qrCheckoutBtnOuter: { borderRadius: 14, overflow: 'hidden' },
  checkoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 8,
  },
  checkoutBtnText: { color: '#fff', fontSize: 16, fontFamily: FontFamily.heading },
  sendStoreBtn: {
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#F1F4F5', alignItems: 'center', justifyContent: 'center',
  },
  sendStoreBtnText: { fontSize: 15, fontFamily: FontFamily.heading, color: '#2D3335' },

  /* modal */
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24,
    zIndex: 2, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: FontFamily.headingExtra, color: '#2D3335', marginBottom: 6 },
  modalHint: { fontSize: 13, fontFamily: FontFamily.body, color: '#5A6062', marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontFamily: FontFamily.bodySemiBold, color: '#5A6062', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1, borderColor: '#E5E9EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    fontFamily: FontFamily.body, color: '#2D3335', backgroundColor: '#F8F9FA',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#F1F4F5', alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, fontFamily: FontFamily.heading, color: '#2D3335' },
  modalSubmitBtnOuter: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  modalSubmitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalSubmitText: { color: '#fff', fontSize: 15, fontFamily: FontFamily.heading },
});
