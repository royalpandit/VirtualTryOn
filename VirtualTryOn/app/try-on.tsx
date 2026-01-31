/**
 * Try-on screen. Camera, image-picker, and file-system are lazy-loaded
 * so opening this screen (tap on cloth) does not load native modules → no crash.
 * Camera permission is only requested when user taps "Capture Photo".
 */
import { getClothingById } from '@/constants/clothing';
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
    try {
      const formData = new FormData();
      formData.append('person_image', { uri: photoUri, type: 'image/jpeg', name: 'person.jpg' } as any);
      formData.append('cloth_type', clothType);
      // Do not set Content-Type: let runtime set multipart/form-data with boundary (required for APK)
      const res = await fetch(`${API_BASE_URL}/api/preprocess-person`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.cache_key) setPreprocessingCacheKey(data.cache_key);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPreprocessingLoading(false);
    }
  };

  const runTryOn = async () => {
    if (!capturedPhoto || !clothingItem) return;
    setLoading(true);
    setResultImage(null);
    try {
      const formData = new FormData();
      if (preprocessingCacheKey) {
        formData.append('cache_key', preprocessingCacheKey);
      } else {
        formData.append('person_image', { uri: capturedPhoto, type: 'image/jpeg', name: 'person.jpg' } as any);
      }
      const clothSource = RNImage.resolveAssetSource(clothingItem?.image ?? require('@/assets/clothes/colourfull-sweatshirt.jpg'));
      let clothUri = clothSource?.uri ?? '';
      if (clothUri.startsWith('http')) {
        try {
          const FileSystem = await import('expo-file-system/legacy');
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
          const ext = clothUri.includes('.png') ? 'png' : 'jpg';
          const fileUri = `${cacheDir}cloth-${Date.now()}.${ext}`;
          await FileSystem.downloadAsync(clothUri, fileUri);
          clothUri = fileUri;
        } catch (fsErr: unknown) {
          const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          throw new Error(`Could not download cloth image: ${msg}`);
        }
      }
      const mime = clothUri.split('.').pop()?.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('cloth_image', { uri: clothUri, type: mime, name: `cloth.${clothUri.split('.').pop()?.split('?')[0] || 'jpg'}` } as any);
      formData.append('cloth_type', clothingItem?.cloth_type ?? 'upper');

      // Do not set Content-Type: let runtime set multipart/form-data with boundary (required for APK)
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || 'Request failed');
      }
      const data = await response.json();
      setResultImage(`data:image/jpeg;base64,${data.imageBase64}`);
      setStep('result');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong');
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
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setCapturedPhoto(null); setPreprocessingCacheKey(null); setStep('choose'); }} disabled={loading || preprocessingLoading}>
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
});
