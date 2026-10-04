import React, { useState } from 'react';
import { 
  GraduationCap, 
  Cpu, 
  Database, 
  Server, 
  HelpCircle, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  X,
  Menu
} from 'lucide-react';

export default function Header({ health, onRefreshHealth, isSidebarOpen, onToggleSidebar }) {
  const [showStatusModal, setShowStatusModal] = useState(false);

  const ollamaOnline = health?.ollama?.status === 'online';
  const dbConnected = health?.database?.status === 'connected';
  const backendHealthy = health?.status === 'healthy' || health?.status === 'degraded';

  const getStatusBadge = () => {
    if (ollamaOnline && dbConnected) {
      return (
        <span className="badge badge-emerald">
          <CheckCircle2 size={13} />
          System Operational
        </span>
      );
    }
    if (ollamaOnline || dbConnected) {
      return (
        <span className="badge badge-amber">
          <AlertTriangle size={13} />
          Partial Setup
        </span>
      );
    }
    return (
      <span className="badge badge-rose">
        <XCircle size={13} />
        Setup Required
      </span>
    );
  };

  return (
    <>
      <header className="header-container">
        <div className="header-left">
          <button 
            className="mobile-menu-btn" 
            onClick={onToggleSidebar}
            aria-label="Toggle Documents Sidebar"
          >
            <Menu size={20} />
          </button>
          
          <div className="logo-wrapper">
            <div className="logo-icon-box">
              <GraduationCap size={24} className="logo-icon" />
            </div>
            <div>
              <div className="title-row">
                <h1 className="app-title">COLLEGE KNOWLEDGE AI</h1>
                <span className="version-pill">v1.0</span>
              </div>
              <p className="app-subtitle">
                Study Notes RAG &middot; Local Ollama &middot; Supabase pgvector &middot; LangGraph
              </p>
            </div>
          </div>
        </div>

        <div className="header-right">
          <button 
            className="status-summary-btn" 
            onClick={() => setShowStatusModal(true)}
            title="View system status and configuration"
          >
            {getStatusBadge()}
            <span className="status-label-detail">Diagnostics</span>
          </button>

          <button 
            className="icon-refresh-btn" 
            onClick={onRefreshHealth}
            title="Refresh system health"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* Diagnostics / Setup Modal */}
      {showStatusModal && (
        <div className="modal-backdrop" onClick={() => setShowStatusModal(false)}>
          <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-center gap-2">
                <Cpu size={20} className="text-indigo" />
                <h3>System Architecture & Status</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setShowStatusModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Ollama Card */}
              <div className="service-status-card">
                <div className="service-card-header">
                  <div className="flex-center gap-2">
                    <Cpu size={18} className="text-cyan" />
                    <strong>Local Ollama Generative AI</strong>
                  </div>
                  {ollamaOnline ? (
                    <span className="badge badge-emerald">Connected</span>
                  ) : (
                    <span className="badge badge-rose">Offline</span>
                  )}
                </div>
                <div className="service-card-details">
                  <p><strong>Base URL:</strong> <code>{health?.ollama?.base_url || 'http://localhost:11434'}</code></p>
                  <p><strong>LLM Model:</strong> <code>{health?.configuration?.model || 'llama3.2'}</code></p>
                  <p><strong>Embed Model:</strong> <code>{health?.configuration?.embed_model || 'nomic-embed-text'}</code></p>
                  {!ollamaOnline && (
                    <div className="troubleshoot-box">
                      <p className="troubleshoot-title">Troubleshooting Ollama:</p>
                      <ol>
                        <li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a></li>
                        <li>Open a terminal and start Ollama: <code>ollama serve</code></li>
                        <li>Pull required models:
                          <pre>ollama pull llama3.2&#10;ollama pull nomic-embed-text</pre>
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              {/* Supabase pgvector Card */}
              <div className="service-status-card">
                <div className="service-card-header">
                  <div className="flex-center gap-2">
                    <Database size={18} className="text-indigo" />
                    <strong>Supabase PostgreSQL + pgvector</strong>
                  </div>
                  {dbConnected ? (
                    <span className="badge badge-emerald">Connected</span>
                  ) : (
                    <span className="badge badge-amber">Action Needed</span>
                  )}
                </div>
                <div className="service-card-details">
                  <p><strong>Status:</strong> {health?.database?.status || 'not_configured'}</p>
                  <p><strong>Vector Dimension:</strong> <code>{health?.configuration?.dimension || 768}</code></p>
                  {!dbConnected && (
                    <div className="troubleshoot-box">
                      <p className="troubleshoot-title">Connecting Supabase:</p>
                      <ol>
                        <li>Create a project on <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a></li>
                        <li>Go to <strong>SQL Editor</strong> and run <code>database/schema.sql</code></li>
                        <li>Add your <code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code> or <code>DATABASE_URL</code> to <code>.env</code> in the project root.</li>
                        <li>Restart backend or click refresh.</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              {/* LangGraph Agent Card */}
              <div className="service-status-card">
                <div className="service-card-header">
                  <div className="flex-center gap-2">
                    <Server size={18} className="text-purple" />
                    <strong>LangGraph Multi-Step Reasoning Agent</strong>
                  </div>
                  <span className="badge badge-cyan">Active</span>
                </div>
                <div className="service-card-details">
                  <p>Autonomous state graph dynamically analyzes student queries and decides when to search pgvector document chunks versus answering direct conversational queries.</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="primary-btn" onClick={() => setShowStatusModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .header-container {
          height: 68px;
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 40;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mobile-menu-btn {
          display: none;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-main);
          padding: 6px;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .mobile-menu-btn {
            display: flex;
          }
        }

        .logo-wrapper {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .logo-icon-box {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
        }

        .logo-icon {
          color: #ffffff;
        }

        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .app-title {
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.01em;
          background: linear-gradient(90deg, #ffffff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .version-pill {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.4);
          padding: 2px 6px;
          border-radius: 6px;
        }

        .app-subtitle {
          font-size: 12px;
          color: var(--text-subtle);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-summary-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-subtle);
          padding: 6px 12px;
          border-radius: var(--radius-full);
          cursor: pointer;
          color: var(--text-main);
          transition: all 0.2s ease;
        }

        .status-summary-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }

        .status-label-detail {
          font-size: 12px;
          color: var(--text-muted);
        }

        .icon-refresh-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .icon-refresh-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 16px;
        }

        .modal-card {
          width: 100%;
          max-width: 600px;
          background: #0d1424;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          animation: fadeIn 0.2s ease-out;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .modal-close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }
        .modal-close-btn:hover { color: #fff; }

        .modal-body {
          padding: 20px 24px;
          max-height: 70vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .service-status-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 14px 16px;
        }

        .service-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .service-card-details {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.6;
        }

        .troubleshoot-box {
          margin-top: 10px;
          background: rgba(245, 158, 11, 0.06);
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          font-size: 12px;
          color: #cbd5e1;
        }

        .troubleshoot-title {
          font-weight: 600;
          color: #fbbf24;
          margin-bottom: 4px;
        }

        .troubleshoot-box ol {
          margin-left: 18px;
        }

        .troubleshoot-box a {
          color: #67e8f9;
          text-decoration: underline;
        }

        .troubleshoot-box pre {
          background: #070b14;
          padding: 6px 10px;
          margin-top: 4px;
          border-radius: 6px;
          color: #38bdf8;
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .modal-footer {
          padding: 14px 24px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          justify-content: flex-end;
        }

        .primary-btn {
          background: var(--accent-primary);
          color: #ffffff;
          border: none;
          padding: 8px 18px;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        }
        .primary-btn:hover {
          background: var(--accent-primary-hover);
        }

        .flex-center {
          display: flex;
          align-items: center;
        }
        .gap-2 { gap: 8px; }
        .text-indigo { color: #818cf8; }
        .text-cyan { color: #06b6d4; }
        .text-purple { color: #a855f7; }
      `}</style>
    </>
  );
}
