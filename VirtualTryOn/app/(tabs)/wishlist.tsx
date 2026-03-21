import { FontFamily } from '@/constants/theme';
import { useWishlist } from '@/context/WishlistContext';
import { getSession } from '@/lib/auth';
import { getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
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
const CARD_GAP = 12;
const CARD_W = (SCREEN_WIDTH - SIDE_PAD * 2 - CARD_GAP) / 2;

type ClothType = 'upper' | 'lower' | 'overall';
type UiItem = {
  id: string;
  name: string;
  price: string;
  cloth_type: ClothType;
  image: string;
};

function inferClothType(p: OuiSellerProduct): ClothType {
  const t = p.cloth_type?.toLowerCase();
  if (t === 'upper' || t === 'lower' || t === 'overall') return t;
  const cat = p.category?.name?.toLowerCase() ?? '';
  if (cat.includes('dress')) return 'overall';
  if (cat.includes('pant') || cat.includes('jeans') || cat.includes('lower')) return 'lower';
  return 'upper';
}

function capitalize(s: string): string {
  return s.split(' ').map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')).join(' ');
}

export default function WishlistScreen() {
  const router = useRouter();
  const { ids: wishlistIds, isWished, toggle: toggleWishlist } = useWishlist();
  const [allProducts, setAllProducts] = useState<OuiSellerProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await getSession();
        if (!mounted || !session?.user?.id) return;
        const res = await getSellerProducts({
          sellerId: session.user.id,
          page: 1,
          perPage: 100,
          accessToken: session.accessToken ?? null,
        });
        if (mounted) setAllProducts(res?.products?.filter((p) => p?.id != null) ?? []);
      } catch {
        if (mounted) setAllProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Map all products to UI format
  const allUiItems: UiItem[] = useMemo(() => {
    return allProducts.map((p) => {
      const name = (p.name ?? '').trim();
      if (!name) return null;
      const img = p.thumb_image ?? p.image;
      const imageUrl = typeof img === 'string' ? (img.startsWith('http') ? img : getOuiAssetUrl(img)) : null;
      if (!imageUrl) return null;
      const ep = p.offer_price ?? p.price;
      return {
        id: String(p.id),
        name,
        price: typeof ep === 'number' ? `₹${ep}` : '',
        cloth_type: inferClothType(p),
        image: imageUrl,
      };
    }).filter((x): x is UiItem => x != null);
  }, [allProducts]);

  // Saved Items — products that are in the wishlist
  const savedItems = useMemo(() => {
    return allUiItems.filter((item) => wishlistIds.has(item.id));
  }, [allUiItems, wishlistIds]);

  // Recommendations = products NOT in wishlist
  const recommendations = useMemo(() => {
    return allUiItems.filter((item) => !wishlistIds.has(item.id)).slice(0, 6);
  }, [allUiItems, wishlistIds]);

  const onItemPress = useCallback(
    (item: UiItem) => {
      router.push({
        pathname: '/product-details',
        params: { productId: item.id, productName: item.name, productImage: item.image, productPrice: item.price, clothType: item.cloth_type },
      } as any);
    },
    [router],
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.headerTitle}>My Curations</Text>
        {savedItems.length > 0 && (
          <Text style={st.headerCount}>{savedItems.length} item{savedItems.length !== 1 ? 's' : ''}</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* Style Match Card */}
        <TouchableOpacity style={st.styleMatchCard} activeOpacity={0.9} onPress={() => router.push('/(tabs)/search' as any)}>
          <LinearGradient
            colors={['#575E7C', '#D5DBFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.styleMatchGradient}
          >
            <View style={st.styleMatchIconWrap}>
              <Ionicons name="sparkles" size={24} color="#fff" />
            </View>
            <View style={st.styleMatchTextWrap}>
              <Text style={st.styleMatchTitle}>Style Match</Text>
              <Text style={st.styleMatchSub}>Discover pieces curated for your taste</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Saved Items */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>Saved Items</Text>

          {loading ? (
            <View style={st.loadingWrap}>
              <ActivityIndicator size="small" color="#2D3335" />
            </View>
          ) : savedItems.length === 0 ? (
            <View style={st.emptyState}>
              <View style={st.emptyIconWrap}>
                <Ionicons name="heart-outline" size={40} color="#E1C4F4" />
              </View>
              <Text style={st.emptyTitle}>No saved items yet</Text>
              <Text style={st.emptyText}>
                Tap the heart icon on any product to save it to your curations.
              </Text>
              <TouchableOpacity
                style={st.exploreBtnOuter}
                activeOpacity={0.85}
                onPress={() => router.push('/products' as any)}
              >
                <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.exploreBtn}>
                  <Text style={st.exploreBtnText}>Explore Collection</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.savedGrid}>
              {savedItems.map((item) => (
                <TouchableOpacity key={item.id} activeOpacity={0.9} onPress={() => onItemPress(item)} style={{ width: CARD_W }}>
                  <View style={[st.cardImgWrap, { width: CARD_W, height: CARD_W * 1.25 }]}>
                    <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    <TouchableOpacity
                      style={st.cardHeart}
                      activeOpacity={0.8}
                      onPress={(e) => { e.stopPropagation?.(); toggleWishlist(item.id); }}
                    >
                      <Ionicons name="heart" size={16} color="#A83836" />
                    </TouchableOpacity>
                  </View>
                  <Text style={st.cardName} numberOfLines={1}>{capitalize(item.name)}</Text>
                  <Text style={st.cardPrice}>{item.price}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Premium Store Recommendations */}
        {!loading && recommendations.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionHeaderRow}>
              <Text style={st.sectionTitle}>Recommendations</Text>
              <TouchableOpacity onPress={() => router.push('/products' as any)} activeOpacity={0.8}>
                <Text style={st.viewAll}>View All ›</Text>
              </TouchableOpacity>
            </View>
            <View style={st.recsGrid}>
              {recommendations.map((item) => (
                <TouchableOpacity key={item.id} activeOpacity={0.9} onPress={() => onItemPress(item)} style={{ width: CARD_W }}>
                  <View style={[st.recImgWrap, { width: CARD_W, height: CARD_W * 1.25 }]}>
                    <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    <TouchableOpacity
                      style={st.recHeart}
                      activeOpacity={0.8}
                      onPress={(e) => { e.stopPropagation?.(); toggleWishlist(item.id); }}
                    >
                      <Ionicons name={isWished(item.id) ? 'heart' : 'heart-outline'} size={16} color={isWished(item.id) ? '#A83836' : '#2D3335'} />
                    </TouchableOpacity>
                  </View>
                  <Text style={st.recName} numberOfLines={1}>{capitalize(item.name)}</Text>
                  <Text style={st.recPrice}>{item.price}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { paddingBottom: 30 },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SIDE_PAD,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 26, fontFamily: FontFamily.headingExtra, color: '#2D3335' },
  headerCount: { fontSize: 13, fontFamily: FontFamily.bodyMedium, color: '#9BA1A6' },

  /* style match card */
  styleMatchCard: {
    marginHorizontal: SIDE_PAD,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  styleMatchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  styleMatchIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleMatchTextWrap: { flex: 1 },
  styleMatchTitle: {
    fontSize: 17,
    fontFamily: FontFamily.heading,
    color: '#fff',
  },
  styleMatchSub: {
    fontSize: 12,
    fontFamily: FontFamily.body,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  /* section */
  section: { paddingHorizontal: SIDE_PAD, marginTop: 24 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 12,
  },
  viewAll: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#575E7C',
    marginBottom: 12,
  },

  /* saved items grid */
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  cardImgWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F4F5',
  },
  cardHeart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBrand: {
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  cardName: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 14,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
    marginTop: 2,
  },

  /* empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  exploreBtnOuter: { borderRadius: 12, overflow: 'hidden' },
  exploreBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exploreBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FontFamily.heading,
  },

  /* loading */
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },

  /* recommendations grid */
  recsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  recImgWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F4F5',
  },
  recHeart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recBrand: {
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  recName: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
    marginTop: 2,
  },
  recPrice: {
    fontSize: 14,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
    marginTop: 2,
  },
});
