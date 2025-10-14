import OpenAI from 'openai';

// Initialize OpenAI client with API key from environment variables
const API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
if (!API_KEY) {
  console.error('REACT_APP_OPENAI_API_KEY is not set in environment variables');
}

const openai = new OpenAI({
  apiKey: API_KEY,
  dangerouslyAllowBrowser: true // Required for browser usage
});

/**
 * Transcribe audio using OpenAI Whisper
 * @param {File|Blob} audioFile - Audio file to transcribe
 * @param {Object} options - Transcription options
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudio = async (audioFile, options = {}) => {
  try {
    const {
      model = 'whisper-1',
      language = null, // Auto-detect if not specified
      prompt = null,
      response_format = 'json',
      temperature = 0.2
    } = options;

    // Ensure we have a valid file
    if (!audioFile || audioFile.size === 0) {
      throw new Error('No audio file provided or file is empty');
    }

    // Check file size (25MB limit)
    if (audioFile.size > 25 * 1024 * 1024) {
      throw new Error('Audio file too large. Maximum size is 25MB.');
    }

    console.log(`Transcribing audio file: ${audioFile.name || 'blob'}, size: ${audioFile.size} bytes`);

    // Build the request object, omitting null values for auto-detection
    const requestOptions = {
      file: audioFile,
      model: model,
      response_format: response_format,
      temperature: temperature
    };
    
    // Only include language if it's not null (for auto-detection)
    if (language) {
      requestOptions.language = language;
    }
    
    // Only include prompt if it's not null
    if (prompt) {
      requestOptions.prompt = prompt;
    }

    const transcription = await openai.audio.transcriptions.create(requestOptions);

    return response_format === 'json' ? transcription.text : transcription;
  } catch (error) {
    console.error('OpenAI Whisper transcription error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
};

/**
 * Transcribe audio with word-level timestamps using detailed response format
 * @param {File|Blob} audioFile - Audio file to transcribe
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} - Detailed transcription with timestamps
 */
export const transcribeAudioWithTimestamps = async (audioFile, options = {}) => {
  try {
    const {
      model = 'whisper-1',
      language = null,
      prompt = null,
      temperature = 0.2
    } = options;

    console.log(`Transcribing audio with timestamps: ${audioFile.name || 'blob'}`);

    // Build the request object, omitting null values for auto-detection
    const requestOptions = {
      file: audioFile,
      model: model,
      response_format: 'verbose_json',
      temperature: temperature,
      timestamp_granularities: ['word']
    };
    
    // Only include language if it's not null (for auto-detection)
    if (language) {
      requestOptions.language = language;
    }
    
    // Only include prompt if it's not null
    if (prompt) {
      requestOptions.prompt = prompt;
    }

    const transcription = await openai.audio.transcriptions.create(requestOptions);

    return transcription;
  } catch (error) {
    console.error('OpenAI Whisper detailed transcription error:', error);
    throw new Error(`Detailed transcription failed: ${error.message}`);
  }
};

/**
 * Generate speech using OpenAI TTS
 * @param {string} text - Text to convert to speech
 * @param {Object} options - TTS options
 * @returns {Promise<Blob>} - Audio blob
 */
export const generateSpeech = async (text, options = {}) => {
  try {
    const {
      model = 'tts-1', // or 'tts-1-hd' for higher quality
      voice = 'alloy', // alloy, echo, fable, onyx, nova, shimmer
      response_format = 'mp3', // mp3, opus, aac, flac, wav, pcm
      speed = 1.0 // 0.25 to 4.0
    } = options;

    // Validate text length (4096 character limit)
    if (text.length > 4096) {
      console.warn('Text exceeds 4096 characters, truncating...');
      text = text.substring(0, 4096);
    }

    console.log(`Generating speech for text: "${text.substring(0, 50)}..." with voice: ${voice}`);

    const mp3 = await openai.audio.speech.create({
      model: model,
      voice: voice,
      input: text,
      response_format: response_format,
      speed: speed
    });

    // Convert response to blob
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const blob = new Blob([buffer], { type: `audio/${response_format}` });

    return blob;
  } catch (error) {
    console.error('OpenAI TTS error:', error);
    throw new Error(`Speech generation failed: ${error.message}`);
  }
};

/**
 * Generate speech and play it immediately
 * @param {string} text - Text to convert to speech
 * @param {Object} options - TTS and playback options
 * @returns {Promise<void>} - Promise that resolves when audio finishes playing
 */
export const speakText = async (text, options = {}) => {
  try {
    const {
      voice = 'alloy',
      model = 'tts-1',
      speed = 1.0,
      volume = 0.7,
      currentAudioRef = null
    } = options;

    const audioBlob = await generateSpeech(text, { voice, model, speed });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.volume = volume;
    
    // Track audio for interruption if ref provided
    if (currentAudioRef) {
      currentAudioRef.current = audio;
    }

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioRef) currentAudioRef.current = null;
        resolve();
      };
      
      audio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioRef) currentAudioRef.current = null;
        reject(new Error('Audio playback failed'));
      };
      
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error('OpenAI speak text error:', error);
    throw error;
  }
};

/**
 * Record audio from microphone for a specified duration
 * @param {number} duration - Recording duration in milliseconds
 * @param {Object} options - Recording options
 * @returns {Promise<Blob>} - Recorded audio blob
 */
export const recordAudio = async (duration = 30000, options = {}) => {
  try {
    const {
      mimeType = 'audio/webm;codecs=opus',
      audioBitsPerSecond = 128000
    } = options;

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      } 
    });

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      audioBitsPerSecond: audioBitsPerSecond
    });

    const audioChunks = [];

    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        console.log(`Recorded audio: ${audioBlob.size} bytes`);
        resolve(audioBlob);
      };

      mediaRecorder.onerror = (event) => {
        stream.getTracks().forEach(track => track.stop());
        reject(new Error(`Recording failed: ${event.error}`));
      };

      // Start recording
      mediaRecorder.start();
      console.log(`Started recording for ${duration}ms`);

      // Stop after specified duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, duration);

      // Also provide manual stop capability
      mediaRecorder.manualStop = () => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      };
    });
  } catch (error) {
    console.error('Audio recording error:', error);
    throw new Error(`Recording failed: ${error.message}`);
  }
};

/**
 * Convert audio file to supported format for Whisper
 * @param {File|Blob} audioFile - Original audio file
 * @param {string} targetFormat - Target format (wav, mp3, etc.)
 * @returns {Promise<Blob>} - Converted audio blob
 */
export const convertAudioFormat = async (audioFile, targetFormat = 'wav') => {
  try {
    // This is a basic conversion using Web Audio API
    // For more complex conversions, you might want to use a library like ffmpeg.js
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convert to WAV format
    if (targetFormat === 'wav') {
      const wav = audioBufferToWav(audioBuffer);
      return new Blob([wav], { type: 'audio/wav' });
    }
    
    // For other formats, return original (might need additional libraries)
    return audioFile;
  } catch (error) {
    console.error('Audio conversion error:', error);
    // Return original file if conversion fails
    return audioFile;
  }
};

/**
 * Convert AudioBuffer to WAV format
 * @param {AudioBuffer} buffer - Audio buffer to convert
 * @returns {ArrayBuffer} - WAV file data
 */
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  let sample;
  let offset = 0;
  let pos = 0;

  // Write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write interleaved data
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) { // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  return arrayBuffer;
}

/**
 * Available OpenAI TTS voices
 */
export const TTS_VOICES = {
  alloy: 'Alloy (Neutral)',
  echo: 'Echo (Male)',
  fable: 'Fable (British Male)', 
  onyx: 'Onyx (Deep Male)',
  nova: 'Nova (Female)',
  shimmer: 'Shimmer (Soft Female)'
};

/**
 * Available Whisper models
 */
export const WHISPER_MODELS = {
  'whisper-1': 'Whisper v1 (General)'
};

const openaiService = {
  transcribeAudio,
  transcribeAudioWithTimestamps,
  generateSpeech,
  speakText,
  recordAudio,
  convertAudioFormat,
  TTS_VOICES,
  WHISPER_MODELS
};

export default openaiService;