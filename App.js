import React from 'react';
import DualModeVoiceAssistant from './components/DualModeVoiceAssistant';
import { Toaster } from 'react-hot-toast';

function App() {
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
      <DualModeVoiceAssistant />
    </div>
  );
}

export default App;