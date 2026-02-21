import React, { useState, useEffect, useRef } from "react";
import { Upload, Download, Table as TableIcon, Search, Type, Save, ChevronRight, ChevronLeft, Database as DbIcon, BookOpen, Settings2 } from "lucide-react";
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

export default function App() {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [data, setData] = useState<TableData | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [filter, setFilter] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  // Focus Mode is now the only mode
  const [focusIndex, setFocusIndex] = useState(0);
  const [surahInput, setSurahInput] = useState("");
  const [ayatInput, setAyatInput] = useState("");
  
  // Track local changes for auto-save
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTables = async () => {
    try {
      const res = await fetch("/api/tables");
      const tables = await res.json();
      setTables(tables);
      if (tables.length > 0 && !selectedTable) {
        setSelectedTable(tables[0]);
      }
    } catch (err) {
      console.error("Failed to fetch tables", err);
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
      setData(result);
      setLocalChanges({}); // Reset local changes on new data
      if (result.columns.length > 0 && !filterColumn) {
        setFilterColumn(result.columns[0].name);
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dbLoaded) {
      fetchTables();
    }
  }, [dbLoaded]);

  useEffect(() => {
    if (selectedTable) {
      fetchData(selectedTable, filter, filterColumn, page);
    }
  }, [selectedTable, filter, filterColumn, page]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("database", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setDbLoaded(true);
        setPage(0);
        setFocusIndex(0);
      }
    } catch (err) {
      console.error("Upload failed", err);
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
    const pkColumn = data.columns.find(c => c.pk === 1) || data.columns[0];
    
    try {
      const res = await fetch(`/api/update/${selectedTable}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idColumn: pkColumn.name,
          idValue: row[pkColumn.name],
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
      }
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const handleNavigate = async (direction: 'next' | 'prev') => {
    if (!data) return;

    // Auto-save current changes before navigating
    if (Object.keys(localChanges).length > 0) {
      await saveChanges(focusIndex, localChanges);
    }

    const nextIdx = direction === 'next' ? focusIndex + 1 : focusIndex - 1;
    
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

  const jumpToSurahAyat = () => {
    if (!surahInput || !ayatInput) return;
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
          <div className="w-8 h-8 bg-black text-white flex items-center justify-center rounded">
            <DbIcon size={16} />
          </div>
          <h1 className="font-serif italic text-lg leading-none hidden sm:block">Editor</h1>
          
          {dbLoaded && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-[10px] uppercase tracking-widest opacity-40 font-mono">Table:</span>
              <select 
                value={selectedTable}
                onChange={(e) => {
                  setSelectedTable(e.target.value);
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
            className="p-3 sm:p-1.5 hover:bg-black/5 rounded-full sm:rounded transition-colors flex items-center justify-center"
            title="Upload Database"
          >
            <Upload size={20} className={isUploading ? "animate-bounce" : ""} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/octet-stream" 
            className="fixed -top-full left-0 opacity-0 pointer-events-none" 
          />

          {dbLoaded && (
            <button
              onClick={handleDownload}
              className="p-1.5 hover:bg-black/5 rounded transition-colors"
              title="Export Database"
            >
              <Download size={18} />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
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
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setPage(0); setFocusIndex(0); }}
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
                            const currentValue = localChanges[col.name] !== undefined ? localChanges[col.name] : (data.rows[focusIndex][col.name] || "");
                            return (
                              <div key={col.name} className="bg-white px-3 py-1.5 rounded-lg border border-black/5 shadow-sm flex items-center gap-2">
                                <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">{col.name}</span>
                                <input
                                  type="text"
                                  value={currentValue}
                                  onChange={(e) => setLocalChanges(prev => ({ ...prev, [col.name]: e.target.value }))}
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
                          const currentValue = localChanges[col.name] !== undefined ? localChanges[col.name] : (data.rows[focusIndex][col.name] || "");
                          return (
                            <div key={col.name} className="bg-white rounded-2xl border border-black/5 shadow-md overflow-hidden flex flex-col">
                              <div className="bg-black/[0.02] px-4 py-2 border-b border-black/5 flex items-center justify-between">
                                <span className="col-header text-[10px]">{col.name}</span>
                                {localChanges[col.name] !== undefined && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                    <span className="text-[8px] font-mono opacity-40 uppercase">Unsaved</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="relative">
                                <textarea
                                  dir="rtl"
                                  value={currentValue}
                                  onChange={(e) => setLocalChanges(prev => ({ ...prev, [col.name]: e.target.value }))}
                                  style={{ fontSize: `${fontSize}px` }}
                                  className="w-full p-6 sm:p-10 bg-transparent outline-none min-h-[600px] leading-relaxed resize-none font-sans text-right"
                                  placeholder={`Enter ${col.name}...`}
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
