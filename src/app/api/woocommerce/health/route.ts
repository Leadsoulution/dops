import { NextResponse } from "next/server";
import { checkConnection, isWooConfigured, WooCommerceError } from "@/lib/woocommerce/client";

export async function GET() {
  if (!(await isWooConfigured())) {
    return NextResponse.json(
      { connected: false, error: "WooCommerce non configure." },
      { status: 200 }
    );
  }
  try {
    const info = await checkConnection();
    return NextResponse.json({ connected: true, ...info });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error:
          error instanceof WooCommerceError
            ? error.message
            : "Erreur inattendue.",
      },
      { status: 200 }
    );
  }
}
