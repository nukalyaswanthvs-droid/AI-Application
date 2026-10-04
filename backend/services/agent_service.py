import json
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from backend.config import settings
from backend.services.ollama_service import ollama_service
from backend.services.vector_store import vector_store

class AgentState(TypedDict):
    question: str
    document_id: Optional[str]        # Optional filter for specific document
    decision: str                     # "search" or "direct"
    reasoning: str                    # explanation of why it chose to search or not
    search_query: str                 # reformulated search query
    retrieved_chunks: List[Dict[str, Any]]
    steps: List[str]                  # multi-step execution logs for frontend UI
    answer: str
    sources: List[Dict[str, Any]]

DECISION_PROMPT = """You are the decision-making brain of College Knowledge AI.
Analyze the following student input and determine whether answering it requires searching the student's uploaded college documents or if it is a general conversational remark (greeting, thanking, asking what you are capable of, or asking for clarification).

Student Input: "{question}"

Respond with ONLY a valid JSON object in the following format:
{{
  "decision": "search" or "direct",
  "reasoning": "brief explanation why searching is or is not needed",
  "search_query": "refined academic search query to look up in notes (if searching)"
}}
Do not include any markdown fences or explanations outside the JSON."""

class CollegeAgentService:
    def __init__(self):
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("router", self._router_node)
        workflow.add_node("retriever", self._retriever_node)
        workflow.add_node("rag_synthesis", self._rag_synthesis_node)
        workflow.add_node("direct_response", self._direct_response_node)

        # Set entry point
        workflow.set_entry_point("router")

        # Conditional routing
        def route_condition(state: AgentState):
            if state.get("decision") == "search":
                return "retriever"
            return "direct_response"

        workflow.add_conditional_edges(
            "router",
            route_condition,
            {
                "retriever": "retriever",
                "direct_response": "direct_response"
            }
        )

        workflow.add_edge("retriever", "rag_synthesis")
        workflow.add_edge("rag_synthesis", END)
        workflow.add_edge("direct_response", END)

        return workflow.compile()

    async def _router_node(self, state: AgentState) -> Dict[str, Any]:
        """Node 1: Evaluates question and decides if document retrieval is required."""
        question = state["question"]
        steps = list(state.get("steps", []))
        steps.append(f"Analyzing question: '{question}'")

        try:
            prompt = DECISION_PROMPT.format(question=question)
            decision_raw = await ollama_service.generate_response(
                prompt=prompt,
                temperature=0.0
            )

            clean_json = decision_raw.strip()
            if "```" in clean_json:
                clean_json = clean_json.split("```")[1]
                if clean_json.startswith("json"):
                    clean_json = clean_json[4:]
                clean_json = clean_json.strip()

            parsed = json.loads(clean_json)
            decision = parsed.get("decision", "search").lower()
            reasoning = parsed.get("reasoning", "Decided to consult college documents.")
            search_query = parsed.get("search_query", question)

            if decision not in ["search", "direct"]:
                decision = "search"

        except Exception:
            # Safe fallback: if parsing fails, default to searching college documents
            decision = "search"
            reasoning = "Query requires looking into college notes."
            search_query = question

        if decision == "search":
            steps.append(f"Agent Action: Decided to search college notes. ({reasoning})")
        else:
            steps.append(f"Agent Action: General query detected. Responding directly without search. ({reasoning})")

        return {
            "decision": decision,
            "reasoning": reasoning,
            "search_query": search_query,
            "steps": steps
        }

    async def _retriever_node(self, state: AgentState) -> Dict[str, Any]:
        """Node 2: Embeds search query and retrieves relevant chunks from Supabase pgvector or local store."""
        steps = list(state.get("steps", []))
        search_query = state.get("search_query") or state["question"]
        doc_id = state.get("document_id")

        if doc_id:
            steps.append(f"Searching specific document for: '{search_query}'")
        else:
            steps.append(f"Embedding query and querying vector index for: '{search_query}'")

        query_emb = await ollama_service.get_embedding(search_query)
        chunks = await vector_store.similarity_search(
            query_embedding=query_emb,
            top_k=6,
            threshold=settings.SIMILARITY_THRESHOLD,
            document_id=doc_id
        )

        steps.append(f"Retrieved {len(chunks)} relevant deduplicated chunk(s)")

        return {
            "retrieved_chunks": chunks,
            "steps": steps
        }

    async def _rag_synthesis_node(self, state: AgentState) -> Dict[str, Any]:
        """Node 3: Synthesizes answer strictly from the retrieved chunks."""
        steps = list(state.get("steps", []))
        chunks = state.get("retrieved_chunks", [])
        question = state["question"]

        if not chunks:
            steps.append("No matching chunks met similarity threshold in vector store.")
            return {
                "answer": "I could not find this information in the uploaded documents.",
                "sources": [],
                "steps": steps
            }

        steps.append(f"Synthesizing academic answer using {settings.OLLAMA_MODEL}...")

        context_parts = []
        sources = []
        for c in chunks:
            meta = c.get("metadata", {})
            doc = meta.get("source", "Document")
            page = meta.get("page_number", "N/A")
            content = c.get("content", "").strip()
            context_parts.append(f"[Source: {doc} | Page {page}]:\n{content}")
            sources.append({
                "document": doc,
                "page": page,
                "similarity": c.get("similarity"),
                "snippet": content[:250] + ("..." if len(content) > 250 else "")
            })

        formatted_context = "\n\n---\n\n".join(context_parts)
        prompt = f"""Student Question: {question}

Uploaded Document Context:
{formatted_context}

Answer the student's question based strictly on the context above. If the context does not contain the answer, reply: "I could not find this information in the uploaded documents."
"""
        system = """You are College Knowledge AI. Use ONLY the provided document excerpts to answer.
If the information is not in the excerpts, state exactly: "I could not find this information in the uploaded documents."
Include page and document references when answering."""

        raw_answer = await ollama_service.generate_response(prompt=prompt, system_prompt=system, temperature=0.1)
        steps.append("Final answer successfully formulated.")

        return {
            "answer": raw_answer,
            "sources": sources,
            "steps": steps
        }

    async def _direct_response_node(self, state: AgentState) -> Dict[str, Any]:
        """Node 4: Answers conversational queries directly without reading notes."""
        steps = list(state.get("steps", []))
        question = state["question"]

        steps.append("Generating conversational response...")
        prompt = f"""You are College Knowledge AI, a specialized assistant for college students.
Respond politely and informatively to the user's conversational input. Remind them that they can upload PDF notes and ask questions about courses, exams, and concepts.

User Input: {question}"""

        answer = await ollama_service.generate_response(prompt=prompt, temperature=0.3)
        steps.append("Direct response complete.")

        return {
            "answer": answer,
            "sources": [],
            "steps": steps
        }

    async def run(self, question: str, document_id: Optional[str] = None) -> Dict[str, Any]:
        """Runs the LangGraph agent state graph."""
        initial_state: AgentState = {
            "question": question,
            "document_id": document_id,
            "decision": "",
            "reasoning": "",
            "search_query": "",
            "retrieved_chunks": [],
            "steps": [],
            "answer": "",
            "sources": []
        }

        final_state = await self.graph.ainvoke(initial_state)

        return {
            "answer": final_state.get("answer"),
            "sources": final_state.get("sources", []),
            "steps": final_state.get("steps", []),
            "decision": final_state.get("decision"),
            "reasoning": final_state.get("reasoning")
        }

agent_service = CollegeAgentService()
