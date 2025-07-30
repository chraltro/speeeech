import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Users, Bot, Volume2, FileText, Play, Square, Pause, Settings, ChevronRight, Loader, Clock, Sparkles, History, CheckCircle, X, Download, Search, Bookmark, Copy, RotateCcw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createSessionInFirestore, addTranscriptChunk, saveSummaryToFirestore, confirmSummaryInFirestore } from '../services/firebaseService';
import { getGeminiTextResponse, getGeminiTTSResponse } from '../services/geminiService';
import { getFallbackTTS } from '../services/freeTTSService';
import useSpeechRecognition from '../hooks/useSpeechRecognition';

const DualModeVoiceAssistant = () => {
  // --- STATE MANAGEMENT ---
  const [mode, setMode] = useState(null); // 'ai-partner', 'meeting-recorder'
  const [sessionId, setSessionId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  
  // Track if we've already started a session to prevent double initialization
  const sessionStartedRef = useRef(false);
  // Use refs to persist critical state across re-renders
  const modeRef = useRef(null);
  const isActiveRef = useRef(false);
  const sessionIdRef = useRef(null);
  
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Debug state changes - StrictMode safe
  useEffect(() => {
    console.log('STATE CHANGE - mode:', mode, 'isActive:', isActive, 'sessionId:', sessionId);
    if (mode === null && isActive === false && sessionId === null) {
      console.log('Initial state or reset detected');
    }
  }, [mode, isActive, sessionId]);
  
  // --- CONTENT STATE ---
  const [conversation, setConversation] = useState([]);
  const conversationRef = useRef([]);
  const [liveNotes, setLiveNotes] = useState([]);
  const [sessionTime, setSessionTime] = useState(0);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 1');
  const [speakers] = useState(['Speaker 1', 'Speaker 2', 'Speaker 3']);
  
  // --- UI STATE ---
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState(70);
  const [noteFrequency, setNoteFrequency] = useState(30);
  const [preferredVoice, setPreferredVoice] = useState('aria');
  const [finalSummary, setFinalSummary] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [bookmarkedMessages, setBookmarkedMessages] = useState(new Set());
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // --- REFS ---
  const synthesisRef = useRef(null);
  const timerRef = useRef(null);
  const noteTimerRef = useRef(null);
  const currentAudioRef = useRef(null); // Track current playing audio for interruption
  const audioInterruptedRef = useRef(false); // Track if audio was manually interrupted
  const messagesEndRef = useRef(null);
  const { isListening, startListening, stopListening } = useSpeechRecognition();

  // --- EFFECTS ---

  // Initialize speech synthesis on component mount
  useEffect(() => {
    synthesisRef.current = window.speechSynthesis;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (noteTimerRef.current) clearInterval(noteTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            if (isActive) {
              exportConversation();
              toast.success('💾 Conversation exported!');
            }
            break;
          case 'f':
            e.preventDefault();
            if (isActive) {
              setShowSearch(!showSearch);
              toast.success(showSearch ? '🔍 Search closed' : '🔍 Search opened');
            }
            break;
          case 'k':
            e.preventDefault();
            setShowKeyboardHelp(!showKeyboardHelp);
            break;
          case ',':
            e.preventDefault();
            setShowSettings(!showSettings);
            break;
        }
      } else {
        switch (e.key.toLowerCase()) {
          case ' ':
            if (isActive && !showSettings && !showKeyboardHelp) {
              e.preventDefault();
              if (isSpeaking) {
                stopCurrentAudio();
                toast.success('⏹️ AI stopped');
              } else if (!isPaused) {
                pauseSession();
              }
            }
            break;
          case 'escape':
            e.preventDefault();
            if (showSettings) setShowSettings(false);
            else if (showKeyboardHelp) setShowKeyboardHelp(false);
            else if (showSearch) setShowSearch(false);
            else if (isActive && !isSpeaking) {
              endSession();
            }
            break;
          case '?':
            if (!showSettings) {
              e.preventDefault();
              setShowKeyboardHelp(!showKeyboardHelp);
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isActive, isSpeaking, isPaused, showSettings, showKeyboardHelp, showSearch]);

  // Generate live notes from conversation
  const generateLiveNotes = useCallback(async () => {
    const recentContent = conversation.slice(-5).map(m => `${m.role || m.speaker}: ${m.content}`).join('\n');
    if (!recentContent || recentContent.length < 50) return;
    
    try {
      const prompt = `Extract 1-2 key bullet points from this conversation segment. Be extremely concise. Segment:\n\n${recentContent}\n\nReturn as a JSON array of strings: ["point 1", "point 2"]`;
      const response = await getGeminiTextResponse(prompt);
      
      try {
        const notesArray = JSON.parse(response.replace(/```json|```/g, ''));
        const newNotes = notesArray.map(note => ({
          id: Date.now() + Math.random(), content: note, timestamp: new Date().toISOString()
        }));
        setLiveNotes(prev => [...prev, ...newNotes]);
      } catch (parseError) {
        console.error("Error parsing live notes from AI response:", parseError);
      }

    } catch (error) {
      console.error("Error generating live notes:", error);
    }
  }, [conversation]);

  // Stop any current audio playback
  const stopCurrentAudio = () => {
    console.log('🔇 STOPPING ALL AUDIO PLAYBACK');
    console.log('currentAudioRef.current:', currentAudioRef.current);
    console.log('synthesisRef.current:', synthesisRef.current);
    console.log('isSpeaking:', isSpeaking);
    
    // Mark as manually interrupted to prevent fallback TTS
    audioInterruptedRef.current = true;
    
    // Stop Edge TTS audio
    if (currentAudioRef.current) {
      console.log('📻 Stopping Edge TTS audio object:', currentAudioRef.current);
      try {
        console.log('Current audio paused:', currentAudioRef.current.paused);
        console.log('Current audio currentTime:', currentAudioRef.current.currentTime);
        console.log('Current audio duration:', currentAudioRef.current.duration);
        
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = ''; // Clear source
        currentAudioRef.current = null;
        console.log('✅ Edge TTS audio stopped successfully');
      } catch (e) {
        console.log('❌ Error stopping Edge TTS:', e);
      }
    } else {
      console.log('⚠️ No Edge TTS audio to stop');
    }
    
    // Stop browser TTS
    if (synthesisRef.current) {
      console.log('🔊 Stopping browser TTS');
      try {
        synthesisRef.current.cancel();
        console.log('✅ Browser TTS stopped successfully');
      } catch (e) {
        console.log('❌ Error stopping browser TTS:', e);
      }
    } else {
      console.log('⚠️ No browser TTS to stop');
    }
    
    setIsSpeaking(false);
    console.log('✅ setIsSpeaking(false) called - NO FALLBACK TTS - microphone should remain active');
    
    // Ensure microphone stays active
    if (!isListening) {
      console.log('🎤 Restarting microphone after stopping audio');
      startListening(handleTranscription);
    } else {
      console.log('🎤 Microphone is already listening');
    }
  };

  // Handle transcription results from speech recognition
  const handleTranscription = async (transcript) => {
    console.log('handleTranscription called with:', transcript);
    console.log('Current state - isPaused:', isPaused, 'isActive:', isActive, 'mode:', mode, 'isSpeaking:', isSpeaking);
    console.log('Ref state - isActiveRef:', isActiveRef.current, 'modeRef:', modeRef.current, 'sessionIdRef:', sessionIdRef.current);
    
    // Check if this is an interim result for interruption
    const isInterimResult = transcript && transcript.includes('[INTERIM]');
    const cleanTranscript = isInterimResult ? transcript.replace(' [INTERIM]', '') : transcript;
    
    // INTERRUPT AI if it's currently speaking - trigger on interim results for real-time interruption
    if (isSpeaking && cleanTranscript && cleanTranscript.trim().length > 3) {
      console.log('🛑 USER INTERRUPTED AI SPEECH (interim:', isInterimResult, ') - STOPPING AUDIO');
      stopCurrentAudio();
      
      // If this was just an interim result for interruption, don't process the transcript further
      if (isInterimResult) {
        console.log('✋ Interim result processed for interruption only - not adding to conversation');
        return;
      }
    }
    
    // Use refs as fallback for critical state
    const activeState = isActiveRef.current || isActive;
    const modeState = modeRef.current || mode;
    const sessionState = sessionIdRef.current || sessionId;
    
    // Process transcripts normally (only final results, not interim)
    if (cleanTranscript && cleanTranscript.trim() && !isPaused && activeState && !isInterimResult) {
      console.log('Processing transcript:', cleanTranscript);
      const entry = {
        id: Date.now(),
        role: modeState === 'ai-partner' ? 'user' : currentSpeaker,
        content: cleanTranscript,
        timestamp: new Date().toISOString()
      };
      setConversation(prev => {
        const updated = [...prev, entry];
        conversationRef.current = updated;
        return updated;
      });
      await addTranscriptChunk(sessionState, entry);

      if (modeState === 'ai-partner') {
        console.log('Calling handleAIConversation with:', cleanTranscript);
        handleAIConversation(cleanTranscript);
      }
    } else {
      console.log('Transcript not processed - conditions not met, too short, or interim result');
    }
  };

  // Manage the session timer
  useEffect(() => {
    if (isActive && !isPaused) {
      timerRef.current = setInterval(() => setSessionTime(prev => prev + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, isPaused]);

  // Manage the live notes timer
  useEffect(() => {
    if (isActive && !isPaused && mode) {
      noteTimerRef.current = setInterval(() => generateLiveNotes(), noteFrequency * 1000);
    } else {
      clearInterval(noteTimerRef.current);
    }
    return () => clearInterval(noteTimerRef.current);
  }, [isActive, isPaused, noteFrequency, mode, generateLiveNotes]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // --- UTILITY FUNCTIONS ---
  
  const exportConversation = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${mode}-${timestamp}.json`;
    
    const exportData = {
      sessionId,
      mode,
      timestamp: new Date().toISOString(),
      duration: formatTime(sessionTime),
      conversation,
      liveNotes,
      bookmarkedMessages: Array.from(bookmarkedMessages),
      settings: { volume, preferredVoice, noteFrequency }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const copyMessageToClipboard = async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('📋 Copied! You can paste it anywhere now');
    } catch (error) {
      toast.error('❌ Could not copy. Try selecting the text manually.');
    }
  };
  
  const toggleBookmark = (messageId) => {
    setBookmarkedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        toast.success('🔖 Bookmark removed');
      } else {
        newSet.add(messageId);
        toast.success('⭐ Message bookmarked!');
      }
      return newSet;
    });
  };
  
  const getFilteredConversation = () => {
    if (!searchQuery.trim()) return conversation;
    return conversation.filter(msg => 
      msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (msg.role || msg.speaker || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  };
  
  const restartSession = async () => {
    console.log('🔄 Restarting session...');
    setConversation([]);
    conversationRef.current = [];
    setLiveNotes([]);
    setSessionTime(0);
    setBookmarkedMessages(new Set());
    
    // Always restart speech recognition
    try {
      if (isListening) {
        await stopListening();
      }
      
      // Give a moment for cleanup, then restart
      setTimeout(async () => {
        console.log('🎤 Restarting speech recognition after session restart');
        const speechStarted = await startListening(handleTranscription);
        if (speechStarted) {
          toast.success('🎤 Ready! Start talking now!');
        } else {
          toast.error('⚠️ Microphone problem. Try clicking the button again.');
        }
      }, 500);
    } catch (error) {
      console.error('Error restarting session:', error);
      toast.error('Failed to restart session');
    }
  };

  // --- CORE FUNCTIONS ---
  
  const startMode = async (selectedMode) => {
    console.log('startMode called with:', selectedMode);
    
    // Prevent double initialization
    if (sessionStartedRef.current) {
      console.log('Session already started, skipping...');
      return;
    }
    
    sessionStartedRef.current = true;
    
    try {
      console.log('Creating session in Firestore...');
      const newSessionId = await createSessionInFirestore(selectedMode);
      console.log('Session created with ID:', newSessionId);
      
      console.log('Setting sessionId to:', newSessionId);
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      console.log('Setting mode to:', selectedMode);
      setMode(selectedMode);
      modeRef.current = selectedMode;
      console.log('Setting isActive to: true');
      setIsActive(true);
      isActiveRef.current = true;
      console.log('State updated - sessionId:', newSessionId, 'mode:', selectedMode, 'isActive: true');
      
      console.log('Starting speech recognition...');
      // Start listening immediately - and keep it on throughout the session
      setTimeout(async () => {
        const speechStarted = await startListening(handleTranscription);
        console.log('Speech recognition started:', speechStarted);
        if (!speechStarted) {
          console.error('Failed to start speech recognition');
          toast.error('Failed to start speech recognition. Please check microphone permissions.');
        } else {
          console.log('🎤 MICROPHONE IS ACTIVE - WILL STAY ON DURING AI SPEECH');
        }
      }, 1000);
      
      if (selectedMode === 'ai-partner') {
        const greeting = "Hello! I'm ready to have a conversation with you. What's on your mind?";
        const greetingEntry = {
          id: Date.now(), role: 'assistant', content: greeting, timestamp: new Date().toISOString()
        };
        setConversation([greetingEntry]);
        conversationRef.current = [greetingEntry];
        await addTranscriptChunk(newSessionId, greetingEntry);
        console.log('Starting greeting TTS...');
        await speakResponse(greeting);
        console.log('Greeting TTS completed');
      }
      toast.success(`${selectedMode === 'ai-partner' ? 'AI Partner' : 'Meeting Recorder'} session started!`);
      console.log('startMode completed successfully');
    } catch (error) {
      console.error("Error starting mode:", error);
      toast.error("Could not start session. Please check your setup.");
    }
  };


  const handleAIConversation = async (userInput) => {
    console.log('handleAIConversation started with input:', userInput);
    setIsProcessing(true);
    
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const currentConversation = conversationRef.current || conversation;
        const context = currentConversation.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
        const prompt = `You are an AI assistant having a voice conversation. Be BRIEF and conversational - 1-2 sentences max unless the user specifically asks for details, explanations, or help with complex topics. No bullet points or lists unless requested. Keep it natural like talking to a friend. Context:\n${context}\n\nUser: ${userInput}\n\nResponse:`;
        console.log('Sending prompt to Gemini:', prompt);
        
        const response = await getGeminiTextResponse(prompt);
        console.log('Got AI response:', response);
        
        const currentSessionId = sessionIdRef.current || sessionId;
        console.log('Using sessionId for AI message:', currentSessionId);
        
        const aiMessage = {
          id: Date.now() + 1, role: 'assistant', content: response, timestamp: new Date().toISOString()
        };
        setConversation(prev => {
          const updated = [...prev, aiMessage];
          conversationRef.current = updated;
          return updated;
        });
        await addTranscriptChunk(currentSessionId, aiMessage);
        
        console.log('Starting TTS for response:', response);
        await speakResponse(response);
        console.log('TTS completed');
        break; // Success, exit retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`AI conversation error (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          // Final failure - add error message to conversation
          const errorMessage = {
            id: Date.now() + 1, 
            role: 'assistant', 
            content: "I'm having trouble connecting right now. Please try again in a moment.", 
            timestamp: new Date().toISOString()
          };
          setConversation(prev => {
            const updated = [...prev, errorMessage];
            conversationRef.current = updated;
            return updated;
          });
          
          toast.error(`AI response failed after ${maxRetries} attempts. Please check your connection.`);
        } else {
          // Retry with exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          toast(`Retrying AI response... (${retryCount}/${maxRetries})`, { icon: '🔄' });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    setIsProcessing(false);
    console.log('AI conversation completed');
  };

  const speakResponse = async (text) => {
    setIsSpeaking(true);
    audioInterruptedRef.current = false; // Reset interrupt flag for new speech
    // Keep listening active during speech - DO NOT STOP MICROPHONE 
    
    // Strip markdown formatting for TTS
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/`(.*?)`/g, '$1')       // Code
      .replace(/#{1,6}\s?(.*?)$/gm, '$1') // Headers
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
      .replace(/^\s*[-*+]\s/gm, '')    // List bullets
      .replace(/^\s*\d+\.\s/gm, '')    // Numbered lists
      .trim();
    
    try {
      // Use Gemini TTS for high-quality speech
      const audioResponse = await getGeminiTTSResponse(cleanText, "Kore");
      
      // Use the converted WAV blob directly
      const audioUrl = URL.createObjectURL(audioResponse.blob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio; // Track for interruption
      
      audio.volume = volume / 100;
      
      return new Promise((resolve) => {
        audio.onended = () => {
          setIsSpeaking(false);
          currentAudioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          // Don't restart - microphone should stay on
          resolve();
        };
        audio.onerror = (e) => {
          console.error("Audio playback failed, falling back to browser TTS:", e);
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          // Fallback to browser TTS with better voice
          if (synthesisRef.current) {
            const voices = synthesisRef.current.getVoices();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            const preferredVoice = voices.find(voice => 
              voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Apple')
            ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.volume = volume / 100;
            utterance.rate = 0.9;
            utterance.onend = () => { 
              setIsSpeaking(false); 
              // Don't restart - microphone should stay on
              resolve(); 
            };
            synthesisRef.current.speak(utterance);
          } else {
            setIsSpeaking(false);
            resolve();
          }
        };
        audio.play().catch((playError) => {
          console.error("Audio play failed:", playError);
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          // Fallback to browser TTS with better voice
          if (synthesisRef.current) {
            const voices = synthesisRef.current.getVoices();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            const preferredVoice = voices.find(voice => 
              voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Apple')
            ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.volume = volume / 100;
            utterance.rate = 0.9;
            utterance.onend = () => { 
              setIsSpeaking(false); 
              // Don't restart - microphone should stay on
              resolve(); 
            };
            synthesisRef.current.speak(utterance);
          } else {
            setIsSpeaking(false);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error("Gemini TTS failed, trying enhanced fallback TTS:", error);
      
      // Check if audio was manually interrupted - if so, don't fallback
      if (audioInterruptedRef.current) {
        console.log('🛑 Audio was manually interrupted - skipping fallback TTS');
        setIsSpeaking(false);
        currentAudioRef.current = null;
        return;
      }
      
      try {
        // Use comprehensive fallback TTS chain with preferred voice and audio ref
        await getFallbackTTS(cleanText, volume / 100, preferredVoice, currentAudioRef);
        setIsSpeaking(false);
        currentAudioRef.current = null;
        // Don't restart - microphone should stay on
      } catch (fallbackError) {
        console.error("All TTS methods failed:", fallbackError);
        setIsSpeaking(false);
        currentAudioRef.current = null;
        toast.error("Speech synthesis unavailable");
      }
    }
  };

  const endSession = async () => {
    sessionStartedRef.current = false;
    isActiveRef.current = false;
    setIsActive(false);
    await stopListening();
    toast.promise(
      generateFinalSummary(),
       { loading: 'Generating final summary...', success: 'Summary ready!', error: 'Failed to generate summary.' }
    );
  };
  
  const generateFinalSummary = async () => {
    setIsProcessing(true);
    const fullTranscript = conversation.map(m => `${m.role || m.speaker}: ${m.content}`).join('\n');
    
    try {
      const prompt = `Create a comprehensive summary of this ${mode === 'ai-partner' ? 'AI conversation' : 'meeting'}. Content:\n${fullTranscript}\nReturn JSON with: title (string), participants (array), duration (string), keyTopics (array of strings), decisions (array of strings), actionItems (array of {task, owner, priority}), insights (array of strings). For participants, use these names: ${mode === 'meeting-recorder' ? speakers.join(', ') : '["User", "AI Assistant"]'}. Duration is "${formatTime(sessionTime)}". Priority can be 'high', 'medium', or 'low'. If no decisions or action items, return empty arrays. Ensure the output is a single valid JSON object.`;
      const response = await getGeminiTextResponse(prompt);
      
      let summaryData;
      try {
        summaryData = JSON.parse(response.replace(/```json|```/g, ''));
      } catch (parseError) {
        console.error("Error parsing final summary from AI. Using fallback.", parseError);
        throw new Error("Summary generation returned invalid format.");
      }

      const completeSummary = {
        ...summaryData, id: sessionId, mode, notes: liveNotes, conversationHistory: conversation, timestamp: new Date().toISOString(), isConfirmed: false
      };
      
      await saveSummaryToFirestore(sessionId, completeSummary);
      setFinalSummary(completeSummary);

    } catch (error) {
      console.error("Error generating final summary:", error);
      const fallbackSummary = {
        id: sessionId, title: mode === 'ai-partner' ? 'AI Conversation' : 'Meeting Recording', participants: mode === 'ai-partner' ? ['User', 'AI Assistant'] : speakers, duration: formatTime(sessionTime), keyTopics: ['General discussion'], insights: ['Session completed, but AI summary failed.'], notes: liveNotes, conversationHistory: conversation, timestamp: new Date().toISOString(), isConfirmed: false, actionItems: []
      };
      await saveSummaryToFirestore(sessionId, fallbackSummary);
      setFinalSummary(fallbackSummary);
      throw new Error("Summary generation failed."); // for toast
    } finally {
      setIsProcessing(false);
    }
  };
  
  // --- UI HANDLERS ---
  const pauseSession = async () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    if (newPausedState) {
      await stopListening();
      toast("Session paused.");
    } else {
      await startListening(handleTranscription);
      toast("Session resumed.");
    }
  };

  const handleConfirmSummary = async () => {
    try {
      await confirmSummaryInFirestore(sessionId);
      setFinalSummary(prev => ({ ...prev, isConfirmed: true }));
      toast.success("Summary confirmed!");
    } catch (error) {
      console.error("Error confirming summary:", error);
      toast.error("Could not confirm summary.");
    }
  };

  const resetApp = () => {
    sessionStartedRef.current = false;
    modeRef.current = null;
    isActiveRef.current = false;
    sessionIdRef.current = null;
    conversationRef.current = [];
    setMode(null); setIsActive(false); setConversation([]); setLiveNotes([]); setSessionTime(0); setFinalSummary(null); setSessionId(null);
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RENDER FUNCTIONS ---
  
  const renderKeyboardHelp = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full border border-gray-700 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Keyboard Shortcuts
          </h3>
          <button onClick={() => setShowKeyboardHelp(false)} className="text-gray-400 hover:text-white">
            <X/>
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-semibold text-purple-400 mb-3">General</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Show this help</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">?</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Settings</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Ctrl + ,</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Close modal</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Esc</kbd>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-green-400 mb-3">During Session</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Pause/Stop AI</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Space</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Export conversation</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Ctrl + S</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Search messages</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Ctrl + F</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">End session</span>
                <kbd className="bg-gray-700 px-2 py-1 rounded text-xs">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
          <h4 className="text-blue-400 font-semibold mb-2">💡 Pro Tips</h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Hover over messages to see action buttons</li>
            <li>• Use search to quickly find specific topics</li>
            <li>• Bookmark important messages for easy access</li>
            <li>• Export conversations to save your sessions</li>
          </ul>
        </div>
        <button 
          onClick={() => setShowKeyboardHelp(false)} 
          className="w-full mt-6 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg"
        >
          Got it!
        </button>
      </div>
    </div>
  );

  const renderSettingsModal = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full border border-emerald-500/20 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-light tracking-wide">Settings</h3>
          <button 
            onClick={() => setShowSettings(false)} 
            className="w-8 h-8 rounded-full bg-gray-700/50 hover:bg-gray-600/50 transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 space-y-3">
          <button 
            onClick={() => { restartSession(); setShowSettings(false); }} 
            className="w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all duration-300 flex items-center justify-center gap-3 text-emerald-400 font-light"
          >
            <RotateCcw className="w-5 h-5" />
            <span>New conversation</span>
          </button>
          <button 
            onClick={() => { exportConversation(); setShowSettings(false); }} 
            className="w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all duration-300 flex items-center justify-center gap-3 text-blue-400 font-light"
          >
            <Download className="w-5 h-5" />
            <span>Export conversation</span>
          </button>
          <button 
            onClick={() => { setShowSearch(!showSearch); setShowSettings(false); }} 
            className="w-full p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 hover:border-violet-500/30 transition-all duration-300 flex items-center justify-center gap-3 text-violet-400 font-light"
          >
            <Search className="w-5 h-5" />
            <span>Search messages</span>
          </button>
        </div>

        {/* Voice Settings */}
        <div className="space-y-6">
          <div>
            <label className="text-lg font-light mb-4 block text-gray-300">Volume</label>
            <div className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700/50">
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={volume} 
                onChange={(e) => setVolume(parseInt(e.target.value))} 
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="text-center text-lg font-light mt-3 text-emerald-400">{volume}%</div>
            </div>
          </div>
          
          <div>
            <label className="text-lg font-light mb-4 block text-gray-300">Voice</label>
            <select 
              value={preferredVoice} 
              onChange={(e) => setPreferredVoice(e.target.value)} 
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-2xl px-4 py-4 text-white font-light focus:border-emerald-500/50 focus:outline-none transition-colors"
            >
              <option value="aria">Aria</option>
              <option value="jenny">Jenny</option>
              <option value="guy">Guy</option>
              <option value="davis">Davis</option>
              <option value="jane">Jane</option>
              <option value="jason">Jason</option>
              <option value="sara">Sara</option>
              <option value="nancy">Nancy</option>
            </select>
          </div>
        </div>
        
        <button 
          onClick={() => setShowSettings(false)} 
          className="w-full mt-8 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 hover:border-emerald-500/50 py-4 rounded-2xl text-emerald-400 font-light transition-all duration-300"
        >
          Done
        </button>
      </div>
    </div>
  );

  // --- MAIN RENDER ---

  if (!mode && !finalSummary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white overflow-hidden relative">
        {/* Ambient Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-24">
              {/* Logo/Icon */}
              <div className="relative mb-16">
                <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-emerald-400/15 via-teal-400/15 to-cyan-400/15 backdrop-blur-xl border border-emerald-400/20 flex items-center justify-center shadow-2xl">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 flex items-center justify-center shadow-lg">
                    <Mic className="w-10 h-10 text-white/90" />
                  </div>
                </div>
              </div>
              
              {/* Brand Name */}
              <h1 className="text-7xl md:text-8xl font-medium tracking-wider mb-6">
                <span className="bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
                  Speeeech
                </span>
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wide opacity-70">
                Conversations that flow naturally
              </p>
            </div>
            
            {/* Main Action */}
            <div className="text-center mb-20">
              <button 
                onClick={() => startMode('ai-partner')} 
                className="group relative bg-gradient-to-r from-emerald-400/10 via-teal-400/10 to-cyan-400/10 backdrop-blur-xl border border-emerald-400/25 rounded-2xl px-12 py-6 hover:from-emerald-400/20 hover:via-teal-400/20 hover:to-cyan-400/20 hover:border-emerald-400/40 transition-all duration-500 hover:scale-105 shadow-xl hover:shadow-emerald-500/20"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-teal-400/5 to-cyan-400/0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative flex items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md">
                    <Mic className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-2xl font-light tracking-wide">Begin</span>
                </div>
              </button>
            </div>

            {/* Subtle Instructions */}
            <div className="text-center space-y-6 text-gray-400 text-base font-light">
              <p className="tracking-wide">Click to start • Speak when ready • Listen to respond</p>
              <details className="group cursor-pointer">
                <summary className="list-none hover:text-emerald-400 transition-colors duration-300">
                  <span className="border-b border-dotted border-gray-600 hover:border-emerald-500 transition-colors duration-300">Advanced options</span>
                </summary>
                <div className="mt-6 pt-6 border-t border-gray-800">
                  <button 
                    onClick={() => startMode('meeting-recorder')} 
                    className="text-gray-400 hover:text-emerald-400 transition-colors duration-300 border-b border-dotted border-gray-600 hover:border-emerald-500"
                  >
                    Meeting recorder
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
        
        {/* Settings Button */}
        <button 
          onClick={() => setShowSettings(true)} 
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-emerald-500/10 backdrop-blur-sm border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 flex items-center justify-center group shadow-lg"
          title="Settings"
        >
          <Settings className="w-6 h-6 text-gray-400 group-hover:text-emerald-400 transition-colors duration-300" />
        </button>
        {showSettings && renderSettingsModal()}
        {showKeyboardHelp && renderKeyboardHelp()}
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white flex flex-col lg:flex-row overflow-hidden relative">
        {/* Ambient Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/3 right-1/3 w-72 h-72 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        
        <div className="relative z-10 flex-1 flex flex-col">
          {/* Elegant Header */}
          <div className="bg-black/20 backdrop-blur-xl border-b border-emerald-500/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-400 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-xl font-extralight tracking-widest">Speeeech</h1>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="font-mono text-sm text-emerald-400">{formatTime(sessionTime)}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {isSpeaking && (
                  <button 
                    onClick={() => {
                      console.log('🛑 STOP AI BUTTON CLICKED');
                      stopCurrentAudio();
                    }} 
                    className="w-9 h-9 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30 hover:border-orange-500/50 transition-all duration-300 flex items-center justify-center animate-pulse"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                )}
                
                <button 
                  onClick={pauseSession} 
                  className={`w-9 h-9 rounded-full border transition-all duration-300 flex items-center justify-center ${
                    isPaused 
                      ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/50' 
                      : 'bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30 hover:border-amber-500/50'
                  }`}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>

                <button 
                  onClick={() => setShowSettings(true)} 
                  className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 flex items-center justify-center group"
                >
                  <Settings className="w-4 h-4 text-gray-400 group-hover:text-emerald-400 transition-colors" />
                </button>

                <button 
                  onClick={endSession} 
                  className="w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:border-red-500/50 transition-all duration-300 flex items-center justify-center"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-8">
            {/* Elegant Status Indicator */}
            <div className="mb-8 text-center">
              {isProcessing ? (
                <div className="relative">
                  <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 via-yellow-500/20 to-orange-500/20 backdrop-blur-sm border border-amber-500/30 flex items-center justify-center mb-6 shadow-2xl">
                    <Loader className="w-12 h-12 text-amber-400 animate-spin" />
                  </div>
                  <div className="text-2xl font-extralight text-amber-400 mb-2 tracking-wide">Thinking</div>
                  <div className="text-sm text-gray-400 font-light">Processing your message</div>
                </div>
              ) : isSpeaking ? (
                <div className="relative">
                  <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-violet-500/20 via-purple-500/20 to-indigo-500/20 backdrop-blur-sm border border-violet-500/30 flex items-center justify-center mb-6 shadow-2xl">
                    <Volume2 className="w-12 h-12 text-violet-400 animate-pulse" />
                  </div>
                  <div className="text-2xl font-extralight text-violet-400 mb-2 tracking-wide">Speaking</div>
                  <div className="text-sm text-gray-400 font-light">Listen to the response</div>
                </div>
              ) : isListening ? (
                <div className="relative">
                  <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 backdrop-blur-sm border border-emerald-500/30 flex items-center justify-center mb-6 animate-pulse shadow-2xl">
                    <Mic className="w-12 h-12 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-extralight text-emerald-400 mb-2 tracking-wide">Listening</div>
                  <div className="text-sm text-gray-400 font-light">Start speaking when ready</div>
                </div>
              ) : isPaused ? (
                <div className="relative">
                  <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-gray-500/20 to-gray-600/20 backdrop-blur-sm border border-gray-500/30 flex items-center justify-center mb-6 shadow-2xl">
                    <Pause className="w-12 h-12 text-gray-400" />
                  </div>
                  <div className="text-2xl font-extralight text-gray-400 mb-2 tracking-wide">Paused</div>
                  <div className="text-sm text-gray-400 font-light">Click Resume to continue</div>
                </div>
              ) : (
                <div className="relative">
                  <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-gray-500/20 to-gray-600/20 backdrop-blur-sm border border-gray-500/30 flex items-center justify-center mb-6 shadow-2xl">
                    <Mic className="w-12 h-12 text-gray-400" />
                  </div>
                  <div className="text-2xl font-extralight text-gray-400 mb-2 tracking-wide">Initializing</div>
                  <div className="text-sm text-gray-400 font-light">Getting ready</div>
                </div>
              )}
            </div>
            
            {/* Search Bar */}
            {showSearch && (
              <div className="max-w-4xl w-full mb-4">
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="mt-2 text-sm text-gray-400">
                    Found {getFilteredConversation().length} of {conversation.length} messages
                  </div>
                )}
              </div>
            )}
            
            <div className="max-w-4xl w-full h-[60vh] bg-gray-900 rounded-xl p-4 md:p-6 overflow-y-auto markdown-container">
              {conversation.length > 0 ? getFilteredConversation().map(msg => (
                <div key={msg.id} className={`group flex mb-2 ${msg.role === 'user' || msg.role?.startsWith('Speaker') ? 'justify-end' : 'justify-start'}`}>
                  <div className="relative flex items-center gap-2 max-w-[65%]">
                    {/* Copy button - left side for AI, right side for user */}
                    {msg.role !== 'user' && (
                      <button
                        onClick={() => copyMessageToClipboard(msg.content)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-500 hover:text-emerald-400 transition-all font-mono px-1"
                        title="Copy"
                      >
                        copy
                      </button>
                    )}
                    
                    {/* Message bubble */}
                    <div className={`relative px-3 py-2 rounded-2xl transition-all duration-200 ${
                      msg.role === 'user' 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                        : 'bg-gray-800 hover:bg-gray-700 text-white'
                    }`}>
                      
                      {/* Message Content */}
                      <div className="text-sm leading-relaxed">
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                      
                      {/* Timestamp on hover */}
                      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 font-mono whitespace-nowrap">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    
                    {/* Copy button - right side for user */}
                    {msg.role === 'user' && (
                      <button
                        onClick={() => copyMessageToClipboard(msg.content)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-500 hover:text-emerald-400 transition-all font-mono px-1"
                        title="Copy"
                      >
                        copy
                      </button>
                    )}
                  </div>
                </div>
              )) : <div className="text-gray-500 text-center pt-16">
                <div className="mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                    <div className="text-3xl opacity-50">★</div>
                  </div>
                  <p className="text-2xl font-bold mb-2">Your conversation will appear here</p>
                  <p className="text-lg text-gray-400">Start talking when you see the green "Listening" message above</p>
                </div>
              </div>}
              
              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
              {mode === 'meeting-recorder' && (
                <div className="sticky bottom-0 bg-gray-900 pt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-400">Current speaker:</span>
                  <select value={currentSpeaker} onChange={(e) => setCurrentSpeaker(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm">
                    {speakers.map(speaker => <option key={speaker} value={speaker}>{speaker}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="w-full lg:w-96 bg-gray-900 border-l border-gray-800 p-3 md:p-6 overflow-y-auto h-screen lg:h-auto max-h-[40vh] lg:max-h-none">
          <h2 className="text-lg md:text-xl font-bold mb-4 md:mb-6 flex items-center gap-2"><FileText className="w-4 h-4 md:w-5 md:h-5 text-blue-400" /> Live Notes</h2>
          <div className="mb-3 md:mb-4 text-xs md:text-sm text-gray-400">Auto-generated every {noteFrequency} seconds.</div>
          {liveNotes.length === 0 ? (
            <div className="text-center text-gray-500 mt-12"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Notes will appear here...</p></div>
          ) : (
            <div className="space-y-3">
              {liveNotes.map(note => (
                <div key={note.id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-blue-500">
                  <p className="text-sm">{note.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {showSettings && renderSettingsModal()}
        {showKeyboardHelp && renderKeyboardHelp()}
      </div>
    );
  }

  if (finalSummary) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="max-w-6xl w-full bg-gray-900 rounded-2xl p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">{finalSummary.title}</h2>
                <div className="flex items-center gap-4 text-gray-400">
                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {finalSummary.duration}</span>
                  <span className="flex items-center gap-1">{finalSummary.mode === 'ai-partner' ? <Bot className="w-4 h-4" /> : <Users className="w-4 h-4" />} {finalSummary.mode === 'ai-partner' ? 'AI Conversation' : 'Meeting'}</span>
                </div>
              </div>
            </div>
             <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-3">Key Topics</h3>
                <ul className="space-y-2 list-disc list-inside">
                  {finalSummary.keyTopics.map((topic, i) => <li key={i} className="bg-gray-800 rounded-lg p-3">{topic}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-3">Key Insights</h3>
                <ul className="space-y-2">
                  {finalSummary.insights.map((insight, i) => <li key={i} className="flex gap-2"><Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" /><span>{insight}</span></li>)}
                </ul>
              </div>
            </div>
            {finalSummary.actionItems && finalSummary.actionItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-orange-400 mb-3">Action Items</h3>
                <div className="space-y-2">
                  {finalSummary.actionItems.map((item, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{item.task}</p>
                          <p className="text-sm text-gray-400 mt-1">Owner: {item.owner || 'Unassigned'}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                          item.priority === 'high' ? 'bg-red-900 text-red-300' :
                          item.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {item.priority || 'Normal'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-4 mt-8">
              <button onClick={resetApp} className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded-lg font-semibold">New Session</button>
              <button onClick={handleConfirmSummary} disabled={finalSummary.isConfirmed} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
                {finalSummary.isConfirmed ? <><CheckCircle/> Confirmed</> : 'Agree to Summary'}
              </button>
            </div>
          </div>
          <div className="md:col-span-1 bg-gray-800 rounded-lg p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><History className="w-5 h-5" /> Version History</h3>
            <div className="space-y-4">
              {finalSummary.conversationHistory.map(entry => (
                <div key={entry.id} className="border-b border-gray-700 pb-2">
                  <p className={`font-semibold text-sm ${entry.role === 'user' ? 'text-purple-400' : entry.role === 'assistant' ? 'text-gray-300' : 'text-pink-400'}`}>{entry.role || entry.speaker}</p>
                  <p className="text-xs text-gray-500 mb-1">{new Date(entry.timestamp).toLocaleTimeString()}</p>
                  <p className="text-sm">{entry.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Voice Assistant Error:', error, errorInfo);
    toast.error('An unexpected error occurred. The app will recover automatically.');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-900 rounded-2xl p-8 text-center border border-red-500/30">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-600/20 rounded-full flex items-center justify-center">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-4 text-red-400">Something went wrong</h2>
            <p className="text-gray-400 mb-6">
              The voice assistant encountered an error, but don't worry - we can recover from this.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-semibold"
              >
                Restart App
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded-lg"
              >
                Try Again
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-sm text-gray-500 cursor-pointer">Technical Details</summary>
                <pre className="text-xs text-red-400 mt-2 bg-gray-800 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Enhanced component with error boundary
const EnhancedDualModeVoiceAssistant = () => (
  <ErrorBoundary>
    <DualModeVoiceAssistant />
  </ErrorBoundary>
);

export default EnhancedDualModeVoiceAssistant;
