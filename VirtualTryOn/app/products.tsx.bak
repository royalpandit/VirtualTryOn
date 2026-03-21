import { getSession } from '@/lib/auth';
import { getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { useKioskCart } from '@/context/KioskCartContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ClothType = 'upper' | 'lower' | 'overall';

type UiClothItem = {
  id: string;
  name: string;
  price: string;
  cloth_type: ClothType;
  image: string;
  categoryId?: number;
  categoryName?: string;
};

function inferClothType(p: OuiSellerProduct): ClothType {
  const t = p.cloth_type?.toLowerCase();
  if (t === 'upper' || t === 'lower' || t === 'overall') return t;
  const cat = p.category?.name?.toLowerCase() ?? '';
  if (cat.includes('dress')) return 'overall';
  if (cat.includes('pant') || cat.includes('jeans') || cat.includes('lower')) return 'lower';
  return 'upper';
}

function canAddToCartId(id: string) {
  return /^\d+$/.test(id);
}

function getImageUrl(p: OuiSellerProduct): string | null {
  const imgPath = (p as any).thumb_image ?? p.image;
  if (!imgPath || typeof imgPath !== 'string') return null;
  if (imgPath.startsWith('http')) return imgPath;
  return getOuiAssetUrl(imgPath) ?? null;
}

export default function ProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; categoryId?: string; categoryName?: string }>();
  const { addToCart, itemCount } = useKioskCart();

  const mode = typeof params.mode === 'string' ? params.mode : 'all';
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : undefined;
  const categoryName = typeof params.categoryName === 'string' ? params.categoryName : undefined;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UiClothItem[]>([]);
  const [sellerId, setSellerId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const session = await getSession();
        const vend = session?.user?.id ?? null;
        const isLoggedIn = Boolean(session?.accessToken && vend);
        if (!mounted) return;
        if (!isLoggedIn) {
          setSellerId(null);
          router.replace('/login');
          return;
        }
        setSellerId(vend as number);

        if (!vend) {
          setItems([]);
          return;
        }

        const accessToken = session?.accessToken ?? null;
        const parsedCategoryId = mode === 'category' && categoryId ? parseInt(categoryId, 10) : null;
        const res = await getSellerProducts({
          sellerId: vend,
          page: 1,
          perPage: 80,
          accessToken,
          category_id: parsedCategoryId != null && Number.isFinite(parsedCategoryId) ? parsedCategoryId : null,
        });

        if (!mounted) return;
        const rawProducts = Array.isArray(res?.products) ? res.products : [];

        const mapped: UiClothItem[] = [];
        for (const p of rawProducts) {
          const id = (p as any)?.id;
          if (id == null) continue;
          const imageUrl = getImageUrl(p);
          if (!imageUrl) continue; // no placeholders; show real images only

          const effectivePrice = p.offer_price != null ? p.offer_price : p.price;
          const price =
            typeof effectivePrice === 'number' && Number.isFinite(effectivePrice)
              ? `₹${effectivePrice}`
              : effectivePrice != null
                ? `₹${String(effectivePrice)}`
                : '';

          mapped.push({
            id: String(id),
            name: (p.name ?? (p as any).short_name ?? 'Item').toString(),
            price,
            cloth_type: inferClothType(p),
            image: imageUrl,
            categoryId: (p as any).category_id ?? p.category?.id,
            categoryName: p.category?.name,
          });
        }

        setItems(mapped);
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== 'Unauthorized') Alert.alert('Failed to load products', msg || 'Unable to fetch products');
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [mode, categoryId, router]);

  const title = useMemo(() => {
    if (mode === 'category') return categoryName ?? 'Category';
    return 'All Products';
  }, [mode, categoryName]);

  const handleAddToCart = useCallback(
    async (item: UiClothItem) => {
      if (!canAddToCartId(item.id)) return;
      try {
        await addToCart(Number(item.id), 1);
        Alert.alert('Added', 'Item added to cart.');
      } catch (e: unknown) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not add to cart.');
      }
    },
    [addToCart]
  );

  const handleItemPress = useCallback(
    (item: UiClothItem) => {
      router.push({
        pathname: '/try-on',
        params: {
          clothId: item.id,
          clothName: item.name,
          clothImageUrl: item.image,
          clothType: item.cloth_type,
        },
      });
    },
    [router]
  );

  const CARD_GAP = 12;
  const CARD_WIDTH = (SCREEN_WIDTH - 20 * 2 - CARD_GAP) / 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#1a1a2e" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        <TouchableOpacity onPress={() => router.push('/cart')} style={styles.cartBtn} activeOpacity={0.85}>
          <Ionicons name="cart-outline" size={18} color="#6B4EAA" />
          {itemCount > 0 ? <View style={styles.cartDot} /> : null}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6B4EAA" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No clothes found</Text>
          <Text style={styles.emptySub}>Try another category.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={{ gap: CARD_GAP, justifyContent: 'space-between' }}
          renderItem={({ item }) => (
            <View style={{ width: CARD_WIDTH }}>
              <View style={styles.card}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => handleItemPress(item)}>
                  <View style={styles.imageWrap}>
                    <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" />
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {!!item.price && <Text style={styles.price}>{item.price}</Text>}
                  </View>
                </TouchableOpacity>
                {canAddToCartId(item.id) ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddToCart(item);
                    }}
                    activeOpacity={0.9}
                    style={styles.addBtn}
                  >
                    <Ionicons name="cart-outline" size={16} color="#6B4EAA" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#1a1a2e' },
  cartBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', position: 'relative' },
  cartDot: { position: 'absolute', right: 10, top: 10, width: 8, height: 8, borderRadius: 99, backgroundColor: '#6d567e' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#6B7280' },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 15, fontWeight: '600', color: '#6B7280', textAlign: 'center' },

  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f4f5' },
  imageWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#f1f4f5', justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  meta: { paddingHorizontal: 12, paddingVertical: 10 },
  name: { fontSize: 13, fontWeight: '800', color: '#2d3335', marginBottom: 6 },
  price: { fontSize: 13, fontWeight: '900', color: '#575e7c' },
  addBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(107,78,170,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

