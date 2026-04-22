"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, UserCog, UserX } from "lucide-react";

interface User {
  id: string; name: string; email: string;
  role: "ADMIN" | "CASHIER"; active: boolean; createdAt: string;
}

const emptyForm = { name: "", email: "", role: "CASHIER" as "ADMIN" | "CASHIER", password: "", pin: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function fetchUsers() {
    const res = await fetch("/api/users");
    setUsers(await res.json());
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleCreate() {
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.role === "ADMIN" ? form.password : undefined,
        pin: form.role === "CASHIER" ? form.pin : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json();
      toast({ title: "Error", description: e.error, variant: "destructive" });
      return;
    }
    toast({ title: "User created", variant: "success" });
    setDialogOpen(false);
    setForm(emptyForm);
    fetchUsers();
  }

  async function toggleActive(user: User) {
    if (!confirm(`${user.active ? "Deactivate" : "Reactivate"} ${user.name}?`)) return;
    const res = await fetch(`/api/users/${user.id}`, {
      method: user.active ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: !user.active ? JSON.stringify({ active: true }) : undefined,
    });
    if (res.ok) {
      toast({ title: `User ${user.active ? "deactivated" : "reactivated"}`, variant: "success" });
      fetchUsers();
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm mt-1">Manage admins and cashiers</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className={`flex items-center justify-between p-4 border rounded-lg ${user.active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                  {!user.active && <Badge variant="outline">Inactive</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(user)}
                    title={user.active ? "Deactivate" : "Reactivate"}
                  >
                    {user.active ? <UserX className="h-4 w-4 text-red-400" /> : <UserCog className="h-4 w-4 text-green-500" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "ADMIN" | "CASHIER" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASHIER">Cashier (PIN login)</SelectItem>
                  <SelectItem value="ADMIN">Admin (Password login)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "ADMIN" ? (
              <div>
                <Label>Password (min. 6 characters)</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            ) : (
              <div>
                <Label>4-Digit PIN</Label>
                <Input
                  type="password"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                />
                <p className="text-xs text-gray-500 mt-1">Cashiers log in with their PIN at the POS.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
