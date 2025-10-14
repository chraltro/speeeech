#!/usr/bin/env python3
"""
Insanely Fast Whisper Backend Server
Requires: pip install insanely-fast-whisper fastapi uvicorn python-multipart
"""

import os
import tempfile
import asyncio
from typing import Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Try to import insanely-fast-whisper dependencies
try:
    import torch
    from transformers import pipeline
    import librosa
    import numpy as np
    print("✅ All dependencies available")
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("Please install: pip install insanely-fast-whisper torch transformers librosa")
    exit(1)

app = FastAPI(title="Insanely Fast Whisper API", version="1.0.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model storage
whisper_model = None
diarization_pipeline = None

@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    global whisper_model, diarization_pipeline
    
    print("🚀 Starting Insanely Fast Whisper Server...")
    
    try:
        # Load Whisper model
        print("📥 Loading Whisper model...")
        whisper_model = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-large-v3",
            torch_dtype=torch.float16,
            device="cuda" if torch.cuda.is_available() else "cpu",
            model_kwargs={"attn_implementation": "flash_attention_2"} if torch.cuda.is_available() else {}
        )
        
        # Try to load diarization pipeline
        try:
            print("👥 Loading speaker diarization pipeline...")
            from pyannote.audio import Pipeline
            
            # You'll need a Hugging Face token for this
            hf_token = os.getenv("HF_TOKEN")
            if hf_token:
                diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=hf_token
                )
                print("✅ Speaker diarization ready!")
            else:
                print("⚠️ No HF_TOKEN found, diarization disabled")
                
        except Exception as e:
            print(f"⚠️ Diarization not available: {e}")
            diarization_pipeline = None
            
        print("🎉 Server ready!")
        
    except Exception as e:
        print(f"❌ Failed to load models: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "whisper": whisper_model is not None, "diarization": diarization_pipeline is not None}

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    diarize: bool = Form(default=True),
    hf_token: Optional[str] = Form(default=None)
):
    """Transcribe audio with optional speaker diarization"""
    
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Whisper model not loaded")
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        print(f"🎵 Processing audio: {audio.filename}")
        
        # Load and preprocess audio
        audio_array, sample_rate = librosa.load(temp_file_path, sr=16000)
        duration = len(audio_array) / sample_rate
        
        print(f"⏱️ Audio duration: {duration:.2f}s")
        
        # Transcribe with Whisper
        print("🎤 Transcribing with Whisper...")
        whisper_result = whisper_model(
            audio_array,
            return_timestamps=True,
            generate_kwargs={"language": None}  # Auto-detect language
        )
        
        # Initialize result
        result = {
            "text": whisper_result["text"],
            "duration": duration,
            "words": [],
            "segments": [],
            "speakers": [],
            "confidence": 0.9
        }
        
        # Extract word-level timestamps if available
        if "chunks" in whisper_result:
            for chunk in whisper_result["chunks"]:
                if "timestamp" in chunk:
                    start, end = chunk["timestamp"]
                    result["words"].append({
                        "word": chunk["text"],
                        "start": start,
                        "end": end,
                        "probability": 0.9
                    })
        
        # Speaker diarization if requested and available
        if diarize and diarization_pipeline:
            print("👥 Performing speaker diarization...")
            
            try:
                # Run diarization
                diarization = diarization_pipeline(temp_file_path)
                
                # Process diarization results
                segments = []
                speakers = set()
                
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    speakers.add(speaker)
                    
                    # Find words in this time segment
                    segment_words = [
                        word for word in result["words"]
                        if word["start"] >= turn.start and word["end"] <= turn.end
                    ]
                    
                    if segment_words:
                        segment_text = " ".join([word["word"] for word in segment_words])
                        segments.append({
                            "speaker": f"Speaker {len([s for s in speakers if s <= speaker])}",
                            "start": turn.start,
                            "end": turn.end,
                            "text": segment_text.strip(),
                            "words": segment_words,
                            "confidence": 0.9
                        })
                
                result["segments"] = segments
                result["speakers"] = list(speakers)
                
                print(f"✅ Identified {len(speakers)} speakers in {len(segments)} segments")
                
            except Exception as e:
                print(f"⚠️ Diarization failed: {e}")
                # Fallback: create single speaker segment
                result["segments"] = [{
                    "speaker": "Speaker 1",
                    "start": 0,
                    "end": duration,
                    "text": result["text"],
                    "words": result["words"],
                    "confidence": 0.9
                }]
                result["speakers"] = ["Speaker 1"]
        
        else:
            # No diarization: single speaker
            result["segments"] = [{
                "speaker": "Speaker 1",
                "start": 0,
                "end": duration,
                "text": result["text"],
                "words": result["words"],
                "confidence": 0.9
            }]
            result["speakers"] = ["Speaker 1"]
        
        # Cleanup
        os.unlink(temp_file_path)
        
        print("🎉 Transcription complete!")
        return result
        
    except Exception as e:
        print(f"❌ Transcription error: {e}")
        # Cleanup on error
        if 'temp_file_path' in locals():
            try:
                os.unlink(temp_file_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

if __name__ == "__main__":
    print("🚀 Starting Insanely Fast Whisper Server...")
    print("📋 Setup instructions:")
    print("1. pip install insanely-fast-whisper fastapi uvicorn python-multipart")
    print("2. Optional: export HF_TOKEN='your_huggingface_token' for speaker diarization")
    print("3. python whisper_server.py")
    print("")
    
    uvicorn.run(
        "whisper_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )