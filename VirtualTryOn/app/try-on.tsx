import { getClothingById } from '@/constants/clothing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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

export default function TryOnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clothId: string; clothName: string }>();
  const clothId = params.clothId ?? '1';
  const clothingItem = getClothingById(clothId);

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<'choose' | 'camera' | 'upload' | 'preview' | 'result'>('choose');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preprocessingLoading, setPreprocessingLoading] = useState(false);
  const [preprocessingCacheKey, setPreprocessingCacheKey] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!(loading || preprocessingLoading)) return;
    const id = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [loading, preprocessingLoading]);

  const startCountdown = () => {
    if (countdown !== null) return;
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          setCountdown(null);
          takePicture();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (photo?.uri) {
        setCapturedPhoto(photo.uri);
        setResultImage(null);
        setPreprocessingCacheKey(null);
        setStep('preview');
        preprocessPersonImage(photo.uri, clothingItem.cloth_type);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to upload.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setCapturedPhoto(result.assets[0].uri);
      setResultImage(null);
      setPreprocessingCacheKey(null);
      setStep('preview');
      preprocessPersonImage(result.assets[0].uri, clothingItem.cloth_type);
    }
  };

  const preprocessPersonImage = async (photoUri: string, clothType: string = 'upper') => {
    setPreprocessingLoading(true);
    try {
      const formData = new FormData();
      formData.append('person_image', { uri: photoUri, type: 'image/jpeg', name: 'person.jpg' } as any);
      formData.append('cloth_type', clothType);
      const res = await fetch(`${API_BASE_URL}/api/preprocess-person`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
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
      const clothSource = RNImage.resolveAssetSource(clothingItem.image);
      let clothUri = clothSource.uri;
      if (clothUri.startsWith('http')) {
        const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
        const ext = clothUri.includes('.png') ? 'png' : 'jpg';
        const fileUri = `${cacheDir}cloth-${Date.now()}.${ext}`;
        await FileSystem.downloadAsync(clothUri, fileUri);
        clothUri = fileUri;
      }
      const mime = clothUri.split('.').pop()?.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
      formData.append('cloth_image', { uri: clothUri, type: mime, name: `cloth.${clothUri.split('.').pop()?.split('?')[0] || 'jpg'}` } as any);
      formData.append('cloth_type', clothingItem.cloth_type);

      const healthRes = await fetch(`${API_BASE_URL}/health`);
      if (!healthRes.ok) throw new Error('Backend unreachable');
      const healthData = await healthRes.json();
      if (healthData.status === 'loading') throw new Error('Backend still loading. Please wait.');

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
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

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted && step === 'camera') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep('choose')}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.message}>Camera permission is needed</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.title}>Try on: {clothingItem.name}</Text>
          <View style={styles.clothPreview}>
            <Image source={clothingItem.image} style={styles.clothPreviewImg} contentFit="contain" />
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
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front">
            {countdown !== null && (
              <View style={styles.countdownOverlay}>
                <Text style={styles.countdownText}>{countdown}</Text>
                <TouchableOpacity style={styles.cancelCountdown} onPress={cancelCountdown}>
                  <Text style={styles.cancelCountdownText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.cameraButtons}>
              <TouchableOpacity style={styles.captureBtn} onPress={startCountdown} disabled={countdown !== null}>
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
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
  cameraWrap: { flex: 1 },
  countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  countdownText: { fontSize: 100, fontWeight: 'bold', color: '#fff' },
  cancelCountdown: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: 'rgba(255,59,48,0.9)', borderRadius: 24 },
  cancelCountdownText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cameraButtons: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureBtnInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
  previewWrap: { width: '100%', aspectRatio: 3/4, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 20 },
  previewImg: { width: '100%', height: '100%' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  loadingMsg: { color: '#fff', marginTop: 12, fontSize: 16 },
  resultImg: { width: '100%', aspectRatio: 3/4, backgroundColor: '#000', borderRadius: 12, marginBottom: 20 },
  resultActions: { gap: 12 },
  message: { fontSize: 16, color: '#333', marginBottom: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
