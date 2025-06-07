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
  const [todayCount, setTodayCount] = useState(0);
  const [lastStudent, setLastStudent] = useState(null);
  const API_URL = import.meta.env.VITE_API_URL;
  const processingRef = useRef(false);
  const lastProcessedRef = useRef(0);
  const MIN_PROCESS_INTERVAL = 30; // Faster interval
  const CAPTURE_SIZE = {
    width: 640,
    height: 480
  };
  const animationFrameRef = useRef(null);
  const lastPositionsRef = useRef(new Map()); 
  const scannerRef = useRef(null);
  const BATCH_SIZE = 1; // Process one image at a time
  const [batchedScans, setBatchedScans] = useState(new Set());
  const [sessionStats, setSessionStats] = useState({ present: 0, absent: 0 });
  const capturedCodesRef = useRef(new Set());
  const frameCountRef = useRef(0);
  const FRAME_SKIP = 2; // Process every 2nd frame

  useEffect(() => {
   
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }

   
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: CAPTURE_SIZE.width },
        height: { ideal: CAPTURE_SIZE.height },
        frameRate: { ideal: 15 } // Lower framerate for better processing
      }
    })
    .then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();  
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
      const ctx = canvas.getContext('2d');
      let animationFrame;
      
      const drawScanner = (timestamp) => {
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        // Draw scanning grid
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
        const gridSize = 40;
        for (let x = 0; x < width; x += gridSize) {
          for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.rect(x, y, gridSize, gridSize);
            ctx.stroke();
          }
        }

        // Animated scan line
        const scanY = ((timestamp % 3000) / 3000) * height;
        const gradient = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(width, scanY);
        ctx.stroke();

        // Draw QR markers
        if (qrResults.length > 0) {
          qrResults.forEach(qr => {
            if (qr.polygon) {
              const scaleX = width / videoRef.current.videoWidth;
              const scaleY = height / videoRef.current.videoHeight;
              
              // Draw targeting box
              ctx.beginPath();
              ctx.moveTo(qr.polygon[0][0] * scaleX, qr.polygon[0][1] * scaleY);
              qr.polygon.forEach(point => {
                ctx.lineTo(point[0] * scaleX, point[1] * scaleY);
              });
              ctx.closePath();
              
              // Glowing effect
              ctx.shadowColor = '#00ff88';
              ctx.shadowBlur = 15;
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // Corner markers
              qr.polygon.forEach(point => {
                const x = point[0] * scaleX;
                const y = point[1] * scaleY;
                
                // Cross
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - 10, y);
                ctx.lineTo(x + 10, y);
                ctx.moveTo(x, y - 10);
                ctx.lineTo(x, y + 10);
                ctx.stroke();
                
                // Dot
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          });
        }

        animationFrame = requestAnimationFrame(drawScanner);
      };

      animationFrame = requestAnimationFrame(drawScanner);
      return () => cancelAnimationFrame(animationFrame);
    }
  }, [qrResults]);

  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const displayWidth = videoRef.current.clientWidth;
      const displayHeight = videoRef.current.clientHeight;
      
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (qrResults.length > 0) {
        const scaleX = displayWidth / videoRef.current.videoWidth;
        const scaleY = displayHeight / videoRef.current.videoHeight;

        qrResults.forEach(qr => {
          if (qr.polygon) {
            const scaledPolygon = qr.polygon.map(point => ({
              x: point[0] * scaleX,
              y: point[1] * scaleY
            }));

            // Draw boundary
            ctx.beginPath();
            ctx.moveTo(scaledPolygon[0].x, scaledPolygon[0].y);
            scaledPolygon.forEach(point => ctx.lineTo(point.x, point.y));
            ctx.closePath();
            
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw label
            const label = qr.data;
            ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
            ctx.fillRect(
              scaledPolygon[0].x,
              scaledPolygon[0].y - 25,
              ctx.measureText(label).width + 20,
              25
            );
            
            ctx.fillStyle = '#00ff88';
            ctx.font = '14px monospace';
            ctx.fillText(
              label,
              scaledPolygon[0].x + 10,
              scaledPolygon[0].y - 8
            );
          }
        });
      }
    }
  }, [qrResults]);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev.slice(-4), message]); // Keep last 5 logs
  };

  const captureFrame = async () => {
    if (!videoRef.current?.videoWidth || processingRef.current) {
      requestAnimationFrame(captureFrame);
      return;
    }

    frameCountRef.current++;
    if (frameCountRef.current % FRAME_SKIP !== 0) {
      requestAnimationFrame(captureFrame);
      return;
    }

    processingRef.current = true;
    
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CAPTURE_SIZE.width;
      canvas.height = CAPTURE_SIZE.height;
      
      const ctx = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
        desynchronized: true // Hardware acceleration
      });

      ctx.drawImage(
        videoRef.current,
        0, 0,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        0, 0,
        CAPTURE_SIZE.width,
        CAPTURE_SIZE.height
      );

      const imageData = canvas.toDataURL("image/jpeg", 0.3); // Lower quality for speed
      
      const response = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setQrResults(prev => {
            // Only update if data changed
            if (JSON.stringify(prev) !== JSON.stringify(data)) {
              data.forEach(result => handleSuccessfulScan(result.data));
              return data;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      processingRef.current = false;
      requestAnimationFrame(captureFrame);
    }
  };

  const handleSuccessfulScan = (data) => {
    if (!batchedScans.has(data)) {
      setBatchedScans(prev => new Set(prev).add(data));
      // Quick feedback
      new Audio('/beep.mp3').play().catch(() => {});
    }
  };

  // Process batched scans
  useEffect(() => {
    const processBatch = () => {
      if (batchedScans.size > 0) {
        setTodayCount(prev => prev + batchedScans.size);
        setScanCount(prev => prev + batchedScans.size);
        setSessionStats(prev => ({
          ...prev,
          present: prev.present + batchedScans.size
        }));
        setBatchedScans(new Set());
      }
    };

    const batchTimer = setInterval(processBatch, BATCH_SIZE);
    return () => clearInterval(batchTimer);
  }, [batchedScans]);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1>Attendance Scanner</h1>
        <div style={{ marginBottom: '20px' }}>
          Total Scanned: {scanCount}
        </div>

        <div style={{ position: 'relative' }}>
          <video 
            ref={videoRef} 
            style={{ width: '100%', display: 'block' }} 
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
              height: '100%'
            }}
          />
        </div>

        <div style={{ marginTop: '20px' }}>
          {qrResults.map((qr, idx) => (
            <div key={idx} style={{ marginBottom: '10px' }}>
              {qr.data}
            </div>
          ))}
        </div>

        <button
          onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
          style={{ marginTop: '20px' }}
        >
          Switch Camera
        </button>
      </div>
    </div>
  );
}

export default App;
