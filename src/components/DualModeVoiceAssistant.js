import React, { useState, useEffect, useRef } from 'react';
import { Mic, Users, Bot, Volume2, FileText, Play, Square, Pause, Settings, ChevronRight, Loader, Clock, User, Sparkles, History, CheckCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createSessionInFirestore, addTranscriptChunk, saveSummaryToFirestore, confirmSummaryInFirestore } from '../services/firebaseService';
import { getGeminiVisionResponse, getGeminiTextResponse } from '../services/geminiService';
import useAudioRecorder from '../hooks/useAudioRecorder';

const DualModeVoiceAssistant = () => {
  // --- STATE MANAGEMENT ---
  const [mode, setMode] = useState(null); // 'ai-partner', 'meeting-recorder'
  const [sessionId, setSessionId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- CONTENT STATE ---
  const [conversation, setConversation] = useState([]);
  const [liveNotes, setLiveNotes] = useState([]);
  const [sessionTime, setSessionTime] = useState(0);
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 1');
  const [speakers, setSpeakers] = useState(['Speaker 1', 'Speaker 2', 'Speaker 3']);
  
  // --- UI STATE ---
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolume] = useState(70);
  const [noteFrequency, setNoteFrequency] = useState(30);
  const [finalSummary, setFinalSummary] = useState(null);
  
  // --- REFS ---
  const synthesisRef = useRef(null);
  const timerRef = useRef(null);
  const noteTimerRef = useRef(null);
  const { isListening, startListening, stopListening, audioBlobs } = useAudioRecorder();

  // --- EFFECTS ---

  // Initialize speech synthesis on component mount
  useEffect(() => {
    synthesisRef.current = window.speechSynthesis;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (noteTimerRef.current) clearInterval(noteTimerRef.current);
    };
  }, []);

  // Transcribe new audio chunks as they become available
  useEffect(() => {
    if (audioBlobs.length > 0 && !isPaused && isActive) {
      transcribeAudio(audioBlobs[audioBlobs.length - 1]);
    }
  }, [audioBlobs, isPaused, isActive]);

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
  }, [isActive, isPaused, noteFrequency, mode]);

  // --- CORE FUNCTIONS ---
  
  const startMode = async (selectedMode) => {
    try {
      const newSessionId = await createSessionInFirestore(selectedMode);
      setSessionId(newSessionId);
      setMode(selectedMode);
      setIsActive(true);
      
      await startListening();
      
      if (selectedMode === 'ai-partner') {
        const greeting = "Hello! I'm ready to have a conversation with you. What's on your mind?";
        const greetingEntry = {
          id: Date.now(), role: 'assistant', content: greeting, timestamp: new Date().toISOString()
        };
        setConversation([greetingEntry]);
        await addTranscriptChunk(newSessionId, greetingEntry);
        await speakResponse(greeting);
      }
      toast.success(`${selectedMode === 'ai-partner' ? 'AI Partner' : 'Meeting Recorder'} session started!`);
    } catch (error) {
      console.error("Error starting mode:", error);
      toast.error("Could not start session. Please check your setup.");
    }
  };

  const transcribeAudio = async (audioBlob) => {
    if (isSpeaking || isProcessing) return;

    setIsProcessing(true);
    try {
      // Pass the audioBlob directly to the service function.
      const transcript = await getGeminiVisionResponse(audioBlob, "Transcribe this audio.");
      
      if (transcript && transcript.trim()) {
        const entry = {
          id: Date.now(),
          role: mode === 'ai-partner' ? 'user' : currentSpeaker,
          content: transcript,
          timestamp: new Date().toISOString()
        };
        setConversation(prev => [...prev, entry]);
        await addTranscriptChunk(sessionId, entry);

        if (mode === 'ai-partner') {
          handleAIConversation(transcript);
        }
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error("Transcription failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIConversation = async (userInput) => {
    setIsProcessing(true);
    await stopListening();

    try {
      const context = conversation.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
      const prompt = `You are having a voice conversation. Be concise, natural, and engaging. Context:\n${context}\n\nUser: ${userInput}\n\nRespond in 1-2 sentences.`;
      const response = await getGeminiTextResponse(prompt);
      
      const aiMessage = {
        id: Date.now() + 1, role: 'assistant', content: response, timestamp: new Date().toISOString()
      };
      setConversation(prev => [...prev, aiMessage]);
      await addTranscriptChunk(sessionId, aiMessage);
      
      await speakResponse(response);
    } catch (error) {
      console.error("AI conversation error:", error);
      toast.error("AI response failed.");
    } finally {
      setIsProcessing(false);
      if (isActive && !isPaused) {
        await startListening();
      }
    }
  };

  const speakResponse = async (text) => {
    return new Promise((resolve) => {
      if (!synthesisRef.current) return resolve();
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = volume / 100;
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      synthesisRef.current.speak(utterance);
    });
  };

  const generateLiveNotes = async () => {
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
  };

  const endSession = async () => {
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
      await startListening();
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
    setMode(null); setIsActive(false); setConversation([]); setLiveNotes([]); setSessionTime(0); setFinalSummary(null); setSessionId(null);
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RENDER FUNCTIONS ---

  const renderSettingsModal = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Settings</h3>
          <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white"><X/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">AI Voice Volume</label>
            <input type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(parseInt(e.target.value))} className="w-full"/>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Auto-note frequency (seconds)</label>
            <select value={noteFrequency} onChange={(e) => setNoteFrequency(parseInt(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2">
              <option value={15}>Every 15 seconds</option><option value={30}>Every 30 seconds</option><option value={60}>Every minute</option><option value={120}>Every 2 minutes</option>
            </select>
          </div>
        </div>
        <button onClick={() => setShowSettings(false)} className="w-full mt-6 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg">Done</button>
      </div>
    </div>
  );

  // --- MAIN RENDER ---

  if (!mode && !finalSummary) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-black text-white flex items-center justify-center p-4">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4">Gemini Voice Assistant</h1>
            <p className="text-xl text-gray-400">Choose your mode</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <button onClick={() => startMode('ai-partner')} className="group relative overflow-hidden bg-gradient-to-br from-purple-900/50 to-purple-600/20 backdrop-blur border border-purple-500/30 rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:border-purple-400">
              <div className="relative z-10 text-center">
                <div className="w-24 h-24 mx-auto mb-6 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-purple-600/30 rounded-full animate-pulse"></div>
                  <Bot className="w-12 h-12 text-purple-300" />
                </div>
                <h2 className="text-2xl font-bold mb-3">AI Voice Partner</h2>
                <p className="text-gray-300 mb-4">Have a natural voice conversation with a Gemini-powered AI.</p>
                <div className="mt-6 flex items-center justify-center gap-2 text-purple-400 font-semibold">
                  <span>Start Talking</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>
            <button onClick={() => startMode('meeting-recorder')} className="group relative overflow-hidden bg-gradient-to-br from-pink-900/50 to-pink-600/20 backdrop-blur border border-pink-500/30 rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:border-pink-400">
              <div className="relative z-10 text-center">
                <div className="w-24 h-24 mx-auto mb-6 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-pink-600/30 rounded-full animate-pulse"></div>
                  <Users className="w-12 h-12 text-pink-300" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Meeting Recorder</h2>
                <p className="text-gray-300 mb-4">Record, transcribe, and summarize conversations with Gemini.</p>
                <div className="mt-6 flex items-center justify-center gap-2 text-pink-400 font-semibold">
                  <span>Start Recording</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="fixed bottom-6 right-6 bg-gray-800 hover:bg-gray-700 p-3 rounded-full transition-colors"><Settings className="w-6 h-6" /></button>
        {showSettings && renderSettingsModal()}
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-900/50 backdrop-blur p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold flex items-center gap-2">
                  {mode === 'ai-partner' ? <><Bot className="w-5 h-5 text-purple-400" /> AI Partner</> : <><Users className="w-5 h-5 text-pink-400" /> Meeting Recorder</>}
                </h1>
                <div className="flex items-center gap-2 text-red-400">
                  <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse" />
                  <span className="font-mono text-lg">{formatTime(sessionTime)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowSettings(true)} className="bg-gray-700 hover:bg-gray-600 p-2 rounded-lg"><Settings className="w-5 h-5"/></button>
                <button onClick={pauseSession} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button onClick={endSession} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2">
                  <Square className="w-4 h-4" /> End
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="mb-8">
              {isProcessing ? <div className="flex items-center gap-3 text-yellow-400"><Loader className="w-6 h-6 animate-spin" /><span className="text-xl">Processing...</span></div> :
               isSpeaking ? <div className="flex items-center gap-3 text-purple-400"><Volume2 className="w-6 h-6 animate-pulse" /><span className="text-xl">AI is speaking...</span></div> :
               isListening ? <div className="flex items-center gap-3 text-green-400"><Mic className="w-6 h-6 animate-pulse" /><span className="text-xl">Listening...</span></div> :
               isPaused ? <div className="flex items-center gap-3 text-gray-400"><Pause className="w-6 h-6" /><span className="text-xl">Paused</span></div> : 
               <div className="flex items-center gap-3 text-gray-500"><Mic className="w-6 h-6" /><span className="text-xl">Ready to start</span></div>}
            </div>
            <div className="max-w-3xl w-full h-64 bg-gray-900 rounded-xl p-6 overflow-y-auto">
              {conversation.length > 0 ? conversation.map(msg => (
                <div key={msg.id} className={`flex mb-3 ${msg.role === 'user' || msg.role?.startsWith('Speaker') ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-5 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-purple-600' : msg.role === 'assistant' ? 'bg-gray-800' : 'bg-pink-600'}`}>
                    <p className="text-sm font-semibold mb-1 opacity-70">{msg.role === 'user' ? 'You' : msg.role || msg.speaker}</p>
                    <p>{msg.content}</p>
                  </div>
                </div>
              )) : <div className="text-gray-500 text-center pt-16">Conversation will appear here...</div>}
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
        <div className="w-full md:w-96 bg-gray-900 border-l border-gray-800 p-6 overflow-y-auto h-screen">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><FileText className="w-5 h-5 text-blue-400" /> Live Notes</h2>
          <div className="mb-4 text-sm text-gray-400">Auto-generated every {noteFrequency} seconds.</div>
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

export default DualModeVoiceAssistant;