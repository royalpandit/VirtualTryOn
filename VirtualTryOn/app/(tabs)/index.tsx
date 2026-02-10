import { getSession } from '@/lib/auth';
import { getCategoryList, getOuiAssetUrl, getSellerProducts, type OuiCategory, type OuiSellerProduct } from '@/lib/ouiApi';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 20 * 2 - 12 * 2) / 2;
const CATEGORY_ITEM_WIDTH = 80;

type ClothType = 'upper' | 'lower' | 'overall';

function inferClothType(p: OuiSellerProduct): ClothType {
  const t = p.cloth_type?.toLowerCase();
  if (t === 'upper' || t === 'lower' || t === 'overall') return t;
  const cat = p.category?.name?.toLowerCase() ?? '';
  if (cat.includes('dress')) return 'overall';
  if (cat.includes('bag') || cat.includes('boot') || cat.includes('sneaker') || cat.includes('accessor') || cat.includes('watch')) return 'upper';
  if (cat.includes('pant') || cat.includes('jeans') || cat.includes('lower')) return 'lower';
  return 'upper';
}

type UiClothItem = {
  id: string;
  name: string;
  price: string;
  cloth_type: ClothType;
  image: number | string;
  categoryName?: string;
};

type FilterChip = { id: string; name: string; imageUrl: string | null };

export default function HomeScreen() {
  const router = useRouter();
  const [selectedFilterId, setSelectedFilterId] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [products, setProducts] = useState<OuiSellerProduct[]>([]);
  const [categories, setCategories] = useState<OuiCategory[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [session, catRes] = await Promise.all([getSession(), getCategoryList().catch(() => ({ categories: [] }))]);
        if (!mounted) return;
        const id = session.user?.id ?? null;
        setSellerId(id);
        const list = Array.isArray(catRes?.categories) ? catRes.categories : [];
        setCategories(list.filter((c) => c.status !== 0));

        if (!id) {
          setProducts([]);
          setLoading(false);
          return;
        }
        const res = await getSellerProducts({ sellerId: id, page: 1, perPage: 50, accessToken: session.accessToken });
        if (!mounted) return;
        setProducts(Array.isArray(res?.products) ? res.products : []);
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Failed to load products', msg || 'Unable to fetch products');
        setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filterChips: FilterChip[] = useMemo(() => {
    const base: FilterChip[] = [{ id: 'all', name: 'All', imageUrl: null }];
    categories.forEach((c) => base.push({ id: String(c.id), name: c.name, imageUrl: getOuiAssetUrl(c.image) ?? null }));
    return base;
  }, [categories]);

  const uiItems: UiClothItem[] = useMemo(() => {
    return products.map((p) => {
      const id = String(p.id);
      const price = p.price != null ? `₹${p.price}` : '';
      const imgPath = p.thumb_image ?? p.image;
      const image =
        imgPath && typeof imgPath === 'string'
          ? imgPath.startsWith('http')
            ? imgPath
            : getOuiAssetUrl(imgPath) ?? ''
          : '';
      const clothType = inferClothType(p);
      return {
        id,
        name: p.name ?? 'Item',
        price,
        cloth_type: clothType,
        image: image || 'https://via.placeholder.com/512x512.png?text=Cloth',
        categoryName: p.category?.name,
      };
    });
  }, [products]);

  const onClothPress = (item: UiClothItem) => {
    try {
      const clothId = typeof item?.id === 'string' ? item.id : String(item?.id ?? '1');
      const clothName = typeof item?.name === 'string' ? item.name : 'Item';
      const clothImageUrl = typeof item?.image === 'string' ? item.image : '';
      const clothType = item?.cloth_type ?? 'upper';
      router.push({
        pathname: '/try-on',
        params: { clothId, clothName, clothImageUrl, clothType },
      });
    } catch (e) {
      if (__DEV__) console.error('onClothPress error:', e);
      // Fallback: navigate with default id so app does not crash
      router.push({ pathname: '/try-on', params: { clothId: '1', clothName: 'Item' } });
    }
  };

  const emptyState = !loading && uiItems.length === 0;
  const showSignInPrompt = emptyState && !sellerId;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>oui</Text>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/login')} activeOpacity={0.7}>
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
          style={styles.categoriesScrollView}
        >
          {filterChips.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[styles.categoryPill, selectedFilterId === chip.id && styles.categoryPillActive]}
              onPress={() => {
                setSelectedFilterId(chip.id);
                if (chip.id !== 'all') router.push({ pathname: '/(tabs)/explore', params: { categoryId: chip.id, categoryName: chip.name } });
              }}
            >
              {chip.imageUrl ? (
                <Image source={{ uri: chip.imageUrl }} style={styles.categoryPillImage} />
              ) : (
                <View style={styles.categoryPillPlaceholder} />
              )}
              <Text style={[styles.categoryPillText, selectedFilterId === chip.id && styles.categoryPillTextActive]} numberOfLines={1}>{chip.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{sellerId ? 'My products' : 'Products'}</Text>
        </View>

        <View style={styles.grid}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#6B4EAA" />
              <Text style={styles.loadingText}>Loading products...</Text>
            </View>
          ) : showSignInPrompt ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Sign in to see your products</Text>
              <Text style={styles.emptySubtext}>Log in as a seller to manage and try on your catalog.</Text>
              <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login')}>
                <Text style={styles.signInBtnText}>Sign in</Text>
              </TouchableOpacity>
            </View>
          ) : emptyState ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No products yet</Text>
              <Text style={styles.emptySubtext}>Add products in your seller dashboard or browse categories.</Text>
              <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/(tabs)/explore')}>
                <Text style={styles.browseBtnText}>Browse categories</Text>
              </TouchableOpacity>
            </View>
          ) : uiItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => onClothPress(item)}
              activeOpacity={0.85}
            >
              <View style={styles.cardImageWrap}>
                <Image source={typeof item.image === 'string' ? { uri: item.image } : item.image} style={styles.cardImage} contentFit="cover" />
                <TouchableOpacity style={styles.heartBtn} onPress={() => {}}>
                  <Text style={styles.heartIcon}>♡</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardPrice}>{item.price}</Text>
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
              {item.categoryName ? <Text style={styles.cardCategory} numberOfLines={1}>{item.categoryName}</Text> : null}
              <TouchableOpacity style={styles.tryOnBtn} onPress={() => onClothPress(item)}>
                <Text style={styles.tryOnBtnText}>Try on</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6B4EAA',
    letterSpacing: 0.5,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(107,78,170,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: {
    fontSize: 20,
  },
  scroll: {
    flex: 1,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  seeAll: {
    fontSize: 14,
    color: '#6B4EAA',
    fontWeight: '500',
  },
  categoriesScrollView: {
    marginBottom: 8,
  },
  categoriesScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    paddingRight: 40,
  },
  categoryPill: {
    width: CATEGORY_ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  categoryPillActive: {
    backgroundColor: '#6B4EAA',
    borderColor: '#6B4EAA',
  },
  categoryPillImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  categoryPillPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eee',
    marginBottom: 6,
  },
  categoryPillText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  categoryPillTextActive: {
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 40,
  },
  loadingWrap: {
    width: '100%',
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#444',
    fontWeight: '500',
  },
  emptyWrap: {
    width: '100%',
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  signInBtn: {
    backgroundColor: '#6B4EAA',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  signInBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  browseBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6B4EAA',
  },
  browseBtnText: {
    color: '#6B4EAA',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 12,
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIcon: {
    fontSize: 16,
    color: '#333',
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B4EAA',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  cardName: {
    fontSize: 14,
    color: '#222',
    fontWeight: '500',
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  cardCategory: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  tryOnBtn: {
    marginTop: 8,
    marginHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#6B4EAA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryOnBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
