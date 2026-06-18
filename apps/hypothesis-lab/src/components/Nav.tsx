"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
    { href: "/", label: "작업대" },
    { href: "/explore", label: "탐색" },
    { href: "/edit", label: "편집" },
];

export function Nav() {
    const pathname = usePathname();
    return (
        <nav className="topnav">
            <span className="brand">Hypothesis Lab</span>
            <div className="topnav-links">
                {LINKS.map((l) => (
                    <Link key={l.href} href={l.href} className={pathname === l.href ? "is-active" : ""}>
                        {l.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
