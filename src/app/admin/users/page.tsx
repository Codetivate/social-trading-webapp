"use client";

import { useState } from "react";
import { Search, Filter, ChevronDown, MoreHorizontal, Shield, User, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export default function AdminUsersPage() {
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState<"ALL" | "MASTER" | "FOLLOWER">("ALL");
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

    // Mock Data
    const users = [
        { id: 1, name: "Alice User", role: "MASTER", status: "Active", balance: 12450, email: "alice@example.com" },
        { id: 2, name: "Bob Trader", role: "FOLLOWER", status: "Active", balance: 500, email: "bob@example.com" },
        { id: 3, name: "Charlie Day", role: "FOLLOWER", status: "Inactive", balance: 0, email: "charlie@example.com" },
        { id: 4, name: "David Copper", role: "MASTER", status: "Active", balance: 89000, email: "david@example.com" },
        { id: 5, name: "Eve Polastri", role: "FOLLOWER", status: "Active", balance: 250, email: "eve@example.com" },
    ];

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const toggleSelectAll = () => {
        if (selectedUsers.length === filteredUsers.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(filteredUsers.map(u => u.id));
        }
    };

    const toggleSelectUser = (id: number) => {
        if (selectedUsers.includes(id)) {
            setSelectedUsers(selectedUsers.filter(uid => uid !== id));
        } else {
            setSelectedUsers([...selectedUsers, id]);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">User Management</h2>
                    <p className="text-gray-500 text-sm">Manage system users, roles, and permissions.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search users..."
                            className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-blue-500 outline-none transition-all"
                        />
                    </div>

                    {/* Shadcn-like Select Filter */}
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-300 hover:text-white hover:border-gray-700 transition-all font-medium whitespace-nowrap"
                        >
                            <Filter size={16} />
                            {roleFilter === "ALL" ? "All Roles" : roleFilter === "MASTER" ? "Masters" : "Followers"}
                            <ChevronDown size={14} className={`text-gray-500 transition-transform ${isFilterOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isFilterOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-1">
                                    {(["ALL", "MASTER", "FOLLOWER"] as const).map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => { setRoleFilter(r); setIsFilterOpen(false); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${roleFilter === r ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
                                        >
                                            {r === "ALL" ? "All Roles" : r === "MASTER" ? "Masters" : "Followers"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-gray-800 bg-gray-900/50 backdrop-blur-sm">
                <Table>
                    <TableHeader className="bg-gray-900/50">
                        <TableRow className="hover:bg-transparent border-gray-800">
                            <TableHead className="w-[50px]">
                                <Checkbox
                                    checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.length > 0 ? (
                            filteredUsers.map((user) => (
                                <TableRow key={user.id} className="border-gray-800 hover:bg-gray-800/50 data-[state=selected]:bg-gray-800" data-state={selectedUsers.includes(user.id) ? "selected" : ""}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedUsers.includes(user.id)}
                                            onCheckedChange={() => toggleSelectUser(user.id)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{user.name}</div>
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`gap-1 pr-3 ${user.role === "MASTER" ? "border-purple-500/30 text-purple-400 bg-purple-500/10" : "border-blue-500/30 text-blue-400 bg-blue-500/10"}`}>
                                            {user.role === "MASTER" ? <Shield size={10} /> : <User size={10} />}
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={user.status === "Active" ? "success" : "destructive_soft"}>
                                            {user.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-gray-300">
                                        ${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <button className="text-gray-500 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors">
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Pagination Footer */}
                <div className="flex items-center justify-between px-4 py-4 border-t border-gray-800 bg-gray-900/50">
                    <div className="flex-1 text-sm text-gray-500">
                        {selectedUsers.length} of {filteredUsers.length} row(s) selected
                    </div>
                    <div className="flex items-center gap-6 lg:gap-8">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-500">Rows per page</p>
                            <select className="h-8 w-[70px] rounded-md border border-gray-800 bg-gray-950 text-gray-300 text-sm focus:outline-none focus:border-blue-500 px-2">
                                <option>10</option>
                                <option>20</option>
                                <option>50</option>
                            </select>
                        </div>
                        <div className="flex w-[100px] items-center justify-center text-sm font-medium text-gray-300">
                            Page 1 of 5
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-50 text-gray-400">
                                <ChevronsLeft className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-50 text-gray-400">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-50 text-gray-400">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-800 bg-gray-950 hover:bg-gray-800 disabled:opacity-50 text-gray-400">
                                <ChevronsRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
