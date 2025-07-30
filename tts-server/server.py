#!/usr/bin/env python3
"""
Free Microsoft Edge TTS Server
Provides high-quality neural voice synthesis using Microsoft's Edge TTS service
"""

import asyncio
import io
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import edge_tts

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Edge TTS Server",
    description="Free high-quality text-to-speech using Microsoft Edge TTS",
    version="1.0.0"
)

# Enable CORS for your React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-AriaNeural"
    rate: Optional[str] = "+30%"  # 30% faster for natural pace
    pitch: Optional[str] = "+0Hz"

# High-quality voice options
VOICE_OPTIONS = {
    "aria": "en-US-AriaNeural",          # Female, friendly
    "jenny": "en-US-JennyNeural",        # Female, assistant-like
    "guy": "en-US-GuyNeural",            # Male, friendly
    "davis": "en-US-DavisNeural",        # Male, confident
    "jane": "en-US-JaneNeural",          # Female, young
    "jason": "en-US-JasonNeural",        # Male, mature
    "sara": "en-US-SaraNeural",          # Female, cheerful
    "tony": "en-US-TonyNeural",          # Male, news anchor
    "nancy": "en-US-NancyNeural",        # Female, mature
    "amber": "en-US-AmberNeural",        # Female, warm
    "ana": "en-US-AnaNeural",            # Female, child
    "brandon": "en-US-BrandonNeural",    # Male, young
    "christopher": "en-US-ChristopherNeural", # Male, confident
    "cora": "en-US-CoraNeural",          # Female, mature
    "elizabeth": "en-US-ElizabethNeural", # Female, calm
    "eric": "en-US-EricNeural",          # Male, friendly
    "michelle": "en-US-MichelleNeural",  # Female, professional
    "monica": "en-US-MonicaNeural",      # Female, cheerful
    "roger": "en-US-RogerNeural",        # Male, mature
    "steffan": "en-US-SteffanNeural"     # Male, young
}

@app.get("/")
async def root():
    return {
        "message": "Edge TTS Server is running!",
        "available_voices": list(VOICE_OPTIONS.keys()),
        "usage": "POST /tts with JSON: {'text': 'Hello world', 'voice': 'aria'}"
    }

@app.get("/voices")
async def get_voices():
    """Get all available voices with descriptions"""
    return {
        "voices": VOICE_OPTIONS,
        "descriptions": {
            "aria": "Female, friendly and warm",
            "jenny": "Female, assistant-like and helpful",
            "guy": "Male, friendly and approachable",
            "davis": "Male, confident and professional",
            "jane": "Female, young and energetic",
            "jason": "Male, mature and authoritative",
            "sara": "Female, cheerful and upbeat",
            "tony": "Male, news anchor style",
            "nancy": "Female, mature and calm",
            "amber": "Female, warm and caring"
        }
    }

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech using Microsoft Edge TTS"""
    try:
        # Validate input
        if not request.text or len(request.text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        if len(request.text) > 5000:
            raise HTTPException(status_code=400, detail="Text too long (max 5000 characters)")
        
        # Resolve voice name
        voice_name = request.voice
        if request.voice in VOICE_OPTIONS:
            voice_name = VOICE_OPTIONS[request.voice]
        elif request.voice not in [v for v in VOICE_OPTIONS.values()]:
            voice_name = VOICE_OPTIONS["aria"]  # Default fallback
            
        logger.info(f"Generating TTS: voice={voice_name}, text_length={len(request.text)}")
        
        # Create TTS communication
        communicate = edge_tts.Communicate(
            text=request.text,
            voice=voice_name,
            rate=request.rate,
            pitch=request.pitch
        )
        
        # Generate audio
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        
        audio_data.seek(0)
        
        if audio_data.getvalue():
            logger.info("TTS generation successful")
            return StreamingResponse(
                io.BytesIO(audio_data.getvalue()),
                media_type="audio/mpeg",
                headers={
                    "Content-Disposition": "inline; filename=speech.mp3",
                    "Cache-Control": "no-cache"
                }
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
            
    except Exception as e:
        logger.error(f"TTS Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Edge TTS Server"}

if __name__ == "__main__":
    import uvicorn
    print("Starting Edge TTS Server...")
    print("Server will be available at: http://localhost:8000")
    print("API docs available at: http://localhost:8000/docs")
    print("Available voices: aria, jenny, guy, davis, jane, jason...")
    
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )