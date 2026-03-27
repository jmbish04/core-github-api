import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SparkLanding() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#050505] text-white overflow-hidden flex items-center justify-center font-sans selection:bg-cyan-500/30">
      {/* 3D Depth Simulation: Ethereal background glow mapped to a deep z-layer */}
      <div className="absolute w-[800px] h-[800px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none z-0 animate-pulse duration-10000" />
      
      {/* Core UI Container with Glassmorphism */}
      <div className="z-10 w-full max-w-3xl p-6 relative">
        <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-3xl rounded-3xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)]" />
        
        <Card className="relative bg-transparent border-none p-12 flex flex-col items-center text-center space-y-8 shadow-none">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-700 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.5)] transform hover:scale-110 hover:rotate-12 transition-all duration-300">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-6xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white/90 to-white/40">
              Spark Core
            </h1>
            <p className="text-xl text-gray-400 max-w-xl mx-auto font-light leading-relaxed">
              Genesis state initialized. Your modern React template is successfully mapped to the edge network via ASSETS binding.
            </p>
          </div>
          
          <div className="flex gap-6 pt-8">
            <Button 
                className="h-14 px-8 bg-white text-black hover:bg-cyan-50 rounded-full text-lg font-medium transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]"
                onClick={() => navigate("/dashboard")}
            >
              Initialize World
            </Button>
            <Button 
                variant="outline" 
                className="h-14 px-8 rounded-full border-white/20 bg-transparent hover:bg-white/10 text-white text-lg font-medium transition-all backdrop-blur-md"
                onClick={() => navigate("/dashboard")}
            >
              <Globe className="mr-2 w-5 h-5" /> Edge Analytics
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
