/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Next.js sert les pages prerendues avec `s-maxage=31536000`, soit
        // un an de cache CDN. Hostinger applique cette consigne (hcdn) et
        // continuait donc a servir l'ancien HTML apres un deploiement —
        // HTML qui reclame des fichiers CSS/JS au nom hache supprimes par
        // le nouveau build, d'ou une page sans aucun style.
        //
        // On force la revalidation des pages a chaque requete. Les assets
        // de `/_next/static` gardent leur cache immuable : leur nom change
        // a chaque build, ils n'ont donc jamais besoin d'etre revalides.
        source: "/:path((?!_next/static|api/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // L'agent de service doit pouvoir etre remplace. Mis en cache
        // longtemps par un intermediaire, l'ancien resterait en place et
        // les notifications continueraient de passer par du code perime.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        // Les reponses d'API dependent de qui les demande : /api/auth/me
        // renvoie l'identite de la personne connectee. Les marquer
        // `public`, meme avec revalidation, autorise un cache partage
        // comme celui de Hostinger a les conserver, et donc a servir la
        // fiche d'un utilisateur a un autre. Elles ne doivent jamais
        // etre stockees.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
