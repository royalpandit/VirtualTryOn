import { FontFamily } from '@/constants/theme';
import { useWishlist } from '@/context/WishlistContext';
import { getSession } from '@/lib/auth';
import { getBannerImageUrl, getBannersByVendor, getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDE_PAD = 20;
const GAP = 12;
const CARD_W = (SCREEN_WIDTH - SIDE_PAD * 2 - GAP) / 2;

type ClothType = 'upper' | 'lower' | 'overall';

type UiItem = {
  id: string;
  name: string;
  price: string;
  cloth_type: ClothType;
  image: string;
};

function capitalize(s: string): string {
  return s.split(' ').map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')).join(' ');
}

function inferClothType(p: OuiSellerProduct): ClothType {
  const t = p.cloth_type?.toLowerCase();
  if (t === 'upper' || t === 'lower' || t === 'overall') return t;
  const cat = p.category?.name?.toLowerCase() ?? '';
  if (cat.includes('pant') || cat.includes('jeans') || cat.includes('lower')) return 'lower';
  if (cat.includes('dress')) return 'overall';
  return 'upper';
}

export default function SearchScreen() {
  const router = useRouter();
  const { isWished, toggle: toggleWishlist } = useWishlist();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<OuiSellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerUrls, setBannerUrls] = useState<string[]>([]);

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
        if (mounted) setProducts(res?.products?.filter((p) => p?.id != null) ?? []);

        // Fetch all banners
        try {
          const bannerRes = await getBannersByVendor(session.user.id);
          const active = (bannerRes?.banners ?? []).filter((b: any) => b && b.status !== 0);
          const sorted = [...active].sort((a: any, b: any) => ((a.priority ?? 999) - (b.priority ?? 999)));
          const urls: string[] = [];
          for (const b of sorted) {
            const url = getBannerImageUrl(b);
            if (url) urls.push(url);
          }
          if (mounted) setBannerUrls(urls);
        } catch {}
      } catch {
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const items: UiItem[] = useMemo(() => {
    return products
      .map((p) => {
        const name = (p.name ?? '').trim();
        if (!name) return null;
        const img = p.thumb_image ?? p.image;
        const imageUrl = typeof img === 'string' ? (img.startsWith('http') ? img : getOuiAssetUrl(img)) : null;
        if (!imageUrl) return null;
        const effectivePrice = p.offer_price ?? p.price;
        return {
          id: String(p.id),
          name,
          price: typeof effectivePrice === 'number' ? `₹${effectivePrice}` : '',
          cloth_type: inferClothType(p),
          image: imageUrl,
        };
      })
      .filter((x): x is UiItem => x != null);
  }, [products]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const renderItem = useCallback(
    ({ item }: { item: UiItem }) => (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          router.push({
            pathname: '/product-details',
            params: { productId: item.id, productName: item.name, productImage: item.image, productPrice: item.price, clothType: item.cloth_type },
          } as any)
        }
        style={st.card}
      >
        <View style={st.imgWrap}>
          <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <TouchableOpacity
            style={st.heartBtn}
            activeOpacity={0.8}
            onPress={(e) => { e.stopPropagation?.(); toggleWishlist(item.id); }}
          >
            <Ionicons name={isWished(item.id) ? 'heart' : 'heart-outline'} size={16} color={isWished(item.id) ? '#A83836' : '#2D3335'} />
          </TouchableOpacity>
        </View>
        <Text style={st.cardName} numberOfLines={1}>{capitalize(item.name)}</Text>
        <Text style={st.cardPrice}>{item.price}</Text>
      </TouchableOpacity>
    ),
    [router, isWished, toggleWishlist],
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.title}>Search</Text>
      </View>
      <View style={st.searchBar}>
        <Ionicons name="search-outline" size={20} color="#5A6062" />
        <TextInput
          style={st.input}
          placeholder="Search products..."
          placeholderTextColor="#9BA1A6"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9BA1A6" />
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#2D3335" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={st.row}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            bannerUrls.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: GAP }}>
                {bannerUrls.map((url, idx) => (
                  <View key={idx} style={st.heroBanner}>
                    <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.4)']} style={StyleSheet.absoluteFillObject} />
                  </View>
                ))}
              </ScrollView>
            ) : null
          }
          ListEmptyComponent={
            <View style={st.center}>
              <Ionicons name="search" size={48} color="#E5E9EB" />
              <Text style={st.emptyText}>No products found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { paddingHorizontal: SIDE_PAD, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 26, fontFamily: FontFamily.headingExtra, color: '#2D3335' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F4F5',
    marginHorizontal: SIDE_PAD,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.body,
    color: '#2D3335',
  },
  list: { paddingHorizontal: SIDE_PAD, paddingBottom: 30 },
  row: { gap: GAP, marginBottom: GAP },
  card: { width: CARD_W },
  imgWrap: {
    width: CARD_W,
    height: CARD_W * 1.25,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F4F5',
  },
  heartBtn: {
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
    marginBottom: 2,
  },
  cardPrice: {
    fontSize: 14,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  heroBanner: {
    height: 140,
    width: SCREEN_WIDTH * 0.75,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F1F4F5',
  },
  emptyText: {
    fontSize: 15,
    fontFamily: FontFamily.bodyMedium,
    color: '#5A6062',
    marginTop: 12,
  },
});
