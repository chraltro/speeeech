import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY; 
if (!API_KEY) {
  console.error('REACT_APP_GEMINI_API_KEY is not set in environment variables');
}
const genAI = new GoogleGenerativeAI(API_KEY);
const newGenAI = new GoogleGenAI({ apiKey: API_KEY });

// Note: Audio transcription functions removed - now using Web Speech API for speech recognition

/**
 * Uses gemini-2.5-flash for text-only generation - latest and fastest model
 */
export const getGeminiTextResponse = async (prompt) => {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini Text API error:", error);
    throw new Error("Failed to get response from Gemini Text API.");
  }
};

/**
 * Convert PCM audio data to WAV format for browser playback
 */
const pcmToWav = (pcmData, sampleRate = 24000, channels = 1, bitsPerSample = 16) => {
  const length = pcmData.length;
  const arrayBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true);
  view.setUint16(32, channels * bitsPerSample / 8, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // PCM data
  for (let i = 0; i < length; i++) {
    view.setInt16(44 + i * 2, pcmData[i], true);
  }
  
  return arrayBuffer;
};

/**
 * Uses Gemini 2.5 Flash TTS for high-quality speech generation with voice selection
 * Falls back to Gemini 2.5 Pro TTS if Flash quota is exceeded
 */
export const getGeminiTTSResponse = async (text, voiceName = "Kore") => {
  // Try Gemini 2.5 Flash TTS first
  try {
    const response = await newGenAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    // Extract audio data from response
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!data) {
      throw new Error("No audio data found in TTS response");
    }

    // Convert base64 PCM to binary
    const pcmBinary = atob(data);
    const pcmArray = new Int16Array(pcmBinary.length / 2);
    for (let i = 0; i < pcmArray.length; i++) {
      pcmArray[i] = (pcmBinary.charCodeAt(i * 2 + 1) << 8) | pcmBinary.charCodeAt(i * 2);
    }

    // Convert PCM to WAV
    const wavBuffer = pcmToWav(pcmArray);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    
    return {
      blob: wavBlob,
      mimeType: 'audio/wav'
    };
  } catch (error) {
    console.error("Gemini 2.5 Flash TTS error:", error);
    
    // If quota exceeded or rate limited, try Gemini 2.5 Pro TTS
    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED') || 
        error.message?.includes('429') || error.message?.includes('rate')) {
      console.log("Flash TTS quota exceeded, trying Gemini 2.5 Pro TTS...");
      
      try {
        const proResponse = await newGenAI.models.generateContent({
          model: "gemini-2.5-pro-preview-tts",
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            }
          }
        });

        const proData = proResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (!proData) {
          throw new Error("No audio data found in Pro TTS response");
        }

        // Convert base64 PCM to binary
        const proPcmBinary = atob(proData);
        const proPcmArray = new Int16Array(proPcmBinary.length / 2);
        for (let i = 0; i < proPcmArray.length; i++) {
          proPcmArray[i] = (proPcmBinary.charCodeAt(i * 2 + 1) << 8) | proPcmBinary.charCodeAt(i * 2);
        }

        // Convert PCM to WAV
        const proWavBuffer = pcmToWav(proPcmArray);
        const proWavBlob = new Blob([proWavBuffer], { type: 'audio/wav' });
        
        return {
          blob: proWavBlob,
          mimeType: 'audio/wav'
        };
      } catch (proError) {
        console.error("Gemini 2.5 Pro TTS fallback also failed:", proError);
        throw new Error("Failed to get TTS response from Gemini API.");
      }
    }
    
    throw new Error("Failed to get TTS response from Gemini API.");
  }
};