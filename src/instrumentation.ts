export async function register() {
  // Ecuador continental: America/Guayaquil (UTC−5, sin DST)
  process.env.TZ = "America/Guayaquil";
}
