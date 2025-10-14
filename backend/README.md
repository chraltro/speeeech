# Insanely Fast Whisper Backend Setup

This backend provides **much better speaker diarization** using `insanely-fast-whisper` + `pyannote`.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
# Create virtual environment (recommended)
python -m venv whisper_env
source whisper_env/bin/activate  # On Windows: whisper_env\Scripts\activate

# Install required packages
pip install insanely-fast-whisper fastapi uvicorn python-multipart
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 2. Get Hugging Face Token (Required for Speaker Diarization)
1. Go to https://huggingface.co/settings/tokens
2. Create a new token with "Read" permissions
3. Accept the user agreement for `pyannote/speaker-diarization-3.1`
4. Set the token:
```bash
export HF_TOKEN="your_token_here"  # On Windows: set HF_TOKEN=your_token_here
```

### 3. Run the Server
```bash
cd backend
python whisper_server.py
```

The server will start on `http://localhost:8000`

## 🎯 How It Works

1. **React app** tries the backend first (if available)
2. **Backend** uses `insanely-fast-whisper` + `pyannote` for accurate speaker diarization
3. **Fallback** to browser-based processing if backend is unavailable
4. **Final fallback** to basic transcription if all else fails

## ✅ Benefits of Backend Approach

- **Much more accurate** speaker identification (uses state-of-the-art models)
- **Faster processing** (optimized for GPUs)
- **Better language support** 
- **No browser limitations**

## 🔧 Troubleshooting

### GPU Support (Optional but Recommended)
```bash
# Check if CUDA is available
python -c "import torch; print(torch.cuda.is_available())"
```

### Memory Issues
If you get memory errors, the server will automatically fall back to CPU processing.

### Dependencies
If installation fails, try:
```bash
pip install --upgrade pip setuptools wheel
pip install insanely-fast-whisper --no-deps
pip install torch transformers accelerate datasets librosa soundfile
```

## 🎵 Testing

1. Start the backend: `python whisper_server.py`
2. Check health: Visit `http://localhost:8000/health`
3. Use your React app - it should show "🚀 Insanely Fast Whisper + PyAnnote" in the method info

The app will automatically detect if the backend is running and use it for much better results!