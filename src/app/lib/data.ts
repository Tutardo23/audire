// ============================================================================
// BASE DE DATOS APDES - ENCUESTA DE CLIMA ALUMNOS 2026 (537 Respuestas)
// ============================================================================

// 1. ESTADÍSTICAS GENERALES DE ENCUESTAS
export const generalStats = {
  totalResponses: 537,
  npsScore: 12,
  promoters: 145,
  passives: 314,
  detractors: 78,
  averageRating: 7.75
};

// 2. COLEGIOS PARTICIPANTES EN LA ENCUESTA
export const colegiosSurvey = [
  "Todos los colegios",
  "Colegio Mirasoles",
  "Colegio El Buen Ayre",
  "Colegio Portezuelo",
  "Colegio Los Arroyos",
  "Colegio Los Cerros",
  "Colegio Crisol",
  "Colegio Los Molinos",
  "Colegio Los Caminos",
  "Colegio Cinco Ríos"
];

// 3. DATOS PARA GRÁFICOS DE CLIMA
export const npsDistribution = [
  { name: "1-6 (Detractores)", cantidad: generalStats.detractors, fill: "#EF4444" },
  { name: "7-8 (Pasivos)", cantidad: generalStats.passives, fill: "#F59E0B" },
  { name: "9-10 (Promotores)", cantidad: generalStats.promoters, fill: "#10B981" },
];

// 4. FEEDBACK CUALITATIVO (Muestra de las 537 respuestas reales)
export const surveyResponses = [
  {
    id: "186012671", date: "2025-09-02", score: 9, type: "Promotor",
    nombre: "Maria Del Pilar", apellido: "Klappenbach", colegio: "Colegio El Buen Ayre", curso: "5° año B",
    positive: "La formación de fe y valores que nos enseñan. Me parece muy buenas todas las actividades religiosas que el colegio nos ofrece. Ademas también quiero destacar las horas de fe y vida y formación.",
    improvement: "Me parece que estaría buenísimo que nos dejen comer afuera. El recreo del almuerzo es el momento en el que más podemos descansar, y hacerlo en el comedor, con el ruido y la oscuridad del lugar, no ayuda a despejar la cabeza. También sería muy efectivo que agreguen enchufes en las aulas.",
    tags: ["Infraestructura", "Recreos", "Formación"]
  },
  {
    id: "186445412", date: "2025-09-05", score: 4, type: "Detractor",
    nombre: "Pedro Martín", apellido: "Ayarza", colegio: "Colegio Los Arroyos", curso: "4° año",
    positive: "Lo que mas valoro es la relacion entre los alumnos. Entre alumnos es un ambiente positivo.",
    improvement: "Predispocision de algunos profesores con los alumnos, hay muchos profesores que tardan en corregir las pruebas, incluso meses despues. Por ultimo quiero decir que se centran en cosas como no teñirse el pelo ni de color rubio que es un color natural y hay cosas muchas mas graves de las que ocuparse como por ejemplo el estado de los techos del colegio que estan todos rotos.",
    tags: ["Infraestructura", "Docentes", "Normativas"]
  },
  {
    id: "185596793", date: "2025-08-29", score: 7, type: "Pasivo",
    nombre: "Sofía", apellido: "Streluk", colegio: "Colegio Mirasoles", curso: "5º año",
    positive: "Las actividades de entrega a los demás (viaje solidario, PAS).",
    improvement: "Que se implemente un laboratorio (como en Arroyos), realizar más convivencias, adaptar la fecha de la fiesta del deporte al clima, más tiempo para digerir el almuerzo previo a educación física, cambiar viaje de estudios, y que se permita el uso del celular y se nos instruya en su uso responsable.",
    tags: ["Actividades", "Instalaciones", "Normativas"]
  },
  {
    id: "186309710", date: "2025-09-04", score: 7, type: "Pasivo",
    nombre: "Paz", apellido: "Simon Padrós", colegio: "Colegio Los Cerros", curso: "5° año A",
    positive: "El colegio siempre esta cuando lo necesitas y te ayuda, son muy atentas en el sentido de adaptación, lo valoro mucho.",
    improvement: "Que haya minimo 2 o 3 profesoras por materia, ya que tener solo 1 es antipedagógico, eso puede ser intenso para la profesora tambien ya que tiene su materia en todos los cursos, por lo cual es un estrés para la profesora.",
    tags: ["Docentes", "Académico"]
  },
  {
    id: "186312128", date: "2025-09-04", score: 6, type: "Detractor",
    nombre: "Caterina", apellido: "TARQUINI", colegio: "Colegio Portezuelo", curso: "4° año",
    positive: "La atención de los profesores antes los problemas.",
    improvement: "Conocimiento de los profesores, el uso de celulares.",
    tags: ["Docentes", "Normativas"]
  },
  {
    id: "186930351", date: "2025-09-09", score: 7, type: "Pasivo",
    nombre: "Marcos José", apellido: "Deane", colegio: "Colegio Los Molinos", curso: "5 NAT",
    positive: "Los amigos, la calidad de la educacion, la gente y las actividades extracuriculares.",
    improvement: "Hay un par de personajes que no van en la pelicula (profesores) y me parece que deberiamos salir mas a hacer misiones y esas cosas, y deberian de mejorar las cosas de deportes, y microondas que funcionen.",
    tags: ["Deportes", "Docentes", "Infraestructura"]
  },
  {
    id: "186312088", date: "2025-09-04", score: 10, type: "Promotor",
    nombre: "María Emilia", apellido: "Vargas Awad", colegio: "Colegio Portezuelo", curso: "5° año",
    positive: "El trato con las profesoras y la confianza que nos tenemos. Ademas, los valores que nos dan son los que me llevo para toda mi vida.",
    improvement: "Mas actividades mixtas para tener relaciones de amistad con nuestros compañeros.",
    tags: ["Actividades", "Clima Escolar"]
  },
  {
    id: "186196708", date: "2025-09-03", score: 8, type: "Pasivo",
    nombre: "Kiara Aylen", apellido: "Villarroel", colegio: "Colegio Crisol", curso: "Secundaria",
    positive: "Lo que mas valoro del Colegio Crisol es la educaciòn que tenemos y todas las oportunidades que nos brindan las profesoras.",
    improvement: "Las oportunidades de mejora que me parecen importante destacar son: arreglo de baños, mejora en la limpieza del comedor, mejoras en los microondas y las computadoras de computaciòn.",
    tags: ["Infraestructura", "Limpieza"]
  }
];