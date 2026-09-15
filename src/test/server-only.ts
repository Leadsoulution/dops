// Remplacant de `server-only` sous Vitest. Le vrai module leve une
// erreur des qu'il est importe hors du rendu serveur de Next.js, ce qui
// ferait echouer tout test touchant a la couche serveur.
export {};
