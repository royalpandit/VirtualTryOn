/**
 * Try-On Camera screen — redesigned with OUI brand aesthetic.
 * Features a viewfinder with decorative corner brackets, scan-line effects,
 * clothing thumbnails, capture button, and side action buttons.
 */
import { FontFamily } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const IS_EXPO_GO =
  (Constants as any)?.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo' ||
  (Constants.appOwnership == null && __DEV__);

export type CameraStepProps = {
  onPhotoTaken: (uri: string) => void;
  onBack: () => void;
  onPickImage?: () => void;
  clothItems?: { id: string; image: string; name: string }[];
  selectedClothId?: string;
  onSelectCloth?: (id: string) => void;
};

export function CameraStep({ onPhotoTaken, onBack, onPickImage, clothItems, selectedClothId, onSelectCloth }: CameraStepProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [guideMessage, setGuideMessage] = useState('Position yourself within the frame');
  const [scanningText, setScanningText] = useState('SCANNING FOR PRECISE FIT...');

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Animate scanning text
  useEffect(() => {
    const texts = ['SCANNING FOR PRECISE FIT...', 'ANALYZING BODY SHAPE...', 'PREPARING VIRTUAL TRY-ON...'];
    let idx = 0;
    const id = setInterval(() => {
      idx = (idx + 1) % texts.length;
      setScanningText(texts[idx]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const toggleCamera = () => setFacing((f) => (f === 'front' ? 'back' : 'front'));

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
      });
      if (photo?.uri) onPhotoTaken(photo.uri);
    } catch {}
  };

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

  /* ─── Permission screen ─── */
  if (!permission?.granted) {
    return (
      <View style={st.permissionContainer}>
        <LinearGradient colors={['#0C0F10', '#1a1a2e']} style={StyleSheet.absoluteFillObject} />
        <View style={st.permissionContent}>
          <View style={st.permissionIconWrap}>
            <Ionicons name="camera-outline" size={48} color="#D5DBFF" />
          </View>
          <Text style={st.permissionTitle}>Camera Access Required</Text>
          <Text style={st.permissionText}>
            We need camera access to capture your photo for the virtual try-on experience.
          </Text>
          <TouchableOpacity style={st.permissionBtn} activeOpacity={0.85} onPress={requestPermission}>
            <LinearGradient colors={['#575E7C', '#D5DBFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.permissionBtnGrad}>
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={st.permissionBtnText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={onBack} activeOpacity={0.8} style={{ marginTop: 16 }}>
            <Text style={st.permissionBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ─── Main camera UI ─── */
  return (
    <View style={st.container}>
      <StatusBar style="light" />
      {/* Camera */}
      <View style={st.cameraWrap}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />

        {/* Dark gradient overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.6)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Viewfinder frame */}
        <View style={st.viewfinderWrap}>
          <View style={st.viewfinder}>
            {/* Inner guide rectangle */}
            <View style={st.innerGuide} />

            {/* Corner brackets */}
            <View style={[st.corner, st.cornerTL]} />
            <View style={[st.corner, st.cornerTR]} />
            <View style={[st.corner, st.cornerBL]} />
            <View style={[st.corner, st.cornerBR]} />

            {/* Horizontal scan line */}
            <LinearGradient
              colors={['rgba(213,219,255,0)', '#D5DBFF', 'rgba(213,219,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={st.scanLine}
            />

            {/* Scan dots */}
            <View style={[st.scanDot, { left: '18%', top: '40%' }]} />
            <View style={[st.scanDot, { right: '18%', top: '40%' }]} />
            <View style={[st.scanDotSmall, { left: '28%', top: '60%' }]} />
            <View style={[st.scanDotSmall, { right: '28%', top: '60%' }]} />
          </View>
        </View>

        {/* Right side action buttons */}
        <View style={st.sideActions}>
          <TouchableOpacity style={st.sideBtn} activeOpacity={0.85} onPress={toggleCamera}>
            <Ionicons name="camera-reverse-outline" size={20} color="#575E7C" />
          </TouchableOpacity>
          <TouchableOpacity style={st.sideBtn} activeOpacity={0.85}>
            <Ionicons name="settings-outline" size={20} color="#575E7C" />
          </TouchableOpacity>
        </View>

        {/* Bottom controls area */}
        <View style={st.bottomArea}>
          {/* Instruction text */}
          <View style={st.instructionWrap}>
            <View style={st.instructionPill}>
              <Text style={st.instructionText}>{guideMessage}</Text>
            </View>
            <Text style={st.scanningText}>{scanningText}</Text>
          </View>

          {/* Clothing thumbnails */}
          {clothItems && clothItems.length > 0 && (
            <View style={st.thumbnailRow}>
              {clothItems.slice(0, 5).map((item) => {
                const isSelected = item.id === selectedClothId;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[st.thumbWrap, isSelected && st.thumbWrapSelected]}
                    activeOpacity={0.85}
                    onPress={() => onSelectCloth?.(item.id)}
                  >
                    <Image source={{ uri: item.image }} style={st.thumbImage} contentFit="cover" />
                    {isSelected && <View style={st.thumbDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Capture controls */}
          <View style={st.captureRow}>
            {/* Camera toggle (front/back) */}
            <TouchableOpacity style={st.actionBtn} activeOpacity={0.85} onPress={toggleCamera}>
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Main capture button */}
            <TouchableOpacity onPress={startCountdown} style={st.captureOuter} activeOpacity={0.85}>
              <View style={st.captureGlow} />
              <View style={st.captureRing}>
                <View style={st.captureInner}>
                  <View style={st.captureCenter} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Gallery button */}
            <TouchableOpacity style={st.actionBtn} activeOpacity={0.85} onPress={onPickImage}>
              <Ionicons name="images-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Countdown overlay */}
        {countdown !== null && (
          <View style={st.countdownOverlay}>
            <Text style={st.countdownText}>{countdown}</Text>
            <Text style={st.countdownSub}>Hold still…</Text>
            <TouchableOpacity onPress={cancelCountdown} style={st.cancelBtn} activeOpacity={0.85}>
              <Text style={st.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Header bar — frosted glass style */}
      <View style={st.headerBar}>
        <View style={st.headerLeft}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color="#475569" />
          </TouchableOpacity>
          <Text style={st.headerBrand}>Virtual Try-On</Text>
        </View>
      </View>
    </View>
  );
}

const VIEWFINDER_W = SCREEN_WIDTH * 0.84;
const VIEWFINDER_H = VIEWFINDER_W * 1.33;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0F10' },

  /* Camera wrap */
  cameraWrap: { flex: 1, position: 'relative' },

  /* Header */
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(248,250,252,0.7)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerBrand: {
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: '#1E293B',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  /* Viewfinder */
  viewfinderWrap: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
  },
  viewfinder: {
    width: VIEWFINDER_W,
    height: VIEWFINDER_H,
    position: 'relative',
  },
  innerGuide: {
    position: 'absolute',
    left: '18%',
    top: '7%',
    width: '62%',
    height: '87%',
    borderWidth: 0.7,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  /* Corners */
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'rgba(213,219,255,0.6)',
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(213,219,255,0.6)',
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'rgba(213,219,255,0.6)',
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(213,219,255,0.6)',
    borderBottomRightRadius: 12,
  },

  /* Scan effects */
  scanLine: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    height: 2,
  },
  scanDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D5DBFF',
    shadowColor: '#D5DBFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  scanDotSmall: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(225,196,244,0.8)',
  },

  /* Side actions */
  sideActions: {
    position: 'absolute',
    right: 24,
    top: '42%',
    gap: 16,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  /* Bottom area */
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
  },

  /* Instructions */
  instructionWrap: {
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  instructionPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: 'rgba(248,249,250,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  instructionText: {
    fontSize: 14,
    fontFamily: FontFamily.body,
    color: '#FAF8FF',
    textAlign: 'center',
  },
  scanningText: {
    fontSize: 12,
    fontFamily: FontFamily.body,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    textAlign: 'center',
  },

  /* Thumbnails */
  thumbnailRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 16,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  thumbWrapSelected: {
    backgroundColor: 'rgba(213,219,255,0.3)',
    borderWidth: 2,
    borderColor: '#D5DBFF',
  },
  thumbImage: {
    flex: 1,
    borderRadius: 8,
  },
  thumbDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#575E7C',
    borderWidth: 1,
    borderColor: '#fff',
  },

  /* Capture controls */
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    maxWidth: 384,
    alignSelf: 'center',
    width: '100%',
  },
  actionBtn: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(222,227,230,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureOuter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(213,219,255,0.2)',
    // Shadow to simulate glow
    shadowColor: '#D5DBFF',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 0,
  },
  captureRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // Inner shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  captureCenter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  /* Countdown */
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 100,
    fontWeight: 'bold',
    color: '#fff',
  },
  countdownSub: {
    marginTop: 12,
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: 'rgba(255,255,255,0.9)',
  },
  cancelBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,59,48,0.9)',
    borderRadius: 24,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: FontFamily.headingSemiBold,
  },

  /* Permission screen */
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0C0F10',
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  permissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(213,219,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: FontFamily.headingExtra,
    color: '#FAF8FF',
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    fontFamily: FontFamily.body,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 32,
  },
  permissionBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  permissionBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  permissionBtnText: {
    fontSize: 16,
    fontFamily: FontFamily.heading,
    color: '#fff',
  },
  permissionBackText: {
    fontSize: 14,
    fontFamily: FontFamily.headingSemiBold,
    color: 'rgba(255,255,255,0.5)',
  },
});
