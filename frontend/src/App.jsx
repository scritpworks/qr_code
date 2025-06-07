import React, { useEffect, useRef, useState } from 'react';


function App() {
  const videoRef = useRef(null);
  const [qrResults, setQrResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [debugLogs, setDebugLogs] = useState([]);
  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    // Stop any existing tracks
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

    // Start webcam with constraints
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    .then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    })
    .catch((err) => {
      console.error("Camera error:", err);
      setError("Failed to access camera: " + err.message);
    });

    const interval = setInterval(captureFrame, 1000);
    return () => {
      clearInterval(interval);
      videoRef.current?.srcObject?.getTracks().forEach(track => track.stop());
    };
  }, [facingMode]);

  useEffect(() => {
    addDebugLog(`Frontend URL: ${window.location.origin}`);
    addDebugLog(`API URL: ${API_URL}`);
    addDebugLog('Use separate ngrok tunnels');
  }, [API_URL]);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev.slice(-4), message]); // Keep last 5 logs
  };

  const captureFrame = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      addDebugLog('Video not ready yet');
      return;
    }

    setIsScanning(true);
    setError(null);
    
    try {
      const canvas = document.createElement("canvas");
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      
      addDebugLog(`Video: ${videoWidth}x${videoHeight}`);
      
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg");
      
      addDebugLog(`Image size: ${Math.round(imageData.length / 1024)}KB`);
      
      addDebugLog(`Attempting to fetch: ${API_URL}/scan`);
      const response = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        mode: 'cors',
        body: JSON.stringify({ image: imageData })
      });
      
      addDebugLog(`Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Server response data:', data);
      
      if (data.length > 0) {
        console.log('QR codes found:', data.length);
        setQrResults(data.map(d => d.data));
      } else {
        console.log('No QR codes detected');
      }
    } catch (err) {
      addDebugLog(`Network Error: ${err.message}`);
      setError(`Connection failed: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1>📷 Vite + React QR Scanner</h1>
      <button 
        onClick={() => setFacingMode(current => current === 'environment' ? 'user' : 'environment')}
        style={{ margin: '1rem 0', padding: '8px 16px' }}
      >
        Switch Camera ({facingMode === 'environment' ? 'Back' : 'Front'})
      </button>
      <div style={{ position: 'relative', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
        <video 
          ref={videoRef} 
          style={{ width: '100%', display: 'block' }} 
          autoPlay 
          playsInline 
          muted 
        />
      </div>
      <div>
        <h3>Detected QR:</h3>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {isScanning && <p>Scanning...</p>}
        {qrResults.map((qr, idx) => (
          <p key={idx}>{qr}</p>
        ))}
      </div>
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0,
        background: 'rgba(0,0,0,0.8)', 
        color: 'white',
        padding: '10px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <h4 style={{ margin: '0 0 5px 0' }}>Debug Logs:</h4>
        {debugLogs.map((log, idx) => (
          <div key={idx}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
