const normalize = (str: string) =>
  str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

export function schoolBrand(school: string) {
  const n = normalize(school);
  if (n.includes("mirasoles")) return { ring: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700" };
  if (n.includes("buen ayre")) return { ring: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" };
  if (n.includes("portezuelo")) return { ring: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-700" };
  if (n.includes("pucara")) return { ring: "border-amber-200", bg: "bg-blue-50", text: "text-blue-800" };
  if (n.includes("torreon")) return { ring: "border-cyan-200", bg: "bg-cyan-50", text: "text-cyan-700" };
  if (n.includes("arroyos")) return { ring: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700" };
  if (n.includes("cerros")) return { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" };
  return { ring: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700" };
}

export function schoolLogoPath(school: string) {
  const n = normalize(school);
  if (n.includes("jardin buen molino")) return "/jardinbuenmolino.png";
  if (n.includes("jardin cauquen")) return "/jardincauquen.png";
  if (n.includes("jardin los cerritos")) return "/jardincerritos.png";
  if (n.includes("jardin crisol")) return "/jardincrisol.png";
  if (n.includes("jardin los senderos")) return "/jardinlossenderos.png";
  if (n.includes("jardin platero")) return "/jardinplatero.png";
  if (n.includes("jardin torreon")) return "/jardintorreon.png";
  if (n.includes("bosque del plata")) return "/bosquedelplata.png";
  if (n.includes("buen ayre")) return "/buenayre.png";
  if (n.includes("cinco rios")) return "/cincorios.png";
  if (n.includes("crisol")) return "/crisol.png";
  if (n.includes("los arroyos")) return "/losarroyos.png";
  if (n.includes("los caminos")) return "/loscaminos.png";
  if (n.includes("los candiles")) return "/loscandiles.png";
  if (n.includes("los cerros")) return "/loscerros.png";
  if (n.includes("los molinos")) return "/losmolinos.png";
  if (n.includes("los olivos")) return "/losolivos.png";
  if (n.includes("mirasoles")) return "/mirasoles.png";
  if (n.includes("portezuelo")) return "/portezuelo.png";
  if (n.includes("pucara")) return "/pucara.png";
  if (n.includes("torreon")) return "/torreon.png";
  return "";
}

export function schoolInitials(school: string) {
  return school
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}
