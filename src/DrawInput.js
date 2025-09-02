import { useEffect, useRef, useState } from "react";

function DrawInput({ onSubmit, onClear, clearCanvasRef, onDrawingChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (clearCanvasRef) {
      clearCanvasRef.current = () => {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const handleResize = () => {
      const parentWidth = canvas.parentElement.offsetWidth;
      const size = Math.min(parentWidth * 0.9, 400); // 90% of parent width, max 400px
      canvas.width = size;
      canvas.height = size;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial call
    return () => window.removeEventListener("resize", handleResize);
  }, [clearCanvasRef]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => {
    // This line is needed to prevent scrolling on touch devices
    e.preventDefault();

    // Check if it's a touch event or a left mouse click
    if (e.type === "mousedown" && e.button !== 0) {
      return;
    }
    
    // Notify parent component that drawing has started
    if (onDrawingChange) {
      onDrawingChange(true);
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e);
    setDrawing(true);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

    const draw = (e) => {
        if (!drawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Prevent touch events from triggering mouse events
        e.preventDefault();

        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
      };

  const isCanvasBlank = (canvas) => {
    const ctx = canvas.getContext("2d");
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixelData.length; i += 4) {
      if (pixelData[i] !== 0 || pixelData[i + 1] !== 0 || pixelData[i + 2] !== 0) {
        return false;
      }
    }
    return true;
  };
  
  const endDrawing = (e) => {
    // This line is needed to prevent scrolling on touch devices
    e.preventDefault();

    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.closePath();
    setDrawing(false);
    
    // Notify parent component that drawing has ended
    if (onDrawingChange) {
      onDrawingChange(false);
    }

    if (!isCanvasBlank(canvas)) {
        submitCanvas();
    }
  };
  
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (onClear) {
      onClear();
    }
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    clearCanvas();
  };

  const submitCanvas = () => {
    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL("image/png");
    onSubmit(imageData);
  };
    
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const opts = { passive: false }; // override passive
      canvas.addEventListener("touchstart", startDrawing, opts);
      canvas.addEventListener("touchmove", draw, opts);
      canvas.addEventListener("touchend", endDrawing, opts);

      return () => {
        canvas.removeEventListener("touchstart", startDrawing, opts);
        canvas.removeEventListener("touchmove", draw, opts);
        canvas.removeEventListener("touchend", endDrawing, opts);
      };
    }, []);

  return (
    <div className="canvas-container">
          <canvas
            ref={canvasRef}
            className="draw-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}   // ← remove Capture
            onTouchMove={draw}            // ← remove Capture
            onTouchEnd={endDrawing}       // ← remove Capture
            onContextMenu={handleRightClick}
          />
    </div>
  );
}

export default DrawInput;
