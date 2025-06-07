import React, { useEffect, useRef, useState } from 'react';


function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [qrResults, setQrResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState(null);
  const API_URL = import.meta.env.VITE_API_URL;
  const processingRef = useRef(false);
  const lastProcessedRef = useRef(0);
  const MIN_PROCESS_INTERVAL = 100; // Faster scanning
  const animationFrameRef = useRef(null);
  const lastPositionsRef = useRef(new Map()); 

  useEffect(() => {
   
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

   
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

    const processFrame = async () => {
      if (!processingRef.current) {
        await captureFrame();
      }
      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      videoRef.current?.srcObject?.getTracks().forEach(track => track.stop());
    };
  }, [facingMode]);

  useEffect(() => {
    addDebugLog(`Frontend running locally at: ${window.location.origin}`);
    addDebugLog(`Backend API: ${API_URL}`);
  }, [API_URL]);

  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const displayWidth = videoRef.current.clientWidth;
      const displayHeight = videoRef.current.clientHeight;
      
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Scanner grid effect
      const gridSize = 30;
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Scanning line effect
      const scanLineY = (Date.now() % 1000) / 1000 * canvas.height;
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, scanLineY);
      ctx.lineTo(canvas.width, scanLineY);
      ctx.stroke();

      if (qrResults.length > 0) {
        const scaleX = displayWidth / (videoRef.current.videoWidth / 2);
        const scaleY = displayHeight / (videoRef.current.videoHeight / 2);

        qrResults.forEach(qr => {
          if (qr.polygon) {
            const scaledPolygon = qr.polygon.map(point => ({
              x: point[0] * scaleX,
              y: point[1] * scaleY
            }));

            // Smooth position transition
            const qrId = qr.data; // Use QR data as identifier
            const lastPos = lastPositionsRef.current.get(qrId);
            if (lastPos) {
              scaledPolygon.forEach((point, i) => {
                point.x = point.x * 0.3 + lastPos[i].x * 0.7; // Smooth transition
                point.y = point.y * 0.3 + lastPos[i].y * 0.7;
              });
            }
            lastPositionsRef.current.set(qrId, scaledPolygon);

            // Draw tracking box
            ctx.beginPath();
            ctx.moveTo(scaledPolygon[0].x, scaledPolygon[0].y);
            scaledPolygon.forEach((point, index) => {
              if (index > 0) ctx.lineTo(point.x, point.y);
            });
            ctx.lineTo(scaledPolygon[0].x, scaledPolygon[0].y);
            
            // Neon effect
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Tech corners
            scaledPolygon.forEach(point => {
              ctx.beginPath();
              ctx.moveTo(point.x - 10, point.y);
              ctx.lineTo(point.x + 10, point.y);
              ctx.moveTo(point.x, point.y - 10);
              ctx.lineTo(point.x, point.y + 10);
              ctx.strokeStyle = '#ff0000';
              ctx.lineWidth = 1;
              ctx.stroke();
            });

            // Update rectangle coordinates
            const scaledRect = {
              x: qr.rect.x * scaleX,
              y: qr.rect.y * scaleY,
              width: qr.rect.width * scaleX,
              height: qr.rect.height * scaleY
            };

            // Digital label background
            const label = `[${qr.type}] ${qr.data}`;
            ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
            const padding = 10;
            const labelWidth = ctx.measureText(label).width + (padding * 2);
            ctx.fillRect(scaledRect.x, scaledRect.y - 30, labelWidth, 25);
            
            // Label border
            ctx.strokeStyle = '#00ff00';
            ctx.strokeRect(scaledRect.x, scaledRect.y - 30, labelWidth, 25);
            
            // Text
            ctx.fillStyle = '#00ff00';
            ctx.font = '14px "Courier New"';
            ctx.fillText(label, scaledRect.x + padding, scaledRect.y - 12);
          }
        });
      }

      // Clean up old positions
      if (qrResults.length === 0) {
        lastPositionsRef.current.clear();
      }

      // Add success flash effect when new QR detected
      if (lastScan !== qrResults[0]?.data) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setLastScan(qrResults[0]?.data);
        setScanCount(prev => prev + 1);
      }
    }
  }, [qrResults, lastScan]);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev.slice(-4), message]); // Keep last 5 logs
  };

  const captureFrame = async () => {
    if (!videoRef.current?.videoWidth || processingRef.current) {
      return;
    }

    processingRef.current = true;
    setIsScanning(true);
    lastProcessedRef.current = Date.now();
    
    try {
      const canvas = document.createElement("canvas");
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      
      // Optimize canvas operations
      canvas.width = videoWidth / 2; // Reduce size for faster processing
      canvas.height = videoHeight / 2;
      
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.7); // Reduced quality for faster transfer
      
      addDebugLog(`Attempting to fetch: ${API_URL}/scan`);
      const response = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
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
        setQrResults(data); // Store the complete QR data objects
      } else {
        setQrResults([]); // Clear results when no QR codes are found
      }
    } catch (err) {
      addDebugLog(`Network Error: ${err.message}`);
      setError(`Connection failed: ${err.message}`);
    } finally {
      processingRef.current = false;
      setIsScanning(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#0a0a0a',
      padding: '1rem',
      color: '#00ff00',
      fontFamily: '"Courier New", monospace'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: '#111',
        borderRadius: '4px',
        padding: '2rem',
        border: '1px solid #00ff00',
        boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <h1 style={{ 
            color: '#00ff00',
            fontSize: '1.8rem',
            textShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
            margin: 0
          }}>⚡ SCHOOL ATTENDANCE SCANNER</h1>
          <div style={{
            background: '#001800',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            border: '1px solid #00ff00'
          }}>
            <span style={{ fontSize: '1.2rem' }}>Students Scanned: {scanCount}</span>
          </div>
        </div>

        <button 
          onClick={() => setFacingMode(current => current === 'environment' ? 'user' : 'environment')}
          style={{
            background: '#001a00',
            color: '#00ff00',
            border: '1px solid #00ff00',
            padding: '10px 20px',
            borderRadius: '4px',
            fontSize: '0.9rem',
            cursor: 'pointer',
            marginBottom: '1rem',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            boxShadow: '0 0 10px rgba(0, 255, 0, 0.2)'
          }}
        >
          {facingMode === 'environment' ? '◀ SWITCH TO FRONT CAM' : '▶ SWITCH TO BACK CAM'}
        </button>

        <div style={{ 
          position: 'relative',
          width: '100%',
          maxWidth: '600px',
          margin: '1rem auto',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '1px solid #00ff00',
          boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)'
        }}>
          <video 
            ref={videoRef} 
            style={{ width: '100%', display: 'block', borderRadius: '12px' }} 
            autoPlay 
            playsInline 
            muted 
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
          {isScanning && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 20, 0, 0.9)',
              color: '#00ff00',
              padding: '8px 16px',
              borderRadius: '4px',
              fontSize: '0.9rem',
              border: '1px solid #00ff00',
              animation: 'pulse 2s infinite'
            }}>
              ▶ SCANNING TARGET
            </div>
          )}
          {qrResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(0, 40, 0, 0.9)',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #00ff00',
              animation: 'blink 1s infinite'
            }}>
              ✓ STUDENT VERIFIED
            </div>
          )}
        </div>

        <div style={{
          background: '#001800',
          padding: '1rem',
          borderRadius: '8px',
          marginTop: '1rem',
          border: '1px solid #00ff00'
        }}>
          <h3 style={{ 
            margin: '0 0 1rem 0', 
            color: '#00ff00',
            borderBottom: '1px solid #00ff00',
            paddingBottom: '0.5rem'
          }}>Recent Scans:</h3>
          {qrResults.map((qr, idx) => (
            <div 
              key={idx}
              style={{
                background: '#e9ecef',
                padding: '0.75rem',
                borderRadius: '6px',
                marginBottom: '0.5rem',
                wordBreak: 'break-all'
              }}
            >
              <div>Type: {qr.type}</div>
              <div>Data: {qr.data}</div>
            </div>
          ))}
          {qrResults.length === 0 && !error && (
            <p style={{ color: '#6c757d' }}>No QR codes detected yet</p>
          )}
        </div>

        <button
          onClick={() => setShowDebug(prev => !prev)}
          style={{
            background: 'transparent',
            border: '1px solid #dee2e6',
            padding: '8px 16px',
            borderRadius: '6px',
            marginTop: '1rem',
            cursor: 'pointer'
          }}
        >
          {showDebug ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
      </div>

      {showDebug && (
        <div style={{ 
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '1rem',
          fontSize: '0.875rem',
          fontFamily: 'monospace',
          maxHeight: '30vh',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Debug Logs:</h4>
          {debugLogs.map((log, idx) => (
            <div key={idx} style={{ opacity: 0.8 }}>{log}</div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </div>
  );
}

export default App;
