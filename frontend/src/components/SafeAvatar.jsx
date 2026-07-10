import { useState } from "react";

/** Avatar con fallback a iniciales si la imagen falla (evita errores de img rotas). */
export default function SafeAvatar({ user, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (user?.picture && !broken) {
    return (
      <img
        src={user.picture}
        alt={user.name || "Usuario"}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg,#6366F1,#3B82F6)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
