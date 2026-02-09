import { CLOTHING_ITEMS } from '@/constants/clothing';
import { getSession } from '@/lib/auth';
import { getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 20 * 2 - 12 * 2) / 2;

type UiClothItem = {
  id: string;
  name: string;
  price: string;
  cloth_type: 'upper' | 'lower' | 'overall';
  image: number | string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<'All' | 'Woman' | 'Man' | 'Kid'>('All');

  const [loading, setLoading] = useState(true);
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [products, setProducts] = useState<OuiSellerProduct[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await getSession();
        if (!mounted) return;
        const id = session.user?.id ?? null;
        setSellerId(id);
        if (!id) {
          setProducts([]);
          return;
        }
        const res = await getSellerProducts({ sellerId: id, page: 1, perPage: 50, accessToken: session.accessToken });
        if (!mounted) return;
        setProducts(Array.isArray(res?.data?.products) ? res.data.products : []);
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

  const uiItems: UiClothItem[] = useMemo(() => {
    if (products.length === 0) return CLOTHING_ITEMS;
    return products.map((p) => {
      const id = String(p.id);
      const price = p.price != null ? `₹${p.price}` : '';
      const image = p.image && typeof p.image === 'string' ? p.image : 'https://via.placeholder.com/512x512.png?text=Cloth';
      return {
        id,
        name: p.name ?? 'Item',
        price,
        cloth_type: 'upper',
        image,
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>oui</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn} />
            <TouchableOpacity style={styles.iconBtn} />
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New arrivals</Text>
          <TouchableOpacity onPress={() => {}}>
            <Text style={styles.seeAll}>See all &gt;</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filters}>
          {(['All', 'Woman', 'Man', 'Kid'] as const).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, category === cat && styles.filterChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.filterText, category === cat && styles.filterTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.grid}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={styles.loadingText}>Loading products...</Text>
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
              <TouchableOpacity style={styles.addBtn} onPress={() => onClothPress(item)}>
                <Text style={styles.addBtnText}>+</Text>
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
    color: '#000',
    letterSpacing: 0.5,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
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
    color: '#000',
  },
  seeAll: {
    fontSize: 14,
    color: '#666',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  filterChipActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  filterText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  filterTextActive: {
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
    color: '#000',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  cardName: {
    fontSize: 14,
    color: '#444',
    paddingHorizontal: 10,
    paddingTop: 4,
  },
  addBtn: {
    position: 'absolute',
    bottom: 12,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
});
