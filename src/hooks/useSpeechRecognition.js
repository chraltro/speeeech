import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
  const onTranscriptCallback = useRef(null);
  const isListeningRef = useRef(false);
  const lastInterimRef = useRef('');
  const lastFinalTranscriptRef = useRef('');
  const interimTimeoutRef = useRef(null);

  const startListening = useCallback(async (onTranscript) => {
    console.log('Starting speech recognition...');
    
    // Check if Web Speech API is supported
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('Speech recognition not supported');
      toast.error('Speech recognition not supported in this browser');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    console.log('SpeechRecognition available:', !!SpeechRecognition);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    onTranscriptCallback.current = onTranscript;
    lastFinalTranscriptRef.current = '';

    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    // Try to keep recognition going longer
    if ('webkitSpeechRecognition' in window) {
      // WebKit specific settings
      recognition.grammars = new window.webkitSpeechGrammarList();
    }

    // Add audio event listeners for debugging
    recognition.onaudiostart = () => {
      console.log('Audio capture started');
    };
    
    recognition.onsoundstart = () => {
      console.log('Sound detected');
    };
    
    recognition.onspeechstart = () => {
      console.log('Speech detected');
    };
    
    recognition.onspeechend = () => {
      console.log('Speech ended');
    };
    
    recognition.onsoundend = () => {
      console.log('Sound ended');
    };
    
    recognition.onaudioend = () => {
      console.log('Audio capture ended');
    };

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      console.log('Speech recognition started successfully');
      toast.success('Microphone is listening...');
    };

    recognition.onresult = (event) => {
      console.log('Speech recognition result:', event);
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        console.log(`Result ${i}: "${transcript}" (final: ${event.results[i].isFinal})`);
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
          // Clear any pending interim timeout since we got a final result
          if (interimTimeoutRef.current) {
            clearTimeout(interimTimeoutRef.current);
            interimTimeoutRef.current = null;
          }
        } else {
          interimTranscript += transcript;
          lastInterimRef.current = interimTranscript;
          
          // TRIGGER INTERRUPTION on interim results if AI is speaking
          if (interimTranscript.length > 5 && onTranscriptCallback.current) {
            onTranscriptCallback.current(interimTranscript + " [INTERIM]");
          }
          
          // Set timeout to process interim as final if no final result comes
          if (interimTimeoutRef.current) {
            clearTimeout(interimTimeoutRef.current);
          }
          interimTimeoutRef.current = setTimeout(() => {
            const lastInterim = lastInterimRef.current;
            if (lastInterim && lastInterim.trim().length > 0 && onTranscriptCallback.current) {
              console.log('⏰ Processing interim as final (timeout):', lastInterim);
              if (lastInterim !== lastFinalTranscriptRef.current) {
                setTranscript(lastInterim);
                onTranscriptCallback.current(lastInterim);
                lastFinalTranscriptRef.current = lastInterim;
              }
              lastInterimRef.current = '';
            }
          }, 1500); // Wait 1.5 seconds for final result
        }
      }

      setInterimTranscript(interimTranscript);

      // Process final transcripts immediately
      if (finalTranscript && finalTranscript.trim().length > 0) {
        console.log('✅ Final transcript:', finalTranscript);
        lastInterimRef.current = ''; // Clear interim
        if (finalTranscript !== lastFinalTranscriptRef.current) {
          setTranscript(finalTranscript);
          lastFinalTranscriptRef.current = finalTranscript;
          if (onTranscriptCallback.current) {
            onTranscriptCallback.current(finalTranscript);
          }
        } else {
          console.log('Duplicate final transcript ignored');
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error, event);
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing to listen...');
        // This is normal - just keep listening. The onend handler will restart it.
        // No need to show any error or stop anything.
      } else if (event.error === 'aborted') {
        console.log('Speech recognition aborted - this is normal during restarts');
        // This happens during normal operation, don't treat as error
      } else if (event.error === 'network') {
        console.warn('Network error during speech recognition, will retry...');
        // Don't show user error for network issues, just retry
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone permission denied. Please allow microphone access.');
        setIsListening(false);
        isListeningRef.current = false;
      } else if (event.error === 'audio-capture') {
        toast.error('Microphone not found or not working. Please check your microphone.');
        setIsListening(false);
        isListeningRef.current = false;
      } else {
        console.log(`Speech recognition error: ${event.error} - will restart automatically`);
        // Don't show toast for minor errors, just log them and let it restart
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended, isListening:', isListeningRef.current);
      if (isListeningRef.current) {
        // Auto-restart recognition to keep it continuous
        setTimeout(() => {
          if (isListeningRef.current) {
            try {
              console.log('Restarting speech recognition...');
              
              // Clear old reference
              if (recognitionRef.current) {
                recognitionRef.current = null;
              }
              
              const newRecognition = new SpeechRecognition();
              recognitionRef.current = newRecognition;
              
              // Configure new recognition with same settings
              newRecognition.continuous = true;
              newRecognition.interimResults = true;
              newRecognition.lang = 'en-US';
              newRecognition.maxAlternatives = 1;
              
              // Copy all event handlers
              newRecognition.onstart = recognition.onstart;
              newRecognition.onresult = recognition.onresult;
              newRecognition.onerror = recognition.onerror;
              newRecognition.onend = recognition.onend;
              newRecognition.onaudiostart = recognition.onaudiostart;
              newRecognition.onsoundstart = recognition.onsoundstart;
              newRecognition.onspeechstart = recognition.onspeechstart;
              newRecognition.onspeechend = recognition.onspeechend;
              newRecognition.onsoundend = recognition.onsoundend;
              newRecognition.onaudioend = recognition.onaudioend;
              
              newRecognition.start();
              console.log('✅ Speech recognition restarted successfully');
            } catch (error) {
              console.error('❌ Error restarting recognition:', error);
              // Try again after a longer delay
              setTimeout(() => {
                if (isListeningRef.current) {
                  console.log('Retrying speech recognition restart...');
                  try {
                    const retryRecognition = new SpeechRecognition();
                    recognitionRef.current = retryRecognition;
                    retryRecognition.continuous = true;
                    retryRecognition.interimResults = true;
                    retryRecognition.lang = 'en-US';
                    retryRecognition.maxAlternatives = 1;
                    retryRecognition.onstart = recognition.onstart;
                    retryRecognition.onresult = recognition.onresult;
                    retryRecognition.onerror = recognition.onerror;
                    retryRecognition.onend = recognition.onend;
                    retryRecognition.onaudiostart = recognition.onaudiostart;
                    retryRecognition.onsoundstart = recognition.onsoundstart;
                    retryRecognition.onspeechstart = recognition.onspeechstart;
                    retryRecognition.onspeechend = recognition.onspeechend;
                    retryRecognition.onsoundend = recognition.onsoundend;
                    retryRecognition.onaudioend = recognition.onaudioend;
                    retryRecognition.start();
                    console.log('✅ Speech recognition retry successful');
                  } catch (retryError) {
                    console.error('❌ Speech recognition retry failed:', retryError);
                  }
                }
              }, 1000);
            }
          }
        }, 300); // Slightly longer delay for stability
      }
    };

    try {
      console.log('Attempting to start recognition...');
      recognition.start();
      return true;
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      toast.error('Failed to start speech recognition');
      return false;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      setIsListening(false);
      isListeningRef.current = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // Clear any pending timeouts
    if (interimTimeoutRef.current) {
      clearTimeout(interimTimeoutRef.current);
      interimTimeoutRef.current = null;
    }
    setInterimTranscript('');
    lastInterimRef.current = '';
    lastFinalTranscriptRef.current = '';
    onTranscriptCallback.current = null;
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening
  };
};

export default useSpeechRecognition;