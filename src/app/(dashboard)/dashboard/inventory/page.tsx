"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatUSD } from "@/lib/utils";
import { Plus, Pencil, Trash2, Search, AlertTriangle, Package } from "lucide-react";

interface Category { id: string; name: string }
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  priceUsd: number; taxExempt: boolean; stockQuantity: number;
  lowStockThreshold: number; category: Category | null;
}

const emptyForm = {
  name: "", sku: "", barcode: "", priceUsd: "", categoryId: "",
  taxExempt: false, stockQuantity: "0", lowStockThreshold: "5",
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCategory) params.set("category", filterCategory);
    if (showLowStock) params.set("lowStock", "1");
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  }, [search, filterCategory, showLowStock]);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function openCreate() {
    setEditProduct(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku ?? "", barcode: p.barcode ?? "",
      priceUsd: p.priceUsd.toString(), categoryId: p.category?.id ?? "",
      taxExempt: p.taxExempt, stockQuantity: p.stockQuantity.toString(),
      lowStockThreshold: p.lowStockThreshold.toString(),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      name: form.name, sku: form.sku || undefined, barcode: form.barcode || undefined,
      priceUsd: parseFloat(form.priceUsd), categoryId: form.categoryId || undefined,
      taxExempt: form.taxExempt, stockQuantity: parseInt(form.stockQuantity),
      lowStockThreshold: parseInt(form.lowStockThreshold),
    };
    const url = editProduct ? `/api/products/${editProduct.id}` : "/api/products";
    const method = editProduct ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json();
      toast({ title: "Error", description: e.error, variant: "destructive" });
      return;
    }
    toast({ title: editProduct ? "Product updated" : "Product added", variant: "success" });
    setDialogOpen(false);
    fetchProducts();
  }

  async function handleDelete(id: string) {
    if (!confirm("Archive this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    toast({ title: "Product archived", variant: "success" });
    fetchProducts();
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategory }),
    });
    if (res.ok) {
      const cat = await res.json();
      setCategories((prev) => [...prev, cat]);
      setNewCategory("");
    }
  }

  const lowStockCount = products.filter((p) => p.stockQuantity <= p.lowStockThreshold).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">{products.length} products</p>
        </div>
        <div className="flex gap-2">
          {lowStockCount > 0 && (
            <Button variant="warning" size="sm" onClick={() => setShowLowStock(!showLowStock)}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              {showLowStock ? "Show All" : `${lowStockCount} Low Stock`}
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, SKU, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filterCategory || "__all__"}
          onValueChange={(v) => setFilterCategory(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No products found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="text-left p-4 font-medium text-gray-600">Product</th>
                    <th className="text-left p-4 font-medium text-gray-600">SKU</th>
                    <th className="text-left p-4 font-medium text-gray-600">Category</th>
                    <th className="text-right p-4 font-medium text-gray-600">Price (USD)</th>
                    <th className="text-right p-4 font-medium text-gray-600">Stock</th>
                    <th className="text-center p-4 font-medium text-gray-600">Tax</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const isLow = product.stockQuantity <= product.lowStockThreshold;
                    return (
                      <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="p-4 font-medium text-gray-900">{product.name}</td>
                        <td className="p-4 text-gray-500 font-mono text-xs">{product.sku ?? "—"}</td>
                        <td className="p-4">
                          {product.category ? (
                            <Badge variant="secondary">{product.category.name}</Badge>
                          ) : "—"}
                        </td>
                        <td className="p-4 text-right font-semibold">{formatUSD(product.priceUsd)}</td>
                        <td className="p-4 text-right">
                          <span className={isLow ? "text-red-600 font-bold" : "text-gray-900"}>
                            {product.stockQuantity}
                          </span>
                          {isLow && (
                            <AlertTriangle className="inline h-3 w-3 text-red-500 ml-1" />
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {product.taxExempt ? (
                            <Badge variant="secondary">Exempt</Badge>
                          ) : (
                            <Badge variant="default">VAT</Badge>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Barcode</Label>
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Price (USD) *</Label>
              <Input type="number" step="0.01" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <div className="flex gap-2">
                <Select
                  value={form.categoryId || "__none__"}
                  onValueChange={(v) => setForm({ ...form, categoryId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="New category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="text-sm"
                />
                <Button variant="outline" size="sm" onClick={addCategory}>Add</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stock Qty</Label>
                <Input type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
              </div>
              <div>
                <Label>Low Stock Alert</Label>
                <Input type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.taxExempt}
                onChange={(e) => setForm({ ...form, taxExempt: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700">Tax Exempt (no VAT)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editProduct ? "Update" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
