'use client';
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface Message {
  role: 'user' | 'ai';
  content: string;
}

interface Node {
  id: string;
  label: string;
  color?: string;
  x?: number;
  y?: number;
  [key: string]: any;
}

export default function GraphPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
  const fgRef = useRef<any>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Alternative: Use a ref for the container to get actual dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setGraphDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    // Initial delay to ensure container is rendered
    const timer = setTimeout(updateDimensions, 100);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
    };
  }, [isChatMinimized, windowSize]); // Added windowSize to dependencies to re-evaluate on window resize

  useEffect(() => {
    const fetchInitialGraph = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/graph/initial');
        const result = await response.json();
        if (result.graphData && result.graphData.nodes?.length > 0) {
          setGraphData(result.graphData);
        }
      } catch (error) {
        console.error("Initial graph load error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialGraph();
  }, []);

  const handleSearch = async () => {
    if (!query.trim() || loading) return;

    const userQuery = query;
    setQuery('');
    setLoading(true);

    setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userQuery }),
      });

      const result = await response.json();

      if (result.error) {
        setMessages((prev) => [
          ...prev, 
          { role: 'ai', content: `Error: ${result.error}. ${result.details || ''}` }
        ]);
        return;
      }

      if (result.graphData && result.graphData.nodes.length > 0) {
        setGraphData(result.graphData);
      }
      
      setMessages((prev) => [
        ...prev, 
        { role: 'ai', content: result.answer || "No data mapping found for that query." }
      ]);

      // On mobile, maximize chat when receiving a response
      if (window.innerWidth < 768) {
        setIsChatMinimized(false);
      }

    } catch (error) {
      console.error("Search error:", error);
      setMessages((prev) => [...prev, { role: 'ai', content: "Sorry, I encountered an error communicating with the server." }]);
    } finally {
      setLoading(false);
    }
  };

  const getNodeColor = (label: string) => {
    switch (label) {
      case 'SalesOrder': return '#3b82f6';
      case 'Delivery': return '#10b981';
      case 'Billing': return '#f59e0b';
      case 'JournalEntry': return '#8b5cf6';
      case 'Customer': return '#ec4899';
      case 'Product': return '#ef4444';
      case 'Plant': return '#64748b';
      default: return '#94a3b8';
    }
  };

  return (
    <main className="flex flex-col md:flex-row h-screen w-full bg-[#020617] text-slate-100 font-sans overflow-hidden">
      {/* LEFT SIDE: Graph Visualization */}
      <div 
        ref={containerRef}
        className="flex-1 relative border-b md:border-b-0 md:border-r border-slate-800 min-w-0 overflow-hidden"
      >
        {/* TOP CONTROLS */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 items-center max-w-[calc(100%-2rem)]">
          <div className="bg-slate-900/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-slate-700/50 text-[10px] sm:text-[11px] font-semibold tracking-wider text-slate-400 shadow-2xl">
            Mapping / <span className="text-blue-400 uppercase">Order to Cash</span>
          </div>
          <button 
            onClick={() => setIsChatMinimized(!isChatMinimized)}
            className="bg-slate-900/60 backdrop-blur-xl px-3 py-2 rounded-lg border border-slate-700/50 text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition-all flex items-center gap-2 z-50">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isChatMinimized ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
            <span className="hidden sm:inline">{isChatMinimized ? 'Maximize Chat' : 'Minimize Chat'}</span>
            <span className="sm:hidden">{isChatMinimized ? 'Max' : 'Min'}</span>
          </button>
          <button className="bg-black/80 backdrop-blur-xl px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold text-white hover:bg-slate-900 transition-all flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <span className="hidden sm:inline">Hide Overlay</span>
          </button>
        </div>

        {loading && (
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold animate-pulse backdrop-blur-md">
               SCANNING...
            </div>
          </div>
        )}

        {/* NODE INSPECTION CARD */}
        {selectedNode && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[90%] sm:w-80 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-slate-200 p-4 sm:p-6 text-slate-800 animate-in zoom-in duration-200">
            <button 
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-sm sm:text-base font-extrabold mb-4 border-b border-slate-100 pb-2 capitalize">{selectedNode.label.split(/(?=[A-Z])/).join(" ")}</h3>
            <div className="space-y-2 text-[10px] sm:text-[11px] font-medium max-h-[40vh] overflow-y-auto pr-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Entity:</span>
                <span className="text-slate-900">{selectedNode.label.split(/(?=[A-Z])/).join(" ")}</span>
              </div>
              {Object.entries(selectedNode).map(([key, value]) => {
                if (['id', 'label', 'color', 'x', 'y', 'vy', 'vx', 'fx', 'fy', 'index', '__indexColor', '__controlPoints'].includes(key)) return null;
                const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                return (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="text-slate-400 shrink-0">{formattedKey}:</span>
                    <span className="text-slate-900 truncate text-right">{String(value)}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-5 pt-3 border-t border-slate-100">
              <div className="text-[9px] sm:text-[10px] text-slate-400 italic mb-2">
                Additional fields hidden for readability
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-xs font-bold text-slate-700">
                  Connections: {graphData.links.filter(l => 
                    (typeof l.source === 'object' ? (l.source as any).id : l.source) === selectedNode.id || 
                    (typeof l.target === 'object' ? (l.target as any).id : l.target) === selectedNode.id
                  ).length}
                </span>
                <div className="flex items-center gap-1.5 text-[8px] sm:text-[9px] font-bold text-blue-600 uppercase tracking-tighter">
                  <span className="w-1 h-1 bg-blue-600 rounded-full animate-pulse"></span>
                  Active Node
                </div>
              </div>
            </div>
          </div>
        )}

        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={graphDimensions.width}
          height={graphDimensions.height}
          nodeAutoColorBy="label"
          nodeRelSize={6}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.01}
          nodeLabel={(node: any) => `${node.label}: ${node.id}`}
          linkColor={() => '#1e293b'}
          onNodeClick={(node: any) => {
             setSelectedNode(node);
             fgRef.current.centerAt(node.x, node.y, 400);
             fgRef.current.zoom(3, 400);
          }}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.id;
            const fontSize = 10 / globalScale;
            const color = getNodeColor(node.label);
            
            ctx.beginPath();
            ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI, false);
            ctx.fillStyle = color;
            ctx.fill();
            
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();

            if (globalScale > 2) {
              ctx.font = `bold ${fontSize}px Inter, system-ui`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#94a3b8';
              ctx.fillText(label, node.x, node.y + 10);
            }
          }}
        />
      </div>

      {/* RIGHT SIDE: Chat Interface */}
      <div 
        className={`shrink-0 flex flex-col bg-[#0f172a] shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-30 transition-all duration-300 ease-in-out ${
          isChatMinimized 
            ? 'h-0 md:h-full md:w-0 opacity-0 overflow-hidden border-t-0 md:border-l-0' 
            : 'h-[50%] md:h-full w-full md:w-[420px] opacity-100 border-t md:border-t-0 md:border-l border-slate-800'
        }`}
      >
        <div className="flex flex-col h-full w-full">
          <div className="p-4 sm:p-6 border-b border-slate-800/50 bg-[#1e293b]/10 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 text-sm">D</div>
               <div>
                  <h2 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                    Dodge AI
                    <span className="px-1.5 py-0.5 bg-slate-800 text-blue-400 text-[8px] sm:text-[9px] rounded border border-blue-500/20">AGENT</span>
                  </h2>
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Order to Cash Intelligence</p>
               </div>
            </div>
          </div>

          {/* Message History */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 scrollbar-hide">
            {messages.length === 0 && (
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-slate-800/20 p-4 sm:p-5 rounded-2xl text-[12px] sm:text-[13px] text-slate-300 border border-slate-700/50 leading-relaxed">
                  Hi! I can help you analyze the <span className="text-blue-400 font-bold">Order to Cash</span> process. 
                  I map relationships between customers, orders, deliveries, and billing.
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    "Trace flow of billing 90504298",
                    "Which products have highest billing?",
                    "Show sales orders delivered but not billed"
                  ].map((s, i) => (
                    <button 
                      key={i} 
                      onClick={() => { setQuery(s); }}
                      className="text-left p-3 rounded-xl bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/30 text-[10px] sm:text-[11px] text-slate-400 transition-all hover:translate-x-1"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-widest">
                  {msg.role === 'user' ? 'You' : 'Dodge AI'}
                </span>
                <div className={`max-w-[95%] p-3 sm:p-4 rounded-2xl text-[12px] sm:text-[13px] leading-relaxed ${
                  msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-500/10' 
                  : 'bg-slate-800/80 text-slate-200 rounded-tl-none border border-slate-700 shadow-xl'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-slate-500 animate-pulse">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                GATHERING DATA...
              </div>
            )}
          </div>
          
          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-slate-900 border-t border-slate-800/50 shrink-0">
            <div className="relative group">
              <input 
                className="w-full bg-slate-800/50 px-4 py-3 sm:px-5 sm:py-4 text-[12px] sm:text-[13px] rounded-2xl focus:outline-none border border-slate-700/50 focus:border-blue-500 focus:bg-slate-800 transition-all shadow-inner"
                placeholder="Analyze anything..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button 
                onClick={handleSearch}
                disabled={loading}
                className={`absolute right-1.5 top-1.5 bottom-1.5 px-4 sm:px-5 rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                  loading ? 'bg-slate-700 cursor-not-allowed text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95'
                }`}
              >
                {loading ? '...' : 'SEND'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}