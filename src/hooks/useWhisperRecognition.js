import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { transcribeAudio, recordAudio } from '../services/openaiService';

const useWhisperRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const onTranscriptCallback = useRef(null);
  const isListeningRef = useRef(false);
  const recordingChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const lastTranscriptRef = useRef('');

  /**
   * Start continuous speech recognition using chunked recording
   * Records in chunks and transcribes each chunk for near real-time results
   */
  const startListening = useCallback(async (onTranscript, options = {}) => {
    console.log('Starting Whisper speech recognition...');
    
    try {
      const {
        chunkDuration = 3000, // Record in 3-second chunks
        language = null, // Auto-detect language
        prompt = null
      } = options;

      // Check if already listening
      if (isListeningRef.current) {
        console.log('Already listening, ignoring start request');
        return true;
      }

      // Store callback
      onTranscriptCallback.current = onTranscript;
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });

      streamRef.current = stream;
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (recordingChunksRef.current.length > 0 && isListeningRef.current) {
          await processRecordingChunk();
        }
      };

      // Start initial recording
      setIsListening(true);
      isListeningRef.current = true;
      mediaRecorder.start(chunkDuration);
      console.log('Whisper recognition started with chunked recording');
      toast.success('🎤 Listening with Whisper...');

      // Set up interval for continuous chunked recording
      recordingIntervalRef.current = setInterval(() => {
        if (isListeningRef.current && mediaRecorderRef.current) {
          if (mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          
          // Start new recording chunk after a brief pause
          setTimeout(() => {
            if (isListeningRef.current && mediaRecorderRef.current) {
              recordingChunksRef.current = [];
              mediaRecorderRef.current.start(chunkDuration);
            }
          }, 100);
        }
      }, chunkDuration + 200); // Slight overlap for continuous recording

      /**
       * Process recorded chunk with Whisper
       */
      async function processRecordingChunk() {
        if (!isListeningRef.current || recordingChunksRef.current.length === 0) {
          return;
        }

        try {
          setIsProcessing(true);
          
          // Create blob from recorded chunks
          const audioBlob = new Blob(recordingChunksRef.current, { 
            type: 'audio/webm;codecs=opus' 
          });

          // Skip processing if audio is too small (likely silence)
          if (audioBlob.size < 1000) {
            console.log('Skipping small audio chunk (likely silence)');
            setIsProcessing(false);
            return;
          }

          console.log(`Processing audio chunk: ${audioBlob.size} bytes`);

          // Transcribe with Whisper
          const result = await transcribeAudio(audioBlob, {
            language: language,
            prompt: prompt,
            temperature: 0.2
          });

          // Process result if we got meaningful text
          if (result && result.trim() && result.trim() !== lastTranscriptRef.current) {
            console.log('Whisper result:', result);
            lastTranscriptRef.current = result.trim();
            setTranscript(result.trim());
            
            if (onTranscriptCallback.current) {
              onTranscriptCallback.current(result.trim());
            }
          }

        } catch (error) {
          console.error('Whisper transcription error:', error);
          // Don't show error toast for every failed chunk, just log it
          if (error.message.includes('quota') || error.message.includes('rate limit')) {
            toast.error('OpenAI API limit reached. Please try again later.');
            stopListening(); // Stop if we hit API limits
          }
        } finally {
          setIsProcessing(false);
        }
      }

      return true;

    } catch (error) {
      console.error('Error starting Whisper recognition:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please allow microphone access.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No microphone found. Please connect a microphone.');
      } else {
        toast.error('Failed to start speech recognition: ' + error.message);
      }
      
      setIsListening(false);
      isListeningRef.current = false;
      return false;
    }
  }, []);

  /**
   * Stop speech recognition
   */
  const stopListening = useCallback(() => {
    console.log('Stopping Whisper speech recognition...');
    
    setIsListening(false);
    setIsProcessing(false);
    isListeningRef.current = false;

    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear refs
    recordingChunksRef.current = [];
    onTranscriptCallback.current = null;
    lastTranscriptRef.current = '';
    setTranscript('');
    
    console.log('Whisper recognition stopped');
  }, []);

  /**
   * Record a single audio chunk and transcribe it
   * Useful for push-to-talk functionality
   */
  const recordAndTranscribe = useCallback(async (duration = 5000, options = {}) => {
    try {
      setIsProcessing(true);
      console.log(`Recording single chunk for ${duration}ms`);

      // Record audio
      const audioBlob = await recordAudio(duration, {
        mimeType: 'audio/webm;codecs=opus'
      });

      // Transcribe with Whisper
      const result = await transcribeAudio(audioBlob, {
        language: options.language,
        prompt: options.prompt,
        temperature: 0.2
      });

      console.log('Single recording transcription result:', result);
      setTranscript(result);

      return result;

    } catch (error) {
      console.error('Record and transcribe error:', error);
      toast.error('Failed to record and transcribe: ' + error.message);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Transcribe an uploaded audio file
   */
  const transcribeFile = useCallback(async (file, options = {}) => {
    try {
      setIsProcessing(true);
      console.log(`Transcribing uploaded file: ${file.name}`);

      const result = await transcribeAudio(file, {
        language: options.language,
        prompt: options.prompt,
        temperature: 0.2
      });

      console.log('File transcription result:', result);
      setTranscript(result);

      return result;

    } catch (error) {
      console.error('File transcription error:', error);
      toast.error('Failed to transcribe file: ' + error.message);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isListening,
    isProcessing,
    transcript,
    startListening,
    stopListening,
    recordAndTranscribe,
    transcribeFile
  };
};

export default useWhisperRecognition;