"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  eliminarMaterialDB,
  guardarMaterialDB,
  obtenerMaterialesPageDataDB,
  type MaterialInterno,
  type MaterialesPageData,
} from "../../actions-materiales";

type UploadResponse = {
  ok?: boolean;
  error?: string;
  url?: string;
  pathname?: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
};

const POLOS = ["", "Tucumán", "Córdoba", "Rosario", "Buenos Aires", "Mendoza", "La Plata", "Pilar"];

const COLEGIOS = [
  "",
  "Colegio Pucará",
  "Colegio Los Cerros",
  "Jardín Los Cerritos",
  "Colegio Cinco Ríos",
  "Colegio El Torreón",
  "Jardín Torreón de los Ríos",
  "Colegio Los Arroyos",
  "Colegio Mirasoles",
  "Jardín Los Senderos",
  "Colegio Los Molinos",
  "Colegio El Buen Ayre",
  "Jardín Buen Molino",
  "Colegio Los Olivos",
  "Colegio Portezuelo",
  "Jardín Platero",
  "Bosque Del Plata",
  "Colegio Crisol",
  "Jardín Crisol",
  "Colegio Los Caminos",
  "Los Candiles",
  "Jardín Cauquén",
];

const formatBytes = (bytes: number) => {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const getMaterialUrl = (id: string) => `/api/materiales/file?id=${encodeURIComponent(id)}`;

export default function MaterialesPage() {
  const [data, setData] = useState<MaterialesPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MaterialInterno | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [visiblePara, setVisiblePara] = useState<"todos" | "polo" | "colegio">("todos");
  const [colegio, setColegio] = useState("");
  const [polo, setPolo] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadData = () => {
    setLoading(true);
    obtenerMaterialesPageDataDB()
      .then((nextData) => {
        setData(nextData);
        if (!polo && nextData.scope.polo) setPolo(nextData.scope.polo);
        if (!colegio && nextData.scope.colegio) setColegio(nextData.scope.colegio);
      })
      .catch((error) => {
        setMessage(error?.message || "No se pudieron cargar los materiales.");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMaterials = useMemo(() => {
    const text = query.trim().toLowerCase();
    const materiales = data?.materiales || [];
    if (!text) return materiales;

    return materiales.filter((material) =>
      [material.titulo, material.descripcion, material.colegio, material.polo, material.filename, String(material.year || "")]
        .join(" ")
        .toLowerCase()
        .includes(text),
    );
  }, [data, query]);

  const resetForm = () => {
    setTitulo("");
    setDescripcion("");
    setVisiblePara("todos");
    setColegio("");
    setPolo("");
    setYear("");
    setFile(null);
  };

  const submitMaterial = async () => {
    if (!data?.canUpload) return;

    const safeTitle = titulo.trim();
    if (!safeTitle) return setMessage("Poné un título para el material.");
    if (!file) return setMessage("Seleccioná un PDF para subir.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setMessage("Solo se permiten archivos PDF.");
    }
    if (visiblePara === "polo" && !polo.trim()) return setMessage("Elegí un polo para este material.");
    if (visiblePara === "colegio" && !colegio.trim()) return setMessage("Elegí un colegio para este material.");

    setUploading(true);
    setMessage("Subiendo PDF privado a Vercel Blob...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/materiales/upload", {
        method: "POST",
        body: formData,
      });

      const raw = await uploadResponse.text();
      let uploaded: UploadResponse = {};

      try {
        uploaded = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw || "La subida no devolvió JSON válido.");
      }

      if (!uploadResponse.ok || !uploaded.ok) {
        throw new Error(uploaded.error || "No se pudo subir el PDF.");
      }
      if (!uploaded.pathname) throw new Error("Blob no devolvió pathname privado.");

      setMessage("Guardando metadata liviana en Neon...");

      await guardarMaterialDB({
        titulo: safeTitle,
        descripcion,
        filename: uploaded.filename || file.name,
        contentType: "application/pdf",
        sizeBytes: Number(uploaded.sizeBytes || file.size || 0),
        url: uploaded.url || "",
        pathname: uploaded.pathname,
        colegio: visiblePara === "colegio" ? colegio : "",
        polo: visiblePara === "polo" || visiblePara === "colegio" ? polo : "",
        year: year ? Number(year) : null,
        visiblePara,
      });

      setMessage("Material subido correctamente.");
      resetForm();
      setUploadOpen(false);
      loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo subir el material.");
    } finally {
      setUploading(false);
    }
  };

  const deleteMaterial = async (material: MaterialInterno) => {
    if (!data?.canUpload) return;
    const confirmed = window.confirm(
      `¿Eliminar “${material.titulo}”?\n\nEsto borra el PDF privado de Vercel Blob y también la metadata liviana en Neon.`,
    );
    if (!confirmed) return;

    try {
      await eliminarMaterialDB(material.id);
      setMessage("Material eliminado correctamente.");
      if (selected?.id === material.id) setSelected(null);
      loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el material.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/dashboard" className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
              ← Volver
            </Link>
            <p className="mt-5 text-xs font-black uppercase tracking-widest text-blue-600">Materiales internos</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Documentos para directores</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              PDFs internos para leer desde el panel. Los archivos quedan privados en Vercel Blob y Neon guarda solo metadata liviana.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            
            {data?.canUpload && (
              <button
                onClick={() => setUploadOpen((prev) => !prev)}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                {uploadOpen ? "Cerrar subida" : "Subir PDF"}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            {message}
          </div>
        )}

        {data?.canUpload && uploadOpen && (
          <section className="mb-6 rounded-[28px] border border-white bg-white/85 p-5 shadow-xl backdrop-blur-xl">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="text-lg font-black text-slate-950">Subir PDF</h2>
              <p className="text-xs font-semibold text-slate-500">Solo admin. El PDF queda privado y se entrega por una ruta protegida.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título del material" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300" />
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción breve" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300" />
              <select value={visiblePara} onChange={(e) => setVisiblePara(e.target.value as "todos" | "polo" | "colegio")} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300">
                <option value="todos">Visible para todos los perfiles permitidos</option>
                <option value="polo">Visible para un polo</option>
                <option value="colegio">Visible para un colegio</option>
              </select>
              <select value={polo} onChange={(e) => setPolo(e.target.value)} disabled={visiblePara === "todos"} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300 disabled:opacity-50">
                {POLOS.map((item) => <option key={item || "none"} value={item}>{item || "Elegí polo..."}</option>)}
              </select>
              <select value={colegio} onChange={(e) => setColegio(e.target.value)} disabled={visiblePara !== "colegio"} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300 disabled:opacity-50">
                {COLEGIOS.map((item) => <option key={item || "none"} value={item}>{item || "Elegí colegio..."}</option>)}
              </select>
              <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Año, opcional. Ej: 2025" inputMode="numeric" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-300" />
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-slate-500">{file ? `${file.name} · ${formatBytes(file.size)}` : "Todavía no seleccionaste PDF."}</p>
              <button onClick={submitMaterial} disabled={uploading} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                {uploading ? "Subiendo..." : "Subir y publicar"}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-white bg-white/85 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Archivos disponibles</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Abrilos en una ventana de lectura. No ocupan toda la pantalla principal.</p>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar material..." className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400 md:w-80" />
          </div>

          {loading ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-500">Cargando materiales...</p>
          ) : filteredMaterials.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-500">No hay materiales para mostrar.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMaterials.map((material) => (
                <article key={material.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{material.titulo}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">{material.descripcion || "Sin descripción"}</p>
                    </div>
                    <span className="rounded-xl bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-600">PDF</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {material.year ? <span className="rounded-lg bg-slate-100 px-2 py-1">{material.year}</span> : null}
                    {material.polo ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">{material.polo}</span> : null}
                    {material.colegio ? <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">{material.colegio}</span> : null}
                    <span className="rounded-lg bg-slate-100 px-2 py-1">{formatBytes(material.sizeBytes)}</span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1">{formatDate(material.createdAt)}</span>
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    <button onClick={() => setSelected(material)} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800">
                      Ver archivo
                    </button>
                    <a href={getMaterialUrl(material.id)} target="_blank" rel="noreferrer" className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50">
                      Abrir
                    </a>
                    {data?.canUpload && (
                      <button onClick={() => deleteMaterial(material)} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-black text-red-600 hover:bg-red-100">
                        Borrar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Vista previa</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{selected.titulo}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{selected.descripcion || "Sin descripción"}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={getMaterialUrl(selected.id)} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">
                  Abrir en pestaña
                </a>
                <button onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
                  Cerrar
                </button>
              </div>
            </div>
            <iframe src={getMaterialUrl(selected.id)} className="h-full w-full bg-slate-50" title={selected.titulo} />
          </div>
        </div>
      )}
    </main>
  );
}
