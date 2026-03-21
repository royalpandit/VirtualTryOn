/**
 * Try-On screen — integrated camera UI with product strip, try-on API, combo mode,
 * add to cart, and share functionality. Uses the redesigned CameraStep component
 * as the capture interface and overlays a product sidebar + result viewer.
 */
import { CLOTHING_ITEMS } from '@/constants/clothing';
import { FontFamily } from '@/constants/theme';
import { useKioskCart } from '@/context/KioskCartContext';
import { getSession } from '@/lib/auth';
import {
    kioskGetCartByToken,
    kioskTryonShare,
    kioskTryonStart,
    kioskUploadImage,
} from '@/lib/kioskApi';
import { getOuiAssetUrl, getSellerProducts, type OuiSellerProduct } from '@/lib/ouiApi';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    Image as RNImage,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ─── API helpers ─── */
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
const API_HEADERS: Record<string, string> = {
  'User-Agent': 'VirtualTryOn/1.0 (Android)',
  Accept: 'application/json',
};

function logError(tag: string, e: unknown, context?: Record<string, unknown>) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(`[${tag}]`, err.name, err.message, context ?? '');
}

function toUserSafeTryOnError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('cannot identify image file') || msg.includes('invalid response: no image'))
    return 'Could not process this clothing image. Try another item.';
  if (msg.includes('network request failed') || msg.includes('failed to fetch'))
    return 'Connection issue. Check internet and try again.';
  if (msg.includes('timeout') || msg.includes('aborterror'))
    return 'Try-on is taking too long. Please try again.';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('internal server error'))
    return 'Service temporarily unavailable. Try again shortly.';
  return 'Could not generate try-on. Please try again.';
}

function getResultCacheKey(args: { basePersonUri?: string | null; clothId: string; clothType: string }): string {
  return `uri:${args.basePersonUri ?? 'none'}__cloth:${args.clothId}__type:${args.clothType}`;
}

const LOADING_MESSAGES = ['Uploading photo...', 'Preparing your image...', 'Analyzing pose...', 'Creating your look...'];

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

/* ═══════════ MAIN COMPONENT ═══════════ */
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
  const clothTypeFromParams =
    clothTypeParam === 'upper' || clothTypeParam === 'lower' || clothTypeParam === 'overall' ? clothTypeParam : null;
  const effectiveClothType = clothTypeFromParams ?? (clothingItem?.cloth_type ?? 'upper');
  const effectiveClothImage = clothImageUrl && clothImageUrl !== '1' ? clothImageUrl : clothingItem?.image;

  /* ─── cloth state ─── */
  const [selectedClothId, setSelectedClothId] = useState<string>(clothId);
  const [availableCloths, setAvailableCloths] = useState<UiClothItem[] | null>(null);
  const [clothsLoading, setClothsLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const selectedClothRef = useRef<{ id: string; cloth_type: ClothType; image: number | string; name: string } | null>(null);
  const lastTryClothTypeRef = useRef<ClothType | null>(null);
  const pendingApplyRef = useRef<{ clothType: ClothType; cloth: UiClothItem | null } | null>(null);

  /* ─── strip state ─── */
  const [comboMode, setComboMode] = useState<boolean>(false);

  /* ─── camera/result state ─── */
  const [step, setStep] = useState<'camera' | 'preview' | 'result'>('camera');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preprocessingLoading, setPreprocessingLoading] = useState(false);
  const [preprocessingCacheKey, setPreprocessingCacheKey] = useState<string | null>(null);
  const [preprocessingClothType, setPreprocessingClothType] = useState<ClothType | null>(null);
  const [basePersonUri, setBasePersonUri] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [resultCache, setResultCache] = useState<Record<string, string>>({});
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [CameraComponent, setCameraComponent] = useState<React.ComponentType<any> | null>(null);
  const [cameraLoadError, setCameraLoadError] = useState<string | null>(null);
  const { addToCart, refreshCart, ensureCart } = useKioskCart();

  const [autoTryRequestedUri, setAutoTryRequestedUri] = useState<string | null>(null);
  const [autoTryPending, setAutoTryPending] = useState(false);

  /* ─── Load products ─── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setClothsLoading(true);
      try {
        const session = await getSession();
        const sellerId = session?.user?.id ?? null;
        if (!sellerId) { if (mounted) setAvailableCloths(null); return; }
        const res = await getSellerProducts({ sellerId, page: 1, perPage: 60, accessToken: session?.accessToken ?? '' });
        if (!mounted) return;
        const products = Array.isArray(res?.products) ? res.products : [];
        const mapped: UiClothItem[] = products
          .filter((p) => Boolean(p) && typeof (p as any).id !== 'undefined')
          .map((p) => {
            const id = String((p as any).id);
            const name = typeof p.name === 'string' && p.name.length > 0 ? p.name : 'Item';
            const imgPath = (p as any).thumb_image ?? (p as any).image;
            const image = typeof imgPath === 'string' ? (imgPath.startsWith('http') ? imgPath : (getOuiAssetUrl(imgPath) ?? '')) : '';
            return { id, name, cloth_type: inferClothTypeFromProduct(p), image: image || 'https://via.placeholder.com/512x512.png?text=Cloth', categoryId: p.category?.id as number | undefined, categoryName: p.category?.name };
          });
        setAvailableCloths(mapped.length > 0 ? mapped : null);
      } catch { if (mounted) setAvailableCloths(null); }
      finally { if (mounted) setClothsLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const localFallbackCloths: UiClothItem[] = useMemo(
    () => CLOTHING_ITEMS.map((i) => ({ id: i.id, name: i.name, cloth_type: i.cloth_type, image: i.image, categoryName: 'All' })),
    [],
  );
  const baseCloths = availableCloths && availableCloths.length > 0 ? availableCloths : localFallbackCloths;
  const incomingClothFromParams: UiClothItem | null = useMemo(() => {
    if (!clothId || clothId === '1' || !effectiveClothImage) return null;
    if (baseCloths.some((c) => c.id === clothId)) return null;
    return { id: clothId, name: clothNameParam && clothNameParam !== '1' ? clothNameParam : 'Item', cloth_type: effectiveClothType as ClothType, image: effectiveClothImage, categoryName: 'Selected' };
  }, [clothId, clothNameParam, effectiveClothImage, effectiveClothType, baseCloths]);
  const allCloths = useMemo(() => (incomingClothFromParams ? [incomingClothFromParams, ...baseCloths] : baseCloths), [incomingClothFromParams, baseCloths]);

  const stripCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    allCloths.forEach((c) => { if (c.categoryId != null) { const id = String(c.categoryId); if (!map.has(id)) map.set(id, { id, name: c.categoryName || `Cat ${id}` }); } });
    return [{ id: 'all', name: 'All' }, ...Array.from(map.values())];
  }, [allCloths]);
  const filteredCloths = useMemo(() => {
    if (selectedCategoryId === 'all') return allCloths;
    return allCloths.filter((c) => String(c.categoryId ?? '') === selectedCategoryId);
  }, [allCloths, selectedCategoryId]);
  const selectedCloth = allCloths.find((i) => i.id === selectedClothId) ?? null;
  const selectedClothType = selectedCloth?.cloth_type ?? effectiveClothType;
  const selectedClothImage = selectedCloth?.image ?? effectiveClothImage;
  useEffect(() => { if (selectedCloth?.categoryId) setSelectedCategoryId(String(selectedCloth.categoryId)); }, [selectedCloth?.id]);
  const displayClothName = clothNameParam && clothNameParam !== '1' ? clothNameParam : (selectedCloth?.name ?? clothingItem?.name ?? 'Item');

  /* ─── keep ref in sync ─── */
  useEffect(() => {
    if (!selectedCloth) return;
    selectedClothRef.current = { id: selectedCloth.id, cloth_type: selectedCloth.cloth_type, image: selectedCloth.image, name: selectedCloth.name };
  }, [selectedCloth?.id]);

  /* ─── loading message animation ─── */
  useEffect(() => {
    if (!(loading || preprocessingLoading)) return;
    const id = setInterval(() => setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length), 2200);
    return () => clearInterval(id);
  }, [loading, preprocessingLoading]);

  /* ─── lazy load camera ─── */
  useEffect(() => {
    if (CameraComponent) return;
    setCameraLoadError(null);
    import('./try-on-camera')
      .then((m) => setCameraComponent(() => m.CameraStep))
      .catch((e: unknown) => setCameraLoadError(e instanceof Error ? e.message : String(e ?? 'Camera not available')));
  }, [CameraComponent]);

  /* ─── route params sync ─── */
  useEffect(() => {
    if (!clothId || clothId === '1') return;
    setSelectedClothId(clothId);
    setAutoTryPending(false);
    setAutoTryRequestedUri(null);
    if (effectiveClothImage)
      selectedClothRef.current = { id: clothId, cloth_type: effectiveClothType as ClothType, image: effectiveClothImage, name: clothNameParam && clothNameParam !== '1' ? clothNameParam : 'Item' };
  }, [clothId, clothNameParam, effectiveClothType, effectiveClothImage]);

  /* ─── result apply tracking for combo ─── */
  useEffect(() => {
    if (!resultImage) return;
    const pending = pendingApplyRef.current;
    if (!pending) return;
    pendingApplyRef.current = null;
  }, [resultImage]);

  /* ─── preprocess person image ─── */
  const preprocessPersonImage = async (photoUri: string, clothType: string = 'upper'): Promise<string | null> => {
    setPreprocessingLoading(true);
    setPreprocessingClothType((clothType === 'upper' || clothType === 'lower' || clothType === 'overall') ? clothType : null);
    const preprocessUrl = `${API_BASE_URL}/api/preprocess-person`;
    try {
      const formData = new FormData();
      formData.append('person_image', { uri: photoUri, type: 'image/jpeg', name: 'person.jpg' } as any);
      formData.append('cloth_type', clothType);
      const res = await fetch(preprocessUrl, { method: 'POST', headers: API_HEADERS, body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.cache_key) { setPreprocessingCacheKey(data.cache_key); return data.cache_key as string; }
      }
    } catch (e) { logError('PREPROCESS', e); }
    finally { setPreprocessingLoading(false); }
    return null;
  };

  /* ─── run try-on ─── */
  const runTryOn = async () => {
    const refCloth = selectedClothRef.current;
    const clothIdForRequest = refCloth?.id ?? selectedClothId;
    const clothTypeVal = refCloth?.cloth_type ?? selectedClothType;
    const clothImageForRequest = refCloth?.image ?? selectedClothImage;
    if (!(basePersonUri || capturedPhoto) || !clothImageForRequest) return;
    const baseUriForCache = basePersonUri ?? capturedPhoto;
    lastTryClothTypeRef.current = clothTypeVal;

    const cacheKeyForResult = getResultCacheKey({ basePersonUri: baseUriForCache, clothId: clothIdForRequest, clothType: clothTypeVal });
    const cachedImage = resultCache[cacheKeyForResult];
    if (cachedImage) { setResultImage(cachedImage); setStep('result'); return; }

    setLoading(true);
    setLoadingMessageIndex(0);
    setTryOnError(null);

    let activeCacheKey: string | null = preprocessingCacheKey;
    if (activeCacheKey && preprocessingClothType && preprocessingClothType !== clothTypeVal) {
      const personUri = basePersonUri ?? capturedPhoto;
      setPreprocessingCacheKey(null);
      setPreprocessingClothType(null);
      if (personUri) activeCacheKey = await preprocessPersonImage(personUri, clothTypeVal);
    }

    try {
      const formData = new FormData();
      if (activeCacheKey) {
        formData.append('cache_key', activeCacheKey);
      } else {
        const personUri = basePersonUri ?? capturedPhoto;
        formData.append('person_image', { uri: personUri, type: 'image/jpeg', name: 'person.jpg' } as any);
      }
      formData.append('cloth_type', clothTypeVal);

      const imageModule = clothImageForRequest ?? require('@/assets/clothes/colourfull-sweatshirt.jpg');
      let clothUri: string;
      const rawUriFromUrl = typeof imageModule === 'string' && imageModule.startsWith('http') ? imageModule : '';
      const clothSource = rawUriFromUrl ? null : RNImage.resolveAssetSource(imageModule as number);
      const rawUri = rawUriFromUrl || (typeof clothSource?.uri === 'string' ? clothSource.uri : typeof clothSource === 'number' ? String(clothSource) : '');

      if (rawUri.startsWith('http')) {
        const FileSystem = await import('expo-file-system/legacy');
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
        const ext = rawUri.includes('.png') ? 'png' : 'jpg';
        const fileUri = `${cacheDir}cloth-${Date.now()}.${ext}`;
        await FileSystem.downloadAsync(rawUri, fileUri);
        clothUri = fileUri;
      } else {
        const asset = Asset.fromModule(imageModule);
        await asset.downloadAsync();
        clothUri = asset.localUri ?? asset.uri ?? '';
        if (!clothUri) throw new Error('Asset has no localUri or uri');
      }

      if (!clothUri || clothUri.length < 2) throw new Error('Cloth image URI is missing. Try another item.');

      // Resize
      const MAX_DIM = 1024;
      let uploadClothUri = clothUri;
      let mime = clothUri.split('.').pop()?.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
      const tryResize = async (uri: string) => {
        const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
        return manipulateAsync(uri, [{ resize: { width: MAX_DIM } }], { compress: 0.85, format: SaveFormat.JPEG });
      };
      try {
        let resized = await tryResize(clothUri).catch(() => null);
        if (!resized) {
          const FileSystem = await import('expo-file-system/legacy');
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
          const copyPath = `${cacheDir}cloth_resize_${Date.now()}.jpg`;
          await FileSystem.copyAsync({ from: clothUri, to: copyPath });
          resized = await tryResize(copyPath).catch(() => null);
        }
        if (resized) { uploadClothUri = resized.uri; mime = 'image/jpeg'; }
      } catch {}

      const FileSystem = await import('expo-file-system/legacy');
      let safeUri = uploadClothUri.split('?')[0].split('#')[0];
      if (safeUri.startsWith('content://')) {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
        const copiedPath = `${cacheDir}cloth_upload_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: safeUri, to: copiedPath });
        safeUri = copiedPath;
        mime = 'image/jpeg';
      }
      if (safeUri.startsWith('file:/') && !safeUri.startsWith('file://')) safeUri = safeUri.replace(/^file:\/*/, 'file://');
      const fileInfo = await FileSystem.getInfoAsync(safeUri);
      if (!(fileInfo as any)?.exists || ((fileInfo as any)?.size ?? 0) < 32)
        throw new Error(`Cloth image invalid for upload`);
      formData.append('cloth_image', { uri: safeUri, type: mime || 'image/jpeg', name: 'cloth.jpg' } as any);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TRY_ON_TIMEOUT_MS);
      const response = await fetch(TRY_ON_URL, { method: 'POST', headers: API_HEADERS, body: formData, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text();
        let err: { detail?: string } = { detail: response.statusText };
        try { err = JSON.parse(errBody); } catch { err = { detail: errBody?.slice(0, 100) || response.statusText }; }
        throw new Error(err.detail || `Request failed ${response.status}`);
      }
      const data = await response.json();
      if (!data?.imageBase64) throw new Error('Invalid response: no image');
      setTryOnError(null);
      const resultMime = data.imageMimeType || 'image/jpeg';
      const imageUri = `data:${resultMime};base64,${data.imageBase64}`;
      setResultImage(imageUri);
      setResultCache((prev) => ({ ...prev, [cacheKeyForResult]: imageUri }));
      setShareUrl(null);
      setShareError(null);
      setStep('result');
    } catch (e: any) {
      logError('TRY-ON', e);
      const userMsg = toUserSafeTryOnError(e);
      setTryOnError(userMsg);
      Alert.alert('Try-on failed', userMsg);
    } finally {
      setLoading(false);
    }
  };

  /* ─── auto try-on ─── */
  useEffect(() => {
    if (!autoTryPending || !autoTryRequestedUri) return;
    if (!clothId || clothId === '1' || !effectiveClothImage) return;
    if (loading || preprocessingLoading) return;
    const currentPhotoUri = basePersonUri ?? capturedPhoto;
    if (!currentPhotoUri || currentPhotoUri !== autoTryRequestedUri) return;
    setAutoTryPending(false);
    setAutoTryRequestedUri(null);
    const refCloth = selectedClothRef.current;
    if (refCloth) pendingApplyRef.current = { clothType: refCloth.cloth_type, cloth: { id: refCloth.id, name: refCloth.name, cloth_type: refCloth.cloth_type, image: refCloth.image } };
    runTryOn();
  }, [autoTryPending, autoTryRequestedUri, capturedPhoto, basePersonUri, loading, preprocessingLoading, clothId, effectiveClothImage, selectedClothType]);

  /* ─── handlers ─── */
  const handlePhotoTaken = useCallback((uri: string) => {
    setCapturedPhoto(uri);
    setBasePersonUri(uri);
    setResultImage(null);
    setPreprocessingCacheKey(null);
    setPreprocessingClothType(null);
    setResultCache({});
    setStep('preview');
    preprocessPersonImage(uri, selectedClothType);
    if (clothId && clothId !== '1' && effectiveClothImage) { setAutoTryRequestedUri(uri); setAutoTryPending(true); }
  }, [selectedClothType, clothId, effectiveClothImage]);

  const pickImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to your photos to upload.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        setCapturedPhoto(uri);
        setBasePersonUri(uri);
        setResultImage(null);
        setPreprocessingCacheKey(null);
        setPreprocessingClothType(null);
        setResultCache({});
        setStep('preview');
        preprocessPersonImage(uri, selectedClothType);
        if (clothId && clothId !== '1' && effectiveClothImage) { setAutoTryRequestedUri(uri); setAutoTryPending(true); }
      }
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : String(e)); }
  };

  const promoteResultToBase = async () => {
    if (!resultImage) return;
    try {
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
      setResultCache({});
      preprocessPersonImage(fileUri, 'lower');
      setStep('preview');
    } catch (e) { logError('PROMOTE_RESULT', e); Alert.alert('Error', 'Could not prepare the combo try-on base image.'); }
  };

  const handleSelectCloth = async (it: UiClothItem) => {
    if (loading || preprocessingLoading) return;
    const hasPerson = Boolean(basePersonUri || capturedPhoto);
    const lastTryType = lastTryClothTypeRef.current;
    const shouldAutoLayer = Boolean(resultImage) && Boolean(lastTryType) && it.cloth_type !== lastTryType;
    if (shouldAutoLayer) await promoteResultToBase();
    setSelectedClothId(it.id);
    selectedClothRef.current = { id: it.id, cloth_type: it.cloth_type, image: it.image, name: it.name };
    setTryOnError(null);
    if (hasPerson || resultImage) {
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
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Could not add to cart.'); }
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
      if (!token) { setShareError('Cart not ready.'); return; }
      const cartRes = await kioskGetCartByToken(token);
      const currentCartId = cartRes?.cart?.id;
      if (currentCartId == null) { setShareError('Cart not ready.'); return; }
      const FileSystem = await import('expo-file-system/legacy');
      const base64 = resultImage.includes(',') ? resultImage.split(',')[1] : resultImage;
      const mime2 = resultImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const ext = mime2 === 'image/png' ? 'png' : 'jpg';
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const fileUri = `${cacheDir}kiosk_tryon_${Date.now()}.${ext}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const uploadRes = await kioskUploadImage('tryon_images', fileUri, mime2);
      const path = uploadRes?.data?.path ?? uploadRes?.data?.full_url;
      if (!path) throw new Error('Upload did not return path');
      const startRes = await kioskTryonStart(currentCartId, Number(selectedClothId), path);
      const sessionId = startRes?.data?.id;
      if (sessionId == null) throw new Error('Try-on start did not return session id');
      const shareRes = await kioskTryonShare(sessionId);
      const url = shareRes?.share_url;
      if (url) { setShareUrl(url); Alert.alert('Ready', 'QR generated. Scan to view.'); }
      else setShareError('No share link returned.');
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); setShareError(msg); Alert.alert('Share failed', msg); }
    finally { setSharing(false); }
  };

  const handleBack = () => {
    if (step === 'preview' || step === 'result') {
      setCapturedPhoto(null);
      setBasePersonUri(null);
      setResultImage(null);
      setStep('camera');
    } else {
      router.back();
    }
  };

  const resetToCamera = () => {
    setCapturedPhoto(null);
    setBasePersonUri(null);
    setResultImage(null);
    setPreprocessingCacheKey(null);
    setPreprocessingClothType(null);
    setTryOnError(null);
    setResultCache({});
    setStep('camera');
  };

  const canTryOn = Boolean((basePersonUri || capturedPhoto) && selectedClothImage);
  const showPreviewUri = resultImage || basePersonUri || capturedPhoto;

  /* ═══════════ RENDER ═══════════ */

  /* CAMERA STEP */
  if (step === 'camera') {
    return (
      <SafeAreaView style={s.container} edges={[]}>
        <StatusBar style="light" />
        <View style={s.fullCamera}>
          {cameraLoadError ? (
            <View style={s.center}>
              <Ionicons name="camera-outline" size={48} color="#D5DBFF" />
              <Text style={s.centerTitle}>Camera unavailable</Text>
              <Text style={s.centerSub}>{cameraLoadError}</Text>
              <TouchableOpacity style={s.backBtnInCenter} onPress={() => router.back()} activeOpacity={0.85}>
                <Text style={s.backBtnInCenterText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : CameraComponent ? (
            <CameraComponent
              onPhotoTaken={handlePhotoTaken}
              onBack={() => router.back()}
              onPickImage={pickImage}
              clothItems={filteredCloths.slice(0, 5).map((c) => ({ id: c.id, image: typeof c.image === 'string' ? c.image : '', name: c.name }))}
              selectedClothId={selectedClothId}
              onSelectCloth={(id: string) => {
                const found = allCloths.find((c) => c.id === id);
                if (found) { setSelectedClothId(id); selectedClothRef.current = { id: found.id, cloth_type: found.cloth_type, image: found.image, name: found.name }; }
              }}
            />
          ) : (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#D5DBFF" />
              <Text style={s.centerSub}>Loading camera…</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  /* PREVIEW / RESULT STEP */
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar style="light" />
      {/* Preview / result area */}
      <View style={s.previewStage}>
        {showPreviewUri ? (
          <View style={resultImage ? s.stageResultWrap : s.stageImageWrap}>
            <Image source={{ uri: showPreviewUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          </View>
        ) : (
          <View style={s.center}>
            <Ionicons name="camera-outline" size={48} color="#D5DBFF" />
            <Text style={s.centerTitle}>No photo yet</Text>
            <Text style={s.centerSub}>Go back to camera to capture a photo.</Text>
          </View>
        )}

        {/* Loading overlay */}
        {(loading || preprocessingLoading) && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={s.loadingText}>{LOADING_MESSAGES[loadingMessageIndex]}</Text>
          </View>
        )}

        {/* Error banner */}
        {tryOnError && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{tryOnError}</Text>
          </View>
        )}

        {/* Top bar */}
        <View style={[s.topBar, { top: Math.max(12, insets.top + 6) }]}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.85} style={s.topPill}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Share bar (when result is available) */}
        {resultImage && canShareLook && !shareUrl && (
          <View style={s.shareFloating}>
            {shareError ? <Text style={s.shareErrorText}>{shareError}</Text> : null}
            <TouchableOpacity onPress={handleShareLook} disabled={sharing} style={[s.shareLookBtn, sharing && { opacity: 0.7 }]} activeOpacity={0.85}>
              {sharing ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={s.shareLookBtnText}>Share</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {resultImage && shareUrl && (
          <View style={s.shareQrFloating}>
            <Text style={s.shareQrLabel}>Scan to view this look</Text>
            <View style={s.shareQrCard}>
              <QRCode value={shareUrl} size={160} />
            </View>
          </View>
        )}
      </View>

      {/* ─── Bottom Panel: categories + horizontal product strip + actions ─── */}
      <View style={s.bottomPanel}>
        {/* Category pills row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catPillsRow}>
          {stripCategories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[s.catPill, selectedCategoryId === cat.id && s.catPillActive]}
              onPress={() => setSelectedCategoryId(cat.id)}
              activeOpacity={0.85}
            >
              <Text style={[s.catPillText, selectedCategoryId === cat.id && s.catPillTextActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[s.catPill, comboMode && s.catPillActive]}
            onPress={() => setComboMode((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={[s.catPillText, comboMode && s.catPillTextActive]}>Combo</Text>
          </TouchableOpacity>
        </ScrollView>

        {comboMode && (
          <View style={s.comboHint}>
            <Text style={s.comboHintText}>Combo: Try upper first, then select a lower</Text>
          </View>
        )}

        {/* Horizontal product strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.horizStripRow}
        >
          {filteredCloths.map((it) => {
            const isSelected = selectedClothId === it.id;
            return (
              <TouchableOpacity key={it.id} onPress={() => handleSelectCloth(it)} activeOpacity={0.85} style={s.horizCardTouch}>
                <View style={[s.horizCard, isSelected && s.horizCardActive]}>
                  <Image source={typeof it.image === 'string' ? { uri: it.image } : it.image} style={s.horizCardImg} contentFit="cover" />
                  {isSelected && (
                    <View style={s.horizCardCheck}>
                      <Ionicons name="checkmark-circle" size={16} color="#575E7C" />
                    </View>
                  )}
                </View>
                <Text style={[s.horizCardName, isSelected && s.horizCardNameActive]} numberOfLines={1}>{it.name}</Text>
              </TouchableOpacity>
            );
          })}
          {clothsLoading && (
            <View style={s.horizLoadingPill}>
              <ActivityIndicator size="small" color="#575E7C" />
            </View>
          )}
        </ScrollView>

        {/* Action buttons row */}
        <View style={s.actionRow}>
          <TouchableOpacity onPress={resetToCamera} style={s.actionBtn} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={20} color="#2D3335" />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={s.actionBtn} activeOpacity={0.85}>
            <Ionicons name="images-outline" size={20} color="#2D3335" />
          </TouchableOpacity>
          {canTryOn && (
            <TouchableOpacity onPress={handleTryLook} style={s.tryOnBtn} activeOpacity={0.85} disabled={loading || preprocessingLoading}>
              <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.tryOnBtnGrad}>
                {loading || preprocessingLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text style={s.tryOnBtnText}>Try On</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
          {canAddToCart && (
            <TouchableOpacity onPress={handleAddToCart} style={s.addCartBtn} activeOpacity={0.85}>
              <Ionicons name="cart-outline" size={20} color="#2D3335" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ═══════════ STYLES ═══════════ */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  fullCamera: { flex: 1, backgroundColor: '#0C0F10' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  centerTitle: { color: '#fff', fontSize: 22, fontFamily: FontFamily.headingExtra, textAlign: 'center', marginTop: 16 },
  centerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: FontFamily.body, textAlign: 'center', marginTop: 8 },
  backBtnInCenter: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
  backBtnInCenterText: { color: '#fff', fontSize: 15, fontFamily: FontFamily.headingSemiBold },

  /* Gallery FAB on camera */
  galleryFab: { position: 'absolute', left: 24, bottom: 42 },
  galleryFabInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(87,94,124,0.8)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },

  /* preview/result */
  previewStage: { flex: 1, backgroundColor: '#121212', position: 'relative' },
  stageImageWrap: { flex: 1, backgroundColor: '#121212' },
  stageResultWrap: { flex: 1, backgroundColor: '#fff' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 16, fontFamily: FontFamily.headingSemiBold, textAlign: 'center' },
  errorBanner: { position: 'absolute', top: 74, left: 16, right: 16, backgroundColor: 'rgba(183,28,28,0.9)', borderRadius: 14, padding: 12 },
  errorText: { color: '#fff', fontSize: 13, lineHeight: 18 },

  /* top bar */
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topPill: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },

  /* share floating buttons */
  shareFloating: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center' },
  shareErrorText: { fontSize: 12, color: '#ffcdd2', marginBottom: 8 },
  shareLookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: '#575E7C' },
  shareLookBtnText: { color: '#fff', fontSize: 15, fontFamily: FontFamily.heading },
  shareQrFloating: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center' },
  shareQrLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginBottom: 10, fontFamily: FontFamily.heading },
  shareQrCard: { backgroundColor: '#fff', borderRadius: 14, padding: 10 },

  /* bottom panel (categories + product strip + actions) */
  bottomPanel: { backgroundColor: '#F1F4F5', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 16 },
  catPillsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#E5E9EB' },
  catPillActive: { backgroundColor: '#575E7C' },
  catPillText: { color: '#2D3335', fontSize: 13, fontFamily: FontFamily.headingSemiBold },
  catPillTextActive: { color: '#fff' },
  comboHint: { marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#D5DBFF' },
  comboHintText: { color: '#575E7C', fontSize: 11, fontFamily: FontFamily.heading, textAlign: 'center', lineHeight: 15 },

  /* horizontal product strip */
  horizStripRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  horizCardTouch: { alignItems: 'center', width: 80 },
  horizCard: { width: 72, height: 80, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 2, borderColor: '#E5E9EB', position: 'relative' },
  horizCardActive: { borderColor: '#575E7C', backgroundColor: '#D5DBFF' },
  horizCardImg: { width: '100%', height: '100%', borderRadius: 12 },
  horizCardCheck: { position: 'absolute', top: 4, right: 4, backgroundColor: '#fff', borderRadius: 999, padding: 1 },
  horizCardName: { marginTop: 4, fontSize: 10, fontFamily: FontFamily.headingSemiBold, color: '#2D3335', textAlign: 'center' },
  horizCardNameActive: { color: '#575E7C' },
  horizLoadingPill: { width: 72, height: 80, borderRadius: 14, backgroundColor: '#E5E9EB', alignItems: 'center', justifyContent: 'center' },

  /* action row */
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  actionBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#E5E9EB', alignItems: 'center', justifyContent: 'center' },
  addCartBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#E5E9EB', alignItems: 'center', justifyContent: 'center' },
  tryOnBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  tryOnBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  tryOnBtnText: { color: '#fff', fontSize: 16, fontFamily: FontFamily.heading },
});
