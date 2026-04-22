"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Save, RefreshCw } from "lucide-react";

interface OrgSettings {
  id: string; name: string; address: string | null; phone: string | null;
  email: string | null; vatNumber: string | null; returnPolicy: string | null;
  taxRate: number; zigRate: number;
  smtpHost: string | null; smtpPort: number | null;
  smtpUser: string | null; smtpFrom: string | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState<Partial<OrgSettings & { smtpPass: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      setSettings(data);
      setForm(data);
    });
  }, []);

  async function save(section: Partial<typeof form>) {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(section),
    });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json();
      toast({ title: "Error", description: e.error, variant: "destructive" });
    } else {
      toast({ title: "Settings saved", variant: "success" });
    }
  }

  if (!settings) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your business configuration</p>
      </div>

      {/* Business info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Information</CardTitle>
          <CardDescription>Appears on receipts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Business Name *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>VAT Number</Label>
            <Input value={form.vatNumber ?? ""} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <Label>Return Policy (shown on receipts)</Label>
            <Input value={form.returnPolicy ?? ""} onChange={(e) => setForm({ ...form, returnPolicy: e.target.value })} />
          </div>
          <Button onClick={() => save({ name: form.name, address: form.address, phone: form.phone, email: form.email, vatNumber: form.vatNumber, returnPolicy: form.returnPolicy })} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Business Info
          </Button>
        </CardContent>
      </Card>

      {/* Tax & currency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax & Currency</CardTitle>
          <CardDescription>VAT rate and ZiG exchange rate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>VAT Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.taxRate ?? ""}
                onChange={(e) => { const v = parseFloat(e.target.value); setForm({ ...form, taxRate: isNaN(v) ? undefined : v }); }}
              />
              <p className="text-xs text-gray-500 mt-1">Currently 15% in Zimbabwe</p>
            </div>
            <div>
              <Label>ZiG per 1 USD</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.zigRate ?? ""}
                onChange={(e) => { const v = parseFloat(e.target.value); setForm({ ...form, zigRate: isNaN(v) ? undefined : v }); }}
              />
              <p className="text-xs text-gray-500 mt-1">Update manually from RBZ rates</p>
            </div>
          </div>
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
            <RefreshCw className="inline h-3 w-3 mr-1" />
            ZiG/USD rate must be updated manually. Current rate applies to all new transactions.
            Old transactions keep their rate at time of sale.
          </div>
          <Button onClick={() => save({ taxRate: form.taxRate, zigRate: form.zigRate })} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save Tax & Currency
          </Button>
        </CardContent>
      </Card>

      {/* SMTP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email (SMTP)</CardTitle>
          <CardDescription>Configure to send receipts by email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SMTP Host</Label>
              <Input value={form.smtpHost ?? ""} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <Label>Port</Label>
              <Input type="number" value={form.smtpPort ?? ""} onChange={(e) => { const v = parseInt(e.target.value); setForm({ ...form, smtpPort: isNaN(v) ? undefined : v }); }} placeholder="587" />
            </div>
          </div>
          <div>
            <Label>Username / Email</Label>
            <Input value={form.smtpUser ?? ""} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} placeholder="noreply@mybusiness.com" />
          </div>
          <div>
            <Label>Password / App Password</Label>
            <Input type="password" value={(form as { smtpPass?: string }).smtpPass ?? ""} onChange={(e) => setForm({ ...form, smtpPass: e.target.value })} placeholder="Leave blank to keep current" />
          </div>
          <div>
            <Label>From Name / Email</Label>
            <Input value={form.smtpFrom ?? ""} onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })} placeholder="My Shop <noreply@mybusiness.com>" />
          </div>
          <Button onClick={() => save({ smtpHost: form.smtpHost, smtpPort: form.smtpPort, smtpUser: form.smtpUser, smtpFrom: form.smtpFrom, ...((form as { smtpPass?: string }).smtpPass ? { smtpPass: (form as { smtpPass?: string }).smtpPass } : {}) })} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Save SMTP
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-gray-500">
            <strong>Organization ID:</strong> <code className="bg-gray-100 px-1 rounded text-xs">{settings.id}</code>
            <br />Share this with your staff so they can log in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
