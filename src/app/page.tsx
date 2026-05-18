"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, ShieldCheck } from "phosphor-react";

export default function HomePage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isSignedIn, router]);

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-4">
      {/* Fondo animado y grilla */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-[10%] -top-[10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px]" />
        <div className="absolute -right-[5%] bottom-[10%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#0F172A 1px, transparent 1px), linear-gradient(90deg, #0F172A 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="glass-panel relative z-10 w-full max-w-[500px] rounded-[2rem] p-10 bg-white/60 backdrop-blur-xl shadow-2xl shadow-slate-200 text-center">
        <div className="mb-8 flex flex-col items-center justify-center">
          {/* ✅ ESCUDO APDES GRANDE PARA EL HOME */}
          <div className="flex h-24 items-center justify-center">
            <img 
              src="/escudo-apdes.png" 
              alt="Escudo APDES" 
              className="h-full w-auto object-contain drop-shadow-lg"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                document.getElementById('fallback-home')!.style.display = 'block';
              }}
            />
            <span id="fallback-home" className="hidden font-display text-5xl font-black tracking-tight text-blue-700">
              APDES
            </span>
          </div>
          <h1 className="font-display mt-6 text-4xl font-black tracking-tight text-slate-900">
            Analytics
          </h1>
          <p className="mt-3 text-sm font-medium text-slate-500 px-4 leading-relaxed">
            Plataforma centralizada de inteligencia y análisis de encuestas institucionales.
          </p>
        </div>

        <div className="flex flex-col gap-4 mt-8">
          <Link
            href="/sign-in"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-4 text-sm font-bold text-white transition-all hover:bg-blue-800 hover:shadow-lg hover:shadow-blue-700/25 active:scale-[0.98]"
          >
            Iniciar Sesión{" "}
            <ArrowRight size={18} weight="bold" className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 border-t border-slate-200 pt-6 text-xs font-medium text-slate-400">
          <ShieldCheck size={16} weight="duotone" className="text-emerald-500" />
          <span>Sistema de acceso seguro cifrado</span>
        </div>
      </div>
    </main>
  );
}