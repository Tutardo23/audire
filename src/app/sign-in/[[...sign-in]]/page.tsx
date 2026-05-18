"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import gsap from "gsap";
import {
  EnvelopeSimple,
  LockKey,
  ArrowRight,
  ShieldCheck,
  WarningCircle,
} from "phosphor-react";

export default function SignInPage() {
  const cardRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoaded) return;
    if (isSignedIn) {
      router.replace("/dashboard");
    }
  }, [authLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!cardRef.current) return;

    gsap.fromTo(
      cardRef.current,
      { y: 40, opacity: 0, scale: 0.98 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: "power3.out",
        delay: 0.1,
      }
    );
  }, []);

  const processClerkError = (err: any) => {
    const errorsArray = err?.errors || err?.error?.errors;

    if (errorsArray?.length) {
      const first = errorsArray[0];

      if (first.code === "form_password_incorrect") {
        return "Contraseña incorrecta.";
      }

      if (first.code === "form_identifier_not_found") {
        return "No existe una cuenta con este correo.";
      }

      if (first.code === "session_exists") {
        return "Ya tenés una sesión activa. Redirigiendo...";
      }

      return first.longMessage || first.message || "Error al autenticar.";
    }

    return "Ocurrió un error inesperado al intentar iniciar sesión.";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setErrorMsg("");
    setIsLoading(true);

    try {
      const res = await signIn.create({
        strategy: "password",
        identifier: emailAddress.trim(),
        password,
      });

      if (res.status === "complete") {
        await setActive?.({ session: res.createdSessionId });
        router.replace("/dashboard");
        return;
      }

      if (res.status === "needs_second_factor") {
        setErrorMsg(
          "Esta cuenta requiere un segundo factor de autenticación. Configuralo en Clerk o usá el flujo MFA correspondiente."
        );
        setIsLoading(false);
        return;
      }

      if (res.status === "needs_client_trust") {
        setErrorMsg(
          "Clerk requiere validación adicional para este dispositivo nuevo."
        );
        setIsLoading(false);
        return;
      }

      if (res.status === "needs_new_password") {
        setErrorMsg("La cuenta requiere cambio de contraseña.");
        setIsLoading(false);
        return;
      }

      if (res.status === "needs_identifier" || res.status === "needs_first_factor") {
        setErrorMsg("No se pudo completar el inicio de sesión.");
        setIsLoading(false);
        return;
      }

      setErrorMsg(`Estado no esperado: ${String(res.status)}`);
      setIsLoading(false);
    } catch (err: any) {
      console.error("❌ Clerk login error:", err);
      setErrorMsg(processClerkError(err));
      setIsLoading(false);

      if (err?.errors?.[0]?.code === "session_exists") {
        router.replace("/dashboard");
      }
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-4">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-[100px]" />
        <div className="absolute -right-[5%] bottom-[10%] h-[600px] w-[600px] rounded-full bg-indigo-500/5 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#0F172A 1px, transparent 1px), linear-gradient(90deg, #0F172A 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div
        ref={cardRef}
        className="glass-panel pointer-events-auto relative z-50 w-full max-w-[420px] rounded-[2rem] bg-white/60 p-8 shadow-2xl shadow-slate-200 backdrop-blur-xl md:p-10"
      >
        <div className="mb-8 flex flex-col items-center justify-center">
          <div className="flex h-20 items-center justify-center">
            <img
              src="/escudo-apdes.png"
              alt="Escudo APDES"
              className="h-full w-auto object-contain drop-shadow-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = document.getElementById("fallback-signin");
                if (fallback) fallback.style.display = "block";
              }}
            />
            <span
              id="fallback-signin"
              className="hidden text-4xl font-black tracking-tight text-blue-700"
            >
              APDES
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
            Iniciar Sesión
          </h1>

          <p className="mt-2 text-center text-sm font-medium text-slate-500">
            Panel de control institucional APDES.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-red-600">
            <WarningCircle size={20} weight="fill" className="shrink-0" />
            <p className="text-xs font-bold leading-tight">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Correo Institucional
            </label>
            <div className="relative flex items-center">
              <EnvelopeSimple size={20} className="absolute left-4 text-slate-400" />
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="director@colegio.edu.ar"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Contraseña
            </label>
            <div className="relative flex items-center">
              <LockKey size={20} className="absolute left-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !isLoaded}
            className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 py-4 text-sm font-bold text-white transition-all hover:bg-blue-800 hover:shadow-lg hover:shadow-blue-700/25 active:scale-[0.98] disabled:opacity-70"
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                Acceder al Dashboard
                <ArrowRight
                  size={18}
                  weight="bold"
                  className="transition-transform group-hover:translate-x-1"
                />
              </>
            )}
          </button>

          <div className="mt-4 flex flex-col items-center gap-3">
            <a
              href="/"
              className="relative z-[9999] inline-block pointer-events-auto text-xs font-bold text-slate-400 transition-colors hover:text-slate-600"
            >
              ← Volver a la página principal
            </a>
          </div>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-200 pt-6 text-xs font-medium text-slate-400">
          <ShieldCheck size={16} weight="duotone" className="text-emerald-500" />
          <span>Seguridad gestionada por Clerk</span>
        </div>
      </div>
    </main>
  );
}