import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ⚠️ IMPORTANT: Replace with your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAq7iAR5htE61VVknrltEbiWyq5fpfGSnc",
    authDomain: "speeeech-1ef0c.firebaseapp.com",
    projectId: "speeeech-1ef0c",
    storageBucket: "speeeech-1ef0c.firebasestorage.app",
    messagingSenderId: "286810112243",
    appId: "1:286810112243:web:c68fc6b82c65208862f786"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);