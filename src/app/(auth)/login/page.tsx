"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Eye, EyeOff, X, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const ORG_ID_KEY = "zimpos_org_id";

interface Cashier { id: string; name: string }

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const registered = params.get("registered");

  const [tab, setTab] = useState<"admin" | "cashier">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savedOrgId, setSavedOrgId] = useState("");
  const [form, setForm] = useState({ organizationId: "", email: "", password: "" });

  // Cashier state
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashier, setSelectedCashier] = useState<Cashier | null>(null);
  const [pin, setPin] = useState("");
  const [cashierOrgId, setCashierOrgId] = useState("");
  const [loadingCashiers, setLoadingCashiers] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(ORG_ID_KEY) ?? "";
    setSavedOrgId(stored);
    if (stored) {
      setForm((f) => ({ ...f, organizationId: stored }));
      setCashierOrgId(stored);
    }
  }, []);

  function clearSavedOrg() {
    localStorage.removeItem(ORG_ID_KEY);
    setSavedOrgId("");
    setForm((f) => ({ ...f, organizationId: "" }));
    setCashierOrgId("");
    setCashiers([]);
    setSelectedCashier(null);
  }

  async function loadCashiers(orgId: string) {
    if (!orgId.trim()) return;
    setLoadingCashiers(true);
    setError("");
    try {
      const res = await fetch(`/api/cashiers?orgId=${encodeURIComponent(orgId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCashiers(data);
      if (data.length === 0) setError("No cashiers found for this Organization ID.");
    } catch {
      setError("Could not load cashiers. Check the Organization ID.");
    } finally {
      setLoadingCashiers(false);
    }
  }

  function handlePinKey(key: string) {
    if (pin.length < 4) setPin((p) => p + key);
  }

  function handlePinDelete() {
    setPin((p) => p.slice(0, -1));
  }

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && selectedCashier) {
      handleCashierLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      redirect: false,
      email: form.email,
      password: form.password,
      organizationId: form.organizationId,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid credentials. Check your Organization ID, email, and password.");
    } else {
      localStorage.setItem(ORG_ID_KEY, form.organizationId);
      router.push("/dashboard");
    }
  }

  async function handleCashierLogin() {
    if (!selectedCashier || pin.length !== 4) return;
    setLoading(true);
    setError("");
    const result = await signIn("credentials", {
      redirect: false,
      userId: selectedCashier.id,
      pin,
      organizationId: cashierOrgId,
    });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect PIN. Try again.");
      setPin("");
    } else {
      localStorage.setItem(ORG_ID_KEY, cashierOrgId);
      router.push("/dashboard");
    }
  }

  const pinDots = Array.from({ length: 4 }, (_, i) => i < pin.length);
  const pinKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0"];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="bg-blue-600 p-3 rounded-full">
              <ShoppingCart className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Sign in to ZimPOS</CardTitle>
          <CardDescription>Choose your login type</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-gray-200 p-1 mb-6 bg-gray-50">
            <button
              onClick={() => { setTab("admin"); setError(""); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                tab === "admin" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Admin / Manager
            </button>
            <button
              onClick={() => { setTab("cashier"); setError(""); setPin(""); }}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                tab === "cashier" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Cashier (PIN)
            </button>
          </div>

          {registered && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
              Account created! Your Organization ID has been pre-filled below.
            </div>
          )}

          {/* Admin login */}
          {tab === "admin" && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="organizationId">Organization ID</Label>
                  {savedOrgId && (
                    <button type="button" onClick={clearSavedOrg} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                      <X className="h-3 w-3" /> Clear saved
                    </button>
                  )}
                </div>
                <Input
                  id="organizationId"
                  placeholder="e.g. clxxxxxxxxxxxxx"
                  value={form.organizationId}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                  required
                />
                {savedOrgId
                  ? <p className="text-xs text-green-600 mt-1">Saved on this device</p>
                  : <p className="text-xs text-gray-500 mt-1">Provided when you registered your business.</p>
                }
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@mybusiness.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="pr-10"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <p className="text-center text-sm text-gray-600">
                New business?{" "}
                <Link href="/register" className="text-blue-600 hover:underline font-medium">Create an account</Link>
              </p>
            </form>
          )}

          {/* Cashier PIN login */}
          {tab === "cashier" && (
            <div className="space-y-4">
              {/* Org ID entry */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Organization ID</Label>
                  {savedOrgId && (
                    <button type="button" onClick={clearSavedOrg} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500">
                      <X className="h-3 w-3" /> Clear saved
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. clxxxxxxxxxxxxx"
                    value={cashierOrgId}
                    onChange={(e) => { setCashierOrgId(e.target.value); setCashiers([]); setSelectedCashier(null); setPin(""); }}
                  />
                  <Button type="button" variant="outline" onClick={() => loadCashiers(cashierOrgId)} disabled={loadingCashiers || !cashierOrgId}>
                    {loadingCashiers ? "..." : "Load"}
                  </Button>
                </div>
                {savedOrgId && cashiers.length === 0 && (
                  <p className="text-xs text-green-600 mt-1">Saved on this device — click Load</p>
                )}
              </div>

              {/* Cashier selector */}
              {cashiers.length > 0 && !selectedCashier && (
                <div>
                  <Label className="mb-2 block">Who are you?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {cashiers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCashier(c); setPin(""); setError(""); }}
                        className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-2">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PIN pad */}
              {selectedCashier && (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Signing in as</p>
                    <p className="font-semibold text-gray-900 text-lg">{selectedCashier.name}</p>
                    <button onClick={() => { setSelectedCashier(null); setPin(""); setError(""); }} className="text-xs text-blue-600 hover:underline mt-1">
                      Not you?
                    </button>
                  </div>

                  {/* PIN dots */}
                  <div className="flex justify-center gap-4 py-2">
                    {pinDots.map((filled, i) => (
                      <div key={i} className={cn(
                        "w-4 h-4 rounded-full border-2 transition-colors",
                        filled ? "bg-blue-600 border-blue-600" : "border-gray-300"
                      )} />
                    ))}
                  </div>

                  {/* PIN keypad */}
                  <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                    {pinKeys.map((key, i) => (
                      key === "" ? (
                        <div key={i} />
                      ) : (
                        <button
                          key={i}
                          onClick={() => handlePinKey(key)}
                          disabled={pin.length === 4 || loading}
                          className="h-14 rounded-xl border-2 border-gray-200 text-xl font-semibold text-gray-800 hover:bg-blue-50 hover:border-blue-400 transition-colors disabled:opacity-40"
                        >
                          {key}
                        </button>
                      )
                    ))}
                    <button
                      onClick={handlePinDelete}
                      disabled={pin.length === 0}
                      className="h-14 rounded-xl border-2 border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-30"
                    >
                      <Delete className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                  {loading && <p className="text-sm text-blue-600 text-center">Verifying PIN...</p>}
                </div>
              )}

              {error && !selectedCashier && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
