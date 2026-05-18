"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarBlank, FileArrowUp, FileXls, Users } from "phosphor-react";
import {
  borrarPadronFamiliasProyectoDB,
  consolidarFamiliasDesdeStagingDB,
  guardarParticipacionFamiliarProyectoDB,
  importarFamiliasStagingDB,
  listarProyectosDB,
  precheckCoincidenciasFamiliasDB,
} from "../../actions";
import { SHEETS_BY_GROUP, type FamilyGroup, type SheetSpec } from "../../lib/familyImportConfig";

type Project = { id: string; nombre: string; descripcion: string | null; creado_at: string };

type SchoolCheck = {
  colegio: string;
  coincidencias: number;
  sinCoincidencia: number;
  coincidenciasDetalle: Array<{ nombre: string; familiaId: string; via: "dni" | "email" | "nombre" | "encuesta_nombre" }>;
  noCoincidenciasDetalle: Array<{ nombre: string; familiaId: string; motivo: string }>;
};

export default function FamiliesImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [tipo, setTipo] = useState<FamilyGroup>("varones");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");
  const [lastBatchId, setLastBatchId] = useState("");
  const [consolidating, setConsolidating] = useState(false);
  const [consolidationMsg, setConsolidationMsg] = useState("");
  const [precheckMsg, setPrecheckMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [precheckBySchool, setPrecheckBySchool] = useState<SchoolCheck[]>([]);
  const [selectedSchool, setSelectedSchool] = useState("");

  useEffect(() => {
    listarProyectosDB()
      .then((rows) => setProjects(Array.isArray(rows) ? (rows as Project[]) : []))
      .finally(() => setLoadingProjects(false));
  }, []);

  const yearProjects = useMemo(() => {
    return projects.filter((p) => String(p.nombre || "").includes(anio));
  }, [projects, anio]);

  const selectedProject = yearProjects.find((p) => p.id === projectId);
  const expectedSheets = SHEETS_BY_GROUP[tipo];
  const totalExpectedRows = expectedSheets.reduce((acc: number, s: SheetSpec) => acc + s.filas, 0);

  const summary = useMemo(() => {
    if (!file) return null;

    const mb = (file.size / 1024 / 1024).toFixed(2);

    return {
      filename: file.name,
      sizeMb: mb,
      recomendaciones: [
        "Subir por grupo: varones, mujeres o jardines (no mezclado).",
        "Revisar que el proyecto elegido corresponda al mismo año.",
        "Confirmar importación recién después del análisis.",
      ],
    };
  }, [file]);

  const handleAnalyze = () => {
    if (!file || !projectId) return;

    setAnalyzing(true);
    setAnalyzeError("");
    setAnalysisResult(null);
    setIsAnalyzed(false);
    setConfirmMsg("");
    setConsolidationMsg("");
    setPrecheckMsg("");
    setPrecheckBySchool([]);

    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("group", tipo);
    fd.set("file", file);

    fetch("/api/families/analyze", { method: "POST", body: fd })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Error al analizar.");

        setAnalysisResult(data);
        setIsAnalyzed(true);
      })
      .catch((e) => {
        setIsAnalyzed(false);
        setAnalyzeError(String(e?.message || "No se pudo analizar el archivo."));
      })
      .finally(() => setAnalyzing(false));
  };

  const handlePrecheck = async () => {
    if (!file || !projectId || !isAnalyzed) return;

    setChecking(true);
    setPrecheckMsg("");

    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("group", tipo);
      fd.set("file", file);

      const r = await precheckCoincidenciasFamiliasDB(fd);

      setPrecheckBySchool(Array.isArray(r.porColegio) ? r.porColegio : []);
      setSelectedSchool(Array.isArray(r.porColegio) && r.porColegio.length > 0 ? r.porColegio[0].colegio : "");

      setPrecheckMsg(
        `Control padrón OK. Contactos: ${r.contactosPadron} (DNI ${r.dniEnPadron}, email ${r.emailsEnPadron}). Duplicados en archivo → nombre: ${r.duplicadosNombreEnArchivo}, DNI: ${r.duplicadosDniEnArchivo}, email: ${r.duplicadosEmailEnArchivo}. Coincidencias con padrón ya cargado en proyecto → nombre: ${r.coincidenciasConProyectoPorNombre}, DNI: ${r.coincidenciasConProyectoPorDni}, email: ${r.coincidenciasConProyectoPorEmail}.`,
      );
    } catch (e) {
      setPrecheckMsg(`Error en pre-chequeo: ${String((e as Error)?.message || "desconocido")}`);
    } finally {
      setChecking(false);
    }
  };

  const readyToConfirm = Boolean(file && projectId && isAnalyzed && analysisResult?.resumen?.severidad !== "critical");

 const handleConfirm = async () => {
  if (!file || !projectId || !isAnalyzed) return;

  setConfirming(true);
  setConfirmMsg("");

  let snapshotSaved = false;

  try {
    if (analysisResult?.comparacion && Array.isArray(analysisResult?.porColegio)) {
      await guardarParticipacionFamiliarProyectoDB({
        projectId,
        resumen: analysisResult.comparacion,
        porColegio: analysisResult.porColegio,
        diagnostico: null,
      });

      snapshotSaved = true;
    }

    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("group", tipo);
      fd.set("file", file);

      const result = await importarFamiliasStagingDB(fd);

      setLastBatchId(result.batchId);
      setConfirmMsg(
        `Participación familiar guardada para dashboards. Importación staging OK. Batch ${result.batchId} • Filas ${result.inserted}`,
      );
    } catch (stagingError) {
      console.error("Error importando staging:", stagingError);

      if (snapshotSaved) {
        setConfirmMsg(
          "Participación familiar guardada para dashboards. Falló solamente la importación staging del Excel. Ya podés revisar Director/Equipo; los gráficos deberían aparecer.",
        );
      } else {
        setConfirmMsg(
          `Error al confirmar: ${String((stagingError as any)?.message || "desconocido")}`,
        );
      }
    }
  } catch (snapshotError) {
    console.error("Error guardando participación familiar:", snapshotError);

    setConfirmMsg(
      `Error al guardar participación familiar: ${String((snapshotError as any)?.message || "desconocido")}`,
    );
  } finally {
    setConfirming(false);
  }
};
  const handleConsolidate = async () => {
    if (!lastBatchId) return;

    setConsolidating(true);
    setConsolidationMsg("");

    try {
      const result = await consolidarFamiliasDesdeStagingDB(lastBatchId);

      setConsolidationMsg(
        `Consolidación OK. Familias: +${result.familiesInserted}/~${result.familiesUpdated} • Integrantes: +${result.membersInserted}/~${result.membersUpdated} • Rechazadas: ${result.rejected}`,
      );
    } catch (e) {
      setConsolidationMsg(`Error al consolidar: ${String((e as any)?.message || "desconocido")}`);
    } finally {
      setConsolidating(false);
    }
  };

  const handleDeletePadron = async () => {
    if (!projectId) return;

    if (!confirm(`¿Seguro que querés borrar el padrón del proyecto ${selectedProject?.nombre || projectId}? Esta acción no se puede deshacer.`)) return;

    setDeleting(true);

    try {
      await borrarPadronFamiliasProyectoDB(projectId, tipo);
      setConsolidationMsg("Padrón borrado correctamente para este proyecto/grupo.");
      setConfirmMsg("");
      setLastBatchId("");
    } catch (e) {
      setConsolidationMsg(`Error al borrar padrón: ${String((e as Error)?.message || "desconocido")}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] p-6 font-sans">
      <div className="mx-auto w-full max-w-4xl">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={16} weight="bold" /> Volver al Hub
        </Link>

        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Importar Padrón Audire</h2>
            <p className="mt-1 text-sm text-gray-500">Flujo seguro: Analizar primero, Confirmar importación después.</p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <CalendarBlank size={18} weight="bold" className="text-blue-600" />
                Año académico
              </label>
              <select value={anio} onChange={(e) => { setAnio(e.target.value); setProjectId(""); }} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                {["2024", "2025", "2026", "2027"].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Users size={18} weight="bold" className="text-blue-600" />
                Grupo de colegios
              </label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "varones" | "mujeres" | "jardines")} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                <option value="varones">Varones</option>
                <option value="mujeres">Mujeres</option>
                <option value="jardines">Jardines</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Proyecto (filtrado por año)</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                <option value="">{loadingProjects ? "Cargando proyectos..." : "Seleccionar proyecto..."}</option>
                {yearProjects.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {!loadingProjects && yearProjects.length === 0 && (
                <p className="text-xs font-semibold text-amber-600">No hay proyectos con el año {anio} en el nombre.</p>
              )}
            </div>
          </div>

          <div className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 transition-colors hover:bg-gray-100/50">
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            {file ? (
              <div className="text-center">
                <div className="mb-3 inline-flex rounded-full bg-green-100 p-3 text-green-600"><FileXls size={32} weight="fill" /></div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="mt-1 text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-4 inline-flex rounded-full bg-blue-50 p-4 text-blue-600 transition-transform group-hover:scale-105"><FileArrowUp size={32} weight="duotone" /></div>
                <p className="text-sm font-medium text-gray-900">Hacé clic o arrastrá el Excel</p>
                <p className="mt-1 text-xs text-gray-500">Solo .xlsx / .xls</p>
              </div>
            )}
          </div>

          {summary && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Resumen de análisis previo</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Archivo: {summary.filename} ({summary.sizeMb} MB)</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">Año: {anio} • Grupo: {tipo} • Proyecto: {selectedProject?.nombre || "Sin seleccionar"}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-slate-600">
                {summary.recomendaciones.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Control esperado para grupo {tipo}</p>
            <p className="mt-1 text-xs font-semibold text-indigo-700">Hojas esperadas: {expectedSheets.length} • Filas de referencia: {totalExpectedRows.toLocaleString("es-AR")}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {expectedSheets.map((sheet: SheetSpec) => (
                <div key={sheet.hoja} className="rounded-xl border border-indigo-100 bg-white p-3">
                  <p className="text-xs font-black text-slate-800">{sheet.hoja}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">
                    Filas: {sheet.filas} • Encabezado en fila {sheet.encabezadoFila}
                  </p>
                  {sheet.observacion && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700">{sheet.observacion}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-end gap-3">
            <button onClick={handleAnalyze} disabled={!file || !projectId || analyzing} className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-all ${file && projectId ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" : "cursor-not-allowed bg-gray-100 text-gray-400"}`}>
              {analyzing ? "Analizando..." : "Analizar archivo"}
            </button>
            <button onClick={handleConfirm} disabled={!readyToConfirm || confirming} className={`inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-all ${readyToConfirm ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700" : "cursor-not-allowed bg-gray-100 text-gray-400"}`}>
              Confirmar importación
              <ArrowRight size={16} weight="bold" />
            </button>
            <button onClick={handlePrecheck} disabled={!readyToConfirm || checking} className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-all ${readyToConfirm ? "bg-sky-600 text-white shadow-md hover:bg-sky-700" : "cursor-not-allowed bg-gray-100 text-gray-400"}`}>
              {checking ? "Chequeando..." : "Controlar personas"}
            </button>
            <button onClick={handleConsolidate} disabled={!lastBatchId || consolidating} className={`rounded-lg px-6 py-2.5 text-sm font-medium transition-all ${lastBatchId ? "bg-violet-600 text-white shadow-md hover:bg-violet-700" : "cursor-not-allowed bg-gray-100 text-gray-400"}`}>
              {consolidating ? "Consolidando..." : "Consolidar batch"}
            </button>
          </div>

          {analyzeError && <p className="mt-3 text-sm font-bold text-red-600">{analyzeError}</p>}
          {precheckMsg && <p className="mt-3 text-sm font-bold text-sky-700">{precheckMsg}</p>}

          {precheckBySchool.length > 0 && (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-sky-700">Control por colegio</p>

              <div className="mt-2 flex flex-wrap gap-2">
                {precheckBySchool.map((c) => (
                  <button
                    key={c.colegio}
                    onClick={() => setSelectedSchool(c.colegio)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${selectedSchool === c.colegio ? "bg-sky-700 text-white" : "border border-sky-200 bg-white text-sky-700"}`}
                  >
                    {c.colegio}
                  </button>
                ))}
              </div>

              {precheckBySchool.filter((c) => c.colegio === selectedSchool).map((c) => (
                <div key={c.colegio} className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-white p-3 text-xs text-slate-700">
                    <p className="font-bold">Coincidencias ({c.coincidencias})</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {c.coincidenciasDetalle.map((d, i: number) => (
                        <li key={`${d.nombre}-${i}`}>{d.nombre} — ID {d.familiaId} ({d.via})</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl bg-white p-3 text-xs text-slate-700">
                    <p className="font-bold">No coincidencias ({c.sinCoincidencia})</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {c.noCoincidenciasDetalle.map((d, i: number) => (
                        <li key={`${d.nombre}-${i}`}>{d.nombre} — ID {d.familiaId} — {d.motivo}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}

          {analysisResult?.ok && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Resultado del análisis real</p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                Hojas detectadas: {analysisResult.resumen.hojasDetectadas} / esperadas: {analysisResult.resumen.hojasEsperadas}
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                Total filas detectadas: {analysisResult.resumen.totalDetectado?.toLocaleString("es-AR")} / esperadas: {analysisResult.resumen.totalEsperado?.toLocaleString("es-AR")} (delta {analysisResult.resumen.deltaTotal})
              </p>
              <p className={`mt-1 text-xs font-bold ${analysisResult.resumen.severidad === "ok" ? "text-emerald-700" : analysisResult.resumen.severidad === "warning" ? "text-amber-700" : "text-red-700"}`}>
                Severidad del análisis: {analysisResult.resumen.severidad}
              </p>

              {analysisResult.resumen.faltantes.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-red-600">Faltan hojas: {analysisResult.resumen.faltantes.join(", ")}</p>
              )}

              {analysisResult.resumen.recomendaciones?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-slate-700">
                  {analysisResult.resumen.recomendaciones.map((r: string) => <li key={r}>{r}</li>)}
                </ul>
              )}

              {analysisResult.comparacion && (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                    Comparación contra encuestas cargadas en el proyecto
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Encuestas cargadas</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">
                        {analysisResult.comparacion.totalEncuestasProyecto}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Familias padrón</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">
                        {analysisResult.comparacion.totalFamilias}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Con respuesta</p>
                      <p className="mt-1 text-2xl font-black text-emerald-700">
                        {analysisResult.comparacion.familiasConRespuesta}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Participación</p>
                      <p className="mt-1 text-2xl font-black text-blue-700">
                        {analysisResult.comparacion.porcentajeParticipacion}%
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Solo madre</p>
                      <p className="mt-1 text-2xl font-black text-pink-700">
                        {analysisResult.comparacion.soloMadre}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Solo padre</p>
                      <p className="mt-1 text-2xl font-black text-indigo-700">
                        {analysisResult.comparacion.soloPadre}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Ambos</p>
                      <p className="mt-1 text-2xl font-black text-violet-700">
                        {analysisResult.comparacion.ambos}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Nadie</p>
                      <p className="mt-1 text-2xl font-black text-red-700">
                        {analysisResult.comparacion.ninguno}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Madres respondieron</p>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {analysisResult.comparacion.madresRespondieron}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Padres respondieron</p>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {analysisResult.comparacion.padresRespondieron}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(analysisResult.porColegio) && analysisResult.porColegio.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-blue-100 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-blue-50 text-blue-800">
                          <tr>
                            <th className="px-3 py-2 text-left">Colegio</th>
                            <th className="px-3 py-2 text-right">Familias</th>
                            <th className="px-3 py-2 text-right">Solo madre</th>
                            <th className="px-3 py-2 text-right">Solo padre</th>
                            <th className="px-3 py-2 text-right">Ambos</th>
                            <th className="px-3 py-2 text-right">Nadie</th>
                            <th className="px-3 py-2 text-right">% part.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.porColegio.map((row: any) => (
                            <tr key={row.colegio} className="border-t border-blue-100 text-slate-700">
                              <td className="px-3 py-2 font-bold">{row.colegio}</td>
                              <td className="px-3 py-2 text-right">{row.totalFamilias}</td>
                              <td className="px-3 py-2 text-right">{row.soloMadre}</td>
                              <td className="px-3 py-2 text-right">{row.soloPadre}</td>
                              <td className="px-3 py-2 text-right">{row.ambos}</td>
                              <td className="px-3 py-2 text-right">{row.ninguno}</td>
                              <td className="px-3 py-2 text-right font-black">{row.porcentajeParticipacion}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {analysisResult.diagnostico && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                    Diagnóstico para verificar errores
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Encuestas vinculadas</p>
                      <p className="mt-1 text-2xl font-black text-emerald-700">
                        {analysisResult.diagnostico.resumen.encuestasVinculadas}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Sin vincular</p>
                      <p className="mt-1 text-2xl font-black text-red-700">
                        {analysisResult.diagnostico.resumen.encuestasSinVincular}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Adultos antes dedupe</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">
                        {analysisResult.diagnostico.resumen.adultosAntesDeduplicar}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-[11px] font-bold uppercase text-slate-400">Adultos únicos</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">
                        {analysisResult.diagnostico.resumen.adultosDespuesDeduplicar}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(analysisResult.diagnostico.porColegio) && analysisResult.diagnostico.porColegio.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-amber-100 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-amber-50 text-amber-800">
                          <tr>
                            <th className="px-3 py-2 text-left">Colegio</th>
                            <th className="px-3 py-2 text-right">Encuestas</th>
                            <th className="px-3 py-2 text-right">Vinculadas</th>
                            <th className="px-3 py-2 text-right">Sin vincular</th>
                            <th className="px-3 py-2 text-right">% vinculación</th>
                            <th className="px-3 py-2 text-right">Adultos padrón</th>
                            <th className="px-3 py-2 text-right">Adultos respondidos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.diagnostico.porColegio.map((row: any) => (
                            <tr key={row.colegio} className="border-t border-amber-100 text-slate-700">
                              <td className="px-3 py-2 font-bold">{row.colegio}</td>
                              <td className="px-3 py-2 text-right">{row.encuestas}</td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-700">{row.encuestasVinculadas}</td>
                              <td className="px-3 py-2 text-right font-bold text-red-700">{row.encuestasSinVincular}</td>
                              <td className="px-3 py-2 text-right font-black">{row.porcentajeVinculacion}%</td>
                              <td className="px-3 py-2 text-right">{row.adultosPadron}</td>
                              <td className="px-3 py-2 text-right">{row.adultosRespondidos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {Array.isArray(analysisResult.diagnostico.encuestasSinVincular) && analysisResult.diagnostico.encuestasSinVincular.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-red-100 bg-white">
                      <div className="border-b border-red-100 bg-red-50 px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-widest text-red-700">Respuestas sin vincular</p>
                        <p className="mt-1 text-[11px] font-semibold text-red-700">
                          Estas respuestas están en encuestas, pero no encontraron adulto equivalente en el padrón por colegio + nombre/apellido.
                        </p>
                      </div>

                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr>
                            <th className="px-3 py-2 text-left">Colegio</th>
                            <th className="px-3 py-2 text-left">Curso</th>
                            <th className="px-3 py-2 text-left">Nombre</th>
                            <th className="px-3 py-2 text-left">Apellido</th>
                            <th className="px-3 py-2 text-right">Score</th>
                            <th className="px-3 py-2 text-left">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.diagnostico.encuestasSinVincular.map((row: any) => (
                            <tr key={`${row.id}-${row.schoolMatchKey}`} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-2 font-bold">{row.colegio}</td>
                              <td className="px-3 py-2">{row.curso || "-"}</td>
                              <td className="px-3 py-2">{row.nombre || "-"}</td>
                              <td className="px-3 py-2">{row.apellido || "-"}</td>
                              <td className="px-3 py-2 text-right">{row.score ?? "-"}</td>
                              <td className="px-3 py-2">{row.motivo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {Array.isArray(analysisResult.diagnostico.adultosRepetidosPorHijos) && analysisResult.diagnostico.adultosRepetidosPorHijos.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 bg-white">
                      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-700">
                          Adultos repetidos por varios hijos
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">
                          Esto no necesariamente es error: muestra adultos que aparecen varias veces porque tienen más de un hijo.
                        </p>
                      </div>

                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-700">
                          <tr>
                            <th className="px-3 py-2 text-left">Colegio</th>
                            <th className="px-3 py-2 text-left">Rol</th>
                            <th className="px-3 py-2 text-left">Adulto</th>
                            <th className="px-3 py-2 text-left">DNI</th>
                            <th className="px-3 py-2 text-left">Email</th>
                            <th className="px-3 py-2 text-right">Apariciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.diagnostico.adultosRepetidosPorHijos.map((row: any) => (
                            <tr key={row.key} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-2 font-bold">{row.colegio}</td>
                              <td className="px-3 py-2">{row.rol}</td>
                              <td className="px-3 py-2">{row.fullName || "-"}</td>
                              <td className="px-3 py-2">{row.dni || "-"}</td>
                              <td className="px-3 py-2">{row.email || "-"}</td>
                              <td className="px-3 py-2 text-right font-black">{row.apariciones}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {confirmMsg && <p className="mt-3 text-sm font-bold text-slate-700">{confirmMsg}</p>}

              {analysisResult.resumen.inesperadas.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-700">Hojas inesperadas: {analysisResult.resumen.inesperadas.join(", ")}</p>
              )}

              {analysisResult.matched?.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-emerald-50 text-emerald-800">
                      <tr>
                        <th className="px-3 py-2 text-left">Hoja</th>
                        <th className="px-3 py-2 text-right">Esperado</th>
                        <th className="px-3 py-2 text-right">Detectado</th>
                        <th className="px-3 py-2 text-right">Delta</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisResult.matched.map((m: any) => (
                        <tr key={m.hoja} className="border-t border-emerald-100 text-slate-700">
                          <td className="px-3 py-2">{m.hoja}</td>
                          <td className="px-3 py-2 text-right">{m.esperado}</td>
                          <td className="px-3 py-2 text-right">{m.detectado}</td>
                          <td className="px-3 py-2 text-right">{m.delta}</td>
                          <td className={`px-3 py-2 font-semibold ${m.status === "ok" ? "text-emerald-700" : m.status === "warning" ? "text-amber-700" : "text-red-700"}`}>{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {consolidationMsg && <p className="mt-3 text-sm font-bold text-violet-700">{consolidationMsg}</p>}
        </div>
      </div>
    </div>
  );
}