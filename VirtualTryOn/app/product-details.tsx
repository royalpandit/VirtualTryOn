import { FontFamily } from '@/constants/theme';
import { useKioskCart } from '@/context/KioskCartContext';
import { useWishlist } from '@/context/WishlistContext';
import { getSession } from '@/lib/auth';
import { getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDE_PAD = 20;



export default function ProductDetailsScreen() {
  const router = useRouter();
  const { addToCart, itemCount } = useKioskCart();
  const { isWished, toggle: toggleWishlist } = useWishlist();
  const params = useLocalSearchParams<{
    productId?: string;
    productName?: string;
    productImage?: string;
    productPrice?: string;
    clothType?: string;
  }>();

  const productId = params.productId ?? '';
  const productName = params.productName ?? 'Product';
  const productImage = params.productImage ?? '';
  const productPrice = params.productPrice ?? '';
  const clothType = params.clothType ?? 'upper';

  const [product, setProduct] = useState<OuiSellerProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);

  // Load additional product info
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await getSession();
        if (!mounted || !session?.user?.id) { setLoading(false); return; }
        const res = await getSellerProducts({
          sellerId: session.user.id,
          page: 1,
          perPage: 100,
          accessToken: session.accessToken ?? null,
        });
        if (!mounted) return;
        const found = (res?.products ?? []).find((p) => String(p.id) === productId);
        if (found) setProduct(found);
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [productId]);

  const mainImage = useMemo(() => {
    if (productImage) return productImage;
    if (!product) return null;
    const img = product.thumb_image ?? product.image;
    if (!img || typeof img !== 'string') return null;
    return img.startsWith('http') ? img : getOuiAssetUrl(img);
  }, [productImage, product]);

  const displayName = product?.name ?? productName;
  const displayPrice = useMemo(() => {
    if (product) {
      const ep = product.offer_price ?? product.price;
      return typeof ep === 'number' ? `₹${ep}` : productPrice;
    }
    return productPrice;
  }, [product, productPrice]);

  const originalPrice = useMemo(() => {
    if (product?.offer_price != null && product?.price != null && product.offer_price < product.price) {
      return `₹${product.price}`;
    }
    return null;
  }, [product]);

  const description = (product as any)?.description || (product as any)?.short_description || null;

  const handleAddToCart = useCallback(async () => {
    if (!/^\d+$/.test(productId)) return;
    setAddingToCart(true);
    try {
      await addToCart(Number(productId), 1);
      Alert.alert('Added to Bag', `${displayName} has been added to your shopping bag.`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add to bag');
    } finally {
      setAddingToCart(false);
    }
  }, [addToCart, productId, displayName]);

  const handleTryOn = useCallback(() => {
    router.push({
      pathname: '/try-on',
      params: {
        clothId: productId,
        clothName: displayName,
        clothImageUrl: mainImage ?? '',
        clothType,
      },
    });
  }, [router, productId, displayName, mainImage, clothType]);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.headerIconBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#2D3335" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/cart')} style={st.headerIconBtn} activeOpacity={0.85}>
          <Ionicons name="bag-handle-outline" size={20} color="#2D3335" />
          {itemCount > 0 && <View style={st.cartDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Main image */}
        <View style={st.mainImageWrap}>
          {mainImage ? (
            <Image source={{ uri: mainImage }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, st.imagePlaceholder]}>
              <Ionicons name="shirt-outline" size={64} color="#E5E9EB" />
            </View>
          )}
          <TouchableOpacity style={st.heartFloating} activeOpacity={0.8} onPress={() => toggleWishlist(productId)}>
            <Ionicons name={isWished(productId) ? 'heart' : 'heart-outline'} size={20} color={isWished(productId) ? '#A83836' : '#2D3335'} />
          </TouchableOpacity>
        </View>

        {/* Product info */}
        <View style={st.infoSection}>
          <Text style={st.productName}>{displayName}</Text>
          <View style={st.priceRow}>
            <Text style={st.price}>{displayPrice}</Text>
            {originalPrice && <Text style={st.origPrice}>{originalPrice}</Text>}
          </View>

          {description && (
            <Text style={st.description} numberOfLines={4}>
              {description}
            </Text>
          )}

          {/* Virtual Try-On CTA */}
          <TouchableOpacity style={st.tryOnCard} activeOpacity={0.9} onPress={handleTryOn}>
            <View style={st.tryOnIconWrap}>
              <Ionicons name="camera-outline" size={22} color="#575E7C" />
            </View>
            <View style={st.tryOnTextWrap}>
              <Text style={st.tryOnTitle}>Virtual Try-On</Text>
              <Text style={st.tryOnSubtitle}>See how it looks on you</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#575E7C" />
          </TouchableOpacity>


        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={st.bottomBar}>
        <TouchableOpacity style={st.wishlistBottomBtn} activeOpacity={0.85} onPress={() => toggleWishlist(productId)}>
          <Ionicons name={isWished(productId) ? 'heart' : 'heart-outline'} size={22} color={isWished(productId) ? '#A83836' : '#2D3335'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={st.addBagBtnOuter}
          activeOpacity={0.85}
          onPress={handleAddToCart}
          disabled={addingToCart}
        >
          <LinearGradient
            colors={['#575E7C', '#D5DBFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={st.addBagBtn}
          >
            {addingToCart ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="bag-outline" size={18} color="#fff" />
                <Text style={st.addBagText}>Add to Bag</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { paddingBottom: 100 },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F4',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A83836',
  },

  /* main image */
  mainImageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.15,
    backgroundColor: '#F1F4F5',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F4F5',
  },
  heartFloating: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  /* info */
  infoSection: {
    paddingHorizontal: SIDE_PAD,
    paddingTop: 20,
  },
  brandLabel: {
    fontSize: 10,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 2,
    marginBottom: 6,
  },
  productName: {
    fontSize: 24,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  price: {
    fontSize: 20,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
  },
  origPrice: {
    fontSize: 16,
    fontFamily: FontFamily.body,
    color: '#9BA1A6',
    textDecorationLine: 'line-through',
  },
  description: {
    fontSize: 14,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    lineHeight: 21,
    marginBottom: 20,
  },

  /* try-on card */
  tryOnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F4F5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  tryOnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryOnTextWrap: { flex: 1 },
  tryOnTitle: {
    fontSize: 15,
    fontFamily: FontFamily.heading,
    color: '#2D3335',
  },
  tryOnSubtitle: {
    fontSize: 12,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    marginTop: 1,
  },



  /* bottom bar */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDE_PAD,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F4',
    gap: 12,
  },
  wishlistBottomBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBagBtnOuter: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  addBagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  addBagText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FontFamily.heading,
  },
});
