import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  BookOpen, 
  Layers, 
  Copy, 
  Check, 
  Trash2, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  Loader2, 
  GitBranch, 
  Compass, 
  HelpCircle,
  FileText
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

export default function ChatArea({
  messages,
  isLoading,
  error,
  mode,
  onModeChange,
  onSendMessage,
  onClearChat,
  documentsCount
}) {
  const [inputText, setInputText] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});
  const [expandedSteps, setExpandedSteps] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = inputText.trim();
    if (!query || isLoading) return;
    onSendMessage(query);
    setInputText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextareaChange = (e) => {
    setInputText(e.target.value);
    // Auto-adjust height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleSourceExpand = (msgIdx, srcIdx) => {
    const key = `${msgIdx}-${srcIdx}`;
    setExpandedSources(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleStepsExpand = (msgIdx) => {
    setExpandedSteps(prev => ({
      ...prev,
      [msgIdx]: !prev[msgIdx]
    }));
  };

  const starterQuestions = [
    "Summarize the key concepts covered in the notes.",
    "What are the main definitions and formulas mentioned?",
    "Generate 3 likely exam questions from the material.",
    "What does the document say about the primary topics?"
  ];

  return (
    <div className="chat-container">
      {/* Top Bar with Mode Switcher */}
      <div className="chat-header-bar">
        <div className="mode-toggle-group">
          <button 
            type="button"
            className={`mode-btn ${mode === 'rag' ? 'mode-btn-active' : ''}`}
            onClick={() => onModeChange('rag')}
            title="Standard RAG: Retrieves pgvector chunks and synthesizes answer"
          >
            <BookOpen size={14} />
            <span>Standard RAG</span>
          </button>
          
          <button 
            type="button"
            className={`mode-btn ${mode === 'agent' ? 'mode-btn-active' : ''}`}
            onClick={() => onModeChange('agent')}
            title="LangGraph Agent: Multi-step reasoning with autonomous retrieval routing"
          >
            <GitBranch size={14} />
            <span>LangGraph Agent</span>
            <span className="mode-badge">Multi-step</span>
          </button>
        </div>

        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button 
              className="clear-chat-btn"
              onClick={onClearChat}
              title="Clear message history"
            >
              <Trash2 size={14} />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="messages-scroll-area">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="empty-hero-icon-box">
              <Sparkles size={36} className="text-cyan" />
            </div>
            <h2 className="empty-hero-title">Welcome to College Knowledge AI</h2>
            <p className="empty-hero-subtitle">
              Ask any question about your uploaded PDF college notes. The AI searches relevant document chunks using <strong>Supabase pgvector</strong> and generates answers with <strong>local Ollama</strong>.
            </p>

            {documentsCount === 0 && (
              <div className="no-docs-warning">
                <AlertCircle size={15} className="text-amber flex-shrink-0" />
                <span>No notes uploaded yet. Upload a PDF using the left sidebar to start RAG retrieval!</span>
              </div>
            )}

            <div className="starter-prompts-section">
              <p className="starter-prompts-label">Quick academic questions to try:</p>
              <div className="starter-prompts-grid">
                {starterQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    className="starter-prompt-card"
                    onClick={() => {
                      setInputText(q);
                      textareaRef.current?.focus();
                    }}
                  >
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'user' || msg.role === 'user';
              const textContent = msg.text || msg.content || '';
              return (
                <div 
                  key={msg.id || idx} 
                  className={`message-row ${isUser ? 'message-user' : 'message-ai'}`}
                >
                  <div className="message-avatar">
                    {isUser ? (
                      <User size={16} />
                    ) : (
                      <Bot size={17} />
                    )}
                  </div>

                  <div className="message-content-wrapper">
                    <div className="message-meta-row">
                      <span className="message-sender-name">
                        {isUser ? 'You' : 'College Knowledge AI'}
                      </span>
                      {!isUser && (
                        <span className={`badge ${msg.mode === 'agent' ? 'badge-cyan' : 'badge-indigo'}`}>
                          {msg.mode === 'agent' ? 'LangGraph Agent' : 'Standard RAG'}
                        </span>
                      )}
                      <span className="message-timestamp">
                        {msg.timestamp || 'Just now'}
                      </span>
                    </div>

                    {/* AI LangGraph Step-by-Step Reasoning Trace */}
                    {!isUser && msg.steps && msg.steps.length > 0 && (
                      <div className="agent-steps-container">
                        <button 
                          className="agent-steps-header"
                          onClick={() => toggleStepsExpand(idx)}
                        >
                          <div className="flex-center gap-2">
                            <Compass size={14} className="text-cyan" />
                            <span>Agent Multi-Step Reasoning ({msg.steps.length} steps)</span>
                          </div>
                          {expandedSteps[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {expandedSteps[idx] && (
                          <div className="agent-steps-content animate-fade-in">
                            {msg.steps.map((step, sIdx) => (
                              <div key={sIdx} className="agent-step-item">
                                <span className="agent-step-num">{sIdx + 1}</span>
                                <span className="agent-step-text">{step}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Bubble Body */}
                    <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
                      {isUser ? (
                        <p className="user-text">{textContent}</p>
                      ) : (
                        <>
                          <MarkdownRenderer content={textContent} />

                          {/* Copy button */}
                          <div className="message-actions-bar">
                            <button 
                              className="msg-action-btn"
                              onClick={() => copyToClipboard(textContent, idx)}
                              title="Copy answer to clipboard"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check size={13} className="text-emerald" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span>Copy Answer</span>
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                  {/* Source Citations & Page Numbers */}
                  {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      <div className="sources-heading">
                        <BookOpen size={13} className="text-indigo" />
                        <span>Sources & Referenced Pages ({msg.sources.length}):</span>
                      </div>

                      <div className="sources-list">
                        {msg.sources.map((src, sIdx) => {
                          const isExpanded = expandedSources[`${idx}-${sIdx}`];
                          return (
                            <div key={sIdx} className="source-citation-card glass-panel">
                              <div 
                                className="source-citation-header"
                                onClick={() => toggleSourceExpand(idx, sIdx)}
                              >
                                <div className="source-header-left">
                                  <FileText size={14} className="text-cyan" />
                                  <strong className="source-doc-name">{src.document}</strong>
                                  <span className="badge badge-indigo">Page {src.page}</span>
                                  {src.similarity && (
                                    <span className="source-similarity" title="Cosine Similarity Score">
                                      {Math.round(src.similarity * 100)}% match
                                    </span>
                                  )}
                                </div>
                                <button className="source-toggle-btn">
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="source-snippet-box animate-fade-in">
                                  <p className="source-snippet-text">{src.snippet}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="message-row message-ai animate-fade-in">
                <div className="message-avatar">
                  <Bot size={17} />
                </div>
                <div className="message-content-wrapper">
                  <div className="message-meta-row">
                    <span className="message-sender-name">College Knowledge AI</span>
                    <span className="badge badge-cyan">
                      {mode === 'agent' ? 'LangGraph Processing' : 'RAG Pipeline'}
                    </span>
                  </div>
                  <div className="loading-bubble">
                    <Loader2 size={16} className="animate-spin text-indigo" />
                    <span className="loading-text">
                      {mode === 'agent' 
                        ? "LangGraph Agent analyzing question & querying pgvector..." 
                        : "Retrieving document chunks from Supabase pgvector & running Ollama..."}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner animate-fade-in">
          <AlertCircle size={16} className="text-rose flex-shrink-0" />
          <div className="error-text-wrap">
            <strong>Error: </strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="chat-form">
          <textarea
            ref={textareaRef}
            rows={1}
            className="chat-textarea"
            placeholder="Ask a question about your uploaded college notes... (Enter to send, Shift+Enter for newline)"
            value={inputText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!inputText.trim() || isLoading}
            title="Send question"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="input-hint">
          <span>AI answers strictly from uploaded documents. If not found, it responds: "I could not find this information in the uploaded documents."</span>
        </div>
      </div>

      <style>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-main);
          overflow: hidden;
        }

        .chat-header-bar {
          height: 52px;
          border-bottom: 1px solid var(--border-subtle);
          background: rgba(13, 20, 36, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          z-index: 10;
        }

        .mode-toggle-group {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.35);
          padding: 4px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .mode-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mode-btn:hover {
          color: var(--text-main);
        }

        .mode-btn-active {
          background: var(--accent-primary);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
        }

        .mode-badge {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .clear-chat-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          padding: 5px 12px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .clear-chat-btn:hover {
          color: #fb7185;
          border-color: rgba(244, 63, 94, 0.3);
          background: rgba(244, 63, 94, 0.08);
        }

        /* Messages */
        .messages-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .chat-empty-state {
          margin: auto;
          max-width: 620px;
          text-align: center;
          padding: 40px 20px;
        }

        .empty-hero-icon-box {
          width: 68px;
          height: 68px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, rgba(6, 182, 212, 0.05) 70%);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          box-shadow: 0 0 30px rgba(99, 102, 241, 0.2);
        }

        .empty-hero-title {
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .empty-hero-subtitle {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .no-docs-warning {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
          color: #fde68a;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 12.5px;
          margin-bottom: 28px;
          text-align: left;
        }

        .starter-prompts-section {
          text-align: left;
        }

        .starter-prompts-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-subtle);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 12px;
        }

        .starter-prompts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        @media (max-width: 650px) {
          .starter-prompts-grid {
            grid-template-columns: 1fr;
          }
        }

        .starter-prompt-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          color: var(--text-main);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .starter-prompt-card:hover {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.4);
          transform: translateY(-2px);
        }

        .messages-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 880px;
          margin: 0 auto;
          width: 100%;
        }

        .message-row {
          display: flex;
          gap: 14px;
        }

        .message-avatar {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .message-user .message-avatar {
          background: #3b82f6;
          color: #ffffff;
        }

        .message-ai .message-avatar {
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          color: #ffffff;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
        }

        .message-content-wrapper {
          flex: 1;
          min-width: 0;
        }

        .message-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .message-sender-name {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
        }

        .message-timestamp {
          font-size: 11px;
          color: var(--text-subtle);
        }

        .message-bubble {
          padding: 16px 20px;
          border-radius: var(--radius-md);
          line-height: 1.6;
        }

        .bubble-user {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #f8fafc;
        }

        .bubble-ai {
          background: rgba(18, 26, 45, 0.85);
          border: 1px solid var(--border-subtle);
          backdrop-filter: blur(10px);
          color: var(--text-main);
        }

        .user-text {
          font-size: 14.5px;
          white-space: pre-wrap;
        }

        .message-actions-bar {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .msg-action-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          color: var(--text-subtle);
          font-size: 11.5px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .msg-action-btn:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.05);
        }

        /* LangGraph Steps Accordion */
        .agent-steps-container {
          margin-bottom: 10px;
          background: rgba(6, 182, 212, 0.04);
          border: 1px solid rgba(6, 182, 212, 0.2);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .agent-steps-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: #67e8f9;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .agent-steps-content {
          padding: 10px 14px;
          background: rgba(0, 0, 0, 0.25);
          border-top: 1px solid rgba(6, 182, 212, 0.15);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .agent-step-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #cbd5e1;
        }

        .agent-step-num {
          background: rgba(6, 182, 212, 0.2);
          color: #67e8f9;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 2px;
        }

        /* Source Citations */
        .sources-container {
          margin-top: 14px;
        }

        .sources-heading {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .sources-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .source-citation-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .source-citation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .source-citation-header:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .source-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          flex-wrap: wrap;
        }

        .source-doc-name {
          color: #ffffff;
        }

        .source-similarity {
          font-size: 11px;
          color: var(--text-subtle);
        }

        .source-toggle-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }

        .source-snippet-box {
          padding: 10px 14px;
          background: #070b14;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
        }

        /* Loading bubble */
        .loading-bubble {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(18, 26, 45, 0.6);
          border: 1px solid var(--border-subtle);
          padding: 14px 18px;
          border-radius: var(--radius-md);
        }

        .loading-text {
          font-size: 13px;
          color: var(--text-muted);
        }

        /* Error */
        .error-banner {
          margin: 0 24px 12px;
          padding: 12px 16px;
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.3);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: flex-start;
          gap: 10px;
          color: #fecdd3;
          font-size: 13px;
        }

        /* Chat input */
        .chat-input-container {
          padding: 14px 24px 20px;
          background: rgba(10, 15, 26, 0.85);
          backdrop-filter: blur(14px);
          border-top: 1px solid var(--border-subtle);
        }

        .chat-form {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background: var(--bg-input);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: var(--radius-md);
          padding: 8px 12px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .chat-form:focus-within {
          border-color: var(--border-focus);
          box-shadow: 0 0 16px rgba(99, 102, 241, 0.2);
        }

        .chat-textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-main);
          font-family: var(--font-body);
          font-size: 14.5px;
          line-height: 1.5;
          resize: none;
          outline: none;
          padding: 4px 0;
          max-height: 160px;
        }

        .chat-textarea::placeholder {
          color: var(--text-subtle);
        }

        .send-button {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          border: none;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .send-button:hover:not(:disabled) {
          transform: scale(1.04);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .send-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .input-hint {
          margin-top: 8px;
          text-align: center;
          font-size: 11px;
          color: var(--text-subtle);
        }

        .text-emerald { color: #10b981; }
        .text-amber { color: #f59e0b; }
        .text-rose { color: #f43f5e; }
        .flex-center { display: flex; align-items: center; }
        .gap-2 { gap: 8px; }
      `}</style>
    </div>
  );
}
