import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

const useAudioRecorder = (chunkDuration = 3000) => { // Process audio every 3 seconds
  const [isListening, setIsListening] = useState(false);
  const [audioBlobs, setAudioBlobs] = useState([]);
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);

  const startListening = useCallback(async () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioBlobs(prev => [...prev, event.data]);
        }
      };

      recorder.start(chunkDuration);
      setIsListening(true);
    } catch (error) {
      console.error('Microphone access error:', error);
      toast.error('Microphone access denied. Please enable it in your browser settings.');
      setIsListening(false);
    }
  }, [chunkDuration]);

  const stopListening = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, startListening, stopListening, audioBlobs };
};

export default useAudioRecorder;