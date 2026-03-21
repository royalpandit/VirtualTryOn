import { FontFamily } from '@/constants/theme';
import { useKioskCart } from '@/context/KioskCartContext';
import { useWishlist } from '@/context/WishlistContext';
import { getSession } from '@/lib/auth';
import {
    getBannerImageUrl,
    getBannersByVendor,
    getCategoryList,
    getOuiAssetUrl,
    getSellerProducts,
    type OuiBannerItem,
    type OuiCategory,
    type OuiSellerProduct,
} from '@/lib/ouiApi';
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

type ClothType = 'upper' | 'lower' | 'overall';

type UiClothItem = {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;
  cloth_type: ClothType;
  image: string;
  categoryName?: string;
  categoryId?: number;
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
  return s
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/* ─── Sub-components ─── */

function HeroBanner({
  banner,
  onPress,
}: {
  banner: { imageUrl: string; title?: string | null } | null;
  onPress: () => void;
}) {
  if (!banner) return null;
  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress}>
      <View style={st.heroBanner}>
        <Image source={{ uri: banner.imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={st.heroGradient}>
          <Text style={st.heroTitle}>{banner.title || 'Discover Collection'}</Text>
          <View style={st.heroCta}>
            <Text style={st.heroCtaText}>Explore Now</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}

function CollectionCard({
  title,
  subtitle,
  items,
  onItemPress,
  dark,
}: {
  title: string;
  subtitle?: string;
  items: UiClothItem[];
  onItemPress: (item: UiClothItem) => void;
  dark?: boolean;
}) {
  const CARD_W = (SCREEN_WIDTH - SIDE_PAD * 2 - 12) / 2;
  return (
    <View style={[st.collectionCard, dark && st.collectionCardDark]}>
      <Text style={[st.collectionTitle, dark && st.collectionTitleDark]}>{title}</Text>
      {subtitle && <Text style={[st.collectionSubtitle, dark && st.collectionSubtitleDark]}>{subtitle}</Text>}
      <View style={st.collectionGrid}>
        {items.slice(0, 4).map((item) => (
          <TouchableOpacity key={item.id} activeOpacity={0.9} onPress={() => onItemPress(item)} style={{ width: CARD_W }}>
            <View style={[st.collectionImgWrap, { width: CARD_W, height: CARD_W * 1.25 }]}>
              <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            </View>
            <Text style={[st.collectionItemName, dark && { color: '#FAF8FF' }]} numberOfLines={1}>
              {capitalize(item.name)}
            </Text>
            <Text style={[st.collectionItemPrice, dark && { color: '#D5DBFF' }]}>{item.price}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function QuoteSection() {
  return (
    <View style={st.quoteSection}>
      <Text style={st.quoteText}>
        "Fashion is the armor to survive the reality of everyday life."
      </Text>
      <Text style={st.quoteAuthor}>— Bill Cunningham</Text>
    </View>
  );
}

function MembershipBenefits() {
  const benefits = [
    { icon: 'shirt-outline' as const, title: 'Virtual Try-On', desc: 'See how it looks before you buy' },
    { icon: 'rocket-outline' as const, title: 'Free Express Shipping', desc: 'On all orders above ₹999' },
    { icon: 'shield-checkmark-outline' as const, title: 'Easy Returns', desc: '7-day hassle-free returns' },
  ];
  return (
    <View style={st.membershipSection}>
      <Text style={st.membershipTitle}>Why Shop With Us</Text>
      <Text style={st.membershipSubtitle}>Premium perks on every order</Text>
      <View style={st.benefitsRow}>
        {benefits.map((b) => (
          <View key={b.title} style={st.benefitCard}>
            <View style={st.benefitIconWrap}>
              <Ionicons name={b.icon} size={24} color="#575E7C" />
            </View>
            <Text style={st.benefitTitle}>{b.title}</Text>
            <Text style={st.benefitDesc}>{b.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── Main Collections Screen ─── */

export default function CollectionsScreen() {
  const router = useRouter();
  const { itemCount } = useKioskCart();
  const { isWished, toggle: toggleWishlist } = useWishlist();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<OuiSellerProduct[]>([]);
  const [categories, setCategories] = useState<OuiCategory[]>([]);
  const [banners, setBanners] = useState<OuiBannerItem[]>([]);
  const [sellerId, setSellerId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await getSession();
        const userId = session?.user?.id ?? null;
        if (!mounted) return;
        if (!session?.accessToken || !userId) {
          router.replace('/login');
          return;
        }
        setSellerId(userId as number);

        const [catRes, prodRes] = await Promise.all([
          getCategoryList({ accessToken: session.accessToken }).catch(() => ({ categories: [] as OuiCategory[] })),
          getSellerProducts({ sellerId: userId, page: 1, perPage: 60, accessToken: session.accessToken }).catch(() => ({ products: [] })),
        ]);

        if (!mounted) return;
        const cats = Array.isArray((catRes as any)?.categories) ? (catRes as any).categories : [];
        setCategories(cats.filter((c: OuiCategory) => (c as any).status !== 0));
        setProducts(Array.isArray(prodRes?.products) ? prodRes.products.filter((p) => p?.id != null) : []);
      } catch {
        if (mounted) { setProducts([]); setCategories([]); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (sellerId == null) return;
    let mounted = true;
    (async () => {
      try {
        const res = await getBannersByVendor(sellerId);
        if (!mounted) return;
        setBanners((res?.banners ?? []).filter((b) => b && (b as any).status !== 0));
      } catch {
        if (mounted) setBanners([]);
      }
    })();
    return () => { mounted = false; };
  }, [sellerId]);

  const uiItems: UiClothItem[] = useMemo(() => {
    const mapped: UiClothItem[] = [];
    for (const p of products) {
      const name = (p.name ?? '').toString().trim();
      if (!name) continue;
      const effectivePrice = p.offer_price ?? p.price;
      const price = typeof effectivePrice === 'number' && Number.isFinite(effectivePrice) ? `₹${effectivePrice}` : '';
      const imgPath = p.thumb_image ?? p.image;
      const imageUrl = typeof imgPath === 'string' ? (imgPath.startsWith('http') ? imgPath : getOuiAssetUrl(imgPath) ?? null) : null;
      if (!imageUrl) continue;
      mapped.push({
        id: String(p.id),
        name,
        price,
        cloth_type: inferClothType(p),
        image: imageUrl,
        categoryName: p.category?.name,
        categoryId: (p as any).category_id ?? p.category?.id,
      });
    }
    return mapped;
  }, [products]);

  const heroBanner = useMemo(() => {
    const sorted = [...banners].sort((a, b) => ((a.priority ?? 999) as number) - ((b.priority ?? 999) as number));
    for (const b of sorted) {
      const url = getBannerImageUrl(b);
      if (url) return { imageUrl: url, title: b.title };
    }
    return null;
  }, [banners]);

  const pillChips = useMemo(
    () => categories.slice(0, 6).map((c) => ({ id: String(c.id), name: c.name })),
    [categories],
  );

  const productsByCat = useMemo(() => {
    const map: Record<string, UiClothItem[]> = {};
    for (const c of categories) map[String(c.id)] = [];
    for (const it of uiItems) {
      if (it.categoryId && map[String(it.categoryId)]) map[String(it.categoryId)].push(it);
    }
    return map;
  }, [categories, uiItems]);

  const collectionSections = useMemo(
    () =>
      categories
        .map((cat) => ({ cat, items: productsByCat[String(cat.id)] ?? [] }))
        .filter((x) => x.items.length > 0)
        .slice(0, 3),
    [categories, productsByCat],
  );

  const onItemPress = useCallback(
    (item: UiClothItem) => {
      router.push({
        pathname: '/product-details',
        params: { productId: item.id, productName: item.name, productImage: item.image, productPrice: item.price, clothType: item.cloth_type },
      } as any);
    },
    [router],
  );

  const CARD_W = (SCREEN_WIDTH - SIDE_PAD * 2 - 12) / 2;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color="#2D3335" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Collections</Text>
        <TouchableOpacity onPress={() => router.push('/cart')} style={st.cartBtn} activeOpacity={0.85}>
          <Ionicons name="bag-handle-outline" size={20} color="#2D3335" />
          {itemCount > 0 && <View style={st.cartDot} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color="#2D3335" />
          <Text style={st.loadingText}>Loading collections…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero Banner */}
          <HeroBanner banner={heroBanner} onPress={() => router.push('/products' as any)} />

          {/* Category pills */}
          {pillChips.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pillsRow} style={st.pillsWrap}>
              {pillChips.map((chip) => (
                <TouchableOpacity
                  key={chip.id}
                  style={st.pill}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/products', params: { mode: 'category', categoryId: chip.id, categoryName: chip.name } } as any)}
                >
                  <Text style={st.pillText}>{chip.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* New Arrivals section */}
          {uiItems.length > 0 && (
            <View style={st.section}>
              <View style={st.sectionHeader}>
                <Text style={st.sectionTitle}>New Arrivals</Text>
                <TouchableOpacity onPress={() => router.push('/products' as any)} activeOpacity={0.8}>
                  <Text style={st.viewAll}>View All ›</Text>
                </TouchableOpacity>
              </View>
              <View style={st.newArrivalsGrid}>
                {uiItems.slice(0, 4).map((item) => (
                  <TouchableOpacity key={item.id} activeOpacity={0.9} onPress={() => onItemPress(item)} style={{ width: CARD_W }}>
                    <View style={[st.arrivalImgWrap, { width: CARD_W, height: CARD_W * 1.25 }]}>
                      <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      <TouchableOpacity style={st.heartBtn} activeOpacity={0.8} onPress={(e) => { e.stopPropagation?.(); toggleWishlist(item.id); }}>
                        <Ionicons name={isWished(item.id) ? 'heart' : 'heart-outline'} size={16} color={isWished(item.id) ? '#A83836' : '#2D3335'} />
                      </TouchableOpacity>
                    </View>
                    <Text style={st.arrivalName} numberOfLines={1}>{capitalize(item.name)}</Text>
                    <Text style={st.arrivalPrice}>{item.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Quote */}
          <QuoteSection />

          {/* Collection Sections (alternating light/dark) */}
          {collectionSections.map((sec, idx) => (
            <CollectionCard
              key={sec.cat.id}
              title={idx === 0 ? 'New Essentials: Silks & Satins' : idx === 1 ? 'The Monochrome Uniform' : 'The Evening Collection'}
              subtitle={idx === 0 ? 'Luxurious fabrics for every occasion' : undefined}
              items={sec.items}
              onItemPress={onItemPress}
              dark={idx === 2}
            />
          ))}

          {/* Membership */}
          <MembershipBenefits />

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ═══════════ STYLES ═══════════ */

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { paddingBottom: 30 },

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
  cartBtn: {
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

  /* hero */
  heroBanner: {
    height: 260,
    marginHorizontal: SIDE_PAD,
    marginTop: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E5E9EB',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 24,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: FontFamily.brand,
    color: '#fff',
    marginBottom: 12,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  heroCtaText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FontFamily.headingSemiBold,
  },

  /* pills */
  pillsWrap: { marginTop: 16, marginBottom: 8 },
  pillsRow: { paddingHorizontal: SIDE_PAD, gap: 8 },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#E5E9EB',
  },
  pillText: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
  },

  /* sections */
  section: { paddingHorizontal: SIDE_PAD, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
  },
  viewAll: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#575E7C',
  },

  /* new arrivals */
  newArrivalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  arrivalImgWrap: {
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
  arrivalBrand: {
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  arrivalName: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
    marginTop: 2,
  },
  arrivalPrice: {
    fontSize: 14,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
    marginTop: 2,
  },

  /* quote */
  quoteSection: {
    backgroundColor: '#F1F4F5',
    marginHorizontal: SIDE_PAD,
    marginTop: 24,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 16,
    fontFamily: FontFamily.brand,
    color: '#2D3335',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  quoteAuthor: {
    fontSize: 12,
    fontFamily: FontFamily.bodyMedium,
    color: '#5A6062',
  },

  /* collection card */
  collectionCard: {
    paddingHorizontal: SIDE_PAD,
    paddingVertical: 24,
    marginTop: 20,
  },
  collectionCardDark: {
    backgroundColor: '#1A1A2E',
  },
  collectionTitle: {
    fontSize: 20,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 4,
  },
  collectionTitleDark: { color: '#FAF8FF' },
  collectionSubtitle: {
    fontSize: 13,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    marginBottom: 16,
  },
  collectionSubtitleDark: { color: 'rgba(250,248,255,0.6)' },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  collectionImgWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F4F5',
  },
  collectionItemBrand: {
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  collectionItemName: {
    fontSize: 13,
    fontFamily: FontFamily.headingSemiBold,
    color: '#2D3335',
    marginTop: 2,
  },
  collectionItemPrice: {
    fontSize: 14,
    fontFamily: FontFamily.bodyBold,
    color: '#575E7C',
    marginTop: 2,
  },

  /* membership */
  membershipSection: {
    paddingHorizontal: SIDE_PAD,
    paddingVertical: 24,
    marginTop: 20,
  },
  membershipTitle: {
    fontSize: 20,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 4,
  },
  membershipSubtitle: {
    fontSize: 13,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    marginBottom: 16,
  },
  benefitsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    alignItems: 'center',
  },
  benefitIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  benefitTitle: {
    fontSize: 12,
    fontFamily: FontFamily.heading,
    color: '#2D3335',
    textAlign: 'center',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 11,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    textAlign: 'center',
    lineHeight: 15,
  },

  /* loading */
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontFamily: FontFamily.bodyMedium,
    color: '#5A6062',
  },
});
