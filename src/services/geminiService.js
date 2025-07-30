import { GoogleGenerativeAI } from "@google/generative-ai";

// ⚠️ This must be your actual Gemini API key
const API_KEY = "AIzaSyCyV0JIl_gyqIC12rLxxyWNEz9KAPHwIYY"; 
const genAI = new GoogleGenerativeAI(API_KEY);

// Helper function to convert an audio Blob to a GoogleGenerativeAI.Part object
const fileToGenerativePart = async (audioBlob) => {
  const base64Audio = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
  return {
    inlineData: {
      mimeType: 'audio/webm',
      data: base64Audio,
    },
  };
};

/**
 * Uses gemini-pro-vision for transcription, as it's the correct model
 * in the JS SDK for handling inline multimodal (audio/image) data.
 */
export const getGeminiVisionResponse = async (audioBlob, prompt) => {
  // Use the model explicitly designed for inline multimodal requests in this SDK
  const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  
  const audioPart = await fileToGenerativePart(audioBlob);

  try {
    // This model expects a simple array of the prompt and the data part
    const result = await model.generateContent([prompt, audioPart]);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini Vision API error:", error);
    throw new Error("Failed to get response from Gemini Vision API.");
  }
};

/**
 * Uses a faster, modern Flash model for text-only generation, which is fully supported.
 */
export const getGeminiTextResponse = async (prompt) => {
  // For text, we can use a faster, more modern model without issue.
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini Text API error:", error);
    throw new Error("Failed to get response from Gemini Text API.");
  }
};