"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthVerifyFormProps {
  tokenHash: string;
  type: string;
  next: string;
}

export function AuthVerifyForm({ tokenHash, type, next }: AuthVerifyFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canVerify = Boolean(tokenHash && (type === "signup" || type === "recovery"));

  async function verify() {
    if (!canVerify) return;
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenHash, type, next }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      redirectTo?: string;
    };

    if (!response.ok || !payload.redirectTo) {
      setError(
        payload.error ??
          "El enlace no se pudo verificar. Solicita un correo nuevo e intenta otra vez.",
      );
      setLoading(false);
      return;
    }

    window.location.assign(payload.redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {canVerify ? (
              <ShieldCheck className="h-6 w-6 text-primary" />
            ) : (
              <CheckCircle className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            Verificar enlace
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Presiona continuar para completar este paso de seguridad.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {!canVerify && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              El enlace no es válido. Solicita un correo nuevo.
            </div>
          )}
          <Button
            type="button"
            disabled={!canVerify || loading}
            onClick={verify}
            className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando
              </>
            ) : (
              "Continuar"
            )}
          </Button>
          <Link href="/login">
            <Button
              type="button"
              variant="outline"
              className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Volver al login
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
