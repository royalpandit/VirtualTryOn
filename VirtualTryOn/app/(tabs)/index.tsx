import { defaultFontFamily } from '@/constants/theme';
import { useKioskCart } from '@/context/KioskCartContext';
import { getSession } from '@/lib/auth';
import { getBannerImageUrl, getBannersByVendor, getCategoryList, getOuiAssetUrl, getSellerProducts, type OuiBannerItem, type OuiCategory, type OuiSellerProduct } from '@/lib/ouiApi';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  categoryId?: number;
};

type FilterChip = { id: string; name: string; imageUrl: string | null };

// Fashion Posters for Marquee - Static promotional content
const FASHION_POSTERS = [
  {
    id: '1',
    title: 'Wedding Collection',
    image: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=800&h=400&fit=crop',
  },
  {
    id: '2',
    title: 'Festive Styles',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&h=400&fit=crop',
  },
  {
    id: '3',
    title: 'Traditional Elegance',
    image: 'https://images.unsplash.com/photo-1583391733956-6c78276477e9?w=800&h=400&fit=crop',
  },
  {
    id: '4',
    title: 'Designer Collection',
    image: 'https://images.unsplash.com/photo-1610030469984-aa7803d467b9?w=800&h=400&fit=crop',
  },
  {
    id: '5',
    title: 'Ethnic Fashion',
    image: 'https://images.unsplash.com/photo-1583391733981-5df1f5f5e5f5?w=800&h=400&fit=crop',
  },
];

const FALLBACK_STRIP_IMAGES = [
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1600&h=420&fit=crop',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1600&h=420&fit=crop',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&h=420&fit=crop',
];

type MarqueePoster = { id: string; title: string; image: string };

// Marquee Banner – ScrollView-based auto-scroll (reliable on Android). Uses dynamic posters (from API) or fallback.
const MARQUEE_SCROLL_MS = 25;
const MARQUEE_PX_PER_TICK = 1;
const MarqueeRow: React.FC<{ posters: MarqueePoster[]; reverse?: boolean }> = ({ posters, reverse = false }) => {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const oneSetWidth = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const posterWidth = SCREEN_WIDTH * 0.72;
  const posterGap = 10;
  const list = posters.length > 0 ? posters : FASHION_POSTERS;
  const oneSet = list.length * (posterWidth + posterGap);
  const duplicatedPosters = [...list, ...list];

  useEffect(() => {
    oneSetWidth.current = oneSet;
    if (oneSet <= 0) return;

    offset.current = reverse ? oneSet : 0;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: offset.current, animated: false });
    }, 50);

    tick.current = setInterval(() => {
      if (reverse) {
        offset.current -= MARQUEE_PX_PER_TICK;
        if (offset.current <= 0) offset.current += oneSetWidth.current;
      } else {
        offset.current += MARQUEE_PX_PER_TICK;
        if (offset.current >= oneSetWidth.current) offset.current -= oneSetWidth.current;
      }
      scrollRef.current?.scrollTo({ x: offset.current, animated: false });
    }, MARQUEE_SCROLL_MS);

    return () => {
      clearTimeout(timer);
      if (tick.current) clearInterval(tick.current);
    };
  }, [oneSet, reverse]);

  return (
    <View style={[styles.marqueeRow, { width: SCREEN_WIDTH }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={999}
        scrollEnabled={false}
        contentContainerStyle={[styles.marqueeContent, { width: duplicatedPosters.length * (posterWidth + posterGap) }]}
      >
        {duplicatedPosters.map((poster, index) => (
          <View key={`${poster.id}-${index}`} style={[styles.posterCard, { width: posterWidth, marginRight: posterGap }]}>
            <Image source={{ uri: poster.image }} style={styles.posterImage} contentFit="cover" />
            <View style={styles.posterOverlay}>
              <Text style={styles.posterTitle}>{poster.title}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const MarqueeBanner: React.FC<{ posters?: MarqueePoster[] }> = ({ posters = [] }) => {
  const list = posters.length > 0 ? posters : FASHION_POSTERS;
  return (
    <View style={styles.marqueeContainer}>
      <MarqueeRow posters={list} />
      <MarqueeRow posters={list} reverse />
    </View>
  );
};

// Product Card Component Props
interface ProductCardProps {
  item: UiClothItem;
  onPress: () => void;
  cardWidth: number;
  onAddToCart?: (item: UiClothItem) => void;
}

// Product Card Component - Flipkart-style with overlay (for carousel)
const ProductCard: React.FC<ProductCardProps> = ({ item, onPress, cardWidth, onAddToCart }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const canAddToCart = Boolean(onAddToCart && /^\d+$/.test(item.id));

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.productCard, { width: cardWidth }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.95}
      >
        {/* Product Image */}
        <View style={[styles.cardImageContainer, { width: cardWidth }]}>
          <Image
            source={typeof item.image === 'string' ? { uri: item.image } : item.image}
            style={styles.productImage}
            contentFit="contain"
          />
        </View>
        
        {/* Overlay Content */}
        <LinearGradient
  colors={['transparent', 'rgba(0,0,0,0.85)']}
  style={styles.cardOverlay}
>
          <Text style={styles.overlayProductName} numberOfLines={1}>
            {item.name}
          </Text>
          {!!item.price && (
            <Text style={styles.overlayProductPrice} numberOfLines={1}>
              {item.price}
            </Text>
          )}
       </LinearGradient>
        {canAddToCart && (
          <TouchableOpacity
            style={styles.cardAddToCartBtn}
            onPress={(e) => { e?.stopPropagation?.(); onAddToCart?.(item); }}
            activeOpacity={0.9}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="cart-outline" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// Product Grid Card - Original design with bottom content (for grid)
interface ProductGridCardProps {
  item: UiClothItem;
  onPress: () => void;
  cardWidth: number;
  onAddToCart?: (item: UiClothItem) => void;
}

const ProductGridCard: React.FC<ProductGridCardProps> = ({ item, onPress, cardWidth, onAddToCart }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const canAddToCart = Boolean(onAddToCart && /^\d+$/.test(item.id));

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.gridProductCard, { width: cardWidth }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.95}
      >
        <View style={[styles.gridCardImageContainer, { width: cardWidth }]}>
          <Image
            source={typeof item.image === 'string' ? { uri: item.image } : item.image}
            style={styles.productImage}
            contentFit="contain"
          />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            {!!item.price && (
              <Text style={styles.productPrice} numberOfLines={1}>
                {item.price}
              </Text>
            )}
            {item.categoryName && (
              <Text style={styles.productCategory} numberOfLines={1}>
                {item.categoryName}
              </Text>
            )}
          </View>
          <View style={styles.tryIndicator}>
            {canAddToCart ? (
              <TouchableOpacity
                style={styles.gridCardAddToCartBtn}
                onPress={(e) => { e?.stopPropagation?.(); onAddToCart?.(item); }}
                activeOpacity={0.9}
              >
                <Ionicons name="cart-outline" size={20} color="#6B4EAA" />
                <Text style={styles.gridCardAddToCartText}>Add to cart</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.tryIndicatorText}>→</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Product Carousel with optional marquee (auto-scroll)
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 3;
const CARD_MARGIN = 10;
const CAROUSEL_CARD_TOTAL = CARD_WIDTH + CARD_MARGIN;
const CAROUSEL_SCROLL_MS = 30;
const CAROUSEL_PX_PER_TICK = 1;

interface ProductCarouselProps {
  products: UiClothItem[];
  onProductPress: (item: UiClothItem) => void;
  onAddToCart?: (item: UiClothItem) => void;
  autoScroll?: boolean;
}

const ProductCarousel: React.FC<ProductCarouselProps> = ({ products, onProductPress, onAddToCart, autoScroll = true }) => {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const contentWidthRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contentWidth = products.length * CAROUSEL_CARD_TOTAL;

  const startAutoScroll = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      offsetRef.current += CAROUSEL_PX_PER_TICK;
      if (offsetRef.current >= contentWidthRef.current) offsetRef.current = 0;
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false });
    }, CAROUSEL_SCROLL_MS);
  }, []);

  useEffect(() => {
    contentWidthRef.current = contentWidth;
    if (products.length === 0 || !autoScroll || contentWidth <= 0) return;

    offsetRef.current = 0;
    startAutoScroll();

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, [products.length, contentWidth, autoScroll, startAutoScroll]);

  const onScrollBeginDrag = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }
  }, []);

  const onScrollEndDrag = useCallback(
    (e: any) => {
      const x = e?.nativeEvent?.contentOffset?.x ?? 0;
      offsetRef.current = Math.max(0, Math.min(x, contentWidthRef.current));
      if (!autoScroll || contentWidthRef.current <= 0) return;
      resumeTimeoutRef.current = setTimeout(() => {
        resumeTimeoutRef.current = null;
        startAutoScroll();
      }, 2500);
    },
    [autoScroll, startAutoScroll]
  );

  if (products.length === 0) return null;

  return (
    <View style={styles.carouselContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={999}
        scrollEnabled={true}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onScrollEndDrag}
        onScroll={(e) => {
          offsetRef.current = e?.nativeEvent?.contentOffset?.x ?? 0;
        }}
        contentContainerStyle={[styles.carouselContent, { width: contentWidth }]}
      >
        {products.map((product) => (
          <View key={product.id} style={{ marginRight: CARD_MARGIN }}>
            <ProductCard
              item={product}
              onPress={() => onProductPress(product)}
              cardWidth={CARD_WIDTH}
              onAddToCart={onAddToCart}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const SplashBannerStrip: React.FC<{ image: string }> = ({ image }) => (
  <View style={styles.splashBannerStrip}>
    <Image source={{ uri: image }} style={styles.splashBannerImage} contentFit="cover" />
  </View>
);

const BENTO_CELL_GAP = 10;
const BENTO_PADDING = 20;

type BentoCell = { id: string; title: string; subtitle?: string; image: string; size: 'small' | 'tall' | 'wide' | 'large' };

const BENTO_DATA: BentoCell[] = [
  { id: 'b1', title: 'New Arrivals', subtitle: 'Try now', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&h=400&fit=crop', size: 'large' },
  { id: 'b2', title: 'Trending', image: 'https://images.unsplash.com/photo-1558769132-cb1aea913ec9?w=400&h=300&fit=crop', size: 'small' },
  { id: 'b3', title: 'Ethnic', image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop', size: 'tall' },
  { id: 'b4', title: 'Formal', image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&h=300&fit=crop', size: 'wide' },
  { id: 'b5', title: 'Offers', subtitle: 'Limited', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=300&fit=crop', size: 'small' },
];

const BentoGrid: React.FC = () => {
  const totalWidth = SCREEN_WIDTH - BENTO_PADDING * 2;
  const half = (totalWidth - BENTO_CELL_GAP) / 2;
  const cellSmall = half;
  const cellLarge = totalWidth;
  const cellWide = totalWidth;
  const cellTall = (totalWidth - BENTO_CELL_GAP) / 2;

  const getSize = (size: BentoCell['size']) => {
    switch (size) {
      case 'large': return { width: cellLarge, height: 160 };
      case 'tall': return { width: cellTall, height: 200 };
      case 'wide': return { width: cellWide, height: 100 };
      default: return { width: cellSmall, height: 120 };
    }
  };

  return (
    <View style={styles.bentoSection}>
      <View style={styles.bentoGrid}>
        <View style={styles.bentoRow}>
          <TouchableOpacity style={[styles.bentoCell, getSize('large')]} activeOpacity={0.9}>
            <Image source={{ uri: BENTO_DATA[0].image }} style={styles.bentoImage} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bentoOverlay}>
              <Text style={styles.bentoTitle}>{BENTO_DATA[0].title}</Text>
              {BENTO_DATA[0].subtitle && <Text style={styles.bentoSubtitle}>{BENTO_DATA[0].subtitle}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={[styles.bentoRow, { flexDirection: 'row', gap: BENTO_CELL_GAP }]}>
          <TouchableOpacity style={[styles.bentoCell, getSize('small')]} activeOpacity={0.9}>
            <Image source={{ uri: BENTO_DATA[1].image }} style={styles.bentoImage} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bentoOverlay}>
              <Text style={styles.bentoTitleSmall}>{BENTO_DATA[1].title}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bentoCell, { width: cellTall, height: 200 }]} activeOpacity={0.9}>
            <Image source={{ uri: BENTO_DATA[2].image }} style={styles.bentoImage} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bentoOverlay}>
              <Text style={styles.bentoTitleSmall}>{BENTO_DATA[2].title}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.bentoRow}>
          <TouchableOpacity style={[styles.bentoCell, getSize('wide')]} activeOpacity={0.9}>
            <Image source={{ uri: BENTO_DATA[3].image }} style={styles.bentoImage} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bentoOverlay}>
              <Text style={styles.bentoTitle}>{BENTO_DATA[3].title}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.bentoRow}>
          <TouchableOpacity style={[styles.bentoCell, getSize('small')]} activeOpacity={0.9}>
            <Image source={{ uri: BENTO_DATA[4].image }} style={styles.bentoImage} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bentoOverlay}>
              <Text style={styles.bentoTitleSmall}>{BENTO_DATA[4].title}</Text>
              {BENTO_DATA[4].subtitle && <Text style={styles.bentoSubtitle}>{BENTO_DATA[4].subtitle}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Category Bar Component
interface CategoryBarProps {
  categories: FilterChip[];
  selectedCategory: string;
  onSelectCategory: (id: string, name: string) => void;
}

const CategoryBar: React.FC<CategoryBarProps> = ({ categories, selectedCategory, onSelectCategory }) => {
  if (categories.length === 0) return null;

  return (
    <View style={styles.categoriesSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
        {categories.map((chip) => (
          <TouchableOpacity
            key={chip.id}
            style={[styles.categoryPill, selectedCategory === chip.id && styles.categoryPillActive]}
            onPress={() => onSelectCategory(chip.id, chip.name)}
          >
            <Text style={[styles.categoryText, selectedCategory === chip.id && styles.categoryTextActive]} numberOfLines={1}>
              {chip.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

interface SectionHeaderProps {
  title: string;
  onPress: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, onPress }) => (
  <View style={styles.sectionTitleWrapper}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <TouchableOpacity style={styles.viewAllButton} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.viewAllText}>view all</Text>
      <View style={styles.viewAllArrowWrap}>

      </View>
    </TouchableOpacity>
  </View>
);

// Product Grid Component
interface ProductGridProps {
  products: UiClothItem[];
  onProductPress: (item: UiClothItem) => void;
  onAddToCart?: (item: UiClothItem) => void;
}

const ProductGrid: React.FC<ProductGridProps> = ({ products, onProductPress, onAddToCart }) => {
  if (products.length === 0) return null;

  const CARD_WIDTH = (SCREEN_WIDTH - 40 - 16) / 2;

  return (
    <View style={styles.productGrid}>
      {products.map((product) => (
        <View key={product.id} style={styles.gridItem}>
          <ProductGridCard item={product} onPress={() => onProductPress(product)} cardWidth={CARD_WIDTH} onAddToCart={onAddToCart} />
        </View>
      ))}
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { addToCart } = useKioskCart();
  const [selectedFilterId, setSelectedFilterId] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [products, setProducts] = useState<OuiSellerProduct[]>([]);
  const [categories, setCategories] = useState<OuiCategory[]>([]);
  const [banners, setBanners] = useState<OuiBannerItem[]>([]);

  useEffect(() => {
    let mounted = true;
    let userId: number | null = null;
    (async () => {
      try {
        const session = await getSession();
        if (!mounted) return;
        userId = session?.user?.id ?? null;
        setSellerId(userId);
        const catRes = await getCategoryList({ accessToken: session?.accessToken ?? null }).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn('[HOME] getCategoryList failed', msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
          return { categories: [] as OuiCategory[] };
        });
        if (!mounted) return;
        const raw = (catRes as any);
        const list = Array.isArray(raw?.categories)
          ? raw.categories
          : Array.isArray(raw?.data?.categories)
            ? raw.data.categories
            : [];
        if (__DEV__ && list.length > 0) console.log('[HOME] category-list loaded', list.length, list.map((c: OuiCategory) => c.name));
        const safeCategories = list.filter((c: OuiCategory): c is OuiCategory => Boolean(c) && typeof (c as any).id !== 'undefined');
        const active = safeCategories.filter((c: OuiCategory) => c.status !== 0);
        setCategories(active);
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Failed to load', msg || 'Unable to load categories');
      } finally {
        if (mounted && userId == null) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Fetch ALL products once for home (sections filter by category client-side)
  useEffect(() => {
    if (sellerId == null) return;
    let mounted = true;
    (async () => {
      try {
        const session = await getSession();
        if (!mounted || !session?.accessToken) {
          setProducts([]);
          setLoading(false);
          return;
        }
        if (__DEV__) console.log('[HOME] Fetching all products (no category filter)');
        const res = await getSellerProducts({
          sellerId,
          page: 1,
          perPage: 50,
          accessToken: session.accessToken,
        });
        if (!mounted) return;
        const rawProducts = Array.isArray(res?.products) ? res.products : [];
        const safeProducts = rawProducts.filter((p): p is OuiSellerProduct => Boolean(p) && typeof (p as any).id !== 'undefined');
        if (__DEV__) console.log('[HOME] Loaded', safeProducts.length, 'products');
        setProducts(safeProducts);
      } catch (e: unknown) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== 'Unauthorized') Alert.alert('Failed to load products', msg || 'Unable to fetch products');
        setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sellerId]);

  // Fetch banners by vendor (vendor_id = seller_id)
  useEffect(() => {
    if (sellerId == null) return;
    let mounted = true;
    (async () => {
      try {
        const res = await getBannersByVendor(sellerId);
        if (!mounted) return;
        const list = Array.isArray(res?.banners) ? res.banners : [];
        const active = list.filter((b) => b && (b.status === undefined || b.status === 1));
        setBanners(active);
        if (__DEV__ && active.length > 0) console.log('[HOME] banners loaded', active.length);
      } catch (_) {
        if (mounted) setBanners([]);
      }
    })();
    return () => { mounted = false; };
  }, [sellerId]);

  const filterChips: FilterChip[] = useMemo(() => {
    const list: FilterChip[] = [{ id: 'all', name: 'All', imageUrl: null }];
    categories
      .filter((c): c is OuiCategory => Boolean(c) && typeof (c as any).id !== 'undefined')
      .forEach((c) => list.push({ id: String(c.id), name: c.name, imageUrl: getOuiAssetUrl(c.image) ?? null }));
    return list;
  }, [categories]);

  const uiItems: UiClothItem[] = useMemo(() => {
    return products
      .filter((p): p is OuiSellerProduct => Boolean(p) && typeof (p as any).id !== 'undefined')
      .map((p) => {
        const id = String(p.id);
        const effectivePrice = p.offer_price != null ? p.offer_price : p.price;
        const price = effectivePrice != null ? `₹${effectivePrice}` : '';
        const imgPath = p.thumb_image ?? p.image;
        const image =
          imgPath && typeof imgPath === 'string'
            ? imgPath.startsWith('http')
              ? imgPath
              : getOuiAssetUrl(imgPath) ?? ''
            : '';
        const clothType = inferClothType(p);
        const categoryId = (p as any).category_id ?? p.category?.id;
        return {
          id,
          name: p.name ?? 'Item',
          price,
          cloth_type: clothType,
          image: image || 'https://via.placeholder.com/512x512.png?text=Cloth',
          categoryName: p.category?.name,
          categoryId: typeof categoryId === 'number' ? categoryId : undefined,
        };
      });
  }, [products]);

  const guestItems: UiClothItem[] = useMemo(
    () => [
      {
        id: 'guest-kurti-women',
        name: 'Kurti (Women)',
        price: '',
        cloth_type: 'overall',
        image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771768714/kurti_women_ytygwx.jpg',
        categoryName: 'Indian',
      },
      {
        id: 'guest-sherwani',
        name: 'Sherwani',
        price: '',
        cloth_type: 'overall',
        image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771768713/sherwani_jpgvcq.webp',
        categoryName: 'Indian',
      },
      {
        id: 'guest-saree',
        name: 'Saree',
        price: '',
        cloth_type: 'overall',
        image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771840121/saree_rij9l4.webp',
        categoryName: 'Indian',
      },
      {
        id: 'guest-kurta-men',
        name: 'Kurta (Men)',
        price: '',
        cloth_type: 'overall',
        image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771839832/kurta_men_lyhzmt.webp',
        categoryName: 'Indian',
      },
      {
        id: 'guest-full-suit',
        name: 'Full Suit',
        price: '',
        cloth_type: 'overall',
        image: 'https://res.cloudinary.com/dnmyfbmki/image/upload/v1771769079/full_suit_xe1twn.png',
        categoryName: 'Indian',
      },
    ],
    []
  );

  const allItems = sellerId ? (uiItems.length > 0 ? uiItems : guestItems) : guestItems;

  // Per-category product lists for section carousels (seller only; guest has no categoryId)
  const productsByCategoryId = useMemo(() => {
    const map: Record<number, UiClothItem[]> = {};
    categories.forEach((c) => {
      map[c.id] = uiItems.filter((i) => i.categoryId === c.id);
    });
    return map;
  }, [categories, uiItems]);

  // Marquee: API banners (sorted by priority, lower first) as posters; fallback to static FASHION_POSTERS
  const marqueePosters: MarqueePoster[] = useMemo(() => {
    if (banners.length === 0) return [];
    const sorted = [...banners].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    return sorted
      .map((b) => {
        const url = getBannerImageUrl(b);
        return url ? { id: String(b.id), title: b.title || '', image: url } : null;
      })
      .filter((p): p is MarqueePoster => p != null);
  }, [banners]);

  // Strip images between sections: API banner URLs, then fallback
  const bannerStripUrls = useMemo(() => {
    const urls = banners
      .map((b) => getBannerImageUrl(b))
      .filter((u): u is string => Boolean(u));
    return urls.length > 0 ? urls : FALLBACK_STRIP_IMAGES;
  }, [banners]);

  useEffect(() => {
    console.log('[HOME] render state', {
      loading,
      sellerId,
      productsCount: products.length,
      categoriesCount: categories.length,
      displayedCount: allItems.length,
      mode: sellerId ? 'seller' : 'guest',
    });
  }, [loading, sellerId, products.length, categories.length, allItems.length]);

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
      router.push({ pathname: '/try-on', params: { clothId: '1', clothName: 'Item' } });
    }
  };

  const handleAddToCart = async (item: UiClothItem) => {
    if (!/^\d+$/.test(item.id)) return;
    try {
      await addToCart(Number(item.id), 1);
      Alert.alert('Added', 'Item added to cart.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add to cart.');
    }
  };

  const handleCategorySelect = (id: string, _name: string) => {
    setSelectedFilterId(id);
  };

  const emptyState = !loading && allItems.length === 0;
  const showSignInPrompt = emptyState && !sellerId;

  // Split products into sections for visual variety
  const remainingProducts = allItems.slice(6);
  const midPoint = Math.ceil(remainingProducts.length / 2);
  const collectionProducts = remainingProducts.slice(0, midPoint);
  const newArrivals = remainingProducts.slice(midPoint);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome To Oui Store</Text>
          <View style={styles.downloadButtons}>
            <TouchableOpacity style={styles.downloadButton} onPress={() => {}}>
              <View style={styles.iconButtonContent}>
                <Text style={styles.iconText}>▶</Text>
                <Text style={styles.downloadButtonText}>Play Store</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.downloadButton} onPress={() => {}}>
              <View style={styles.iconButtonContent}>
                <Text style={styles.iconText}></Text>
                <Text style={styles.downloadButtonText}>App Store</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Marquee Banner – top; uses API banners when vendor_id (sellerId) is set */}
        <MarqueeBanner posters={marqueePosters} />
        </View>

        {/* Category Bar */}
        <CategoryBar categories={filterChips} selectedCategory={selectedFilterId} onSelectCategory={handleCategorySelect} />

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#6B4EAA" />
            <Text style={styles.loadingText}>Loading collection...</Text>
          </View>
        )}

        {/* Sign In Prompt */}
        {showSignInPrompt && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Welcome to Virtual Try-On</Text>
            <Text style={styles.emptySubtext}>Sign in to access your product collection</Text>
            <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login')}>
              <Text style={styles.signInBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {emptyState && !showSignInPrompt && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No Products Available</Text>
            <Text style={styles.emptySubtext}>Browse categories to discover our collection</Text>
            <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/(tabs)/explore')}>
              <Text style={styles.browseBtnText}>Explore Categories</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section: All + its product carousel */}
        {!loading && allItems.length > 0 && (
          <View style={styles.lightSection}>
            <SectionHeader title="All" onPress={() => router.push('/(tabs)/explore')} />
            <ProductCarousel products={allItems} onProductPress={onClothPress} onAddToCart={handleAddToCart} autoScroll />
          </View>
        )}

        {!loading && allItems.length > 0 && <SplashBannerStrip image={bannerStripUrls[0]} />}

        {/* One section per category: category name + its product carousel; banner strip between each */}
        {!loading &&
          categories.map((cat, idx) => {
            const categoryProducts = productsByCategoryId[cat.id] ?? [];
            if (categoryProducts.length === 0) return null;
            const stripImage = bannerStripUrls[(idx + 1) % bannerStripUrls.length];
            return (
              <View key={cat.id}>
                <View style={styles.whiteSection}>
                  <SectionHeader
                    title={cat.name}
                    onPress={() => router.push({ pathname: '/(tabs)/explore', params: { categoryId: String(cat.id), categoryName: cat.name } })}
                  />
                  <ProductCarousel products={categoryProducts} onProductPress={onClothPress} onAddToCart={handleAddToCart} autoScroll />
                </View>
                <SplashBannerStrip image={stripImage} />
              </View>
            );
          })}

        {/* Collection Section */}
        {!loading && collectionProducts.length > 0 && (
          <View style={[styles.section, styles.lightSection, styles.gridSectionBlock]}>
            <Text style={styles.sectionTitle}>👗 Featured Collection</Text>
            <ProductGrid products={collectionProducts} onProductPress={onClothPress} onAddToCart={handleAddToCart} />
          </View>
        )}

        {/* New Arrivals Section */}
        {!loading && newArrivals.length > 0 && (
          <View style={[styles.section, styles.whiteSection, styles.gridSectionBlock]}>
            <Text style={styles.sectionTitle}>✨ New Arrivals</Text>
            <ProductGrid products={newArrivals} onProductPress={onClothPress} onAddToCart={handleAddToCart} />
          </View>
        )}

        {/* Bento Grid - at end of home */}
        <BentoGrid />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  // Header - Minimal for kiosk
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  brand: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6B4EAA',
    letterSpacing: 0.5,
    fontFamily: defaultFontFamily,
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  logoutText: {
    color: '#6B4EAA',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: defaultFontFamily,
  },

  scroll: {
    flex: 1,
  },

  // Marquee Banner
  marqueeContainer: {
    paddingVertical: 10,
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  marqueeRow: {
    height: 120,
    marginVertical: 3,
    overflow: 'hidden',
  },
  marqueeContent: {
    flexDirection: 'row',
  },
  posterCard: {
    height: 120,
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 14,
  },
  posterTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
    fontFamily: defaultFontFamily,
  },

  // Infinite Scrolling Carousel
  carouselContainer: {
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  carouselContent: {
    paddingHorizontal: 20,
  },

  // Categories Section
  categoriesSection: {
    paddingVertical: 20,
    backgroundColor: 'black',
    borderBottomWidth: 0.1,
    borderBottomColor: '#E5E7EB',
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    gap: 10,
  },

  // Welcome Section
  topSection: {
    backgroundColor: 'white',
    paddingBottom: 18,
  },
  welcomeSection: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
    fontFamily: defaultFontFamily,
  },
  downloadButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  downloadButton: {
    backgroundColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  iconButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconText: {
    fontSize: 12,
    color: '#FFF',
  },
  downloadButtonText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: defaultFontFamily,
  },
  categoryPill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryPillActive: {
    borderColor: 'black',
    borderWidth: 0.7,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: defaultFontFamily,
  },
  categoryTextActive: {
    color: 'black',
    fontFamily: defaultFontFamily,
  },

  // Section
  section: {
    paddingTop: 28,
    paddingHorizontal: 20,
  },
  lightSection: {
    backgroundColor: '#FFFDFC',
    paddingBottom: 16,
  },
  whiteSection: {
    backgroundColor: '#FFF',
    paddingBottom: 16,
  },
  gridSectionBlock: {
    paddingBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: 0.3,
    fontFamily: defaultFontFamily,
  },

  // Product Grid
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 16,
  },
  gridItem: {
    width: (SCREEN_WIDTH - 40 - 16) / 2, // 2 columns - much wider cards
  },
  cardWrapper: {
    // Removed flex: 1 to prevent stretching
  },
  
  // Flipkart-style Product Card (Carousel)
  productCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  cardImageContainer: {
    aspectRatio: 0.98,
    backgroundColor: '#F3F4F6',
    position: 'relative',
    padding: 18,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  
  // Overlay at bottom of card (Flipkart style)
 cardOverlay: {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderBottomLeftRadius: 12,
  borderBottomRightRadius: 12,
},
  overlayProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
    fontFamily: defaultFontFamily,
    textAlign: 'center',
  },
  overlayProductPrice: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
    fontFamily: defaultFontFamily,
    textAlign: 'center',
  },
  cardAddToCartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(107,78,170,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  
  // Grid Product Card (Original design)
  gridProductCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  gridCardImageContainer: {
    aspectRatio: 1.02,
    backgroundColor: '#F3F4F6',
    padding: 20,
  },
  
  // Card content styles (for grid view)
  cardContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 100, // Ensures consistent content height
  },
  cardInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    lineHeight: 22,
    marginBottom: 4,
    fontFamily: defaultFontFamily,
  },
  productPrice: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: defaultFontFamily,
  },
  productCategory: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    fontFamily: defaultFontFamily,
  },
  tryIndicator: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6B4EAA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    shadowColor: '#6B4EAA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tryIndicatorText: {
    fontSize: 22,
    color: '#FFF',
    fontWeight: '700',
    fontFamily: defaultFontFamily,
  },
  gridCardAddToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#6B4EAA',
    minWidth: 40,
  },
  gridCardAddToCartText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '700',
    fontFamily: defaultFontFamily,
  },

  splashBannerStrip: {
    width: '100%',
    height: 92,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashBannerImage: {
    width: '100%',
    height: '100%',
  },

  bentoSection: {
    paddingHorizontal: BENTO_PADDING,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: '#FFF',
  },
  bentoSectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
    marginBottom: 16,
    fontFamily: defaultFontFamily,
  },
  bentoGrid: {
    gap: BENTO_CELL_GAP,
  },
  bentoRow: {
    marginBottom: BENTO_CELL_GAP,
  },
  bentoCell: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f3f4f6',
  },
  bentoImage: {
    width: '100%',
    height: '100%',
  },
  bentoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    justifyContent: 'flex-end',
  },
  bentoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    fontFamily: defaultFontFamily,
  },
  bentoTitleSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    fontFamily: defaultFontFamily,
  },
  bentoSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    fontFamily: defaultFontFamily,
  },

  // Loading & Empty States
  loadingWrap: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '500',
    fontFamily: defaultFontFamily,
  },
  emptyWrap: {
    paddingVertical: 80,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    fontFamily: defaultFontFamily,
  },
  emptySubtext: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: defaultFontFamily,
  },
  signInBtn: {
    backgroundColor: '#6B4EAA',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  signInBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: defaultFontFamily,
  },
  browseBtn: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#6B4EAA',
  },
  browseBtnText: {
    color: '#6B4EAA',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: defaultFontFamily,
  },

  bottomSpacer: {
    height: 60,
  },

  sectionTitleWrapper: {
    marginLeft: 20,
    marginRight: 8,
    marginTop: 20,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
  },
  viewAllText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1F2937',
    letterSpacing: 0.6,
    fontFamily: defaultFontFamily,
  },
  viewAllArrowWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllArrow: {
    color: 'black',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: defaultFontFamily,
  },

  productGridWrapper: {
    borderRadius: 10,
    padding: 12,
  },
});
