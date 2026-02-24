import React, { useState, useEffect, useRef } from "react";
import { Upload, Download, Table as TableIcon, Search, Type, Save, ChevronRight, ChevronLeft, Database as DbIcon, BookOpen, Settings2, Undo2, Redo2, Copy, ClipboardPaste, Trash2, Eraser, X, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Column {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface TableData {
  rows: any[];
  columns: Column[];
  total: number;
}

const HighlightedTextarea = ({ 
  id, 
  value, 
  onChange, 
  fontSize, 
  placeholder,
  dir = "rtl"
}: { 
  id: string, 
  value: string, 
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void, 
  fontSize: number, 
  placeholder: string,
  dir?: "rtl" | "ltr"
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Sync scroll on value change too (in case of auto-grow or external changes)
  useEffect(() => {
    handleScroll();
  }, [value]);

  const highlightedContent = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([.,()])/g, '<span class="bg-yellow-300 text-black">$1</span>') + "\n";

  const sharedStyles = "w-full p-6 sm:p-10 leading-relaxed font-sans text-right whitespace-pre-wrap break-words border-none outline-none m-0";

  return (
    <div className="relative w-full min-h-[600px] bg-white">
      <div
        ref={backdropRef}
        aria-hidden="true"
        dir={dir}
        className={`${sharedStyles} absolute inset-0 pointer-events-none overflow-auto text-black/80`}
        style={{ fontSize: `${fontSize}px` }}
        dangerouslySetInnerHTML={{ __html: highlightedContent }}
      />
      <textarea
        id={id}
        ref={textareaRef}
        dir={dir}
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        style={{ fontSize: `${fontSize}px` }}
        className={`${sharedStyles} absolute inset-0 w-full h-full bg-transparent resize-none text-transparent caret-black selection:bg-yellow-500/20 selection:text-transparent overflow-auto`}
        placeholder={placeholder}
      />
    </div>
  );
};

export default function App() {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [data, setData] = useState<TableData | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [filter, setFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // Focus Mode is now the only mode
  const [focusIndex, setFocusIndex] = useState(0);
  const [surahInput, setSurahInput] = useState("");
  const [ayatInput, setAyatInput] = useState("");
  
  // Track local changes for auto-save
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({});
  const [changeRowId, setChangeRowId] = useState<any>(null);
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [redoStack, setRedoStack] = useState<Record<string, string[]>>({});
  const historyTimerRef = useRef<Record<string, any>>({});

  const localChangesRef = useRef(localChanges);
  const focusIndexRef = useRef(focusIndex);

  useEffect(() => {
    localChangesRef.current = localChanges;
  }, [localChanges]);

  useEffect(() => {
    focusIndexRef.current = focusIndex;
  }, [focusIndex]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTables = async () => {
    try {
      const res = await fetch("/api/tables");
      const result = await res.json();
      if (res.ok) {
        setTables(result);
        setError(null);
        if (result.length > 0 && !selectedTable) {
          setSelectedTable(result[0]);
        }
      } else {
        setError(result.error || "Failed to fetch tables");
      }
    } catch (err: any) {
      console.error("Failed to fetch tables", err);
      setError(err.message || "Failed to connect to server");
    }
  };

  const fetchData = async (table: string, f: string = "", col: string = "", p: number = 0) => {
    if (!table) return;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (f && col) {
        query.append("filter", f);
        query.append("column", col);
      }
      query.append("limit", pageSize.toString());
      query.append("offset", (p * pageSize).toString());

      const res = await fetch(`/api/data/${table}?${query.toString()}`);
      const result = await res.json();
      if (res.ok) {
        setData(result);
        setError(null);
        setLocalChanges({}); // Reset local changes on new data
        setChangeRowId(null);
        if (result.columns.length > 0 && !filterColumn) {
          setFilterColumn(result.columns[0].name);
        }
      } else {
        setError(result.error || "Failed to fetch data");
      }
    } catch (err: any) {
      console.error("Failed to fetch data", err);
      setError(err.message || "Failed to load data from table");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbLoaded) {
      fetchTables();
    }
  }, [dbLoaded, dbVersion]);

  useEffect(() => {
    if (selectedTable) {
      fetchData(selectedTable, filter, filterColumn, page);
    }
    // Clear history on navigation
    setHistory({});
    setRedoStack({});
    Object.values(historyTimerRef.current).forEach(clearTimeout);
    historyTimerRef.current = {};
  }, [selectedTable, filter, filterColumn, page]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (data.dbLoaded) {
          setDbLoaded(true);
          setDbVersion(v => v + 1);
        }
      } catch (err) {
        console.error("Health check failed", err);
      }
    };
    checkHealth();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("database", file);

    try {
      console.log("Starting upload for file:", file.name, "size:", file.size);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      const contentType = res.headers.get("content-type");
      let result;
      if (contentType && contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON response received:", text);
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}...`);
      }

      console.log("Upload response:", result);

      if (res.ok) {
        setDbLoaded(true);
        setDbVersion(v => v + 1);
        setSelectedTable(""); // Reset selection to force pick first table of new DB
        setPage(0);
        setFocusIndex(0);
        setFilter("");
        setSearchInput("");
        setError(null);
      } else {
        setError(result.error || "Failed to upload database");
      }
    } catch (err: any) {
      console.error("Upload failed with exception:", err);
      setError(err.message || "An unexpected error occurred during upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset to allow re-uploading same file
      }
    }
  };

  const saveChanges = async (rowIdx: number, changes: Record<string, string>) => {
    if (!data || !selectedTable || Object.keys(changes).length === 0) return;
    
    const row = data.rows[rowIdx];
    const pkColumn = data.columns.find(c => c.pk === 1);
    
    // Use PK if available, otherwise fallback to our injected _rowid_
    const idColumn = pkColumn ? pkColumn.name : "_rowid_";
    const idValue = pkColumn ? row[pkColumn.name] : row._rowid_;
    
    try {
      const res = await fetch(`/api/update/${selectedTable}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idColumn,
          idValue,
          updates: changes
        }),
      });

      if (res.ok) {
        const newData = { ...data };
        Object.keys(changes).forEach(col => {
          newData.rows[rowIdx][col] = changes[col];
        });
        setData(newData);
        setLocalChanges({});
        setChangeRowId(null);
        setError(null);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to save changes");
      }
    } catch (err: any) {
      console.error("Save failed", err);
      setError(err.message || "Failed to save changes to server");
    }
  };

  const handleNavigate = async (direction: 'next' | 'prev') => {
    if (!data) return;

    const currentChanges = localChangesRef.current;
    const currentIdx = focusIndexRef.current;

    // Auto-save current changes before navigating
    if (Object.keys(currentChanges).length > 0) {
      await saveChanges(currentIdx, currentChanges);
    }

    const nextIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    
    if (nextIdx >= 0 && nextIdx < data.rows.length) {
      setFocusIndex(nextIdx);
    } else if (direction === 'next' && (page + 1) * pageSize < data.total) {
      setPage(page + 1);
      setFocusIndex(0);
    } else if (direction === 'prev' && page > 0) {
      setPage(page - 1);
      setFocusIndex(pageSize - 1);
    }
  };

  const jumpToSurahAyat = async () => {
    if (!surahInput || !ayatInput) return;
    
    // Auto-save before jumping
    if (Object.keys(localChanges).length > 0) {
      await saveChanges(focusIndex, localChanges);
    }

    const surahCol = data?.columns.find(c => c.name.toLowerCase().includes('sura'))?.name;
    if (surahCol) {
      setFilterColumn(surahCol);
      setFilter(surahInput);
      setPage(0);
      setFocusIndex(0);
    }
  };

  const handleDownload = () => {
    window.location.href = "/api/download";
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F3]">
      {/* Compact Header */}
      <header className="border-b border-black/5 p-2 pt-6 sm:pt-2 flex items-center justify-between bg-white sticky top-0 z-10 h-16 sm:h-12">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 ${dbLoaded ? 'bg-emerald-500' : 'bg-black'} text-white flex items-center justify-center rounded transition-colors`}>
            <DbIcon size={16} />
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif italic text-lg leading-none hidden sm:block">Editor</h1>
            {dbLoaded && <span className="text-[8px] font-mono opacity-50 uppercase mt-1">Database Active</span>}
          </div>
          
          {dbLoaded && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-[10px] uppercase tracking-widest opacity-40 font-mono">Table:</span>
              <select 
                value={selectedTable}
                onChange={async (e) => {
                  const newTable = e.target.value;
                  if (Object.keys(localChanges).length > 0) {
                    await saveChanges(focusIndex, localChanges);
                  }
                  setSelectedTable(newTable);
                  setPage(0);
                  setFocusIndex(0);
                }}
                className="text-xs font-medium bg-black/5 px-2 py-1 rounded outline-none border-none cursor-pointer hover:bg-black/10 transition-colors"
              >
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/5 rounded-full px-2 py-1">
            <Type size={12} className="opacity-50" />
            <input
              type="range"
              min="12"
              max="48"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-16 accent-black"
            />
            <span className="text-[9px] font-mono w-6">{fontSize}px</span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 sm:p-1.5 hover:bg-black/5 rounded-full sm:rounded transition-colors flex items-center justify-center gap-1"
            title="Load Database"
          >
            <Upload size={20} className={isUploading ? "animate-bounce" : ""} />
            <span className="text-[10px] font-bold uppercase hidden sm:inline">Load</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="fixed -top-full left-0 opacity-0 pointer-events-none" 
          />

          {dbLoaded && (
            <button
              onClick={handleDownload}
              className="p-3 sm:p-1.5 hover:bg-black/5 rounded-full sm:rounded transition-colors flex items-center justify-center gap-1"
              title="Save Database"
            >
              <Download size={20} />
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Save</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="bg-red-50 border-b border-red-100 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700 text-xs">
              <span className="font-bold uppercase">Error:</span>
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}
        {selectedTable ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search & Navigation Bar */}
            <div className="p-4 sm:p-2 border-b border-black/5 bg-white flex items-center gap-3 flex-wrap justify-center">
              <div className="flex items-center gap-2 bg-black/5 rounded px-2 py-1 max-w-xs w-full">
                <Search size={14} className="opacity-30" />
                <select 
                  value={filterColumn} 
                  onChange={(e) => setFilterColumn(e.target.value)}
                  className="text-[10px] font-mono bg-transparent outline-none border-r border-black/10 pr-2"
                >
                  {data?.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <input
                  dir="rtl"
                  type="text"
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      if (Object.keys(localChanges).length > 0) {
                        await saveChanges(focusIndex, localChanges);
                      }
                      setFilter(searchInput);
                      setPage(0);
                      setFocusIndex(0);
                    }
                  }}
                  onBlur={async (e) => {
                    if (searchInput !== filter) {
                      if (Object.keys(localChanges).length > 0) {
                        await saveChanges(focusIndex, localChanges);
                      }
                      setFilter(searchInput);
                      setPage(0);
                      setFocusIndex(0);
                    }
                  }}
                  className="flex-1 bg-transparent outline-none text-xs text-right"
                />
              </div>

              <div className="flex items-center gap-1 bg-black/5 p-1 rounded">
                <input 
                  type="number" 
                  placeholder="S" 
                  value={surahInput}
                  onChange={(e) => setSurahInput(e.target.value)}
                  className="w-10 px-1 py-0.5 text-[10px] rounded border-none outline-none"
                />
                <input 
                  type="number" 
                  placeholder="A" 
                  value={ayatInput}
                  onChange={(e) => setAyatInput(e.target.value)}
                  className="w-10 px-1 py-0.5 text-[10px] rounded border-none outline-none"
                />
                <button onClick={jumpToSurahAyat} className="p-1 hover:bg-black hover:text-white rounded transition-colors">
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  disabled={page === 0 && focusIndex === 0}
                  onClick={() => handleNavigate('prev')}
                  className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded text-xs hover:bg-black/80 disabled:opacity-20 transition-all"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <div className="text-[10px] font-mono opacity-40 px-2">
                  {focusIndex + 1 + (page * pageSize)} / {data?.total || 0}
                </div>
                <button 
                  disabled={(page + 1) * pageSize >= (data?.total || 0) && focusIndex === (data?.rows.length || 0) - 1}
                  onClick={() => handleNavigate('next')}
                  className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded text-xs hover:bg-black/80 disabled:opacity-20 transition-all"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              {loading && (
                <div className="fixed inset-0 bg-white/20 backdrop-blur-[1px] z-50 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {data && data.rows.length > 0 ? (
                <div className="max-w-6xl mx-auto flex items-center gap-4">
                  {/* Left Navigation Button */}
                  <button 
                    disabled={page === 0 && focusIndex === 0}
                    onClick={() => handleNavigate('prev')}
                    className="hidden lg:flex w-16 h-32 items-center justify-center bg-white border border-black/5 rounded-2xl shadow-sm hover:bg-black hover:text-white transition-all disabled:opacity-10"
                  >
                    <ChevronLeft size={32} />
                  </button>

                  <div className="flex-1 space-y-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${page}-${focusIndex}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        {/* ID / Meta Columns Row (Tiny) */}
                        <div className="flex flex-wrap gap-2">
                          {data.columns.filter(col => {
                            const name = col.name.toLowerCase();
                            return name.includes('id') || name.includes('sura') || name.includes('aya') || name.includes('verse') || name.includes('chapter');
                          }).map(col => {
                            const pkCol = data.columns.find(c => c.pk === 1);
                            const currentRow = data.rows[focusIndex];
                            const currentRowId = pkCol ? currentRow[pkCol.name] : currentRow._rowid_;
                            const currentValue = (changeRowId === currentRowId && localChanges[col.name] !== undefined) 
                              ? localChanges[col.name] 
                              : (currentRow[col.name] || "");

                            return (
                              <div key={col.name} className="bg-white px-3 py-1.5 rounded-lg border border-black/5 shadow-sm flex items-center gap-2">
                                <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">{col.name}</span>
                                <input
                                  type="text"
                                  value={currentValue}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    setLocalChanges(prev => ({ ...prev, [col.name]: newValue }));
                                    setChangeRowId(currentRowId);

                                    // Debounced history push for typing
                                    if (historyTimerRef.current[col.name]) clearTimeout(historyTimerRef.current[col.name]);
                                    historyTimerRef.current[col.name] = setTimeout(() => {
                                      setHistory(prev => {
                                        const colHist = prev[col.name] || [];
                                        if (colHist[colHist.length - 1] === currentValue) return prev;
                                        return { ...prev, [col.name]: [...colHist, currentValue].slice(-50) };
                                      });
                                      setRedoStack(prev => ({ ...prev, [col.name]: [] }));
                                    }, 1000);
                                  }}
                                  className="w-12 text-center font-mono text-xs font-bold outline-none bg-transparent"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Content Columns (Huge Textareas) */}
                        {data.columns.filter(col => {
                          const name = col.name.toLowerCase();
                          return !(name.includes('id') || name.includes('sura') || name.includes('aya') || name.includes('verse') || name.includes('chapter'));
                        }).map(col => {
                          const pkCol = data.columns.find(c => c.pk === 1);
                          const currentRow = data.rows[focusIndex];
                          const currentRowId = pkCol ? currentRow[pkCol.name] : currentRow._rowid_;
                          const currentValue = (changeRowId === currentRowId && localChanges[col.name] !== undefined) 
                            ? localChanges[col.name] 
                            : (currentRow[col.name] || "");
                          
                          const handleToolbarAction = async (action: string) => {
                            const textarea = document.getElementById(`textarea-${col.name}`) as HTMLTextAreaElement;
                            if (!textarea) return;

                            textarea.focus();

                            switch (action) {
                              case 'undo': {
                                const colHistory = history[col.name] || [];
                                if (colHistory.length > 0) {
                                  const prevVal = colHistory[colHistory.length - 1];
                                  const newHistory = colHistory.slice(0, -1);
                                  
                                  setRedoStack(prev => ({
                                    ...prev,
                                    [col.name]: [...(prev[col.name] || []), currentValue]
                                  }));
                                  setHistory(prev => ({ ...prev, [col.name]: newHistory }));
                                  setLocalChanges(prev => ({ ...prev, [col.name]: prevVal }));
                                  setChangeRowId(currentRowId);
                                }
                                break;
                              }
                              case 'redo': {
                                const colRedo = redoStack[col.name] || [];
                                if (colRedo.length > 0) {
                                  const nextVal = colRedo[colRedo.length - 1];
                                  const newRedo = colRedo.slice(0, -1);

                                  setHistory(prev => ({
                                    ...prev,
                                    [col.name]: [...(prev[col.name] || []), currentValue]
                                  }));
                                  setRedoStack(prev => ({ ...prev, [col.name]: newRedo }));
                                  setLocalChanges(prev => ({ ...prev, [col.name]: nextVal }));
                                  setChangeRowId(currentRowId);
                                }
                                break;
                              }
                              case 'copy':
                                const textToCopy = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd) || textarea.value;
                                await navigator.clipboard.writeText(textToCopy);
                                break;
                              case 'paste': {
                                const textToPaste = await navigator.clipboard.readText();
                                // Push to history before change
                                setHistory(prev => ({
                                  ...prev,
                                  [col.name]: [...(prev[col.name] || []), currentValue].slice(-50)
                                }));
                                setRedoStack(prev => ({ ...prev, [col.name]: [] }));

                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newValue = textarea.value.substring(0, start) + textToPaste + textarea.value.substring(end);
                                setLocalChanges(prev => ({ ...prev, [col.name]: newValue }));
                                setChangeRowId(currentRowId);
                                break;
                              }
                              case 'delete': {
                                const s = textarea.selectionStart;
                                const e = textarea.selectionEnd;
                                if (s !== e) {
                                  // Push to history before change
                                  setHistory(prev => ({
                                    ...prev,
                                    [col.name]: [...(prev[col.name] || []), currentValue].slice(-50)
                                  }));
                                  setRedoStack(prev => ({ ...prev, [col.name]: [] }));

                                  const val = textarea.value.substring(0, s) + textarea.value.substring(e);
                                  setLocalChanges(prev => ({ ...prev, [col.name]: val }));
                                  setChangeRowId(currentRowId);
                                }
                                break;
                              }
                              case 'delete-except': {
                                const selection = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
                                if (selection) {
                                  // Push to history before change
                                  setHistory(prev => ({
                                    ...prev,
                                    [col.name]: [...(prev[col.name] || []), currentValue].slice(-50)
                                  }));
                                  setRedoStack(prev => ({ ...prev, [col.name]: [] }));

                                  setLocalChanges(prev => ({ ...prev, [col.name]: selection }));
                                  setChangeRowId(currentRowId);
                                }
                                break;
                              }
                              case 'extract-pattern': {
                                const text = textarea.value;
                                // Pattern: ( any number ) followed by text till the first .
                                // We capture the part after the parentheses
                                const match = text.match(/\(\s*[\d\u0660-\u0669\u06F0-\u06F9]+\s*\)\s*(.*?\.)/);
                                if (match) {
                                  const result = match[1].trim();
                                  
                                  // Push to history before change
                                  setHistory(prev => ({
                                    ...prev,
                                    [col.name]: [...(prev[col.name] || []), currentValue].slice(-50)
                                  }));
                                  setRedoStack(prev => ({ ...prev, [col.name]: [] }));

                                  setLocalChanges(prev => ({ ...prev, [col.name]: result }));
                                  setChangeRowId(currentRowId);

                                  // Wait 1 second and then go to next row
                                  setTimeout(() => {
                                    handleNavigate('next');
                                  }, 1000);
                                }
                                break;
                              }
                            }
                          };

                          return (
                            <div key={col.name} className="bg-white rounded-2xl border border-black/5 shadow-md overflow-hidden flex flex-col">
                              <div className="bg-black/[0.02] px-4 py-2 border-b border-black/5 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="col-header text-[10px]">{col.name}</span>
                                  {changeRowId === currentRowId && localChanges[col.name] !== undefined && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                      <span className="text-[8px] font-mono opacity-40 uppercase">Unsaved</span>
                                    </div>
                                  )}
                                </div>
                                {/* ... toolbar ... */}
                                <div className="flex items-center gap-1 bg-white/50 p-1 rounded-lg border border-black/5">
                                  <button onClick={() => handleToolbarAction('undo')} className="p-2 hover:bg-black hover:text-white rounded transition-all" title="Undo"><Undo2 size={18} /></button>
                                  <button onClick={() => handleToolbarAction('redo')} className="p-2 hover:bg-black hover:text-white rounded transition-all" title="Redo"><Redo2 size={18} /></button>
                                  <div className="w-px h-6 bg-black/10 mx-1" />
                                  <button onClick={() => handleToolbarAction('copy')} className="p-2 hover:bg-black hover:text-white rounded transition-all" title="Copy"><Copy size={18} /></button>
                                  <button onClick={() => handleToolbarAction('paste')} className="p-2 hover:bg-black hover:text-white rounded transition-all" title="Paste"><ClipboardPaste size={18} /></button>
                                  <div className="w-px h-6 bg-black/10 mx-1" />
                                  <button onClick={() => handleToolbarAction('delete')} className="p-2 hover:bg-red-500 hover:text-white rounded transition-all" title="Delete Selected Text"><Trash2 size={18} /></button>
                                  <button onClick={() => handleToolbarAction('delete-except')} className="p-2 hover:bg-red-500 hover:text-white rounded transition-all" title="Delete All Except Selected"><Eraser size={18} /></button>
                                  <div className="w-px h-6 bg-black/10 mx-1" />
                                  <button onClick={() => handleToolbarAction('extract-pattern')} className="p-2 hover:bg-emerald-500 hover:text-white rounded transition-all text-emerald-600" title="Extract (Number)... and Next"><Wand2 size={18} /></button>
                                </div>
                              </div>
                              
                              <div className="relative">
                                <HighlightedTextarea
                                  id={`textarea-${col.name}`}
                                  dir="rtl"
                                  value={currentValue}
                                  fontSize={fontSize}
                                  placeholder={`Enter ${col.name}...`}
                                  onChange={(e) => {
                                    const newValue = e.target.value;
                                    setLocalChanges(prev => ({ ...prev, [col.name]: newValue }));
                                    setChangeRowId(currentRowId);

                                    // Debounced history push for typing
                                    if (historyTimerRef.current[col.name]) clearTimeout(historyTimerRef.current[col.name]);
                                    historyTimerRef.current[col.name] = setTimeout(() => {
                                      setHistory(prev => {
                                        const colHist = prev[col.name] || [];
                                        if (colHist[colHist.length - 1] === currentValue) return prev;
                                        return { ...prev, [col.name]: [...colHist, currentValue].slice(-50) };
                                      });
                                      setRedoStack(prev => ({ ...prev, [col.name]: [] }));
                                    }, 1000);
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}

                        {/* Mobile Navigation Buttons */}
                        <div className="flex lg:hidden items-center gap-4 pt-4">
                          <button 
                            disabled={page === 0 && focusIndex === 0}
                            onClick={() => handleNavigate('prev')}
                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-white border border-black/5 rounded-xl shadow-sm hover:bg-black hover:text-white transition-all disabled:opacity-10 text-sm font-medium"
                          >
                            <ChevronLeft size={18} /> Previous
                          </button>
                          <button 
                            disabled={(page + 1) * pageSize >= (data?.total || 0) && focusIndex === (data?.rows.length || 0) - 1}
                            onClick={() => handleNavigate('next')}
                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-white border border-black/5 rounded-xl shadow-sm hover:bg-black hover:text-white transition-all disabled:opacity-10 text-sm font-medium"
                          >
                            Next <ChevronRight size={18} />
                          </button>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Right Navigation Button */}
                  <button 
                    disabled={(page + 1) * pageSize >= (data?.total || 0) && focusIndex === (data?.rows.length || 0) - 1}
                    onClick={() => handleNavigate('next')}
                    className="hidden lg:flex w-16 h-32 items-center justify-center bg-white border border-black/5 rounded-2xl shadow-sm hover:bg-black hover:text-white transition-all disabled:opacity-10"
                  >
                    <ChevronRight size={32} />
                  </button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Search size={48} />
                  <p className="mt-4 font-serif italic">No records match your filter</p>
                </div>
              )}

              {/* Manual Save Button (Floating) */}
              {Object.keys(localChanges).length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="fixed bottom-12 right-8 z-20"
                >
                  <button 
                    onClick={() => saveChanges(focusIndex, localChanges)}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl hover:bg-emerald-700 transition-all font-medium"
                  >
                    <Save size={18} />
                    Save Changes
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30">
            <div className="w-20 h-20 border border-dashed border-black rounded-2xl flex items-center justify-center mb-6">
              <DbIcon size={32} />
            </div>
            <h3 className="font-serif italic text-xl mb-2">No Database Loaded</h3>
            <p className="max-w-xs text-xs">Upload a SQLite file to start editing.</p>
          </div>
        )}
      </main>

      {/* Ultra Compact Footer */}
      <footer className="bg-white border-t border-black/5 px-4 py-1 flex items-center justify-between text-[9px] font-mono tracking-widest uppercase opacity-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-1 h-1 rounded-full ${dbLoaded ? "bg-emerald-500" : "bg-red-500"}`} />
            <span>{dbLoaded ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
        <div>SQLite v3.45 // {selectedTable || "None"}</div>
      </footer>
    </div>
  );
}
