"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  type AdminManagedUser,
  updateAdminUser,
} from "@/lib/api";

type EditableRole = "admin" | "investor" | "seller";

const normalizeRole = (role: AdminManagedUser["role"]): EditableRole => {
  if (role === "sme") return "seller";
  return role;
};

function RoleBadge({ role }: { role: AdminManagedUser["role"] }) {
  const value = normalizeRole(role);
  if (value === "admin") return <Badge variant="destructive">ADMIN</Badge>;
  if (value === "investor") return <Badge variant="secondary">INVESTOR</Badge>;
  return <Badge variant="outline">SELLER</Badge>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminManagedUser | null>(
    null,
  );
  const [role, setRole] = useState<EditableRole>("seller");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<EditableRole>("seller");
  const [addActive, setAddActive] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminUsers();
      setUsers(data);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openManage = (user: AdminManagedUser) => {
    setSelectedUser(user);
    setRole(normalizeRole(user.role));
    setIsActive(user.is_active);
  };

  const closeManage = () => {
    setSelectedUser(null);
    setSaving(false);
  };

  const onSave = async () => {
    if (!selectedUser) return;

    try {
      setSaving(true);
      const updated = await updateAdminUser(selectedUser.id, {
        role,
        is_active: isActive,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      closeManage();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to update user.");
      setSaving(false);
    }
  };

  const resetAddForm = () => {
    setAddEmail("");
    setAddPassword("");
    setAddName("");
    setAddRole("seller");
    setAddActive(true);
    setAdding(false);
  };

  const onAddUser = async () => {
    try {
      setAdding(true);
      setError(null);
      const created = await createAdminUser({
        email: addEmail.trim(),
        password: addPassword,
        full_name: addName.trim() || undefined,
        role: addRole,
        is_active: addActive,
        email_verified: true,
      });
      setUsers((prev) => [created, ...prev]);
      setAddOpen(false);
      resetAddForm();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to add user.");
      setAdding(false);
    }
  };

  const onDeleteUser = async (user: AdminManagedUser) => {
    const ok = window.confirm(`Delete user ${user.email}? This action cannot be undone.`);
    if (!ok) return;

    try {
      setDeletingUserId(user.id);
      setError(null);
      await deleteAdminUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));

      if (selectedUser?.id === user.id) {
        closeManage();
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to delete user.");
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-gray-600">
          Manage roles and account status.
        </p>
      </div>

      <div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-slate-900 text-white hover:bg-slate-800"
        >
          Add User
        </Button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : users.length ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.full_name || "-"}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openManage(user)}
                        className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                      >
                        Manage
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDeleteUser(user)}
                        disabled={deletingUserId === user.id}
                        className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                      >
                        {deletingUserId === user.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!selectedUser}
        onOpenChange={(open) => !open && closeManage()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
            <DialogDescription>
              Update role and activation for {selectedUser?.email}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Role</p>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as EditableRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded border px-3 py-2">
              <p className="text-sm">Account Active</p>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeManage} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a new user and assign role/status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Email"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            <Input
              placeholder="Temporary password"
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
            />
            <Input
              placeholder="Full name (optional)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium">Role</p>
              <Select
                value={addRole}
                onValueChange={(value) => setAddRole(value as EditableRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded border px-3 py-2">
              <p className="text-sm">Account Active</p>
              <Switch checked={addActive} onCheckedChange={setAddActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              onClick={onAddUser}
              disabled={adding || !addEmail.trim() || addPassword.length < 8}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {adding ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
