import React, { useState, useRef, useCallback } from 'react';
import { Upload, Mic, Square, Play, Download, RefreshCw, Sparkles, CheckCircle, FileText, Volume2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { transcribeAudio } from '../services/openaiService';
import { getGeminiTextResponse } from '../services/geminiService';
import { transcribeWithSmartDiarization } from '../services/smartSpeakerDiarization';
import { exportHybridResults } from '../services/hybridTranscriptionService';
// import useWhisperRecognition from '../hooks/useWhisperRecognition';

const TranscriptionStudio = () => {
  // State management
  const [activeTab, setActiveTab] = useState('upload'); // upload, record
  const [file, setFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Post-processing options
  const [selectedProcessing, setSelectedProcessing] = useState({
    formatting: false,
    errorCorrection: false,
    fillerRemoval: false
  });
  const [processedTranscription, setProcessedTranscription] = useState('');
  
  // Refs
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const streamRef = useRef(null);
  const recordingChunksRef = useRef([]);

  // Whisper hook for continuous recording (currently unused in upload/record mode)
  // const { isListening, recordAndTranscribe } = useWhisperRecognition();

  // File upload handler
  const handleFileUpload = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      // Check file type
      const supportedTypes = ['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/webm'];
      if (!supportedTypes.some(type => selectedFile.type.includes(type.split('/')[1]))) {
        toast.error('Unsupported file type. Please use MP3, WAV, M4A, MP4, MPEG, MPGA, or WEBM files.');
        return;
      }

      // Check file size (25MB limit)
      if (selectedFile.size > 25 * 1024 * 1024) {
        toast.error('File too large. Maximum size is 25MB.');
        return;
      }

      setFile(selectedFile);
      setTranscriptionResult(null);
      setProcessedTranscription('');
      toast.success(`File loaded: ${selectedFile.name}`);
    }
  };

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });

      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordingChunksRef.current, { type: 'audio/webm;codecs=opus' });
        setFile(audioBlob);
        setIsRecording(false);
        clearInterval(recordingTimerRef.current);
        stream.getTracks().forEach(track => track.stop());
        toast.success(`Recording completed: ${recordingDuration} seconds`);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      setTranscriptionResult(null);
      setProcessedTranscription({});

      // Update duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success('Recording started...');

    } catch (error) {
      console.error('Recording error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Microphone permission denied');
      } else {
        toast.error('Failed to start recording: ' + error.message);
      }
    }
  }, [recordingDuration]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);


  // Process transcription with Gemini Flash 2.5
  const processTranscription = async () => {
    if (!transcriptionResult || !transcriptionResult.text) {
      toast.error('No transcription to process');
      return;
    }

    if (!Object.values(selectedProcessing).some(Boolean)) {
      toast.error('Please select at least one processing option');
      return;
    }

    try {
      setIsProcessing(true);
      
      const processingOptions = [];
      if (selectedProcessing.formatting) processingOptions.push('improve formatting and structure');
      if (selectedProcessing.errorCorrection) processingOptions.push('correct transcription errors and unclear words');
      if (selectedProcessing.fillerRemoval) processingOptions.push('remove filler words like "uh", "um", "you know", "like", etc.');

      // Process either the speaker-formatted text or the plain text
      const textToProcess = transcriptionResult.speakerFormattedText || transcriptionResult.text;

      const prompt = `Please process this transcription by doing the following: ${processingOptions.join(', ')}.

Original transcription:
${textToProcess}

Requirements:
- Maintain the original meaning and content
- If this has speaker labels (Speaker 1:, Speaker 2:, etc.), preserve them
- Only make the requested improvements
- Return the improved transcription without any additional commentary
- Keep the same language as the original

Improved transcription:`;

      const result = await getGeminiTextResponse(prompt);
      setProcessedTranscription(result);
      toast.success('Transcription processed successfully!');
      
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Processing failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Main transcription function - now unified!
  const handleTranscribe = async (mode = 'complete') => {
    if (!file) {
      toast.error('Please upload a file or record audio first');
      return;
    }

    try {
      setIsTranscribing(true);
      
      if (mode === 'complete') {
        // Complete transcription with REAL audio-based speaker identification
        toast.loading('Analyzing audio for speaker identification... This may take a moment.');
        
        const result = await transcribeWithSmartDiarization(file, {
          temperature: 0.2
        });
        
        setTranscriptionResult(result);
        toast.dismiss();
        toast.success(`Complete transcription ready! Identified ${result.speakers.length} speakers.`);
        
      } else {
        // Basic transcription only (fallback)
        const result = await transcribeAudio(file, {
          temperature: 0.2
        });
        
        setTranscriptionResult({
          text: result,
          method: 'basic-whisper',
          speakers: [],
          speakerSegments: [],
          speakerStats: {}
        });
        
        toast.success('Basic transcription completed!');
      }
      
      setProcessedTranscription(''); // Clear processed version when new transcription is made
      
    } catch (error) {
      console.error('Transcription error:', error);
      toast.dismiss();
      toast.error('Transcription failed: ' + error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Download transcription
  const downloadTranscription = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transcription downloaded!');
  };

  // Download hybrid transcription in various formats
  const downloadHybridTranscription = (format = 'txt') => {
    if (!transcriptionResult) {
      toast.error('No transcription available');
      return;
    }

    try {
      const exportData = exportHybridResults(transcriptionResult, format);
      const blob = new Blob([exportData.content], { type: exportData.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportData.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded as ${format.toUpperCase()}!`);
    } catch (error) {
      toast.error('Download failed: ' + error.message);
    }
  };

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-light mb-4">
            <span className="bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
              Transcription Studio
            </span>
          </h1>
          <p className="text-gray-400 text-lg">Upload files or record audio for AI-powered transcription with speaker identification</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-800/50 rounded-xl p-1 flex">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              Upload File
            </button>
            <button
              onClick={() => setActiveTab('record')}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'record'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Mic className="w-4 h-4 inline mr-2" />
              Record Audio
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            {/* File Upload Tab */}
            {activeTab === 'upload' && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" />
                  Upload Audio File
                </h3>
                
                <div 
                  className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center hover:border-emerald-500/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  
                  {file ? (
                    <div className="space-y-2">
                      <FileText className="w-12 h-12 mx-auto text-emerald-400" />
                      <p className="text-emerald-400 font-medium">
                        {file.name || 'Recorded Audio'}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Audio file ready'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-12 h-12 mx-auto text-gray-400" />
                      <p className="text-gray-400">
                        Click to upload audio file
                      </p>
                      <p className="text-gray-500 text-sm">
                        Supports MP3, WAV, M4A, MP4, MPEG, MPGA, WEBM (max 25MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recording Tab */}
            {activeTab === 'record' && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-emerald-400" />
                  Record Audio
                </h3>
                
                <div className="text-center space-y-4">
                  {isRecording ? (
                    <div className="space-y-4">
                      <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
                        <Mic className="w-8 h-8 text-red-400" />
                      </div>
                      <p className="text-red-400 font-medium">Recording...</p>
                      <p className="text-2xl font-mono text-white">
                        {formatTime(recordingDuration)}
                      </p>
                      <button
                        onClick={stopRecording}
                        className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-6 py-3 rounded-lg transition-all"
                      >
                        <Square className="w-4 h-4 inline mr-2" />
                        Stop Recording
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <Mic className="w-8 h-8 text-emerald-400" />
                      </div>
                      <p className="text-gray-400">Click to start recording</p>
                      <button
                        onClick={startRecording}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 px-6 py-3 rounded-lg transition-all"
                      >
                        <Play className="w-4 h-4 inline mr-2" />
                        Start Recording
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transcription Controls */}
            {file && !isRecording && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-blue-400" />
                  Transcription Options
                </h3>
                
                <div className="space-y-4">
                  <div className="text-center">
                    <button
                      onClick={() => handleTranscribe('complete')}
                      disabled={isTranscribing}
                      className="bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 hover:from-emerald-500/30 hover:via-blue-500/30 hover:to-purple-500/30 border border-emerald-500/30 px-8 py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium w-full max-w-md"
                    >
                      {isTranscribing ? (
                        <>
                          <RefreshCw className="w-5 h-5 inline mr-3 animate-spin" />
                          Creating Complete Transcription...
                        </>
                      ) : (
                        <>
                          <Users className="w-5 h-5 inline mr-3" />
                          Create Complete Transcription
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="text-center text-sm text-gray-400">
                    <p className="mb-2">✅ Full text transcription with timestamps</p>
                    <p className="mb-2">⚡ <strong>Fast audio-based</strong> speaker identification</p>
                    <p className="mb-2">📊 Speaker statistics and voice analysis</p>
                    <p>📄 Export in multiple formats (TXT, JSON, SRT, VTT)</p>
                  </div>

                  {/* Fallback option */}
                  <div className="text-center pt-4 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mb-2">Having issues? Try basic transcription:</p>
                    <button
                      onClick={() => handleTranscribe('basic')}
                      disabled={isTranscribing}
                      className="bg-gray-600/20 hover:bg-gray-600/30 border border-gray-600/30 px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {isTranscribing ? (
                        <>
                          <RefreshCw className="w-3 h-3 inline mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3 inline mr-2" />
                          Basic Text Only
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Post-processing Options */}
            {transcriptionResult && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  AI Post-Processing
                </h3>
                
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProcessing.formatting}
                        onChange={(e) => setSelectedProcessing(prev => ({
                          ...prev,
                          formatting: e.target.checked
                        }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span>Improve formatting and structure</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProcessing.errorCorrection}
                        onChange={(e) => setSelectedProcessing(prev => ({
                          ...prev,
                          errorCorrection: e.target.checked
                        }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span>Correct transcription errors</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProcessing.fillerRemoval}
                        onChange={(e) => setSelectedProcessing(prev => ({
                          ...prev,
                          fillerRemoval: e.target.checked
                        }))}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span>Remove filler words (uh, um, etc.)</span>
                    </label>
                  </div>
                  
                  <button
                    onClick={processTranscription}
                    disabled={isProcessing || !Object.values(selectedProcessing).some(Boolean)}
                    className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-4 py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 inline mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 inline mr-2" />
                        Process with AI
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {/* Complete Transcription Results */}
            {transcriptionResult && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    Complete Transcription Results
                    {transcriptionResult.speakers && transcriptionResult.speakers.length > 0 && (
                      <span className="text-sm text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full">
                        {transcriptionResult.speakers.length} speakers detected
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadHybridTranscription('txt')}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 text-xs"
                      title="Download Simple TXT"
                    >
                      TXT
                    </button>
                    <button
                      onClick={() => downloadHybridTranscription('detailed-txt')}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 text-xs"
                      title="Download Detailed TXT"
                    >
                      DETAILED
                    </button>
                    <button
                      onClick={() => downloadHybridTranscription('json')}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 text-xs"
                      title="Download JSON Data"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadHybridTranscription('srt')}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 text-xs"
                      title="Download SRT Subtitles"
                    >
                      SRT
                    </button>
                    <button
                      onClick={() => downloadHybridTranscription('vtt')}
                      className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50 text-xs"
                      title="Download VTT Subtitles"
                    >
                      VTT
                    </button>
                  </div>
                </div>

                {/* Speaker Statistics */}
                {transcriptionResult.speakerStats && Object.keys(transcriptionResult.speakerStats).length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">Speaker Statistics</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(transcriptionResult.speakerStats).map(([speaker, stats]) => (
                        <div key={speaker} className="bg-gray-800/50 rounded-lg p-3 border border-emerald-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                            <span className="font-medium text-sm">{speaker}</span>
                          </div>
                          <div className="text-xs text-gray-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Talk time:</span>
                              <span>{Math.round(stats.totalTime)}s ({Math.round(stats.timePercentage)}%)</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Words:</span>
                              <span>{stats.wordCount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Segments:</span>
                              <span>{stats.segments}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Transcription Content */}
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-4 max-h-96 overflow-y-auto">
                  {transcriptionResult.speakerSegments && transcriptionResult.speakerSegments.length > 0 ? (
                    <div className="space-y-3">
                      {transcriptionResult.speakerSegments.map((segment, index) => (
                        <div key={index} className="flex gap-3">
                          <div className="flex-shrink-0 text-xs text-gray-400 w-20">
                            {Math.floor(segment.start / 60)}:{Math.floor(segment.start % 60).toString().padStart(2, '0')}
                          </div>
                          <div className="flex-shrink-0 font-medium text-emerald-400 w-20 text-sm">
                            {segment.speaker}:
                          </div>
                          <div className="text-emerald-100 leading-relaxed text-sm">
                            {segment.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-emerald-100 leading-relaxed whitespace-pre-wrap">
                      {transcriptionResult.text}
                    </p>
                  )}
                </div>
                
                {/* Method Info */}
                <div className="mt-3 text-xs text-gray-500 flex items-center gap-4">
                  <span>Method: {
                    transcriptionResult.method === 'insanely-fast-whisper-diarization' ? '🚀 Insanely Fast Whisper + PyAnnote' :
                    transcriptionResult.method === 'efficient-audio-speaker-diarization' ? '⚡ Fast Audio Analysis' :
                    transcriptionResult.method === 'basic-transcription-fallback' ? '📝 Basic Transcription' :
                    'OpenAI Whisper + Speaker Detection'
                  }</span>
                  {transcriptionResult.confidence && (
                    <span>Confidence: {Math.round(transcriptionResult.confidence * 100)}%</span>
                  )}
                  {transcriptionResult.duration && (
                    <span>Duration: {Math.round(transcriptionResult.duration)}s</span>
                  )}
                </div>
              </div>
            )}

            {/* Processed Transcription */}
            {processedTranscription && (
              <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-700/50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    AI-Processed Transcription
                  </h3>
                  <button
                    onClick={() => downloadTranscription(processedTranscription, 'processed-transcription.txt')}
                    className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700/50"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <p className="text-emerald-100 leading-relaxed whitespace-pre-wrap">
                    {processedTranscription}
                  </p>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!transcriptionResult && (
              <div className="bg-gray-900/50 rounded-2xl p-12 border border-gray-700/50 text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">Ready for Transcription</h3>
                <p className="text-gray-500 mb-4">Upload a file or record audio, then click "Create Complete Transcription"</p>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>✨ Automatic speaker identification</p>
                  <p>⏱️ Word-level timestamps</p>
                  <p>📊 Speaker statistics</p>
                  <p>💾 Multiple export formats</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionStudio;