import React, { useState } from 'react';
import TranscriptionStudio from './components/TranscriptionStudio';
import { Toaster } from 'react-hot-toast';
import { Mic, FileText, ArrowLeft } from 'lucide-react';

function App() {
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'transcription'

  const renderPage = () => {
    switch (currentPage) {
      case 'transcription':
        return <TranscriptionStudio />;
      default:
        return <HomePage setCurrentPage={setCurrentPage} />;
    }
  };

  return (
    <div>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
      
      {/* Navigation Header (shown on sub-pages) */}
      {currentPage !== 'home' && (
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setCurrentPage('home')}
            className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 hover:border-emerald-500/50 rounded-xl px-4 py-2 text-gray-300 hover:text-emerald-400 transition-all duration-300 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>
      )}
      
      {renderPage()}
    </div>
  );
}

// Home page component
const HomePage = ({ setCurrentPage }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white overflow-hidden relative">
      {/* Ambient Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-16">
            {/* Logo/Icon */}
            <div className="relative mb-12">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-emerald-400/15 via-teal-400/15 to-cyan-400/15 backdrop-blur-xl border border-emerald-400/20 flex items-center justify-center shadow-2xl">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 flex items-center justify-center shadow-lg">
                  <Mic className="w-10 h-10 text-white/90" />
                </div>
              </div>
            </div>
            
            {/* Brand Name */}
            <h1 className="text-6xl md:text-7xl font-medium tracking-wider mb-6">
              <span className="bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
                Speeeech
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-300 font-light tracking-wide opacity-70 mb-4">
              AI-powered transcription with speaker identification
            </p>
            
            <p className="text-base text-gray-400 font-light max-w-2xl mx-auto">
              Professional audio transcription with speaker diarization, OpenAI Whisper, and advanced post-processing
            </p>
          </div>
          
          {/* Main Action */}
          <div className="text-center">
            <div className="group max-w-2xl mx-auto">
              <button 
                onClick={() => setCurrentPage('transcription')} 
                className="w-full bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-violet-400/10 backdrop-blur-xl border border-blue-400/25 rounded-2xl p-8 hover:from-blue-400/20 hover:via-purple-400/20 hover:to-violet-400/20 hover:border-blue-400/40 transition-all duration-500 hover:scale-105 shadow-xl hover:shadow-blue-500/20"
              >
                <div className="relative">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-violet-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-md">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-light tracking-wide mb-4">Start Transcribing</h3>
                  <p className="text-gray-400 text-base leading-relaxed">
                    Professional audio transcription with speaker identification, file uploads, live recording, and AI-powered post-processing.
                  </p>
                  <div className="mt-6 text-sm text-blue-400/80">
                    Whisper • Speaker Diarization • Gemini Flash 2.5 • Auto-formatting
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Features List */}
          <div className="mt-16 text-center">
            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto text-sm text-gray-400">
              <div className="space-y-2">
                <div className="w-8 h-8 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-emerald-400">✓</span>
                </div>
                <p>Speaker identification</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400">✓</span>
                </div>
                <p>AI-powered post-processing</p>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                  <span className="text-purple-400">✓</span>
                </div>
                <p>Multiple file format support</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;