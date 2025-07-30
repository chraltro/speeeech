// Free TTS alternatives for when Gemini limits are reached

/**
 * Web Speech API with enhanced voice selection
 */
export const getEnhancedBrowserTTS = async (text, volume = 0.7, rate = 0.9) => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      return reject(new Error('Speech synthesis not supported'));
    }

    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    
    // Wait for voices to load if they haven't yet
    if (voices.length === 0) {
      synth.onvoiceschanged = () => {
        const loadedVoices = synth.getVoices();
        speakWithVoice(loadedVoices);
      };
    } else {
      speakWithVoice(voices);
    }

    function speakWithVoice(availableVoices) {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Priority order for voice selection
      const voicePriority = [
        // High quality commercial voices
        v => v.name.includes('Google') && v.lang.startsWith('en'),
        v => v.name.includes('Microsoft') && v.lang.startsWith('en'),
        v => v.name.includes('Apple') && v.lang.startsWith('en'),
        // Premium/Natural voices
        v => (v.name.includes('Natural') || v.name.includes('Premium')) && v.lang.startsWith('en'),
        // Neural voices
        v => v.name.includes('Neural') && v.lang.startsWith('en'),
        // Any English voice
        v => v.lang.startsWith('en-US'),
        v => v.lang.startsWith('en'),
        // Fallback to first available
        v => true
      ];

      let selectedVoice = null;
      for (const criteria of voicePriority) {
        selectedVoice = availableVoices.find(criteria);
        if (selectedVoice) break;
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('Using enhanced voice:', selectedVoice.name, selectedVoice.lang);
      }

      utterance.volume = volume;
      utterance.rate = rate;
      utterance.pitch = 1.0;

      utterance.onend = () => resolve(selectedVoice?.name || 'Default');
      utterance.onerror = (e) => reject(new Error(`Speech synthesis error: ${e.error}`));

      synth.speak(utterance);
    }
  });
};

/**
 * Free TTS using ResponsiveVoice (requires internet)
 * Note: This is a free service with usage limits
 */
export const getResponsiveVoiceTTS = async (text, voiceName = 'US English Female') => {
  return new Promise((resolve, reject) => {
    // Check if ResponsiveVoice is available
    if (typeof window.responsiveVoice === 'undefined') {
      // Load ResponsiveVoice dynamically
      const script = document.createElement('script');
      script.src = 'https://code.responsivevoice.org/responsivevoice.js?key=FREE';
      script.onload = () => {
        speakWithResponsiveVoice();
      };
      script.onerror = () => reject(new Error('Failed to load ResponsiveVoice'));
      document.head.appendChild(script);
    } else {
      speakWithResponsiveVoice();
    }

    function speakWithResponsiveVoice() {
      window.responsiveVoice.speak(text, voiceName, {
        onend: () => resolve('ResponsiveVoice'),
        onerror: (e) => reject(new Error('ResponsiveVoice error: ' + e))
      });
    }
  });
};

/**
 * High-quality Edge TTS using local Python server
 * Provides Microsoft's neural voices for free
 */
export const getEdgeTTSViaProxy = async (text, voice = 'aria', rate = '+30%') => {
  const serverUrl = 'http://localhost:8000/tts';
  
  try {
    console.log(`Attempting Edge TTS with voice: ${voice}`);
    
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({ 
        text: text.substring(0, 5000), // Limit text length
        voice, 
        rate,
        pitch: '+0Hz'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge TTS server error: ${response.status} - ${errorText}`);
    }
    
    const audioBlob = await response.blob();
    console.log('Edge TTS success, audio size:', audioBlob.size, 'bytes');
    
    return {
      blob: audioBlob,
      mimeType: 'audio/mpeg'
    };
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error('Edge TTS server not running. Start it with: cd tts-server && python server.py');
    }
    throw new Error('Edge TTS failed: ' + error.message);
  }
};

/**
 * Get high-quality Edge TTS with audio playback
 */
export const getEdgeTTSWithPlayback = async (text, voice = 'aria', volume = 0.7, currentAudioRef = null) => {
  const audioResponse = await getEdgeTTSViaProxy(text, voice, '+30%'); // 30% faster
  const audioUrl = URL.createObjectURL(audioResponse.blob);
  const audio = new Audio(audioUrl);
  audio.volume = volume;
  
  // Track audio for interruption if ref provided
  if (currentAudioRef) {
    currentAudioRef.current = audio;
    console.log('🔊 Audio tracked in ref for interruption capability');
  }
  
  return new Promise((resolve, reject) => {
    audio.onended = () => {
      console.log('🔚 Edge TTS audio ended naturally');
      URL.revokeObjectURL(audioUrl);
      if (currentAudioRef) currentAudioRef.current = null;
      resolve('Edge TTS');
    };
    
    audio.onerror = (e) => {
      console.log('❌ Edge TTS audio error:', e);
      URL.revokeObjectURL(audioUrl);
      if (currentAudioRef) currentAudioRef.current = null;
      // Don't reject if this was intentionally stopped (paused)
      if (audio.paused && audio.currentTime === 0) {
        console.log('Audio was intentionally stopped - not an error');
        resolve('Edge TTS - Stopped');
      } else {
        reject(new Error('Audio playback failed'));
      }
    };
    
    console.log('▶️ Starting Edge TTS audio playback');
    audio.play().catch(reject);
  });
};

/**
 * Comprehensive TTS fallback chain with Edge TTS priority
 */
export const getFallbackTTS = async (text, volume = 0.7, preferredVoice = 'aria', currentAudioRef = null) => {
  const fallbackChain = [
    // Try Edge TTS first (highest quality)
    () => getEdgeTTSWithPlayback(text, preferredVoice, volume, currentAudioRef),
    
    // Try enhanced browser TTS
    () => getEnhancedBrowserTTS(text, volume, 0.9),
    
    // Try ResponsiveVoice if available
    () => getResponsiveVoiceTTS(text, 'US English Female'),
    
    // Final fallback to basic browser TTS
    () => new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        return reject(new Error('No TTS available'));
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = volume;
      utterance.onend = () => resolve('Basic Browser TTS');
      utterance.onerror = (e) => reject(e);
      window.speechSynthesis.speak(utterance);
    })
  ];

  for (let i = 0; i < fallbackChain.length; i++) {
    try {
      const result = await fallbackChain[i]();
      console.log(`TTS fallback ${i + 1} succeeded:`, result);
      return result;
    } catch (error) {
      console.log(`TTS fallback ${i + 1} failed:`, error.message);
      if (i === fallbackChain.length - 1) {
        throw new Error('All TTS fallbacks failed');
      }
    }
  }
};