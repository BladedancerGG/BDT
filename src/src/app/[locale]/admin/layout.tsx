import type {Metadata} from "next";
import {requireAdmin} from "@/lib/auth/admin";
import {AdminLayout} from "@/components/admin/AdminLayout";

// Rien à indexer : ces pages répondent 404 à qui n'est pas administrateur.
export const metadata: Metadata = {
    robots: {index: false, follow: false},
};

export default async function AdminRootLayout({children}: { children: React.ReactNode }) {
    await requireAdmin();
    return <AdminLayout>{children}</AdminLayout>;
}
