import React, { useState, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  BookOpen, 
  Layers, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  FileCheck, 
  Sparkles, 
  Info,
  Trash2,
  Filter
} from 'lucide-react';

export default function DocumentSidebar({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onDeleteDocument,
  isUploading,
  uploadProgress,
  onUploadFile,
  onLoadSampleDocument,
  isOpen
}) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  };

  const handleSelectedFile = (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please upload a valid PDF document.");
      return;
    }
    onUploadFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 KB";
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <aside className={`sidebar-container ${isOpen ? 'sidebar-open' : ''}`}>
      {/* Upload Box */}
      <div className="sidebar-section">
        <div className="section-title-row">
          <UploadCloud size={16} className="text-cyan" />
          <h2 className="section-title">Upload College Notes</h2>
        </div>
        <p className="section-description">
          Upload syllabi, lecture slides, or textbook chapters in PDF. Text will be chunked, embedded with Ollama, and stored in pgvector.
        </p>

        <div 
          className={`dropzone-box ${dragActive ? 'dropzone-active' : ''} ${isUploading ? 'dropzone-disabled' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {isUploading ? (
            <div className="uploading-state">
              <Loader2 size={32} className="animate-spin text-indigo" />
              <p className="upload-main-text">Processing PDF Notes...</p>
              <p className="upload-sub-text">{uploadProgress || "Extracting pages & computing Ollama embeddings..."}</p>
            </div>
          ) : (
            <div className="idle-state">
              <div className="upload-icon-circle">
                <FileText size={22} className="text-indigo" />
              </div>
              <p className="upload-main-text">
                <strong>Click to upload</strong> or drag & drop
              </p>
              <p className="upload-sub-text">Only PDF documents up to 50MB</p>
            </div>
          )}
        </div>

        {/* Quick Sample Notes Generator */}
        <button 
          className="sample-notes-btn"
          onClick={onLoadSampleDocument}
          disabled={isUploading}
          title="Upload sample Operating Systems lecture notes to test immediately"
        >
          <Sparkles size={14} className="text-amber" />
          <span>Load Sample College Notes (OS 101)</span>
        </button>
      </div>

      {/* Uploaded Documents List */}
      <div className="sidebar-section docs-list-section">
        <div className="section-title-row space-between">
          <div className="flex-center gap-2">
            <BookOpen size={16} className="text-indigo" />
            <h2 className="section-title">Indexed Notes</h2>
          </div>
          <span className="badge badge-indigo">{documents.length} docs</span>
        </div>

        {documents.length > 0 && (
          <div className="doc-filter-bar">
            <button 
              className={`filter-chip ${!selectedDocumentId ? 'filter-chip-active' : ''}`}
              onClick={() => onSelectDocument(null)}
              title="Search across all uploaded notes"
            >
              All Notes ({documents.length})
            </button>
            {selectedDocumentId && (
              <button 
                className="filter-clear-btn"
                onClick={() => onSelectDocument(null)}
                title="Clear single-document filter"
              >
                Reset Filter
              </button>
            )}
          </div>
        )}

        <div className="documents-scroll-area">
          {documents.length === 0 ? (
            <div className="empty-docs-box">
              <FileCheck size={36} className="empty-icon" />
              <p className="empty-title">No documents yet</p>
              <p className="empty-desc">
                Upload your lecture PDF or click "Load Sample Notes" to begin chatting with your materials.
              </p>
            </div>
          ) : (
            documents.map((doc, idx) => {
              const isSelected = selectedDocumentId === doc.id;
              return (
                <div 
                  key={doc.id || idx} 
                  className={`doc-card glass-panel ${isSelected ? 'doc-card-active' : ''}`}
                  onClick={() => onSelectDocument(isSelected ? null : doc.id)}
                  title={isSelected ? "Targeting this document. Click to search all." : "Click to scope answers to this document only."}
                >
                  <div className="doc-card-top">
                    <div className="doc-icon-wrap">
                      <FileText size={16} className={isSelected ? "text-indigo" : "text-cyan"} />
                    </div>
                    <div className="doc-name-wrap">
                      <h3 className="doc-filename" title={doc.filename}>{doc.filename}</h3>
                      <span className="doc-filesize">{formatFileSize(doc.file_size)}</span>
                    </div>
                    <button 
                      className="doc-delete-btn"
                      title="Delete document and chunks"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id, doc.filename);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="doc-card-metrics">
                    <div className="doc-metric-item">
                      <BookOpen size={12} className="text-muted" />
                      <span>{doc.total_pages || 1} {doc.total_pages === 1 ? 'Page' : 'Pages'}</span>
                    </div>
                    <div className="doc-metric-item">
                      <Layers size={12} className="text-muted" />
                      <span>{doc.total_chunks || 0} Chunks</span>
                    </div>
                  </div>

                  <div className="doc-card-footer">
                    <div className="doc-time">
                      <Clock size={11} />
                      <span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Ready'}</span>
                    </div>
                    {isSelected ? (
                      <span className="badge badge-indigo">Active Target</span>
                    ) : (
                      <span className="badge badge-emerald">Ready for RAG</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Vector Store Note */}
      <div className="sidebar-footer-hint">
        <Info size={13} className="text-cyan flex-shrink-0" />
        <p>Every query runs semantic cosine similarity search against pgvector in Supabase.</p>
      </div>

      <style>{`
        .sidebar-container {
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          transition: transform 0.3s ease;
        }

        @media (max-width: 900px) {
          .sidebar-container {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            width: 320px;
            z-index: 50;
            transform: translateX(-100%);
            box-shadow: var(--shadow-md);
          }
          .sidebar-container.sidebar-open {
            transform: translateX(0);
          }
        }

        .sidebar-section {
          padding: 20px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .section-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .section-title-row.space-between {
          justify-content: space-between;
        }

        .section-title {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .section-description {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 14px;
          line-height: 1.5;
        }

        .dropzone-box {
          border: 1.5px dashed rgba(99, 102, 241, 0.35);
          border-radius: var(--radius-md);
          background: rgba(99, 102, 241, 0.03);
          padding: 18px 14px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dropzone-box:hover {
          border-color: rgba(99, 102, 241, 0.7);
          background: rgba(99, 102, 241, 0.07);
        }

        .dropzone-active {
          border-color: var(--accent-secondary);
          background: rgba(6, 182, 212, 0.1);
        }

        .dropzone-disabled {
          pointer-events: none;
          opacity: 0.85;
        }

        .upload-icon-circle {
          width: 40px;
          height: 40px;
          background: rgba(99, 102, 241, 0.15);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 10px;
        }

        .upload-main-text {
          font-size: 13px;
          color: var(--text-main);
          margin-bottom: 4px;
        }

        .upload-sub-text {
          font-size: 11px;
          color: var(--text-subtle);
        }

        .sample-notes-btn {
          width: 100%;
          margin-top: 10px;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
          color: #fde68a;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .sample-notes-btn:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.16);
          border-color: rgba(245, 158, 11, 0.45);
        }

        .docs-list-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding-bottom: 12px;
          border-bottom: none;
        }

        .documents-scroll-area {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-right: 4px;
          margin-top: 10px;
        }

        .empty-docs-box {
          text-align: center;
          padding: 30px 16px;
          color: var(--text-subtle);
        }

        .empty-icon {
          color: rgba(255, 255, 255, 0.15);
          margin-bottom: 10px;
        }

        .empty-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 4px;
        }

        .empty-desc {
          font-size: 11.5px;
          line-height: 1.5;
        }

        .doc-card {
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: all 0.2s ease;
        }

        .doc-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
        }

        .doc-card-top {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 8px;
        }

        .doc-icon-wrap {
          padding: 6px;
          background: rgba(6, 182, 212, 0.1);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .doc-name-wrap {
          flex: 1;
          min-width: 0;
        }

        .doc-filename {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .doc-filesize {
          font-size: 11px;
          color: var(--text-subtle);
        }

        .doc-card-metrics {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .doc-metric-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          color: var(--text-muted);
        }

        .doc-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .doc-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-subtle);
        }

        .doc-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 8px;
          margin-bottom: 2px;
          padding: 0 2px;
        }

        .filter-chip {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .filter-chip:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }

        .filter-chip-active {
          background: rgba(99, 102, 241, 0.2) !important;
          border-color: rgba(99, 102, 241, 0.5) !important;
          color: #a5b4fc !important;
          font-weight: 600;
        }

        .filter-clear-btn {
          background: none;
          border: none;
          color: #f87171;
          font-size: 11px;
          cursor: pointer;
          text-decoration: underline;
        }

        .doc-delete-btn {
          background: transparent;
          border: none;
          color: var(--text-subtle);
          cursor: pointer;
          padding: 5px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .doc-delete-btn:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.15);
        }

        .doc-card {
          cursor: pointer;
        }

        .doc-card-active {
          border-color: rgba(99, 102, 241, 0.7) !important;
          background: rgba(99, 102, 241, 0.08) !important;
          box-shadow: 0 0 14px rgba(99, 102, 241, 0.18);
        }

        .sidebar-footer-hint {
          padding: 10px 16px;
          background: rgba(6, 182, 212, 0.04);
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.4;
        }
      `}</style>
    </aside>
  );
}
