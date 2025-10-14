#!/usr/bin/env python3
"""
Simple, Reliable Whisper Diarization Server
Focuses on stability and reliability over advanced features
"""

import os
import tempfile
import json
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Core dependencies check
try:
    import torch
    import whisper
    import librosa
    import numpy as np
    print("✅ Core dependencies available")
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("Please install: pip install torch openai-whisper librosa numpy fastapi uvicorn python-multipart")
    exit(1)

app = FastAPI(title="Simple Whisper Diarization API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model storage
whisper_model = None

@app.on_event("startup")
async def startup_event():
    """Initialize Whisper model on startup"""
    global whisper_model
    
    print("🚀 Starting Simple Whisper Server...")
    
    try:
        # Use a smaller, more reliable model
        model_name = "base"  # Much more stable than medium/large
        device = "cpu"       # Force CPU for stability (can change to cuda if needed)
        
        print(f"📥 Loading Whisper {model_name} model on {device}...")
        
        whisper_model = whisper.load_model(model_name, device=device)
        
        print("✅ Whisper model loaded successfully!")
        print("🎉 Server ready!")
        
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        print("Server will start but transcription will fail")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "whisper": whisper_model is not None,
        "model": "base" if whisper_model else None,
        "device": "cpu"
    }

def simple_speaker_diarization(words, duration):
    """
    Simple but effective speaker diarization based on pause patterns
    Works well for conversational audio like interviews/dialogues
    """
    if not words:
        return [], ["Speaker 1"]
    
    segments = []
    current_speaker = 1
    current_segment = {
        'speaker': f'Speaker {current_speaker}',
        'start': words[0]['start'],
        'end': words[0]['end'],
        'words': [words[0]],
        'text': words[0]['word']
    }
    
    # Parameters for speaker change detection
    pause_threshold = 2.0  # 2 second pause suggests speaker change
    segment_min_length = 3.0  # Minimum 3 seconds per segment
    max_speakers = 4
    
    for i in range(1, len(words)):
        word = words[i]
        prev_word = words[i-1]
        
        # Calculate pause between words
        pause_duration = word['start'] - prev_word['end']
        
        # Check if we should switch speakers
        should_switch = (
            pause_duration > pause_threshold and 
            (word['start'] - current_segment['start']) > segment_min_length and
            current_speaker < max_speakers
        )
        
        if should_switch:
            # End current segment
            current_segment['confidence'] = sum(w.get('probability', 0.9) for w in current_segment['words']) / len(current_segment['words'])
            segments.append(current_segment)
            
            # Start new segment with new speaker
            current_speaker = (current_speaker % max_speakers) + 1
            current_segment = {
                'speaker': f'Speaker {current_speaker}',
                'start': word['start'],
                'end': word['end'],
                'words': [word],
                'text': word['word']
            }
        else:
            # Continue current segment
            current_segment['end'] = word['end']
            current_segment['words'].append(word)
            current_segment['text'] += ' ' + word['word']
    
    # Add final segment
    if current_segment['words']:
        current_segment['confidence'] = sum(w.get('probability', 0.9) for w in current_segment['words']) / len(current_segment['words'])
        segments.append(current_segment)
    
    # Get unique speakers
    speakers = list(set(seg['speaker'] for seg in segments))
    
    return segments, speakers

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio with simple speaker diarization"""
    
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Whisper model not loaded")
    
    temp_file_path = None
    
    try:
        print(f"🎵 Processing uploaded file: {audio.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        print(f"💾 Saved to: {temp_file_path}")
        
        # Load and preprocess audio
        try:
            print("🎵 Loading audio...")
            audio_array, sample_rate = librosa.load(temp_file_path, sr=16000, mono=True)
            duration = len(audio_array) / sample_rate
            
            print(f"⏱️ Audio duration: {duration:.2f}s, Sample rate: {sample_rate}Hz")
            
        except Exception as audio_error:
            print(f"❌ Audio loading failed: {audio_error}")
            raise HTTPException(status_code=400, detail=f"Could not load audio file: {audio_error}")
        
        # Transcribe with Whisper
        try:
            print("🎤 Transcribing with Whisper...")
            
            # Use safe transcription options
            result = whisper_model.transcribe(
                audio_array,
                word_timestamps=True,
                temperature=0.0,  # Deterministic
                best_of=1,        # Faster
                beam_size=1,      # Faster  
                fp16=False,       # More stable
                verbose=False     # Less output
            )
            
            print("✅ Whisper transcription completed")
            
        except Exception as whisper_error:
            print(f"❌ Whisper transcription failed: {whisper_error}")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {whisper_error}")
        
        # Extract words with timestamps
        words = []
        if 'segments' in result:
            for segment in result['segments']:
                if 'words' in segment:
                    for word_info in segment['words']:
                        words.append({
                            'word': word_info.get('word', '').strip(),
                            'start': word_info.get('start', 0),
                            'end': word_info.get('end', 0),
                            'probability': word_info.get('probability', 0.9)
                        })
        
        print(f"📝 Extracted {len(words)} words with timestamps")
        
        # Simple speaker diarization
        try:
            print("👥 Performing simple speaker diarization...")
            speaker_segments, speakers = simple_speaker_diarization(words, duration)
            print(f"✅ Identified {len(speakers)} speakers in {len(speaker_segments)} segments")
            
        except Exception as diarization_error:
            print(f"⚠️ Diarization failed: {diarization_error}")
            # Fallback: single speaker
            speaker_segments = [{
                'speaker': 'Speaker 1',
                'start': 0,
                'end': duration,
                'text': result.get('text', ''),
                'words': words,
                'confidence': 0.9
            }]
            speakers = ['Speaker 1']
        
        # Calculate speaker statistics
        speaker_stats = {}
        for speaker in speakers:
            speaker_segs = [seg for seg in speaker_segments if seg['speaker'] == speaker]
            total_time = sum(seg['end'] - seg['start'] for seg in speaker_segs)
            word_count = sum(len(seg['words']) for seg in speaker_segs)
            
            speaker_stats[speaker] = {
                'totalTime': total_time,
                'wordCount': word_count,
                'segments': len(speaker_segs),
                'avgConfidence': sum(seg['confidence'] for seg in speaker_segs) / len(speaker_segs) if speaker_segs else 0.9,
                'timePercentage': (total_time / duration) * 100 if duration > 0 else 0
            }
        
        # Create formatted text
        speaker_formatted_text = '\n\n'.join(
            f"{seg['speaker']}: {seg['text']}" for seg in speaker_segments
        )
        
        # Build response
        response = {
            'text': result.get('text', ''),
            'duration': duration,
            'words': words,
            'speakerSegments': speaker_segments,
            'speakers': speakers,
            'speakerFormattedText': speaker_formatted_text,
            'speakerStats': speaker_stats,
            'method': 'simple-whisper-diarization',
            'confidence': sum(seg['confidence'] for seg in speaker_segments) / len(speaker_segments) if speaker_segments else 0.9,
            'filename': audio.filename,
            'server_version': '1.0.0'
        }
        
        print("🎉 Processing complete!")
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
        
    finally:
        # Cleanup temporary file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                print(f"🗑️ Cleaned up temp file")
            except Exception as cleanup_error:
                print(f"⚠️ Could not delete temp file: {cleanup_error}")

if __name__ == "__main__":
    print("🚀 Starting Simple Whisper Diarization Server...")
    print("🎯 Optimized for reliability and stability")
    print("")
    print("📋 Quick setup:")
    print("pip install torch openai-whisper librosa numpy fastapi uvicorn python-multipart")
    print("")
    print("🌐 Server will run at: http://localhost:8000")
    print("📊 Health check: http://localhost:8000/health")
    print("")
    
    uvicorn.run(
        "simple_whisper_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Disable reload for stability
        log_level="info"
    )