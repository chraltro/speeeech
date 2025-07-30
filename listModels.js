// We need the fetch function, which is available in modern Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ⚠️ IMPORTANT: Paste your actual Gemini API key here
const API_KEY = "AIzaSyCyV0JIl_gyqIC12rLxxyWNEz9KAPHwIYY"; 
    

async function getAvailableModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

  console.log("Requesting the model list directly from Google's API...");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // If the response is not successful, print the error details
      const errorBody = await response.text();
      console.error(`API Error: ${response.status} ${response.statusText}`);
      console.error("Error Body:", errorBody);
      return;
    }

    const data = await response.json();
    
    console.log("\n--- Models available to your API key ---");
    if (data.models && data.models.length > 0) {
      data.models.forEach(model => {
        // We only care about models that can be used for generating content
        if (model.supportedGenerationMethods.includes("generateContent")) {
            console.log(`- ${model.name}`);
        }
      });
    } else {
      console.log("No models found.");
    }

  } catch (error) {
    console.error("Failed to execute the request:", error);
  }
}

getAvailableModels();