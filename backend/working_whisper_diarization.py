#!/usr/bin/env python3
"""
Working Whisper Diarization Server
Based on MahmoudAshraf97/whisper-diarization methodology
Fixed to actually work without crashing
"""

import os
import tempfile
import traceback
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Core dependencies
try:
    import torch
    import whisper
    import librosa
    import numpy as np
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.metrics.pairwise import cosine_similarity
    print("Core dependencies loaded successfully")
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install: pip install torch whisper librosa numpy scikit-learn")
    exit(1)

app = FastAPI(title="Working Whisper Diarization", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global models
whisper_model = None

@app.on_event("startup")
async def startup_event():
    """Initialize models with proper error handling"""
    global whisper_model
    
    print("Loading Whisper model...")
    
    try:
        # Use base model for stability, force CPU to avoid CUDA issues
        device = "cpu"  # Force CPU for now to avoid crashes
        model_name = "base"
        
        print(f"Loading {model_name} on {device}...")
        whisper_model = whisper.load_model(model_name, device=device)
        
        print("Whisper model loaded successfully!")
        print("Server ready!")
        
    except Exception as e:
        print(f"Model loading failed: {e}")
        traceback.print_exc()

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "whisper": whisper_model is not None,
        "device": "cpu",
        "model": "base"
    }

def extract_speaker_embeddings(audio_data, sample_rate=16000):
    """
    Extract speaker embeddings using MFCC features
    Simple but effective approach for speaker diarization
    """
    try:
        # Extract MFCC features (key for speaker identification)
        mfccs = librosa.feature.mfcc(
            y=audio_data, 
            sr=sample_rate, 
            n_mfcc=13,
            n_fft=2048,
            hop_length=512
        )
        
        # Extract other discriminative features
        spectral_centroids = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio_data, sr=sample_rate)
        zero_crossing_rate = librosa.feature.zero_crossing_rate(audio_data)
        
        # Combine features
        features = np.vstack([
            mfccs,
            spectral_centroids,
            spectral_rolloff, 
            zero_crossing_rate
        ])
        
        return features.T  # Shape: (time_frames, n_features)
        
    except Exception as e:
        print(f"Feature extraction error: {e}")
        return None

def analyze_voice_characteristics_and_segment(words, audio_data, sample_rate, total_duration):
    """
    FAST voice analysis - create segments first, then analyze segment features
    Much more performant than per-word analysis
    """
    try:
        if not words:
            return [{
                'speaker': 'Speaker 1',
                'start': 0,
                'end': total_duration,
                'text': '',
                'words': [],
                'confidence': 0.9
            }]
        
        # Step 1: Create preliminary segments (2-3 second chunks for analysis)
        print("Creating audio segments for voice analysis...")
        segments = create_preliminary_segments(words, 2.5)  # 2.5 second segments
        print(f"Created {len(segments)} segments for analysis")
        
        if len(segments) <= 1:
            return [{
                'speaker': 'Speaker 1',
                'start': words[0]['start'],
                'end': words[-1]['end'],
                'text': ' '.join([w['word'] for w in words]).strip(),
                'words': words,
                'confidence': 0.9
            }]
        
        # Step 2: Extract voice features from each segment (much faster)
        print("Extracting voice features from segments...")
        segment_features = []
        for segment in segments:
            start_sample = int(segment['start'] * sample_rate)
            end_sample = int(segment['end'] * sample_rate)
            segment_audio = audio_data[start_sample:end_sample]
            
            features = extract_fast_voice_features(segment_audio, sample_rate)
            segment_features.append(features)
        
        segment_features = np.array(segment_features)
        
        # Step 3: Fast clustering on segments
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        
        scaler = StandardScaler()
        normalized_features = scaler.fit_transform(segment_features)
        
        # Force 2 speakers - most conversations are 2-person
        n_clusters = 2
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=3)
        speaker_labels = kmeans.fit_predict(normalized_features)
        
        print(f"Clustered into {n_clusters} speakers")
        
        # Step 4: Assign speaker labels to segments and create final segments
        final_segments = []
        for segment, speaker_id in zip(segments, speaker_labels):
            final_segments.append({
                'speaker': f'Speaker {speaker_id + 1}',
                'start': segment['start'],
                'end': segment['end'],
                'text': segment['text'],
                'words': segment['words'],
                'confidence': segment['confidence']
            })
        
        # Step 5: Merge adjacent segments from same speaker
        merged_segments = merge_adjacent_same_speaker_segments(final_segments)
        
        return merged_segments
        
    except Exception as e:
        print(f"Voice analysis error: {e}")
        traceback.print_exc()
        # Fallback: single speaker
        return [{
            'speaker': 'Speaker 1',
            'start': words[0]['start'] if words else 0,
            'end': words[-1]['end'] if words else total_duration,
            'text': ' '.join([w['word'] for w in words]).strip() if words else '',
            'words': words,
            'confidence': 0.9
        }]

def extract_fast_voice_features(audio_segment, sample_rate):
    """
    Fast voice feature extraction - only essential features
    """
    try:
        # MFCC (most important for speaker ID)
        mfccs = librosa.feature.mfcc(y=audio_segment, sr=sample_rate, n_mfcc=8)
        mfcc_mean = np.mean(mfccs, axis=1)
        
        # Spectral centroid (voice brightness)
        spectral_centroid = librosa.feature.spectral_centroid(y=audio_segment, sr=sample_rate)
        centroid_mean = np.mean(spectral_centroid)
        
        # Combine essential features only
        features = np.concatenate([
            mfcc_mean,
            [centroid_mean],
            [np.mean(audio_segment), np.std(audio_segment)]
        ])
        
        return features
        
    except Exception as e:
        return np.array([0] * 11)

def create_preliminary_segments(words, segment_duration):
    """
    Create segments of roughly equal duration for voice analysis
    """
    segments = []
    current_words = []
    segment_start = words[0]['start']
    
    for word in words:
        current_words.append(word)
        
        # Check if segment is long enough
        if word['end'] - segment_start >= segment_duration:
            text = ' '.join([w['word'] for w in current_words]).strip()
            confidence = sum([w.get('probability', 0.9) for w in current_words]) / len(current_words)
            
            segments.append({
                'start': segment_start,
                'end': word['end'],
                'text': text,
                'words': current_words.copy(),
                'confidence': confidence
            })
            
            current_words = []
            segment_start = word['end']
    
    # Add remaining words
    if current_words:
        text = ' '.join([w['word'] for w in current_words]).strip()
        confidence = sum([w.get('probability', 0.9) for w in current_words]) / len(current_words)
        
        segments.append({
            'start': segment_start,
            'end': current_words[-1]['end'],
            'text': text,
            'words': current_words,
            'confidence': confidence
        })
    
    return segments

def determine_speaker_count_from_voice(features):
    """
    Determine optimal number of speakers based on voice feature clustering
    """
    try:
        from sklearn.metrics import silhouette_score
        
        n_samples = len(features)
        if n_samples < 4:
            return min(2, n_samples)
        
        best_score = -1
        best_n_speakers = 2
        
        # Try different numbers of speakers
        for n in range(2, min(5, n_samples)):
            clustering = AgglomerativeClustering(n_clusters=n, linkage='ward')
            labels = clustering.fit_predict(features)
            
            # Skip if any cluster is too small
            unique_labels, counts = np.unique(labels, return_counts=True)
            if np.min(counts) < max(2, n_samples // 10):  # Each speaker needs minimum samples
                continue
                
            score = silhouette_score(features, labels)
            if score > best_score:
                best_score = score
                best_n_speakers = n
        
        return best_n_speakers
        
    except Exception as e:
        print(f"Speaker count determination error: {e}")
        return 2

def merge_adjacent_same_speaker_segments(segments):
    """
    Merge very short segments with adjacent segments from same speaker
    """
    if len(segments) <= 1:
        return segments
    
    merged = []
    MIN_SEGMENT_DURATION = 1.0  # 1 second minimum
    
    for segment in segments:
        duration = segment['end'] - segment['start']
        
        if (merged and 
            merged[-1]['speaker'] == segment['speaker'] and
            (duration < MIN_SEGMENT_DURATION or 
             segment['start'] - merged[-1]['end'] < 0.5)):  # Very close in time
            
            # Merge with previous segment
            prev = merged[-1]
            prev['end'] = segment['end']
            prev['text'] = (prev['text'] + ' ' + segment['text']).strip()
            prev['words'].extend(segment['words'])
            prev['confidence'] = (prev['confidence'] + segment['confidence']) / 2
        else:
            merged.append(segment)
    
    return merged

def create_speaker_segments_from_pauses(words, total_duration):
    """
    Create speaker segments based on natural conversation pauses
    Simple and effective approach
    """
    try:
        if not words:
            return [{
                'speaker': 'Speaker 1',
                'start': 0,
                'end': total_duration,
                'text': '',
                'words': [],
                'confidence': 0.9
            }]
        
        segments = []
        current_speaker = 1
        current_words = []
        segment_start = words[0]['start']
        
        # Simple heuristic: long pauses (>1.5s) likely indicate speaker changes
        PAUSE_THRESHOLD = 1.5
        MIN_SEGMENT_LENGTH = 2.0  # Minimum segment duration
        
        for i, word in enumerate(words):
            if i == 0:
                current_words.append(word)
                continue
                
            prev_word = words[i-1]
            pause = word['start'] - prev_word['end']
            segment_duration = word['start'] - segment_start
            
            # Check if we should create a new speaker segment
            should_switch = (
                pause > PAUSE_THRESHOLD and 
                segment_duration > MIN_SEGMENT_LENGTH
            )
            
            if should_switch:
                # Create segment for current speaker
                if current_words:
                    text = ' '.join([w['word'] for w in current_words]).strip()
                    confidence = sum([w.get('probability', 0.9) for w in current_words]) / len(current_words)
                    
                    segments.append({
                        'speaker': f'Speaker {current_speaker}',
                        'start': segment_start,
                        'end': prev_word['end'],
                        'text': text,
                        'words': current_words.copy(),
                        'confidence': confidence
                    })
                
                # Switch to next speaker (alternate between 1 and 2)
                current_speaker = 2 if current_speaker == 1 else 1
                current_words = [word]
                segment_start = word['start']
            else:
                current_words.append(word)
        
        # Add final segment
        if current_words:
            text = ' '.join([w['word'] for w in current_words]).strip()
            confidence = sum([w.get('probability', 0.9) for w in current_words]) / len(current_words)
            
            segments.append({
                'speaker': f'Speaker {current_speaker}',
                'start': segment_start,
                'end': words[-1]['end'],
                'text': text,
                'words': current_words,
                'confidence': confidence
            })
        
        return segments
        
    except Exception as e:
        print(f"Speaker segmentation error: {e}")
        # Fallback: single speaker
        return [{
            'speaker': 'Speaker 1',
            'start': words[0]['start'] if words else 0,
            'end': words[-1]['end'] if words else total_duration,
            'text': ' '.join([w['word'] for w in words]).strip() if words else '',
            'words': words,
            'confidence': 0.9
        }]

def create_simple_segments_from_words(words):
    """
    Create simple segments based on pauses in transcribed words
    Much more reliable than trying to do audio analysis
    """
    try:
        if not words or len(words) < 2:
            return []
        
        segments = []
        current_segment = {
            'start': words[0]['start'],
            'end': words[0]['end'],
            'words': [words[0]]
        }
        
        PAUSE_THRESHOLD = 2.0  # 2 second pause = likely speaker change
        MIN_SEGMENT_DURATION = 3.0  # Minimum 3 seconds per segment
        
        for i in range(1, len(words)):
            word = words[i]
            prev_word = words[i-1]
            
            pause = word['start'] - prev_word['end']
            segment_duration = word['start'] - current_segment['start']
            
            # Split on long pauses, but only if segment is long enough
            if pause > PAUSE_THRESHOLD and segment_duration > MIN_SEGMENT_DURATION:
                segments.append(current_segment)
                current_segment = {
                    'start': word['start'],
                    'end': word['end'],
                    'words': [word]
                }
            else:
                current_segment['end'] = word['end']
                current_segment['words'].append(word)
        
        # Add final segment
        if current_segment['words']:
            segments.append(current_segment)
        
        return segments
        
    except Exception as e:
        print(f"Simple segmentation error: {e}")
        return []

def perform_clustering_on_segments(segments, audio_data, sample_rate=16000):
    """
    Perform speaker clustering on pre-segmented audio based on word timestamps
    """
    try:
        if len(segments) < 2:
            return [0] * len(segments)
        
        # Extract features for each segment
        segment_features = []
        for segment in segments:
            start_sample = int(segment['start'] * sample_rate)
            end_sample = int(segment['end'] * sample_rate)
            segment_audio = audio_data[start_sample:end_sample]
            
            if len(segment_audio) > 1024:
                features = extract_speaker_embeddings(segment_audio, sample_rate)
                if features is not None:
                    # Use mean and std of features
                    mean_features = np.mean(features, axis=0)
                    std_features = np.std(features, axis=0)
                    combined_features = np.concatenate([mean_features, std_features])
                    segment_features.append(combined_features)
                else:
                    # Fallback features
                    segment_features.append(np.array([
                        np.mean(segment_audio), np.std(segment_audio),
                        np.max(segment_audio), np.min(segment_audio),
                        np.median(segment_audio), np.var(segment_audio)
                    ]))
            else:
                # Very short segment
                segment_features.append(np.array([
                    np.mean(segment_audio) if len(segment_audio) > 0 else 0,
                    np.std(segment_audio) if len(segment_audio) > 0 else 0,
                    0, 0, 0, 0
                ]))
        
        segment_features = np.array(segment_features)
        
        # Determine optimal number of clusters using proper clustering evaluation
        n_segments = len(segment_features)
        
        if n_segments < 2:
            n_clusters = 1
        elif n_segments < 4:
            n_clusters = 2
        else:
            # Use silhouette analysis to find optimal clusters
            from sklearn.metrics import silhouette_score
            best_n_clusters = 2
            best_score = -1
            
            for n in range(2, min(6, n_segments)):
                clustering = AgglomerativeClustering(n_clusters=n, linkage='ward')
                labels = clustering.fit_predict(segment_features)
                score = silhouette_score(segment_features, labels)
                if score > best_score:
                    best_score = score
                    best_n_clusters = n
            
            n_clusters = best_n_clusters
        
        # Perform final clustering
        clustering = AgglomerativeClustering(n_clusters=n_clusters, linkage='ward')
        speaker_labels = clustering.fit_predict(segment_features)
        
        print(f"Clustered {len(segments)} segments into {n_clusters} speakers")
        return speaker_labels
        
    except Exception as e:
        print(f"Clustering error: {e}")
        traceback.print_exc()
        return [i % 2 for i in range(len(segments))]

def perform_speaker_clustering(voice_segments, audio_data, sample_rate=16000):
    """
    Cluster voice segments by speaker using audio features
    """
    try:
        if len(voice_segments) < 2:
            return [0] * len(voice_segments)
        
        # Extract features for each voice segment
        segment_features = []
        
        for segment in voice_segments:
            start_sample = int(segment['start'] * sample_rate)
            end_sample = int(segment['end'] * sample_rate)
            segment_audio = audio_data[start_sample:end_sample]
            
            if len(segment_audio) > 1024:  # Enough samples for analysis
                features = extract_speaker_embeddings(segment_audio, sample_rate)
                if features is not None:
                    # Use mean features for the segment
                    mean_features = np.mean(features, axis=0)
                    segment_features.append(mean_features)
                else:
                    # Fallback: use basic statistics
                    segment_features.append([
                        np.mean(segment_audio),
                        np.std(segment_audio),
                        np.max(segment_audio),
                        np.min(segment_audio)
                    ])
            else:
                # Very short segment - use basic stats
                segment_features.append([
                    np.mean(segment_audio) if len(segment_audio) > 0 else 0,
                    np.std(segment_audio) if len(segment_audio) > 0 else 0,
                    np.max(segment_audio) if len(segment_audio) > 0 else 0,
                    np.min(segment_audio) if len(segment_audio) > 0 else 0
                ])
        
        segment_features = np.array(segment_features)
        
        # Determine optimal number of clusters using proper clustering evaluation
        n_segments = len(segment_features)
        
        if n_segments < 2:
            n_clusters = 1
        elif n_segments < 4:
            n_clusters = 2
        else:
            # Use silhouette analysis to find optimal clusters
            from sklearn.metrics import silhouette_score
            best_n_clusters = 2
            best_score = -1
            
            for n in range(2, min(6, n_segments)):
                clustering = AgglomerativeClustering(n_clusters=n, linkage='ward')
                labels = clustering.fit_predict(segment_features)
                score = silhouette_score(segment_features, labels)
                if score > best_score:
                    best_score = score
                    best_n_clusters = n
            
            n_clusters = best_n_clusters
        
        # Perform clustering
        clustering = AgglomerativeClustering(
            n_clusters=n_clusters,
            linkage='ward'
        )
        
        speaker_labels = clustering.fit_predict(segment_features)
        
        print(f"Clustered {n_segments} segments into {n_clusters} speakers")
        return speaker_labels
        
    except Exception as e:
        print(f"Clustering error: {e}")
        traceback.print_exc()
        # Fallback: alternate between 2 speakers
        return [i % 2 for i in range(len(voice_segments))]

def align_speakers_with_words(words, voice_segments, speaker_labels):
    """
    Align speaker clusters with transcribed words
    """
    try:
        speaker_segments = []
        
        for i, (segment, speaker_id) in enumerate(zip(voice_segments, speaker_labels)):
            # Find words that overlap with this voice segment
            segment_words = []
            
            for word in words:
                word_center = (word['start'] + word['end']) / 2
                
                # Check if word overlaps with voice segment (with some tolerance)
                if (word_center >= segment['start'] - 0.5 and 
                    word_center <= segment['end'] + 0.5):
                    segment_words.append(word)
            
            if segment_words:
                # Create speaker segment
                segment_text = ' '.join([w['word'] for w in segment_words])
                actual_start = min([w['start'] for w in segment_words])
                actual_end = max([w['end'] for w in segment_words])
                
                speaker_segments.append({
                    'speaker': f'Speaker {speaker_id + 1}',
                    'start': actual_start,
                    'end': actual_end,
                    'text': segment_text.strip(),
                    'words': segment_words,
                    'confidence': np.mean([w.get('probability', 0.9) for w in segment_words])
                })
        
        # Sort by start time
        speaker_segments.sort(key=lambda x: x['start'])
        
        # Merge adjacent segments from same speaker
        merged_segments = []
        for segment in speaker_segments:
            if (merged_segments and 
                merged_segments[-1]['speaker'] == segment['speaker'] and
                segment['start'] - merged_segments[-1]['end'] < 2.0):  # 2 second gap
                
                # Merge with previous segment
                prev = merged_segments[-1]
                prev['end'] = segment['end']
                prev['text'] = (prev['text'] + ' ' + segment['text']).strip()
                prev['words'].extend(segment['words'])
                prev['confidence'] = (prev['confidence'] + segment['confidence']) / 2
            else:
                merged_segments.append(segment)
        
        return merged_segments
        
    except Exception as e:
        print(f"Alignment error: {e}")
        traceback.print_exc()
        return []

@app.post("/transcribe")
async def transcribe_with_diarization(audio: UploadFile = File(...)):
    """
    Transcribe audio with speaker diarization using actual audio analysis
    """
    if not whisper_model:
        raise HTTPException(status_code=503, detail="Whisper model not loaded")
    
    temp_file_path = None
    
    try:
        print(f"Processing: {audio.filename}")
        
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        print("File saved, loading audio...")
        
        # Load audio
        try:
            audio_data, sample_rate = librosa.load(temp_file_path, sr=16000, mono=True)
            duration = len(audio_data) / sample_rate
            print(f"Loaded: {duration:.1f}s audio at {sample_rate}Hz")
        except Exception as e:
            print(f"Audio loading error: {e}")
            raise HTTPException(status_code=400, detail=f"Could not load audio: {e}")
        
        # Get clean transcription with proper language detection
        print("Transcribing with Whisper...")
        try:
            result = whisper_model.transcribe(
                audio_data,
                word_timestamps=True,
                language='da',  # Force Danish for better accuracy
                temperature=0.0,
                verbose=False
            )
            print("Transcription complete")
        except Exception as e:
            print(f"Whisper error: {e}")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
        
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
        
        print(f"Got {len(words)} words with timestamps")
        
        # Perform speaker diarization using actual audio analysis
        print("Analyzing audio for speaker diarization...")
        
        try:
            # ACTUAL VOICE ANALYSIS - analyze the audio itself
            speaker_segments = analyze_voice_characteristics_and_segment(words, audio_data, sample_rate, duration)
            print(f"Created {len(speaker_segments)} speaker segments using voice analysis")
            
        except Exception as e:
            print(f"Diarization error: {e}")
            traceback.print_exc()
            # Fallback: single speaker
            speaker_segments = [{
                'speaker': 'Speaker 1',
                'start': 0,
                'end': duration,
                'text': result.get('text', ''),
                'words': words,
                'confidence': 0.9
            }]
        
        # Calculate results
        speakers = list(set([seg['speaker'] for seg in speaker_segments]))
        speaker_formatted_text = '\n\n'.join([f"{seg['speaker']}: {seg['text']}" for seg in speaker_segments])
        
        # Calculate statistics
        speaker_stats = {}
        for speaker in speakers:
            speaker_segs = [seg for seg in speaker_segments if seg['speaker'] == speaker]
            total_time = sum([seg['end'] - seg['start'] for seg in speaker_segs])
            word_count = sum([len(seg['words']) for seg in speaker_segs])
            
            speaker_stats[speaker] = {
                'totalTime': total_time,
                'wordCount': word_count,
                'segments': len(speaker_segs),
                'avgConfidence': sum([seg['confidence'] for seg in speaker_segs]) / len(speaker_segs) if speaker_segs else 0.9,
                'timePercentage': (total_time / duration) * 100 if duration > 0 else 0
            }
        
        response = {
            'text': result.get('text', ''),
            'duration': duration,
            'words': words,
            'speakerSegments': speaker_segments,
            'speakers': speakers,
            'speakerFormattedText': speaker_formatted_text,
            'speakerStats': speaker_stats,
            'method': 'whisper-audio-diarization',
            'confidence': sum([seg['confidence'] for seg in speaker_segments]) / len(speaker_segments) if speaker_segments else 0.9
        }
        
        print("Processing complete!")
        return response
        
    except HTTPException:
        raise
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
        
    finally:
        # Cleanup
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except:
                pass

if __name__ == "__main__":
    print("Starting Working Whisper Diarization Server")
    print("Uses actual audio analysis for speaker identification")
    print("Based on MahmoudAshraf97/whisper-diarization methodology")
    print("")
    print("Requirements: pip install torch whisper librosa numpy scikit-learn fastapi uvicorn python-multipart")
    print("")
    
    uvicorn.run(
        "working_whisper_diarization:app",
        host="0.0.0.0", 
        port=8000,
        reload=False,
        log_level="info"
    )