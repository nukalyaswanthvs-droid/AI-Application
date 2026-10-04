import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DocumentSidebar from './components/DocumentSidebar';
import ChatArea from './components/ChatArea';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [health, setHealth] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      sender: 'ai',
      role: 'assistant',
      text: "👋 **Welcome to College Knowledge AI**!\n\nYour study documents are indexed using **nomic-embed-text** embeddings.\n\n- 📄 View your uploaded documents and chunks in the sidebar.\n- 📤 Upload new lecture PDFs (syllabi, slides, textbooks) at any time.\n- 💡 Switch between **Direct RAG Search** and **LangGraph Reasoning Agent** modes above.",
      content: "👋 **Welcome to College Knowledge AI**!\n\nYour study documents are indexed using **nomic-embed-text** embeddings.\n\n- 📄 View your uploaded documents and chunks in the sidebar.\n- 📤 Upload new lecture PDFs (syllabi, slides, textbooks) at any time.\n- 💡 Switch between **Direct RAG Search** and **LangGraph Reasoning Agent** modes above.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sources: []
    }
  ]);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("rag"); // "rag" or "agent"

  // Fetch system health
  const fetchHealth = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error("Health check error:", err);
    }
  };

  // Fetch documents from database
  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Documents fetch error:", err);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchDocuments();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Handle PDF upload
  const handleUploadFile = async (file) => {
    setIsUploading(true);
    setUploadProgress("Extracting text with layout formatting...");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadProgress("Generating nomic-embed-text embeddings & saving chunks...");
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      await fetchDocuments();
      const successText = `📄 **Document Ingested:** \`${data.document?.filename || file.name}\`\n\n- **Pages:** ${data.document?.total_pages ?? 'N/A'}\n- **Chunks Indexed:** ${data.document?.total_chunks ?? 'N/A'}\n- **Embedding Model:** \`${data.document?.embedding_model || 'nomic-embed-text'}\`\n- **Vector Database:** Stored in pgvector/local store\n\nYour notes have been chunked, embedded, and stored with clean layout extraction!`;
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'ai',
          role: 'assistant',
          text: successText,
          content: successText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          sources: []
        }
      ]);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to process PDF.");
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  // Handle document delete
  const handleDeleteDocument = async (docId, filename) => {
    if (!window.confirm(`Delete document "${filename}" and its vector chunks?`)) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedDocumentId === docId) {
          setSelectedDocumentId(null);
        }
        await fetchDocuments();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to delete document");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete document");
    }
  };

  // Handle sample notes loading
  const handleLoadSampleDocument = () => {
    fetchDocuments();
  };

  // Handle user sending chat query
  const handleSendMessage = async (queryText) => {
    if (!queryText.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      role: 'user',
      text: queryText,
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'agent' ? '/api/agent' : '/api/chat';
      const payload = {
        query: queryText,
        top_k: 6,
        document_id: selectedDocumentId || undefined
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Query failed");
      }

      const answerText = data.answer || "No response received.";
      const botMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        role: 'assistant',
        text: answerText,
        content: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources || [],
        steps: data.steps || [],
        decision: data.decision,
        reasoning: data.reasoning
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      setError(err.message);
      const errText = `⚠️ **Error executing query:** ${err.message}\n\nPlease verify that Ollama is running and your models are loaded.`;
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          role: 'assistant',
          text: errText,
          content: errText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="app-container">
      <Header
        health={health}
        onRefreshHealth={fetchHealth}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="main-layout">
        <DocumentSidebar
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={setSelectedDocumentId}
          onDeleteDocument={handleDeleteDocument}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onUploadFile={handleUploadFile}
          onLoadSampleDocument={handleLoadSampleDocument}
          isOpen={isSidebarOpen}
        />

        <ChatArea
          messages={messages}
          isLoading={isLoading}
          error={error}
          mode={mode}
          onModeChange={setMode}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          documentsCount={documents.length}
        />
      </div>
    </div>
  );
}
