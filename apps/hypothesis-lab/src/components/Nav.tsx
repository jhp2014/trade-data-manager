"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";

const LINKS = [
    { href: "/", label: "작업대" },
    { href: "/explore", label: "탐색" },
    { href: "/edit", label: "편집" },
];

export function Nav() {
    const pathname = usePathname();
    return (
        <nav className={styles.topnav}>
            <span className={styles.brand}>Hypothesis Lab</span>
            <div className={styles.links}>
                {LINKS.map((l) => (
                    <Link
                        key={l.href}
                        href={l.href}
                        className={`${styles.link}${pathname === l.href ? ` ${styles.active}` : ""}`}
                    >
                        {l.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
}
