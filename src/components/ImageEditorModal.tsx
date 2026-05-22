import React, { useRef, useState, useEffect } from 'react';
import { X, Send, Undo2, RotateCcw, PenTool, Image as ImageIcon, Square, Circle, MoveUpRight, Sticker } from 'lucide-react';

type ToolMode = 'free' | 'square' | 'circle' | 'arrow' | 'sticker';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  type: ToolMode;
  color: string;
  points: Point[];
  size: number;
  stickerIndex?: number;
}

interface ImageEditorModalProps {
  file: File;
  onClose: () => void;
  onSend: (file: File, caption: string) => void;
}

const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ffffff', // White
  '#000000', // Black
];

const STICKERS = [
  '✅', '⚠️', '❌', '💡', '💻', '🖥️', '📱', '🔧', '⚙️', '🔍',
  '🚀', '🔥', '👍', '👎', '👏', '👀', '📌', '📎', '📝', '📊',
  '🔒', '🔓', '🔑', '🛡️', '💳', '📦', '🚚', '🏢', '🏠', '📞',
  '📅', '⏰', '⌛', '🔋', '🔌', '📡', '🎙️', '🎧', '📸', '🎥'
];

export default function ImageEditorModal({ file, onClose, onSend }: ImageEditorModalProps) {
  const [caption, setCaption] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[5]); // Default Purple
  const [toolMode, setToolMode] = useState<ToolMode>('free');
  const [strokeSize, setStrokeSize] = useState(4);
  const [stickerIndex, setStickerIndex] = useState(0);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Carrega a imagem original
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setImgObj(img);
    };
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Renderiza o canvas sempre que os strokes, a imagem, ou a ferramenta mudarem
  useEffect(() => {
    if (!imgObj || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calcular as dimensões responsivas
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const imgRatio = imgObj.width / imgObj.height;
    const containerRatio = containerWidth / containerHeight;

    let drawWidth = containerWidth;
    let drawHeight = containerHeight;

    if (imgRatio > containerRatio) {
      drawHeight = containerWidth / imgRatio;
    } else {
      drawWidth = containerHeight * imgRatio;
    }

    // Configura tamanho interno real para a resolução original (mantendo a qualidade final alta)
    // Limitando a resolução máxima
    const MAX_RES = 1920;
    let finalWidth = imgObj.width;
    let finalHeight = imgObj.height;
    if (finalWidth > MAX_RES || finalHeight > MAX_RES) {
      if (finalWidth > finalHeight) {
        finalHeight = (MAX_RES / finalWidth) * finalHeight;
        finalWidth = MAX_RES;
      } else {
        finalWidth = (MAX_RES / finalHeight) * finalWidth;
        finalHeight = MAX_RES;
      }
    }

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    // CSS scaling
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;

    renderCanvas();
  }, [imgObj, strokes, toolMode]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha a base
    ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);

    // Configura o estilo do desenho global
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Desenha os traços salvos
    strokes.forEach(stroke => {
      drawStroke(ctx, stroke);
    });

    // Se estivermos desenhando o traço atual, desenha ele também (prévia ao vivo)
    if (currentStrokeRef.current) {
      drawStroke(ctx, currentStrokeRef.current);
    }
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke | null) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    
    const canvasWidth = canvasRef.current!.width;
    const scaleFactor = canvasWidth / 800; // Normaliza o tamanho com base na resolução

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size * scaleFactor;

    const p0 = stroke.points[0];
    const pEnd = stroke.points[stroke.points.length - 1];

    if (stroke.type === 'free') {
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (stroke.type === 'square') {
      ctx.rect(p0.x, p0.y, pEnd.x - p0.x, pEnd.y - p0.y);
      ctx.stroke();
    } else if (stroke.type === 'circle') {
      const radiusX = Math.abs(pEnd.x - p0.x) / 2;
      const radiusY = Math.abs(pEnd.y - p0.y) / 2;
      const centerX = p0.x + (pEnd.x - p0.x) / 2;
      const centerY = p0.y + (pEnd.y - p0.y) / 2;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (stroke.type === 'arrow') {
      // Draw line
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();
      
      // Draw arrowhead
      const angle = Math.atan2(pEnd.y - p0.y, pEnd.x - p0.x);
      const headLength = 15 * scaleFactor;
      ctx.beginPath();
      ctx.moveTo(pEnd.x, pEnd.y);
      ctx.lineTo(pEnd.x - headLength * Math.cos(angle - Math.PI / 6), pEnd.y - headLength * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(pEnd.x - headLength * Math.cos(angle + Math.PI / 6), pEnd.y - headLength * Math.sin(angle + Math.PI / 6));
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.lineTo(pEnd.x - headLength * Math.cos(angle - Math.PI / 6), pEnd.y - headLength * Math.sin(angle - Math.PI / 6));
      ctx.fillStyle = stroke.color;
      ctx.fill();
    } else if (stroke.type === 'sticker' && stroke.stickerIndex !== undefined) {
      const text = STICKERS[stroke.stickerIndex];
      const dist = Math.sqrt(Math.pow(pEnd.x - p0.x, 2) + Math.pow(pEnd.y - p0.y, 2));
      // Se não arrastou, o tamanho padrão do sticker é cerca de 40px base. Se arrastou, cresce dinamicamente.
      const size = Math.max(40 * scaleFactor, dist);
      const centerX = p0.x + (pEnd.x - p0.x) / 2;
      const centerY = p0.y + (pEnd.y - p0.y) / 2;
      ctx.font = `${size}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, centerX, centerY);
    }
  };

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    // Calcula a posição do mouse na tela
    const xClient = e.clientX;
    const yClient = e.clientY;

    // Converte para a posição relativa ao CSS
    const xPos = xClient - rect.left;
    const yPos = yClient - rect.top;

    // Converte para a resolução real do canvas
    const x = (xPos / rect.width) * canvas.width;
    const y = (yPos / rect.height) * canvas.height;

    return { x, y };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const point = getCanvasCoordinates(e);
    if (!point) return;

    setIsDrawing(true);
    currentStrokeRef.current = {
      type: toolMode,
      color: selectedColor,
      points: [point],
      size: toolMode === 'arrow' ? Math.max(1, strokeSize * 0.75) : strokeSize,
      stickerIndex: toolMode === 'sticker' ? stickerIndex : undefined
    };
    renderCanvas();
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !currentStrokeRef.current) return;

    const point = getCanvasCoordinates(e);
    if (!point) return;

    currentStrokeRef.current.points.push(point);
    
    // Otimização: Só renderiza o canvas em tempo real sem recriar a base
    renderCanvas();
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !currentStrokeRef.current) return;

    const finishedStroke = currentStrokeRef.current;

    // Se é sticker ou apenas clicou, não precisamos de multiplos pontos
    if (finishedStroke.points.length > 0) {
      setStrokes(prev => [...prev, finishedStroke]);
    }
    
    currentStrokeRef.current = null;
    setIsDrawing(false);
    renderCanvas();
  };

  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
  };

  const handleSend = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Forçar a renderização síncrona uma última vez para ter certeza do estado final
    renderCanvas();

    // 2. Usar toDataURL para capturar o conteúdo garantidamente no mesmo ciclo de event loop
    const dataUrl = canvas.toDataURL(file.type || 'image/png', 0.95);
    
    // 3. Converter base64 para Blob para criar o File assíncronamente de forma segura
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const extension = file.name.split('.').pop() || 'png';
        const newFile = new File([blob], file.name || `imagem_editada.${extension}`, {
          type: blob.type || file.type || 'image/png'
        });
        onSend(newFile, caption);
      })
      .catch(err => {
        console.error('Falha ao exportar imagem com as edições', err);
        // Fallback em caso de erro extremo na conversão base64 -> Blob
        onSend(file, caption);
      });
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="bg-[#111b21] rounded-3xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 ring-1 ring-white/10">
        
        {/* Header Options */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#202c33]">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <ImageIcon size={18} className="text-[#00a884]"/> 
              Editar Imagem
            </h3>
            
            <div className="h-6 w-[1px] bg-white/20 mx-2"></div>
            
            {/* Toolbar Principal */}
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl">
              <button onClick={() => setToolMode('free')} className={`p-2 rounded-lg transition-colors ${toolMode === 'free' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Pincel">
                <PenTool size={18} />
              </button>
              <button onClick={() => setToolMode('arrow')} className={`p-2 rounded-lg transition-colors ${toolMode === 'arrow' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Seta (Arraste)">
                <MoveUpRight size={18} />
              </button>
              <button onClick={() => setToolMode('square')} className={`p-2 rounded-lg transition-colors ${toolMode === 'square' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Quadrado">
                <Square size={18} />
              </button>
              <button onClick={() => setToolMode('circle')} className={`p-2 rounded-lg transition-colors ${toolMode === 'circle' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} title="Círculo">
                <Circle size={18} />
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => { setShowStickerPicker(!showStickerPicker); setToolMode('sticker'); }} 
                  className={`p-2 rounded-lg transition-colors flex items-center gap-1 ${toolMode === 'sticker' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} 
                  title="Adesivos (Clique ou Arraste para definir tamanho)"
                >
                  <Sticker size={18} />
                  {toolMode === 'sticker' && <span className="text-sm ml-1">{STICKERS[stickerIndex]}</span>}
                </button>
                {showStickerPicker && (
                  <div className="absolute top-full mt-2 left-0 w-[180px] bg-[#202c33] border border-white/10 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 z-50 animate-in fade-in slide-in-from-top-2 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                    {STICKERS.map((s, i) => (
                      <button 
                        key={i} 
                        onClick={() => { setStickerIndex(i); setToolMode('sticker'); setShowStickerPicker(false); }} 
                        className="w-full h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-lg transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="h-6 w-[1px] bg-white/20 mx-2"></div>
            
            {/* Color Toolbar */}
            <div className="flex gap-1.5 px-2 bg-black/20 p-1.5 rounded-full">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${selectedColor === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  title="Selecionar Cor"
                />
              ))}
            </div>

            <div className="h-6 w-[1px] bg-white/20 mx-2"></div>

            {/* Thickness Selector */}
            <div className="flex items-center gap-2 bg-black/20 px-3 py-2 rounded-full" title="Espessura da linha">
              <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Espessura</span>
              <input 
                type="range" 
                min="1" 
                max="15" 
                value={strokeSize} 
                onChange={(e) => setStrokeSize(parseInt(e.target.value))}
                className="w-20 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#00a884] hover:accent-[#008f6f] transition-all"
              />
            </div>

            <div className="flex items-center gap-2 ml-4">
              <button 
                onClick={handleUndo} 
                disabled={strokes.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-white/5 text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <Undo2 size={16} /> <span className="hidden sm:inline">Desfazer</span>
              </button>
              <button 
                onClick={handleClear} 
                disabled={strokes.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-red-400 hover:bg-red-400/10 disabled:opacity-30 transition-colors"
              >
                <RotateCcw size={16} /> <span className="hidden sm:inline">Limpar</span>
              </button>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Canvas Area */}
        <div 
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-4 bg-black/50 overflow-hidden select-none touch-none"
        >
          {imgObj ? (
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              className={`shadow-lg rounded-sm ${toolMode === 'free' ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ touchAction: 'none' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-white/50 animate-pulse">
              <ImageIcon size={40} className="mb-2" />
              <p>Carregando imagem...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex gap-3 border-t border-white/10 bg-[#202c33]">
          <input 
            type="text" 
            placeholder="Adicionar legenda (opcional)..." 
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            className="flex-1 bg-[#2a3942] text-white border-none rounded-2xl px-5 py-3 text-sm placeholder:text-[#8696a0] focus:outline-none focus:ring-1 focus:ring-[#00a884]/50"
          />
          <button 
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all active:scale-95 duration-200 font-medium shrink-0"
          >
            Cancelar
          </button>
          <button 
            type="button"
            onClick={handleSend}
            className="bg-[#00a884] hover:bg-[#008f6f] text-white px-5 py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 font-medium shrink-0"
          >
            <Send size={18} />
            <span className="hidden sm:inline">Enviar Edição</span>
          </button>
        </div>
      </div>
    </div>
  );
}

