"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateUserRole } from "@/lib/actions/admin-users";

type User = {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: Date;
};

export function UserTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [userList, setUserList] = useState(users);

  async function handleRoleChange(userId: string, newRole: "USER" | "ADMIN") {
    try {
      await updateUserRole(userId, newRole);
      setUserList((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Failed to update role");
    }
  }

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Username</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Email</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {userList.map((user) => (
            <tr key={user.id} className="border-b last:border-b-0">
              <td className="px-4 py-3 text-sm">{user.username}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    user.role === "ADMIN"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {user.role}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {user.id !== currentUserId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleRoleChange(user.id, user.role === "ADMIN" ? "USER" : "ADMIN")
                    }
                  >
                    {user.role === "ADMIN" ? "Remove Admin" : "Make Admin"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
