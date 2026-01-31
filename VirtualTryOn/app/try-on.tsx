/**
 * Try-on screen. Camera, image-picker, and file-system are lazy-loaded
 * so opening this screen (tap on cloth) does not load native modules → no crash.
 * Camera permission is only requested when user taps "Capture Photo".
 */
import { getClothingById } from '@/constants/clothing';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Image as RNImage,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function TryOnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clothId?: string | string[]; clothName?: string | string[] }>();
  const clothId = normalizeParam(params?.clothId);
  const clothingItem = getClothingById(clothId);

  const [step, setStep] = useState<'choose' | 'camera' | 'upload' | 'preview' | 'result'>('choose');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preprocessingLoading, setPreprocessingLoading] = useState(false);
  const [preprocessingCacheKey, setPreprocessingCacheKey] = useState<string | null>(null);
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

  useEffect(() => {
    console.log('[TRY-ON] Screen mounted, API_BASE_URL=', API_BASE_URL, 'TRY_ON_URL=', TRY_ON_URL);
  }, []);

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

  const handlePhotoTaken = useCallback(
    (uri: string) => {
      setCapturedPhoto(uri);
      setResultImage(null);
      setPreprocessingCacheKey(null);
      setStep('preview');
      preprocessPersonImage(uri, clothingItem?.cloth_type ?? 'upper');
    },
    [clothingItem?.cloth_type]
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
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setCapturedPhoto(result.assets[0].uri);
        setResultImage(null);
        setPreprocessingCacheKey(null);
        setStep('preview');
        preprocessPersonImage(result.assets[0].uri, clothingItem?.cloth_type ?? 'upper');
      }
    } catch (e: unknown) {
      logError('PICK_IMAGE', e);
      const message = e instanceof Error ? e.message : String(e);
      const isImagePickerMissing = /ExponentImagePicker|native module|image.?picker/i.test(message);
      if (isImagePickerMissing) {
        Alert.alert(
          'Photo picker not available',
          'Upload from gallery is not available in this build. Please use "Capture Photo" to take a picture with the camera instead.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', message || 'Failed to open photo picker. Try "Capture Photo" instead.');
      }
    }
  };

  const preprocessPersonImage = async (photoUri: string, clothType: string = 'upper') => {
    setPreprocessingLoading(true);
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
        } else {
          console.warn('[PREPROCESS] OK but no cache_key', Object.keys(data ?? {}));
        }
      } else {
        const text = await res.text();
        console.error('[PREPROCESS] Error', res.status, text?.slice(0, 200));
      }
    } catch (e) {
      logError('PREPROCESS', e, { preprocessUrl, clothType });
    } finally {
      setPreprocessingLoading(false);
    }
  };

  const runTryOn = async () => {
    if (!capturedPhoto || !clothingItem) {
      console.error('[TRY-ON] Abort: missing capturedPhoto or clothingItem', { capturedPhoto: !!capturedPhoto, clothingItem: !!clothingItem });
      return;
    }
    setLoading(true);
    setResultImage(null);
    setTryOnError(null);
    const clothTypeVal = clothingItem?.cloth_type ?? 'upper';
    setRequestLog([`0. API URL: ${TRY_ON_URL}`, '1. Start']);
    setRequestDetails({
      url: TRY_ON_URL,
      sending: 'Preparing...',
      format: 'multipart/form-data (no Content-Type set, boundary auto)',
      reached: null,
    });
    const addLog = (line: string) => setRequestLog((prev) => [...prev, line]);
    console.log('[TRY-ON] Start', { TRY_ON_URL, cache_key: preprocessingCacheKey ?? 'none', cloth_type: clothTypeVal });

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
      const personField = preprocessingCacheKey ? `cache_key: ${preprocessingCacheKey.slice(0, 12)}...` : 'person_image: (file from camera/gallery)';
      if (preprocessingCacheKey) {
        formData.append('cache_key', preprocessingCacheKey);
        console.log('[TRY-ON] Using cache_key', preprocessingCacheKey.slice(0, 16) + '...');
      } else {
        formData.append('person_image', { uri: capturedPhoto, type: 'image/jpeg', name: 'person.jpg' } as any);
        console.log('[TRY-ON] Using person_image uri', capturedPhoto?.slice?.(0, 50) ?? capturedPhoto);
      }
      formData.append('cloth_type', clothTypeVal);

      const imageModule = clothingItem?.image ?? require('@/assets/clothes/colourfull-sweatshirt.jpg');
      let clothUri: string;
      const clothSource = RNImage.resolveAssetSource(imageModule);
      const rawUri = typeof clothSource?.uri === 'string' ? clothSource.uri : typeof clothSource === 'number' ? String(clothSource) : '';
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
      const mime = clothUri.split('.').pop()?.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
      const clothName = `cloth.${clothUri.split('.').pop()?.split('?')[0] || 'jpg'}`;
      formData.append('cloth_image', { uri: clothUri, type: mime, name: clothName } as any);
      const clothUriType = clothUri.startsWith('file://') ? 'file' : clothUri.startsWith('http') ? 'http' : 'other';
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
      setResultImage(`data:image/jpeg;base64,${data.imageBase64}`);
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

  const handleBack = () => {
    if (step === 'camera') setStep('choose');
    else if (step === 'preview') { setCapturedPhoto(null); setStep('choose'); }
    else router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {step === 'choose' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Try on: {clothingItem?.name ?? 'Item'}</Text>
          <View style={styles.clothPreview}>
            <Image source={clothingItem?.image ?? require('@/assets/clothes/colourfull-sweatshirt.jpg')} style={styles.clothPreviewImg} contentFit="contain" />
          </View>
          <Text style={styles.hint}>Capture or upload a photo of yourself to try on this item.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('camera')}>
            <Text style={styles.primaryBtnText}>Capture Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickImage}>
            <Text style={styles.secondaryBtnText}>Upload Photo</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {step === 'camera' && (
        <>
          {cameraLoadError ? (
            <View style={styles.centered}>
              <Text style={styles.message}>{cameraLoadError}</Text>
              <Text style={styles.hint}>Use "Upload Photo" to choose an image from your gallery.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('choose')}>
                <Text style={styles.primaryBtnText}>← Back</Text>
              </TouchableOpacity>
            </View>
          ) : CameraComponent ? (
            <CameraComponent onPhotoTaken={handlePhotoTaken} onBack={handleCameraBack} />
          ) : (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={styles.message}>Loading camera...</Text>
            </View>
          )}
        </>
      )}

      {step === 'preview' && capturedPhoto && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* When error: show log first so it's visible without scrolling (APK has no console) */}
          {tryOnError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Error details</Text>
              <Text style={styles.errorText} selectable>
                {tryOnError}
              </Text>
              <TouchableOpacity style={styles.errorDismissBtn} onPress={() => { setTryOnError(null); setRequestDetails(null); setRequestLog([]); }}>
                <Text style={styles.errorDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {(requestDetails || requestLog.length > 0) ? (
            <View style={styles.detailsBox}>
              <Text style={styles.detailsTitle}>Request details (on-screen log for APK)</Text>
              {requestLog.length > 0 ? (
                <>
                  <Text style={styles.detailsLabel}>Step log:</Text>
                  <Text style={styles.detailsText} selectable>
                    {requestLog.join('\n')}
                  </Text>
                </>
              ) : null}
              {requestDetails ? (
                <>
                  <Text style={styles.detailsLabel}>URL:</Text>
                  <Text style={styles.detailsText} selectable>{requestDetails.url}</Text>
                  <Text style={styles.detailsLabel}>Sending:</Text>
                  <Text style={styles.detailsText} selectable>{requestDetails.sending}</Text>
                  <Text style={styles.detailsLabel}>Format:</Text>
                  <Text style={styles.detailsText} selectable>{requestDetails.format}</Text>
                  <Text style={styles.detailsLabel}>Reached server:</Text>
                  <Text style={styles.detailsText}>
                    {requestDetails.reached === null ? '—' : requestDetails.reached ? 'Yes' : 'No'}
                    {requestDetails.responseStatus != null ? ` (status ${requestDetails.responseStatus})` : ''}
                  </Text>
                  {requestDetails.error ? (
                    <>
                      <Text style={styles.detailsLabel}>Problem:</Text>
                      <Text style={[styles.detailsText, styles.detailsError]} selectable>{requestDetails.error}</Text>
                    </>
                  ) : null}
                </>
              ) : null}
              {(requestLog.length > 0 || requestDetails) && (
                <TouchableOpacity
                  style={styles.shareLogBtn}
                  onPress={() => {
                    const parts = [
                      '--- Try-on debug log (APK) ---',
                      ...requestLog,
                      '',
                      requestDetails ? [
                        `URL: ${requestDetails.url}`,
                        `Sending: ${requestDetails.sending}`,
                        `Reached: ${requestDetails.reached ?? '—'}${requestDetails.responseStatus != null ? ` (${requestDetails.responseStatus})` : ''}`,
                        requestDetails.error ? `Error: ${requestDetails.error}` : '',
                      ].filter(Boolean).join('\n') : '',
                      tryOnError ? `\nError details:\n${tryOnError}` : '',
                    ].filter(Boolean);
                    Share.share({ message: parts.join('\n'), title: 'Try-on debug log' });
                  }}
                >
                  <Text style={styles.shareLogText}>Share log</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          <View style={styles.previewWrap}>
            <Image source={{ uri: capturedPhoto }} style={styles.previewImg} contentFit="contain" />
            {(loading || preprocessingLoading) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingMsg}>{LOADING_MESSAGES[loadingMessageIndex]}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (loading || preprocessingLoading) && styles.primaryBtnDisabled]}
            onPress={runTryOn}
            disabled={loading || preprocessingLoading}
          >
            <Text style={styles.primaryBtnText}>Try On</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setCapturedPhoto(null); setPreprocessingCacheKey(null); setStep('choose'); setTryOnError(null); setRequestDetails(null); setRequestLog([]); }} disabled={loading || preprocessingLoading}>
            <Text style={styles.secondaryBtnText}>Choose different photo</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {step === 'result' && resultImage && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Image source={{ uri: resultImage }} style={styles.resultImg} contentFit="contain" />
          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { setResultImage(null); setStep('preview'); }}>
              <Text style={styles.primaryBtnText}>Try Another</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  backBtn: { padding: 16, paddingTop: 8 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '500' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#000', marginBottom: 16 },
  clothPreview: { width: '100%', height: 200, backgroundColor: '#f5f5f5', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  clothPreviewImg: { width: '100%', height: '100%' },
  hint: { fontSize: 15, color: '#666', marginBottom: 24 },
  primaryBtn: { backgroundColor: '#000', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  secondaryBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '500' },
  previewWrap: { width: '100%', aspectRatio: 3/4, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  previewImg: { width: '100%', height: '100%' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  loadingMsg: { color: '#fff', marginTop: 12, fontSize: 16 },
  resultImg: { width: '100%', aspectRatio: 3/4, backgroundColor: '#000', borderRadius: 12, marginBottom: 20 },
  resultActions: { gap: 12 },
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
  detailsTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  detailsLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginTop: 6, marginBottom: 2 },
  shareLogBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#e0e0e0', borderRadius: 8, alignSelf: 'flex-start' },
  shareLogText: { fontSize: 14, color: '#333', fontWeight: '500' },
  detailsText: { fontSize: 12, color: '#333', lineHeight: 18 },
  detailsError: { color: '#c62828', marginBottom: 4 },
  errorBox: {
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#e57373',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: { fontSize: 14, fontWeight: '600', color: '#c62828', marginBottom: 8 },
  errorText: { fontSize: 13, color: '#b71c1c', lineHeight: 20 },
  errorDismissBtn: { marginTop: 10, alignSelf: 'flex-start' },
  errorDismissText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
});
