import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Missing Cloudflare credentials" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing required field: image" },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageArray = [...new Uint8Array(arrayBuffer)];

    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageArray,
          prompt:
            "La vidéo que je vais te fournir montre la plateforme de référence que je veux reproduire.\n\nOBJECTIF PRINCIPAL :\nJe veux que mon application DOPS reprenne le plus fidèlement possible le design de cette plateforme de référence :\n\nmême structure\nmême layout\nmême sidebar\nmêmes couleurs\nmêmes espacements\nmêmes tailles\nmêmes styles de boutons\nmêmes cartes\nmêmes tableaux\nmêmes icônes ou des icônes visuellement équivalentes\nmême typographie ou la plus proche possible\nmêmes bordures, arrondis et ombres\nmêmes interactions et animations lorsque visibles dans la vidéo\nmême responsive design\n\nRÈGLE TRÈS IMPORTANTE :\nNe change PAS le design existant et ne crée PAS de nouveau design de ta propre initiative.\n\nLa vidéo est la référence principale pour le design.\n\nJe vais ensuite te demander d'ajouter des fonctionnalités une par une.\n\nEXEMPLE :\nSi je te dis :\n\"Ajoute Products dans la sidebar\"\n\nTu dois UNIQUEMENT :\n\nAjouter \"Products\" dans la sidebar.\nCréer la page Products nécessaire.\nUtiliser exactement le même design que les autres pages de la plateforme.\nRéutiliser les composants, couleurs, espacements, boutons, tableaux et styles déjà présents.\nNe modifier aucune autre section de l'application.\nNe pas changer la sidebar existante à part l'ajout de \"Products\".\nNe pas ajouter de fonctionnalités que je n'ai pas demandées.\n\nÀ CHAQUE NOUVELLE DEMANDE :\n\nAnalyse d'abord le code existant.\nIdentifie les composants et styles déjà utilisés.\nRéutilise-les au maximum.\nFais uniquement les modifications demandées.\nNe refais pas toute l'application.\nNe change pas les couleurs ou le thème.\nNe change pas la structure existante sans nécessité.\nNe supprime aucune fonctionnalité existante.\n\nPRIORITÉ :\n\nFidélité au design de la vidéo.\nConservation du code et des fonctionnalités existantes.\nModification minimale.\nAjouter uniquement ce que je demande.\n\nAvant chaque modification importante, vérifie que ton implémentation respecte le design de référence.",
          max_tokens: 512,
        }),
      }
    );

    const data = await cfResponse.json();

    if (!data.success) {
      return NextResponse.json(
        { error: data.errors ?? "Cloudflare AI request failed" },
        { status: 502 }
      );
    }

    const description = data.result.description;

    return NextResponse.json({ prompt: description });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
