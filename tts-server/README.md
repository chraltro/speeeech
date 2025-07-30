# Edge TTS Server

A free, high-quality text-to-speech server using Microsoft's Edge TTS neural voices.

## 🚀 Quick Start

1. **Install Python** (3.8 or higher)
2. **Run the server:**
   ```bash
   # On Windows
   start_server.bat
   
   # On macOS/Linux
   pip install -r requirements.txt
   python server.py
   ```
3. **Server runs at:** http://localhost:8000

## 🎵 Available Voices

- **aria** - Female, friendly and warm (default)
- **jenny** - Female, assistant-like 
- **guy** - Male, friendly
- **davis** - Male, confident
- **jane** - Female, young and energetic
- **jason** - Male, mature
- **sara** - Female, cheerful
- **nancy** - Female, mature and calm

## 📡 API Usage

### Generate Speech
```bash
POST http://localhost:8000/tts
Content-Type: application/json

{
  "text": "Hello, this is a test of the Edge TTS system!",
  "voice": "aria",
  "rate": "-10%",
  "pitch": "+0Hz"
}
```

### Get Available Voices
```bash
GET http://localhost:8000/voices
```

## 🎯 Benefits

- ✅ **Completely Free** - No API keys needed
- ✅ **High Quality** - Microsoft's neural voices
- ✅ **No Limits** - Generate as much audio as you want
- ✅ **Fast** - Local processing, no cloud delays
- ✅ **20+ Voices** - Male/female, different ages and styles

## 🔧 Troubleshooting

- **Port 8000 in use?** Change port in `server.py` line with `uvicorn.run(..., port=8001)`
- **Python not found?** Install from https://python.org
- **Module not found?** Run `pip install -r requirements.txt`