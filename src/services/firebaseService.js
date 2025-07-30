import { db } from '../firebase/config';
import { collection, addDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

// Create a new session document in Firestore
export const createSessionInFirestore = async (mode) => {
  const sessionData = {
    mode: mode,
    createdAt: new Date(),
    status: 'active'
  };
  const docRef = await addDoc(collection(db, "sessions"), sessionData);
  return docRef.id;
};

// Add a chunk of transcript to the conversation history subcollection
export const addTranscriptChunk = async (sessionId, chunkData) => {
  const sessionDocRef = doc(db, 'sessions', sessionId);
  const historyCollectionRef = collection(sessionDocRef, 'conversationHistory');
  await addDoc(historyCollectionRef, chunkData);
};

// Save the final summary to the session document
export const saveSummaryToFirestore = async (sessionId, summaryData) => {
  const sessionDocRef = doc(db, 'sessions', sessionId);
  await updateDoc(sessionDocRef, {
    summary: summaryData,
    status: 'completed',
    completedAt: new Date()
  });
};

// Mark the summary as confirmed
export const confirmSummaryInFirestore = async (sessionId) => {
  const sessionDocRef = doc(db, 'sessions', sessionId);
  await updateDoc(sessionDocRef, {
    'summary.isConfirmed': true
  });
};