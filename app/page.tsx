"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Loader2, Volume2, Square, Send } from "lucide-react";

type AssistantState = "idle" | "listening" | "thinking" | "speaking" | "error";
type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [state, setState] = useState<AssistantState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const saved = localStorage.getItem("hermes_chat_history");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("hermes_chat_history", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, state]);

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = "ko-KR";

        recognitionRef.current.onresult = async (event: any) => {
          const text = event.results[0][0].transcript;
          setState("thinking");
          await handleSendToLLM(text);
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error === 'network') {
            setErrorMessage("마이크(STT) 네트워크 오류: Edge 브라우저 등에서 발생하는 호환성 문제입니다. 텍스트를 입력해주세요.");
            setState("error");
            setTimeout(() => setState("idle"), 5000);
          } else {
            setState("idle");
          }
        };

        recognitionRef.current.onend = () => {
          setState((prev) => (prev === "listening" ? "idle" : prev));
        };
      }
    }

    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  const toggleListen = () => {
    // If speaking, stop speaking immediately when user interrupts
    if (state === "speaking") {
      audioQueueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      setState("idle");
      return;
    }

    if (state === "listening") {
      recognitionRef.current?.stop();
      setState("idle");
    } else {
      setState("listening");
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Error starting recognition", e);
        setState("idle");
      }
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || state === "thinking") return;
    
    // Interrupt any ongoing speech
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    const text = textInput.trim();
    setTextInput("");
    setState("thinking");
    await handleSendToLLM(text);
  };

  const handleSendToLLM = async (text: string) => {
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const chatHistory = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
      });

      const data = await res.json();
      if (data.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
        speakText(data.text);
      } else {
        setState("idle");
      }
    } catch (error) {
      console.error("Error communicating with LLM:", error);
      setState("idle");
    }
  };

  const playNextAudio = () => {
    if (audioQueueRef.current.length === 0) {
      setState("idle");
      return;
    }

    const nextText = audioQueueRef.current.shift();
    if (!nextText) {
      playNextAudio();
      return;
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko&q=${encodeURIComponent(nextText)}`;
    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onplay = () => setState("speaking");
    audio.onended = () => {
      currentAudioRef.current = null;
      playNextAudio();
    };
    audio.onerror = (e) => {
      console.error("Audio playback error", e);
      currentAudioRef.current = null;
      playNextAudio(); // Skip to next if error
    };

    audio.play().catch(e => {
      console.error("Audio play failed:", e);
      currentAudioRef.current = null;
      playNextAudio();
    });
  };

  const speakText = (text: string) => {
    // Interrupt any ongoing speech
    audioQueueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    const cleanText = text.replace(/\*[^*]+\*/g, '').replace(/\([^)]+\)/g, '').trim();
    if (!cleanText) {
      setState("idle");
      return;
    }

    // Google Translate TTS limits around 200 chars, so chunk by punctuation
    // Splitting by '.', '?', '!' while preserving the punctuation
    const chunks = cleanText.match(/[^.!?]+[.!?]*|\s/g)
      ?.map(c => c.trim())
      .filter(c => c.length > 0) || [cleanText];

    // Combine short chunks so we don't make too many requests, limit ~150 chars
    const combinedChunks: string[] = [];
    let currentChunk = "";
    
    for (const chunk of chunks) {
      if ((currentChunk + " " + chunk).length < 150) {
        currentChunk += (currentChunk ? " " : "") + chunk;
      } else {
        if (currentChunk) combinedChunks.push(currentChunk);
        currentChunk = chunk;
      }
    }
    if (currentChunk) combinedChunks.push(currentChunk);

    audioQueueRef.current = combinedChunks;
    playNextAudio();
  };

  return (
    <main className="flex flex-col items-center p-8 max-w-md w-full h-screen mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-slate-100 tracking-wide mt-4">HERMES</h1>
      <p className="text-slate-400 mb-8 h-6 text-sm">
        {state === "error" ? <span className="text-red-400">{errorMessage}</span> :
         state === "listening" ? "듣고 있습니다..." : 
         state === "thinking" ? "생각 중..." : 
         state === "speaking" ? "말하는 중..." : 
         "마이크를 누르거나 텍스트를 입력하세요"}
      </p>

      {/* Avatar Button */}
      <div 
        className={`relative mb-8 flex justify-center items-center shrink-0 rounded-full overflow-hidden border-4 shadow-2xl transition-all duration-300 ease-in-out cursor-pointer z-10
          ${state === "thinking" ? "border-blue-500 opacity-80" : "border-slate-700 hover:scale-105 hover:border-slate-500"}
          ${state === "listening" ? "border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]" : ""}
          ${state === "speaking" ? "border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.5)]" : ""}
          ${state === "error" ? "border-red-800 opacity-50 grayscale" : ""}
        `}
        style={{
          width: state === "thinking" ? "8rem" : "12rem",
          height: state === "thinking" ? "8rem" : "12rem"
        }}
        onClick={toggleListen}
      >
        <img 
          src="/avatar.jpg" 
          alt="Avatar" 
          className="absolute inset-0 w-full h-full object-cover pointer-events-none" 
        />
        
        {/* State Indicators Overlay */}
        {state === "listening" && <div className="absolute inset-0 bg-red-500/20 mix-blend-overlay pointer-events-none"></div>}
        {state === "thinking" && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center backdrop-blur-[2px] pointer-events-none">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Chat History Container */}
      <div className="w-full flex-1 bg-slate-800/30 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 shadow-xl overflow-y-auto mb-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic text-sm">
            아직 대화가 없습니다.
          </div>
        ) : null}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${msg.role === "user" ? "text-slate-500" : "text-blue-400/80"}`}>
              {msg.role === "user" ? "You" : "Karina"}
            </span>
            <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
              msg.role === "user" 
                ? "bg-slate-700 text-slate-100 rounded-tr-none" 
                : "bg-blue-600/20 border border-blue-500/30 text-slate-200 rounded-tl-none"
            }`}>
              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Text Input */}
      <form onSubmit={handleTextSubmit} className="w-full flex gap-2 shrink-0 mb-4">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="텍스트로 대화하기..."
          className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={state === "thinking"}
        />
        <button
          type="submit"
          disabled={!textInput.trim() || state === "thinking"}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </main>
  );
}
