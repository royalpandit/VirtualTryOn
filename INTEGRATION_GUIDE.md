# Virtual Try-On System Integration Guide

Complete guide for the CatVTON FastAPI backend and Expo mobile app integration.

## System Architecture

```
┌─────────────────┐         HTTP/REST          ┌──────────────────┐
│                 │    POST /api/try-on        │                  │
│  Expo App       │ ──────────────────────────> │  FastAPI Backend │
│  (React Native) │                             │  (Python)        │
│                 │ <────────────────────────── │                  │
│                 │    JSON + base64 image     │                  │
└─────────────────┘                             └──────────────────┘
                                                         │
                                                         │ CUDA
                                                         ▼
                                                  ┌──────────────┐
                                                  │  NVIDIA GPU  │
                                                  │  (RTX 4050)  │
                                                  └──────────────┘
```

## Components

### 1. Backend (CatVTON FastAPI)

**Location**: `CatVTON/app_fastapi.py`

**Key Features**:
- Models loaded once at startup (singleton pattern)
- Single inference at a time (threading lock)
- GPU memory management with automatic cleanup
- CUDA OOM error handling
- Automatic image resizing for memory safety

**Model Loading**:
- `CatVTONPipeline`: Main diffusion model for try-on
- `AutoMasker`: Generates clothing masks automatically
- Loaded in `startup_event()` - runs once when server starts

**GPU Safety**:
- `gpu_inference_lock()` context manager ensures single inference
- `torch.cuda.empty_cache()` called after each inference
- Images automatically resized if too large
- OOM errors return HTTP 503 with clear error messages

### 2. Frontend (Expo App)

**Location**: `VirtualTryOn/app/(tabs)/index.tsx`

**Key Features**:
- Camera integration for person photos
- Clothing item selection
- Image upload via multipart/form-data
- Loading states and error handling
- Environment variable configuration

**API Integration**:
- Sends `person_image` and `cloth_image` files
- Receives base64-encoded result image
- Health check before main request
- Detailed error messages for different failure modes

## How It Works

### Request Flow

1. **User captures photo** in Expo app
2. **User selects clothing item** from list
3. **App performs health check** to `/health` endpoint
4. **App uploads images** to `/api/try-on`:
   - `person_image`: JPEG/PNG file
   - `cloth_image`: JPEG/PNG file
   - Optional: `cloth_type`, `num_inference_steps`, `guidance_scale`, `seed`
5. **Backend processes request**:
   - Validates images
   - Resizes if needed (max 768x1024)
   - Generates mask using AutoMasker
   - Acquires GPU lock
   - Runs inference with `torch.no_grad()`
   - Releases GPU lock
   - Clears GPU cache
   - Encodes result as base64
6. **App receives result** and displays image

### Model Loading (Backend Startup)

```
Application Start
    ↓
FastAPI startup_event() triggered
    ↓
load_models() called
    ↓
Download models from HuggingFace (if needed)
    ↓
Initialize CatVTONPipeline
    ├─ Load base model (stable-diffusion-inpainting)
    ├─ Load CatVTON attention weights
    ├─ Load VAE
    └─ Load UNet
    ↓
Initialize AutoMasker
    ├─ Load DensePose model
    └─ Load SCHP model
    ↓
Models ready (_model_loaded.set())
    ↓
Server ready to accept requests
```

### Inference Flow (Per Request)

```
POST /api/try-on received
    ↓
Check models loaded
    ↓
Read person_image and cloth_image
    ↓
Resize images if needed (prevent OOM)
    ↓
Generate mask (AutoMasker)
    ↓
gpu_inference_lock() acquired
    ↓
torch.cuda.empty_cache()
    ↓
pipeline() called with torch.no_grad()
    ├─ Encode images to latents (VAE)
    ├─ Generate noise
    ├─ Denoising loop (50 steps)
    └─ Decode latents to image (VAE)
    ↓
gpu_inference_lock() released
    ↓
torch.cuda.empty_cache()
    ↓
Encode result as base64
    ↓
Return JSON response
```

## GPU Memory Management

### Limits (RTX 4050, 6GB VRAM)

- **Resolution**: 768x1024 (maximum safe)
- **Batch Size**: Always 1 (enforced)
- **Precision**: fp16 (reduces memory by ~50%)
- **Concurrent Requests**: 1 (enforced by lock)

### Memory Safety Mechanisms

1. **Singleton Models**: Models loaded once, never reloaded
2. **Inference Lock**: Only one inference at a time
3. **Automatic Resizing**: Large images resized before processing
4. **Cache Clearing**: GPU cache cleared after each inference
5. **No Grad Mode**: `torch.no_grad()` prevents gradient computation
6. **Tensor Cleanup**: Intermediate tensors deleted explicitly

### Preventing OOM

The system prevents OOM through:

```python
# 1. Resize if too large
person_img = resize_if_needed(person_img, (768, 1024))

# 2. Single inference lock
with gpu_inference_lock():
    # Only one request processes at a time
    
# 3. Clear cache after inference
torch.cuda.empty_cache()

# 4. Use fp16 precision
weight_dtype = torch.float16  # Half precision
```

## Configuration

### Backend Configuration

Edit `CatVTON/app_fastapi.py` or use command-line arguments:

```python
DEFAULT_CONFIG = {
    "width": 768,              # Image width
    "height": 1024,            # Image height
    "mixed_precision": "fp16", # fp16, bf16, or no
    "num_inference_steps": 50, # Diffusion steps
    "guidance_scale": 2.5,     # CFG strength
}
```

### Frontend Configuration

Edit `VirtualTryOn/app.json`:

```json
{
  "expo": {
    "extra": {
      "API_URL": "http://YOUR_IP:8000/api/try-on"
    }
  }
}
```

Or let the app auto-detect (default behavior).

## API Reference

### POST /api/try-on

**Request**:
- `person_image` (file): Person photo
- `cloth_image` (file): Clothing image
- `cloth_type` (optional): "upper", "lower", "overall"
- `num_inference_steps` (optional): 10-100, default 50
- `guidance_scale` (optional): 0.0-7.5, default 2.5
- `seed` (optional): Integer, default 42 (-1 for random)

**Response**:
```json
{
  "success": true,
  "imageBase64": "base64_string",
  "message": "Try-on completed successfully"
}
```

**Error Responses**:
- `503`: GPU busy or models loading
- `507`: GPU out of memory
- `500`: Internal server error

### GET /health

**Response**:
```json
{
  "status": "healthy",
  "message": "Service is ready"
}
```

## Deployment

### Starting Backend

**Windows**:
```bash
cd CatVTON
start_server.bat
```

**Linux/macOS**:
```bash
cd CatVTON
chmod +x start_server.sh
./start_server.sh
```

**Manual**:
```bash
cd CatVTON
python app_fastapi.py --host 0.0.0.0 --port 8000
```

### Starting Frontend

```bash
cd VirtualTryOn
npm install
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code for physical device

## Troubleshooting

### Backend Issues

**Models not loading**:
- Check CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- Check disk space for model downloads
- Check internet connection

**GPU OOM errors**:
- Reduce `width`/`height` in DEFAULT_CONFIG
- Ensure no other processes using GPU
- Use `fp16` precision (already default)

**Port already in use**:
- Change port: `--port 8001`
- Or kill process using port 8000

### Frontend Issues

**Cannot connect to backend**:
- Check backend is running: `curl http://localhost:8000/health`
- Check IP address in `app.json`
- Ensure same Wi-Fi network
- Check firewall allows port 8000

**Images not uploading**:
- Check file permissions
- Ensure images are valid JPEG/PNG
- Check network connection

### Integration Issues

**CORS errors**:
- Backend includes CORS middleware
- Check backend logs for CORS issues
- Verify request origin

**Timeout errors**:
- Inference takes 10-20 seconds
- Increase timeout in fetch request if needed
- Check GPU is not stuck

## Performance

### Expected Timings (RTX 4050)

- **Model Loading**: 30-60 seconds (first time only)
- **Inference**: 10-20 seconds per request
- **Total Request Time**: 15-25 seconds (including upload/processing)

### Optimization

1. **Use fp16**: Already default, reduces memory by 50%
2. **Keep resolution low**: 768x1024 is optimal
3. **Single inference**: Already enforced
4. **Cache clearing**: Automatic after each request

## Security Considerations

1. **CORS**: Currently allows all origins - restrict in production
2. **Authentication**: Not implemented - add for production
3. **Rate Limiting**: Not implemented - add for production
4. **HTTPS**: Use HTTPS in production
5. **Input Validation**: Images validated, but add more checks if needed

## Next Steps

1. **Add Authentication**: API keys or OAuth
2. **Add Rate Limiting**: Prevent abuse
3. **Add Logging**: Track usage and errors
4. **Add Monitoring**: GPU usage, request times
5. **Add Caching**: Cache results for same inputs
6. **Add Queue System**: Handle multiple requests better

## Support

For issues:
1. Check logs in backend console
2. Check Expo app console
3. Verify GPU is available and working
4. Check network connectivity
5. Review error messages in API responses

