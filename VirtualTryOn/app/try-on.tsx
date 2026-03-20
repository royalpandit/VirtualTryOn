/**
 * Try-on screen. Camera, image-picker, and file-system are lazy-loaded
 * so opening this screen (tap on cloth) does not load native modules → no crash.
 * Camera permission is only requested when user taps "Capture Photo".
 */
import { CLOTHING_ITEMS } from '@/constants/clothing';
import { useKioskCart } from '@/context/KioskCartContext';
import { getSession } from '@/lib/auth';
import {
  kioskGetCartByToken,
  kioskTryonShare,
  kioskTryonStart,
  kioskUploadImage,
} from '@/lib/kioskApi';
import { getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STRIP_WIDTH = 110;
const STRIP_CARD_SIZE = STRIP_WIDTH - 20;
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const getApiUrl = () => {
  const envApiUrl = Constants.expoConfig?.extra?.API_URL;
  if (envApiUrl) return envApiUrl;
  if (__DEV__) {
    if (Platform.OS === 'android') {
      const hostUri = Constants.expoConfig?.hostUri;
      if (hostUri) return `http://${hostUri.split(':')[0]}:8000/api/try-on`;
      return 'http://10.0.2.2:8000/api/try-on';
    }
    if (Platform.OS === 'ios') return 'http://localhost:8000/api/try-on';
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8000/api/try-on`;
  return 'http://localhost:8000/api/try-on';
};
const API_URL = getApiUrl();
const API_BASE_URL = API_URL.replace('/api/try-on', '');
const TRY_ON_URL = `${API_BASE_URL}/api/try-on`;
const HEALTH_URL = `${API_BASE_URL}/health`;
const TRY_ON_TIMEOUT_MS = 180000;

// Headers some proxies (e.g. RunPod) expect; do not set Content-Type when sending FormData
const API_HEADERS: Record<string, string> = {
  'User-Agent': 'VirtualTryOn/1.0 (Android)',
  'Accept': 'application/json',
};

function logError(tag: string, e: unknown, context?: Record<string, unknown>) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(`[${tag}]`, err.name, err.message, context ?? '');
  if (err.stack) console.error(`[${tag}] stack:`, err.stack);
}

function formatErrorForAlert(e: unknown): string {
  if (e instanceof Error) {
    const parts = [e.message];
    if (e.name && e.name !== 'Error') parts.unshift(`(${e.name})`);
    return parts.join(' ');
  }
  return String(e);
}

function getResultCacheKey(args: {
  basePersonUri?: string | null;
  clothId: string;
  clothType: string;
}): string {
  const baseKey = `uri:${args.basePersonUri ?? 'none'}`;
  return `${baseKey}__cloth:${args.clothId}__type:${args.clothType}`;
}

const LOADING_MESSAGES = [
  'Uploading photo...',
  'Preparing your image...',
  'Analyzing pose...',
  'Creating your look...',
];

// Normalize param (expo-router on some Android can return string | string[])
function normalizeParam(value: unknown): string {
  if (value == null) return '1';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return String(value);
}

type ClothType = 'upper' | 'lower' | 'overall';
type UiClothItem = {
  id: string;
  name: string;
  cloth_type: ClothType;
  image: number | string;
  categoryId?: number;
  categoryName?: string;
};

function inferClothTypeFromProduct(p: OuiSellerProduct): ClothType {
  const t = p.cloth_type?.toLowerCase();
  if (t === 'upper' || t === 'lower' || t === 'overall') return t;
  const cat = (p.category as any)?.name?.toLowerCase?.() ?? '';
  if (cat.includes('dress')) return 'overall';
  if (cat.includes('pant') || cat.includes('jeans') || cat.includes('lower')) return 'lower';
  return 'upper';
}

export default function TryOnScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    clothId?: string | string[];
    clothName?: string | string[];
    clothImageUrl?: string | string[];
    clothType?: string | string[];
  }>();
  const clothId = normalizeParam(params?.clothId);
  const clothNameParam = normalizeParam(params?.clothName);
  const clothTypeParam = normalizeParam(params?.clothType);
  const clothImageUrl = normalizeParam(params?.clothImageUrl);
  const clothingItem = CLOTHING_ITEMS.find((i) => i.id === clothId) ?? null;
  const clothTypeFromParams = (clothTypeParam === 'upper' || clothTypeParam === 'lower' || clothTypeParam === 'overall')
    ? clothTypeParam
    : null;
  const effectiveClothType = clothTypeFromParams ?? (clothingItem?.cloth_type ?? 'upper');
  const effectiveClothImage = clothImageUrl && clothImageUrl !== '1' ? clothImageUrl : clothingItem?.image;

  const [selectedClothId, setSelectedClothId] = useState<string>(clothId);
  const [availableCloths, setAvailableCloths] = useState<UiClothItem[] | null>(null);
  const [clothsLoading, setClothsLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const selectedClothRef = useRef<{ id: string; cloth_type: ClothType; image: number | string; name: string } | null>(null);
  const lastTryClothTypeRef = useRef<ClothType | null>(null);

  const pendingApplyRef = useRef<{ clothType: ClothType; cloth: UiClothItem | null } | null>(null);
  const [appliedUpper, setAppliedUpper] = useState<UiClothItem | null>(null);
  const [appliedLower, setAppliedLower] = useState<UiClothItem | null>(null);
  const [appliedOverall, setAppliedOverall] = useState<UiClothItem | null>(null);

  const panelAnim = useRef(new Animated.Value(1)).current;
  const [stripExpanded, setStripExpanded] = useState<boolean>(true);
  const [comboMode, setComboMode] = useState<boolean>(false);
  const [stripVisible, setStripVisible] = useState<boolean>(true);
  const stripTranslateX = useRef(new Animated.Value(0)).current;
  const [guideVisible, setGuideVisible] = useState<boolean>(true);
  const guideOpacity = useRef(new Animated.Value(1)).current;
  const guideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const GUIDE_DURATION_MS = 3000;

  useEffect(() => {
    if (step === 'camera') return;
    setGuideVisible(true);
    guideOpacity.setValue(1);
    if (guideTimeoutRef.current) clearTimeout(guideTimeoutRef.current);
    guideTimeoutRef.current = setTimeout(() => {
      guideTimeoutRef.current = null;
      Animated.timing(guideOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setGuideVisible(false));
    }, GUIDE_DURATION_MS);
    return () => {
      if (guideTimeoutRef.current) clearTimeout(guideTimeoutRef.current);
    };
  }, [step, resultImage]);

  const STRIP_TOTAL_WIDTH = STRIP_WIDTH + 16;
  const toggleStrip = () => {
    setStripVisible((v) => {
      const next = !v;
      Animated.spring(stripTranslateX, {
        toValue: next ? 0 : STRIP_TOTAL_WIDTH + 40,
        useNativeDriver: true,
        tension: 65,
        friction: 12,
      }).start();
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setClothsLoading(true);
      try {
        const session = await getSession();
        const sellerId = session?.user?.id ?? null;
        if (!sellerId) {
          if (mounted) setAvailableCloths(null);
          return;
        }
        const res = await getSellerProducts({ sellerId, page: 1, perPage: 60, accessToken: session?.accessToken ?? '' });
        if (!mounted) return;
        const products = Array.isArray(res?.products) ? res.products : [];
        const mapped: UiClothItem[] = products
          .filter((p) => Boolean(p) && typeof (p as any).id !== 'undefined')
          .map((p) => {
            const id = String((p as any).id);
            const name = typeof p.name === 'string' && p.name.length > 0 ? p.name : 'Item';
            const imgPath = (p as any).thumb_image ?? (p as any).image;
            const image = typeof imgPath === 'string'
              ? imgPath.startsWith('http')
                ? imgPath
                : (getOuiAssetUrl(imgPath) ?? '')
              : '';
            return {
              id,
              name,
              cloth_type: inferClothTypeFromProduct(p),
              image: image || 'https://via.placeholder.com/512x512.png?text=Cloth',
              categoryId: p.category?.id as number | undefined,
              categoryName: p.category?.name,
            };
          });
        setAvailableCloths(mapped.length > 0 ? mapped : null);
      } catch (e: unknown) {
        if (mounted) setAvailableCloths(null);
      } finally {
        if (mounted) setClothsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const localFallbackCloths: UiClothItem[] = useMemo(
    () => CLOTHING_ITEMS.map((i) => ({ id: i.id, name: i.name, cloth_type: i.cloth_type, image: i.image, categoryName: 'All' })),
    []
  );
  const baseCloths: UiClothItem[] = availableCloths && availableCloths.length > 0 ? availableCloths : localFallbackCloths;
  const incomingClothFromParams: UiClothItem | null = useMemo(() => {
    if (!clothId || clothId === '1' || !effectiveClothImage) return null;
    const alreadyIn = baseCloths.some((c) => c.id === clothId);
    if (alreadyIn) return null;
    return {
      id: clothId,
      name: clothNameParam && clothNameParam !== '1' ? clothNameParam : 'Item',
      cloth_type: effectiveClothType as ClothType,
      image: effectiveClothImage,
      categoryName: 'Selected',
    };
  }, [clothId, clothNameParam, effectiveClothImage, effectiveClothType, baseCloths]);
  const allCloths: UiClothItem[] = useMemo(
    () => (incomingClothFromParams ? [incomingClothFromParams, ...baseCloths] : baseCloths),
    [incomingClothFromParams, baseCloths]
  );
  const stripCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    allCloths.forEach((c) => {
      if (c.categoryId != null) {
        const id = String(c.categoryId);
        if (!map.has(id)) map.set(id, { id, name: c.categoryName || `Category ${id}` });
      }
    });
    return [{ id: 'all', name: 'All' }, ...Array.from(map.values())];
  }, [allCloths]);
  const filteredCloths = useMemo(() => {
    if (selectedCategoryId === 'all') return allCloths;
    return allCloths.filter((c) => String(c.categoryId ?? '') === selectedCategoryId);
  }, [allCloths, selectedCategoryId]);
  const selectedCloth = allCloths.find((i) => i.id === selectedClothId) ?? null;
  const selectedClothType = selectedCloth?.cloth_type ?? effectiveClothType;
  const selectedClothImage = selectedCloth?.image ?? effectiveClothImage;
  useEffect(() => {
    if (!selectedCloth?.categoryId) return;
    setSelectedCategoryId(String(selectedCloth.categoryId));
  }, [selectedCloth?.id]);
  const displayClothName = clothNameParam && clothNameParam !== '1'
    ? clothNameParam
    : (selectedCloth?.name ?? clothingItem?.name ?? 'Item');

  const [step, setStep] = useState<'choose' | 'camera' | 'upload' | 'preview' | 'result'>('camera');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preprocessingLoading, setPreprocessingLoading] = useState(false);
  const [preprocessingCacheKey, setPreprocessingCacheKey] = useState<string | null>(null);
  const [preprocessingClothType, setPreprocessingClothType] = useState<'upper' | 'lower' | 'overall' | null>(null);
  const [basePersonUri, setBasePersonUri] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [CameraComponent, setCameraComponent] = useState<React.ComponentType<{ onPhotoTaken: (uri: string) => void; onBack: () => void }> | null>(null);
  const [cameraLoadError, setCameraLoadError] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [requestDetails, setRequestDetails] = useState<{
    url: string;
    sending: string;
    format: string;
    reached: boolean | null;
    responseStatus?: number;
    error?: string;
  } | null>(null);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [resultCache, setResultCache] = useState<Record<string, string>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const { addToCart, cartId, refreshCart, ensureCart } = useKioskCart();

  useEffect(() => {
    console.log('[TRY-ON] Screen mounted, API_BASE_URL=', API_BASE_URL, 'TRY_ON_URL=', TRY_ON_URL);
  }, []);

  useEffect(() => {
    if (!resultImage) return;
    const pending = pendingApplyRef.current;
    if (!pending) return;
    if (pending.clothType === 'upper') setAppliedUpper(pending.cloth);
    else if (pending.clothType === 'lower') setAppliedLower(pending.cloth);
    else setAppliedOverall(pending.cloth);
    pendingApplyRef.current = null;
  }, [resultImage]);

  useEffect(() => {
    if (!selectedCloth) return;
    selectedClothRef.current = {
      id: selectedCloth.id,
      cloth_type: selectedCloth.cloth_type,
      image: selectedCloth.image,
      name: selectedCloth.name,
    };
  }, [selectedCloth?.id]);

  useEffect(() => {
    if (!(loading || preprocessingLoading)) return;
    const id = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [loading, preprocessingLoading]);

  useEffect(() => {
    if (step !== 'camera') return;
    if (CameraComponent) return;
    setCameraLoadError(null);
    import('./try-on-camera')
      .then((m) => setCameraComponent(() => m.CameraStep))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e ?? 'Camera not available');
        setCameraLoadError(msg);
      });
  }, [step, CameraComponent]);

  const [autoTryRequestedUri, setAutoTryRequestedUri] = useState<string | null>(null);
  const [autoTryPending, setAutoTryPending] = useState(false);
  // Keep selected cloth in sync with route params when user opens Try-On from Home repeatedly.
  useEffect(() => {
    if (!clothId || clothId === '1') return;
    setSelectedClothId(clothId);
    setAutoTryPending(false);
    setAutoTryRequestedUri(null);
    if (effectiveClothImage) {
      selectedClothRef.current = {
        id: clothId,
        cloth_type: effectiveClothType as ClothType,
        image: effectiveClothImage,
        name: clothNameParam && clothNameParam !== '1' ? clothNameParam : 'Item',
      };
    }
  }, [clothId, clothNameParam, effectiveClothType, effectiveClothImage]);

  const handlePhotoTaken = useCallback(
    (uri: string) => {
      setCapturedPhoto(uri);
      setBasePersonUri(uri);
      setResultImage(null);
      setPreprocessingCacheKey(null);
      setPreprocessingClothType(null);
      setResultCache({});
      setStep('preview');
      preprocessPersonImage(uri, selectedClothType);
      if (clothId && clothId !== '1' && effectiveClothImage) {
        setAutoTryRequestedUri(uri);
        setAutoTryPending(true);
      }
    },
    [selectedClothType, clothId, effectiveClothImage]
  );

  const handleCameraBack = useCallback(() => setStep('choose'), []);

  const pickImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your photos to upload.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCapturedPhoto(result.assets[0].uri);
        setBasePersonUri(result.assets[0].uri);
        setResultImage(null);
        setPreprocessingCacheKey(null);
        setPreprocessingClothType(null);
        setResultCache({});
        setStep('preview');
        preprocessPersonImage(result.assets[0].uri, selectedClothType);
        if (clothId && clothId !== '1' && effectiveClothImage) {
          setAutoTryRequestedUri(result.assets[0].uri);
          setAutoTryPending(true);
        }
      }
    } catch (e: unknown) {
      logError('PICK_IMAGE', e);
      Alert.alert('Error', formatErrorForAlert(e));
    }
  };

  const preprocessPersonImage = async (photoUri: string, clothType: string = 'upper'): Promise<string | null> => {
    // Backend /api/preprocess-person does person segmentation and background removal; cache_key speeds up try-on.
    setPreprocessingLoading(true);
    setPreprocessingClothType((clothType === 'upper' || clothType === 'lower' || clothType === 'overall') ? clothType : null);
    const preprocessUrl = `${API_BASE_URL}/api/preprocess-person`;
    console.log('[PREPROCESS] Start', { preprocessUrl, clothType, photoUriLen: photoUri?.length });
    try {
      const formData = new FormData();
      formData.append('person_image', { uri: photoUri, type: 'image/jpeg', name: 'person.jpg' } as any);
      formData.append('cloth_type', clothType);
      const res = await fetch(preprocessUrl, {
        method: 'POST',
        headers: API_HEADERS,
        body: formData,
      });
      console.log('[PREPROCESS] Response', res.status, res.ok);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.cache_key) {
          setPreprocessingCacheKey(data.cache_key);
          console.log('[PREPROCESS] Success cache_key', data.cache_key?.slice(0, 16) + '...');
          return data.cache_key as string;
        } else {
          console.warn('[PREPROCESS] OK but no cache_key', Object.keys(data ?? {}));
        }
      } else {
        const text = await res.text();
        console.error('[PREPROCESS] Error', res.status, text?.slice(0, 200));
      }
    } catch (e: unknown) {
      logError('PREPROCESS', e, { preprocessUrl, clothType });
    } finally {
      setPreprocessingLoading(false);
    }

    return null;
  };

  const runTryOn = async () => {
    const refCloth = selectedClothRef.current;
    const clothIdForRequest = refCloth?.id ?? selectedClothId;
    const clothTypeVal = refCloth?.cloth_type ?? selectedClothType;
    const clothImageForRequest = refCloth?.image ?? selectedClothImage;
    if (!(basePersonUri || capturedPhoto) || !clothImageForRequest) {
      console.error('[TRY-ON] Abort: missing person photo or cloth image', {
        capturedPhoto: Boolean(capturedPhoto),
        basePersonUri: Boolean(basePersonUri),
        hasClothImage: Boolean(clothImageForRequest),
      });
      return;
    }
    const baseUriForCache = basePersonUri ?? capturedPhoto;

    lastTryClothTypeRef.current = clothTypeVal;

    // Serve from cache immediately (fast switching across items)
    const cacheKeyForResult = getResultCacheKey({
      basePersonUri: baseUriForCache,
      clothId: clothIdForRequest,
      clothType: clothTypeVal,
    });
    const cachedImage = resultCache[cacheKeyForResult];
    if (cachedImage) {
      setResultImage(cachedImage);
      setStep('result');
      return;
    }

    setLoading(true);
    setLoadingMessageIndex(0);
    setTryOnError(null);
    setRequestLog([`0. API URL: ${TRY_ON_URL}`, '1. Start']);
    setRequestDetails({
      url: TRY_ON_URL,
      sending: 'Preparing...',
      format: 'multipart/form-data (no Content-Type set, boundary auto)',
      reached: null,
    });
    const addLog = (line: string) => setRequestLog((prev) => [...prev, line]);
    console.log('[TRY-ON] Start', { TRY_ON_URL, cache_key: preprocessingCacheKey ?? 'none', cloth_type: clothTypeVal, cloth_id: clothIdForRequest });

    // cache_key is cloth_type specific on the backend; if user switches cloth type, force re-preprocess
    let activeCacheKey: string | null = preprocessingCacheKey;
    if (activeCacheKey && preprocessingClothType && preprocessingClothType !== clothTypeVal) {
      addLog(`1.2 Cache key cloth_type mismatch (cached=${preprocessingClothType}, now=${clothTypeVal}) → re-preprocess`);
      const personUri = basePersonUri ?? capturedPhoto;
      setPreprocessingCacheKey(null);
      setPreprocessingClothType(null);
      if (personUri) {
        activeCacheKey = await preprocessPersonImage(personUri, clothTypeVal);
      }
    }

    // Quick connectivity check (GET /health) so APK log shows if device can reach server at all
    try {
      const healthRes = await Promise.race([
        fetch(HEALTH_URL, { method: 'GET', headers: API_HEADERS }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('health timeout')), 10000)),
      ]) as Response;
      addLog(healthRes.ok ? '1.5 Connectivity: OK (health reached)' : `1.5 Connectivity: health returned ${healthRes.status}`);
    } catch (healthErr: unknown) {
      const msg = healthErr instanceof Error ? healthErr.message : String(healthErr);
      addLog(`1.5 Connectivity: failed (${msg})`);
    }
    try {
      const formData = new FormData();
      const personField = activeCacheKey ? `cache_key: ${activeCacheKey.slice(0, 12)}...` : 'person_image: (file from camera/gallery)';
      if (activeCacheKey) {
        formData.append('cache_key', activeCacheKey);
        console.log('[TRY-ON] Using cache_key', activeCacheKey.slice(0, 16) + '...');
      } else {
        const personUri = basePersonUri ?? capturedPhoto;
        formData.append('person_image', { uri: personUri, type: 'image/jpeg', name: 'person.jpg' } as any);
        console.log('[TRY-ON] Using person_image uri', personUri?.slice?.(0, 50) ?? personUri);
      }
      formData.append('cloth_type', clothTypeVal);

      const imageModule = clothImageForRequest ?? require('@/assets/clothes/colourfull-sweatshirt.jpg');
      let clothUri: string;
      // Support URL strings (e.g. Cloudinary) - avoids APK asset/resize issues
      const rawUriFromUrl = typeof imageModule === 'string' && imageModule.startsWith('http') ? imageModule : '';
      const clothSource = rawUriFromUrl ? null : RNImage.resolveAssetSource(imageModule as number);
      const rawUri = rawUriFromUrl || (typeof clothSource?.uri === 'string' ? clothSource.uri : typeof clothSource === 'number' ? String(clothSource) : '');
      addLog(`2. clothSource: uri type=${typeof clothSource?.uri}${rawUri ? `, starts ${rawUri.slice(0, 20)}...` : ''}`);
      console.log('[TRY-ON] clothSource', { uri: rawUri?.slice(0, 50), type: typeof clothSource?.uri });

      if (rawUri.startsWith('http')) {
        try {
          addLog('3. Downloading cloth from URL...');
          console.log('[TRY-ON] Downloading cloth from URL...');
          const FileSystem = await import('expo-file-system/legacy');
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
          const ext = rawUri.includes('.png') ? 'png' : 'jpg';
          const fileUri = `${cacheDir}cloth-${Date.now()}.${ext}`;
          await FileSystem.downloadAsync(rawUri, fileUri);
          clothUri = fileUri;
          addLog(`4. Cloth downloaded: ${fileUri.slice(0, 40)}...`);
          console.log('[TRY-ON] Cloth downloaded to', fileUri);
        } catch (fsErr: unknown) {
          logError('TRY-ON cloth download', fsErr, { rawUri: rawUri?.slice(0, 60) });
          const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          throw new Error(`Could not download cloth image: ${msg}`);
        }
      } else {
        addLog('3. Resolving cloth via expo-asset (APK)...');
        console.log('[TRY-ON] Resolving cloth via expo-asset (APK-safe file URI)...');
        try {
          const asset = Asset.fromModule(imageModule);
          await asset.downloadAsync();
          clothUri = asset.localUri ?? asset.uri ?? '';
          if (!clothUri) throw new Error('Asset has no localUri or uri');
          addLog(`4. Cloth localUri: ${clothUri.startsWith('file://') ? 'file://...' : clothUri.slice(0, 30)}...`);
          console.log('[TRY-ON] Cloth asset localUri', clothUri.slice(0, 60) + '...');
        } catch (assetErr: unknown) {
          logError('TRY-ON cloth asset', assetErr, { rawUri: rawUri?.slice(0, 40) });
          const msg = assetErr instanceof Error ? assetErr.message : String(assetErr);
          throw new Error(`Could not load cloth image: ${msg}`);
        }
      }
      if (!clothUri || clothUri.length < 2) {
        console.error('[TRY-ON] Invalid clothUri', { clothUri, length: clothUri?.length });
        throw new Error('Cloth image URI is missing. Try another item.');
      }
      // Resize cloth to keep POST small so RunPod proxy doesn't drop the request (step 6 failure)
      const MAX_CLOTH_DIM = 1024;
      const CLOTH_JPEG_QUALITY = 0.85;
      let uploadClothUri = clothUri;
      let mime: string = clothUri.split('.').pop()?.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
      const tryResize = async (uri: string): Promise<{ uri: string } | null> => {
        const { manipulateAsync: manipulate, SaveFormat } = await import('expo-image-manipulator');
        const resized = await manipulate(uri, [{ resize: { width: MAX_CLOTH_DIM } }], {
          compress: CLOTH_JPEG_QUALITY,
          format: SaveFormat.JPEG,
        });
        return { uri: resized.uri };
      };
      try {
        let resized = await tryResize(clothUri).catch(() => null);
        // In APK, Asset.localUri often isn't accepted by ImageManipulator; copy to a .jpg path and retry
        if (!resized) {
          try {
            const FileSystem = await import('expo-file-system/legacy');
            const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
            const copyPath = `${cacheDir}cloth_resize_${Date.now()}.jpg`;
            await FileSystem.copyAsync({ from: clothUri, to: copyPath });
            addLog('4.4 Cloth copied to .jpg path, retrying resize');
            resized = await tryResize(copyPath).catch(() => null);
          } catch (copyErr: unknown) {
            const msg = copyErr instanceof Error ? copyErr.message : String(copyErr);
            addLog(`4.4 Copy for resize: ${msg.slice(0, 50)}`);
          }
        }
        if (resized) {
          uploadClothUri = resized.uri;
          mime = 'image/jpeg';
          addLog(`4.5 Cloth resized for proxy (max ${MAX_CLOTH_DIM}px, JPEG ${CLOTH_JPEG_QUALITY})`);
        } else {
          addLog('4.5 Cloth resize failed (using original - POST may be large)');
        }
      } catch (resizeErr: unknown) {
        const errMsg = resizeErr instanceof Error ? resizeErr.message : String(resizeErr);
        console.warn('[TRY-ON] Cloth resize failed, using original', resizeErr);
        addLog(`4.5 Cloth resize error: ${errMsg.slice(0, 50)} (using original)`);
      }
      const clothName = `cloth.${uploadClothUri.split('.').pop()?.split('?')[0] || 'jpg'}`;
      formData.append('cloth_image', { uri: uploadClothUri, type: mime, name: clothName } as any);
      const clothUriType = uploadClothUri.startsWith('file://') ? 'file' : uploadClothUri.startsWith('http') ? 'http' : 'other';
      addLog(`5. FormData ready (cloth: ${clothUriType}, ${mime})`);
      setRequestDetails((prev) => (prev ? {
        ...prev,
        sending: [
          `Person: ${personField}`,
          `cloth_type: ${clothTypeVal}`,
          `cloth_image: (${clothUriType}) ${mime}, name=${clothName}`,
        ].join('\n'),
      } : null));
      console.log('[TRY-ON] FormData ready, cloth last, uri=', clothUri.startsWith('file://') ? 'file://...' : clothUri.slice(0, 50), 'mime', mime);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TRY_ON_TIMEOUT_MS);
      addLog('6. Fetching...');
      console.log('[TRY-ON] Fetching', TRY_ON_URL);
      const response = await fetch(TRY_ON_URL, {
        method: 'POST',
        headers: API_HEADERS,
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      addLog(`7. Response: ${response.status} ${response.statusText}`);
      setRequestDetails((prev) => (prev ? { ...prev, reached: true, responseStatus: response.status } : null));
      console.log('[TRY-ON] Response', response.status, response.statusText, response.ok);
      if (!response.ok) {
        const errBody = await response.text();
        console.error('[TRY-ON] Error response body', errBody?.slice(0, 300));
        let err: { detail?: string } = { detail: response.statusText };
        try {
          err = JSON.parse(errBody);
        } catch {
          err = { detail: errBody?.slice(0, 100) || response.statusText };
        }
        const errMsg = err.detail || `Request failed ${response.status}`;
        setRequestDetails((prev) => (prev ? { ...prev, error: errMsg } : null));
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (!data?.imageBase64) {
        console.error('[TRY-ON] Response missing imageBase64', Object.keys(data ?? {}));
        setRequestDetails((prev) => (prev ? { ...prev, error: 'Invalid response: no image' } : null));
        throw new Error('Invalid response: no image');
      }
      addLog('8. Success');
      setTryOnError(null);
      setRequestDetails((prev) => (prev ? { ...prev, error: undefined } : null));
      const resultMime = data.imageMimeType || 'image/jpeg';
      const imageUri = `data:${resultMime};base64,${data.imageBase64}`;
      setResultImage(imageUri);
      setResultCache((prev) => ({ ...prev, [cacheKeyForResult]: imageUri }));
      setShareUrl(null);
      setShareError(null);
      setStep('result');
      console.log('[TRY-ON] Success');
    } catch (e: any) {
      addLog(`ERR: ${e?.name ?? 'Error'} - ${e?.message ?? String(e)}`);
      logError('TRY-ON', e, {
        name: e?.name,
        message: e?.message,
        code: e?.code,
        status: e?.status,
      });
      setRequestDetails((prev) => (prev ? {
        ...prev,
        reached: prev.reached ?? false,
        error: e?.message ?? String(e),
      } : null));
      const isAbort = e?.name === 'AbortError';
      const shortMsg = isAbort
        ? 'Try-on timed out. Check your connection and try again.'
        : formatErrorForAlert(e);
      const isNetworkFailed = (e?.message ?? '').toLowerCase().includes('network request failed');
      const isRunPod = API_BASE_URL?.includes('runpod.net') ?? false;
      const devHint = __DEV__ && isNetworkFailed
        ? 'Dev: Start the backend (e.g. in CatVTON: python app_fastapi.py). It must listen on 0.0.0.0:8000. On a physical device, use same Wi‑Fi as PC; allow port 8000 in Windows Firewall if needed.'
        : !__DEV__ && (API_BASE_URL?.includes('localhost') || API_BASE_URL?.includes('10.0.2.2'))
          ? 'Hint: APK may be using wrong URL. Set extra.API_URL in app.json and rebuild.'
          : !__DEV__ && isNetworkFailed && isRunPod
            ? 'RunPod: Check step log for "1.5 Connectivity". If that failed, the phone cannot reach the proxy (Wi‑Fi, DNS, or pod offline). If 1.5 OK but step 6 failed, the proxy may be dropping large POST requests.'
            : null;
      const fullDetail = [
        e?.name && e.name !== 'Error' ? `Type: ${e.name}` : null,
        e?.message ? `Message: ${e.message}` : null,
        e?.code != null ? `Code: ${e.code}` : null,
        e?.status != null ? `Status: ${e.status}` : null,
        `URL: ${TRY_ON_URL}`,
        devHint,
      ]
        .filter(Boolean)
        .join('\n');
      const displayError = fullDetail || shortMsg || String(e);
      setTryOnError(displayError);
      Alert.alert('Error', shortMsg);
    } finally {
      setLoading(false);
    }
  };

  // Deterministic auto-try flow for cloth selected from Home:
  // wait until photo state is set and preprocess is done, then run once.
  useEffect(() => {
    if (!autoTryPending || !autoTryRequestedUri) return;
    if (!clothId || clothId === '1' || !effectiveClothImage) return;
    if (loading || preprocessingLoading) return;
    const currentPhotoUri = basePersonUri ?? capturedPhoto;
    if (!currentPhotoUri || currentPhotoUri !== autoTryRequestedUri) return;

    setAutoTryPending(false);
    setAutoTryRequestedUri(null);
    const refCloth = selectedClothRef.current;
    if (refCloth) {
      pendingApplyRef.current = {
        clothType: refCloth.cloth_type,
        cloth: { id: refCloth.id, name: refCloth.name, cloth_type: refCloth.cloth_type, image: refCloth.image },
      };
    }
    if (__DEV__) console.log('[AUTO-TRY] Triggering runTryOn for incoming cloth', { clothId, clothType: refCloth?.cloth_type ?? selectedClothType, currentPhotoUriLen: currentPhotoUri?.length });
    runTryOn();
  }, [autoTryPending, autoTryRequestedUri, capturedPhoto, basePersonUri, loading, preprocessingLoading, clothId, effectiveClothImage, selectedClothType]);

  const handleBack = () => {
    if (step === 'camera') setStep('choose');
    else if (step === 'preview') { setCapturedPhoto(null); setStep('choose'); }
    else router.back();
  };

  const promoteResultToBase = async () => {
    if (!resultImage) return;
    try {
      // resultImage is data URL: data:image/jpeg;base64,...
      const base64 = resultImage.includes(',') ? resultImage.split(',')[1] : resultImage;
      const FileSystem = await import('expo-file-system/legacy');
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = `${cacheDir}person_base_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      setResultImage(null);
      setBasePersonUri(fileUri);
      setPreprocessingCacheKey(null);
      setPreprocessingClothType(null);
      setTryOnError(null);
      setRequestDetails(null);
      setRequestLog([]);
      setResultCache({});
      // Preprocess the new base immediately so subsequent lower tries are fast
      preprocessPersonImage(fileUri, 'lower');
      setStep('preview');
    } catch (e: unknown) {
      logError('PROMOTE_RESULT', e);
      Alert.alert('Error', 'Could not prepare the combo try-on base image.');
    }
  };

  const canTryOn = Boolean((basePersonUri || capturedPhoto) && selectedClothImage);
  const showPreviewUri = resultImage || basePersonUri || capturedPhoto;
  const previewMode: 'empty' | 'person' | 'result' = resultImage ? 'result' : (basePersonUri || capturedPhoto) ? 'person' : 'empty';

  const resetToChoose = () => {
    setCapturedPhoto(null);
    setBasePersonUri(null);
    setResultImage(null);
    setPreprocessingCacheKey(null);
    setPreprocessingClothType(null);
    setTryOnError(null);
    setRequestDetails(null);
    setRequestLog([]);
    setResultCache({});
    setStep('choose');
  };

  const animatePanel = () => {
    panelAnim.setValue(0);
    Animated.timing(panelAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const handleSelectCloth = async (it: UiClothItem) => {
    if (loading || preprocessingLoading) return;
    const hasPerson = Boolean(basePersonUri || capturedPhoto);
    const lastTryType = lastTryClothTypeRef.current;
    const shouldAutoLayer = Boolean(resultImage) && Boolean(lastTryType) && it.cloth_type !== lastTryType;
    if (shouldAutoLayer) {
      await promoteResultToBase();
    }
    setSelectedClothId(it.id);
    selectedClothRef.current = { id: it.id, cloth_type: it.cloth_type, image: it.image, name: it.name };
    setTryOnError(null);
    setRequestDetails(null);
    setRequestLog([]);
    setStep(hasPerson || resultImage ? 'preview' : 'choose');

    if (hasPerson) {
      pendingApplyRef.current = { clothType: it.cloth_type, cloth: it };
      runTryOn();
    }
  };

  const handleTryLook = () => {
    pendingApplyRef.current = { clothType: selectedClothType, cloth: selectedCloth };
    runTryOn();
  };

  const canAddToCart = Boolean(selectedCloth && /^\d+$/.test(selectedClothId));
  const handleAddToCart = async () => {
    if (!canAddToCart) return;
    try {
      await addToCart(Number(selectedClothId), 1);
      Alert.alert('Added', 'Item added to cart.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add to cart.');
    }
  };

  const canShareLook = Boolean(resultImage && /^\d+$/.test(selectedClothId));
  const handleShareLook = async () => {
    if (!resultImage || !/^\d+$/.test(selectedClothId)) return;
    setSharing(true);
    setShareError(null);
    try {
      await ensureCart();
      await refreshCart();
      const token = await SecureStore.getItemAsync('kiosk_cart_qr_token');
      if (!token) {
        setShareError('Cart not ready. Try again.');
        return;
      }
      const cartRes = await kioskGetCartByToken(token);
      const currentCartId = cartRes?.cart?.id;
      if (currentCartId == null) {
        setShareError('Cart not ready. Add to cart first or try again.');
        return;
      }
      const FileSystem = await import('expo-file-system/legacy');
      const base64 = resultImage.includes(',') ? resultImage.split(',')[1] : resultImage;
      const mime = resultImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = `${cacheDir}kiosk_tryon_${Date.now()}.${ext}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      // API contract: folder must be "tryon_images"
      const uploadRes = await kioskUploadImage('tryon_images', fileUri, mime);
      const path = uploadRes?.data?.path ?? uploadRes?.data?.full_url;
      if (!path) throw new Error('Upload did not return path');
      const startRes = await kioskTryonStart(currentCartId, Number(selectedClothId), path);
      const sessionId = startRes?.data?.id;
      if (sessionId == null) throw new Error('Try-on start did not return session id');
      const shareRes = await kioskTryonShare(sessionId);
      const url = shareRes?.share_url;
      if (url) {
        setShareUrl(url);
        Alert.alert('Ready', 'QR is generated. User can scan this to view try-on result on phone.');
      } else {
        setShareError('No share link returned.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setShareError(msg);
      Alert.alert('Share failed', msg);
    } finally {
      setSharing(false);
    }
  };

  const renderKioskScreen = () => {
    if (step === 'camera') {
      return (
        <View style={styles.cameraFullScreen}>
          {cameraLoadError ? (
            <View style={styles.centeredOnStage}>
              <Text style={styles.stageTitle}>Camera unavailable</Text>
              <Text style={styles.stageSubtitle}>{cameraLoadError}</Text>
              <TouchableOpacity
                style={[styles.bigBtn, styles.bigBtnSecondary]}
                onPress={() => setStep('preview')}
                activeOpacity={0.85}
              >
                <Text style={styles.bigBtnSecondaryText}>Back to preview</Text>
              </TouchableOpacity>
            </View>
          ) : CameraComponent ? (
            <CameraComponent onPhotoTaken={handlePhotoTaken} onBack={handleCameraBack} />
          ) : (
            <View style={styles.centeredOnStage}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.stageSubtitle}>Loading camera…</Text>
            </View>
          )}
        </View>
      );
    }

    return (
      <View style={styles.kioskRoot}>
        <View style={styles.previewStage}>
          {showPreviewUri ? (
            <View style={resultImage ? styles.stageResultWrap : styles.stageImageWrap}>
              <Image source={{ uri: showPreviewUri }} style={styles.stageImage} contentFit="cover" />
            </View>
          ) : (
            <View style={styles.centeredOnStage}>
              <Text style={styles.stageTitle}>Stand in front of the mirror</Text>
              <Text style={styles.stageSubtitle}>Capture a photo or upload to start trying looks.</Text>
            </View>
          )}

          {guideVisible && (
            <Animated.View pointerEvents="none" style={[styles.guideOverlay, { opacity: guideOpacity }]}>
              {!showPreviewUri ? (
                <Text style={styles.guideOverlayText}>1) Tap Camera or Gallery 2) Take/choose a full-body photo (background will be processed)</Text>
              ) : resultImage ? (
                <Text style={styles.guideOverlayText}>
                  {comboMode ? 'Combo: Select lower and tap to apply, or switch upper/lower from the strip.' : 'Tap Upper/Lower to build a combo. Tap another item to swap it.'}
                </Text>
              ) : (
                <Text style={styles.guideOverlayText}>
                  {comboMode ? 'Combo: Select upper → Try on. Then select lower → Try on again.' : 'Tap a cloth to apply. Change category in the right strip.'}
                </Text>
              )}
            </Animated.View>
          )}

        {(loading || preprocessingLoading) && (
          <View style={styles.stageOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.stageOverlayText}>{LOADING_MESSAGES[loadingMessageIndex]}</Text>
          </View>
        )}

        {tryOnError ? (
          <View style={styles.stageError}>
            <Text style={styles.stageErrorText} selectable>
              {tryOnError}
            </Text>
          </View>
        ) : null}

        </View>

        <View style={[styles.topBar, { top: Math.max(12, insets.top + 6) }]}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.85} style={styles.backPill}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
            <Text style={styles.backPillText}>Back</Text>
          </TouchableOpacity>
          {canAddToCart ? (
            <TouchableOpacity onPress={handleAddToCart} activeOpacity={0.85} style={styles.addToCartPill}>
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <Text style={styles.addToCartPillText}>Add to cart</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {resultImage && canShareLook && (
          <View style={styles.shareBar}>
            {shareUrl ? (
              <View style={styles.shareQrWrap}>
                <Text style={styles.shareQrLabel}>Scan to view this try-on look</Text>
                <View style={styles.shareQrCard}>
                  <QRCode value={shareUrl} size={180} />
                </View>
              </View>
            ) : (
              <>
                {shareError ? <Text style={styles.shareErrorText}>{shareError}</Text> : null}
                <TouchableOpacity
                  onPress={handleShareLook}
                  disabled={sharing}
                  style={[styles.shareLookBtn, sharing && styles.shareLookBtnDisabled]}
                  activeOpacity={0.85}
                >
                  {sharing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="share-social-outline" size={20} color="#fff" />
                      <Text style={styles.shareLookBtnText}>Share your look</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={toggleStrip}
          style={[styles.stripToggleTab, stripVisible && styles.stripToggleTabWhenOpen]}
        >
          <Ionicons name={stripVisible ? 'chevron-forward' : 'chevron-back'} size={20} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={[styles.rightStrip, { top: Math.max(72, insets.top + 56), transform: [{ translateX: stripTranslateX }] }]}>
          <View style={styles.stripChips}>
            {stripCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.stripChip, selectedCategoryId === cat.id && styles.stripChipActive]}
                onPress={() => { setSelectedCategoryId(cat.id); setStripExpanded(true); animatePanel(); }}
                activeOpacity={0.9}
              >
                <Text numberOfLines={1} style={[styles.stripChipText, selectedCategoryId === cat.id && styles.stripChipTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.stripChip, comboMode && styles.stripChipActive]}
              onPress={() => { setComboMode((v) => !v); animatePanel(); }}
              activeOpacity={0.9}
            >
              <Text numberOfLines={1} style={[styles.stripChipText, comboMode && styles.stripChipTextActive]}>Combo</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.stripPanel, { opacity: panelAnim, flex: 1 }]}>
            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.stripScrollContent}
              style={styles.stripScrollView}
            >
              {filteredCloths.map((it) => {
                const isSelected = selectedClothId === it.id;
                return (
                  <TouchableOpacity
                    key={it.id}
                    style={styles.stripCardWrapper}
                    onPress={() => handleSelectCloth(it)}
                    activeOpacity={0.9}
                  >
                    <View style={[styles.stripCard, isSelected && styles.stripCardActive]}>
                      <Image
                        source={typeof it.image === 'string' ? { uri: it.image } : it.image}
                        style={styles.stripCardImage}
                        contentFit="cover"
                      />
                      <View style={styles.stripCardOverlay}>
                        <Text style={styles.stripCardName} numberOfLines={2}>{it.name}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {clothsLoading ? (
                <View style={styles.trayLoadingPill}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.trayLoadingText}>Loading…</Text>
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>

          {comboMode && (
            <View style={styles.comboHint}>
              <Text style={styles.comboHintText}>Combo: Try upper first, then lower on result</Text>
            </View>
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderKioskScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  hint: { fontSize: 15, color: '#666', marginBottom: 24 },
  primaryBtn: { backgroundColor: '#6B4EAA', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 16, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#6B4EAA', borderRadius: 12 },
  secondaryBtnText: { color: '#6B4EAA', fontSize: 17, fontWeight: '500' },

  cameraFullScreen: {
    flex: 1,
    backgroundColor: '#121212',
  },

  kioskRoot: {
    flex: 1,
    backgroundColor: '#121212',
  },
  previewStage: {
    flex: 1,
    backgroundColor: '#121212',
    position: 'relative',
  },
  stageImageWrap: {
    flex: 1,
    backgroundColor: '#121212',
  },
  stageResultWrap: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  stageImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  centeredOnStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  stageTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  stageSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  stageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  guideOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 170,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  guideOverlayText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 18,
  },
  stageOverlayText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  stageError: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(183,28,28,0.9)',
    borderRadius: 14,
    padding: 12,
  },
  stageErrorText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addToCartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#6B4EAA',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  addToCartPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  shareBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shareQrWrap: { alignItems: 'center' },
  shareQrLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginBottom: 10, fontWeight: '700' },
  shareQrCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  shareErrorText: { fontSize: 12, color: '#ffcdd2', marginBottom: 8 },
  shareLookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#6B4EAA',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  shareLookBtnDisabled: { opacity: 0.7 },
  shareLookBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  leftDock: {
    position: 'absolute',
    top: 86,
    left: 12,
    width: 110,
    gap: 10,
  },
  dockBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  dockBtnPrimary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dockBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dockBtnTextPrimary: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  dockBtnTextSecondary: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  rightStrip: {
    position: 'absolute',
    top: 72,
    right: 10,
    bottom: 12,
    width: STRIP_WIDTH + 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stripToggleTab: {
    position: 'absolute',
    top: '50%',
    right: 8,
    marginTop: -24,
    width: 32,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripToggleTabWhenOpen: {
    right: STRIP_WIDTH + 26,
  },
  stripChips: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  stripPanel: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    borderRadius: 14,
    overflow: 'hidden',
  },
  stripScrollView: {
    flex: 1,
  },
  stripScrollContent: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 10,
    alignItems: 'center',
    paddingBottom: 24,
  },
  stripCardWrapper: {
    width: STRIP_CARD_SIZE,
    alignItems: 'center',
  },
  stripCard: {
    width: STRIP_CARD_SIZE,
    height: STRIP_CARD_SIZE * 1.05,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
    position: 'relative',
  },
  stripCardActive: {
    borderColor: '#6B4EAA',
    backgroundColor: 'rgba(107,78,170,0.25)',
  },
  stripCardImage: {
    width: '100%',
    height: '100%',
  },
  stripCardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  stripCardName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  comboHint: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(107,78,170,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  comboHintText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 14,
  },
  stripMiniList: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    borderRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  stripChip: {
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  stripChipActive: {
    backgroundColor: 'rgba(107,78,170,0.95)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  stripChipText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 13,
    fontWeight: '900',
  },
  stripChipTextActive: {
    color: '#fff',
  },
  stripScrollWrap: {
    flex: 1,
  },
  stripItem: {
    width: 72,
    alignItems: 'center',
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  backPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  actionDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  bottomTray: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 22,
    padding: 10,
  },
  trayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  trayChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  trayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  trayChipActive: {
    backgroundColor: 'rgba(107,78,170,0.95)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  trayChipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '800',
  },
  trayChipTextActive: {
    color: '#fff',
  },
  trayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trayActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  trayActionBtnPrimary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  trayActionBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  trayActionTextPrimary: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  trayActionTextSecondary: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
  },
  trayScrollWrap: {
    marginTop: 10,
  },
  trayScrollContent: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 12,
    alignItems: 'flex-start',
  },
  circleItem: {
    width: 74,
    alignItems: 'center',
  },
  circleRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  circleRingActive: {
    borderColor: '#6B4EAA',
  },
  circleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  circleLabel: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.90)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  trayLoadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  trayLoadingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  bigBtn: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bigBtnPrimary: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  bigBtnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  bigBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  bigBtnSecondaryText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  bigBtnAccent: {
    backgroundColor: '#6B4EAA',
    borderColor: '#6B4EAA',
  },
  bigBtnAccentText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  bigBtnDisabled: {
    opacity: 0.6,
  },
  rightPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 340,
    backgroundColor: 'rgba(10,10,10,0.78)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.16)',
    paddingTop: 16,
  },
  panelHeader: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  panelTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  categoryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  categoryBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
  },
  categoryBtnText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    fontWeight: '900',
  },
  categoryBtnTextActive: {
    color: '#000',
  },
  panelBody: {
    flex: 1,
  },
  panelScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  productCardActive: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  productImage: {
    width: 74,
    height: 74,
    borderRadius: 14,
    backgroundColor: '#111',
  },
  productMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  productTag: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  panelLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  panelLoadingText: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 13,
    fontWeight: '700',
  },
  lookCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  lookTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  lookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  lookLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '800',
  },
  lookValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    maxWidth: 190,
    textAlign: 'right',
  },

  message: { fontSize: 16, color: '#333', marginBottom: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  detailsBox: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: { fontSize: 14, color: '#b71c1c', lineHeight: 20 },
  errorBox: {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#e57373',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorDismissBtn: { marginTop: 10, alignSelf: 'flex-start' },
  errorDismissText: { fontSize: 14, color: '#6B4EAA', fontWeight: '500' },
});
