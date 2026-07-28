import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso | Nevermine Coach" },
      {
        name: "description",
        content:
          "Accede a Nevermine Coach para gestionar catálogos de métricas deportivas, equipos y valoraciones.",
      },
      { property: "og:title", content: "Acceso | Nevermine Coach" },
      {
        property: "og:description",
        content: "Inicia sesión o crea tu cuenta de entrenador en Nevermine Coach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    navigate({ to: "/app" });
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    setMessage(
      error ? error.message : "Cuenta creada. Revisa tu correo si se requiere confirmación.",
    );
    if (!error) navigate({ to: "/app" });
  }

  async function handleGoogle() {
    setMessage(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setMessage("No se ha podido iniciar sesión con Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 block text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Nevermine Coach</CardTitle>
            <CardDescription>Acceso de entrenadores</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form className="space-y-4" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Correo</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Contraseña</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4" onSubmit={handleSignUp}>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nombre</Label>
                    <Input
                      id="signup-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Correo</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Contraseña</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Crear cuenta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 space-y-3">
              <Button variant="outline" className="w-full" onClick={handleGoogle}>
                Continuar con Google
              </Button>
              {message ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {message}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
